import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Filter,
  Layers,
  Plane,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { flightsApi, type Flight } from '../Api/flightsApi';

const ML_API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  'http://localhost:5000';

const PAGE_SIZE = 10;

type ConflictSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';
type OccDecision = 'PENDING' | 'APPROVED' | 'REJECTED';
type ProposedAction =
  | 'REASSIGN_AIRCRAFT'
  | 'SHIFT_FLIGHT'
  | 'CANCEL_FLIGHT'
  | 'KEEP_CURRENT'
  | 'MANUAL_REVIEW'
  | string;

interface ConflictProposal {
  action: ProposedAction;
  description: string;
  targetAircraftId?: string | null;
  targetAircraftRegistration?: string | null;
  proposedDeparture?: string | null;
  proposedArrival?: string | null;
  requiresOccApproval?: boolean;
}

interface ConflictFlightRef {
  id: string;
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart?: string | null;
  heureArrivee?: string | null;
  statut?: string;
  avionId?: string | null;
  aircraftRegistration?: string | null;
}

interface FlightConflict {
  id: string;
  type: string;
  severity: ConflictSeverity;
  probability: number;
  detector?: string;
  aircraftId?: string | null;
  aircraftRegistration?: string | null;
  flightA: ConflictFlightRef;
  flightB?: ConflictFlightRef | null;
  overlapMinutes?: number;
  gapMinutes?: number | null;
  reason: string;
  recommendation: string;
  proposal?: ConflictProposal | null;
  occDecision?: OccDecision;
  decision?: OccDecision;
}

interface ConflictDetectionResult {
  timestamp: string;
  totalConflicts: number;
  criticalConflicts: number;
  highConflicts: number;
  mediumConflicts: number;
  conflicts: FlightConflict[];
  model?: {
    algorithm?: string;
    version?: string;
    externalDependencies?: string[];
  };
}

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  note?: string;
  compactValue?: boolean;
  accent?: 'default' | 'emerald' | 'warning' | 'danger';
}

interface ConflictCounterProps {
  label: string;
  value: number;
  tone: 'critical' | 'high' | 'medium';
}

const CONFLICT_SEVERITY = {
  CRITICAL: {
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    border: 'border-l-rose-500',
    label: 'Critique',
  },
  HIGH: {
    badge: 'border-orange-200 bg-orange-50 text-orange-700',
    border: 'border-l-orange-400',
    label: 'Élevé',
  },
  MEDIUM: {
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    border: 'border-l-amber-400',
    label: 'Modéré',
  },
} satisfies Record<
  ConflictSeverity,
  { badge: string; border: string; label: string }
>;

const CONFLICT_TYPE_LABELS: Record<string, string> = {
  AIRCRAFT_UNAVAILABLE: 'Appareil indisponible',
  AIRCRAFT_OVERLAP: 'Chevauchement appareil',
  TURNAROUND_TOO_SHORT: 'Rotation trop courte',
  AIRCRAFT_POSITIONING: 'Positionnement appareil',
  AIRCRAFT_MAINTENANCE: 'Conflit maintenance',
  MAINTENANCE_DUE: 'Maintenance requise',
  CREW_OVERLAP: 'Chevauchement équipage',
  CREW_REST: 'Repos équipage insuffisant',
  UNASSIGNED_AIRCRAFT: 'Appareil non assigné',
  ML_CONFLICT_RISK: 'Risque prédictif ML',
};

const PROPOSAL_LABELS: Record<string, string> = {
  REASSIGN_AIRCRAFT: 'Réaffecter l’appareil',
  SHIFT_FLIGHT: 'Décaler le vol',
  CANCEL_FLIGHT: 'Annuler le vol',
  KEEP_CURRENT: 'Conserver le planning',
  MANUAL_REVIEW: 'Analyse manuelle',
};

const formatShortDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const calculateDuration = (start: string, end: string) => {
  const d1 = new Date(start).getTime();
  const d2 = new Date(end).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2) || d2 <= d1) return null;

  const difference = d2 - d1;
  const hours = Math.floor(difference / 3_600_000);
  const minutes = Math.floor((difference % 3_600_000) / 60_000);

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes.toString().padStart(2, '0')}`;
};

export const FlightOptimizationDashboard: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflictResult, setConflictResult] =
    useState<ConflictDetectionResult | null>(null);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [lastConflictScanAt, setLastConflictScanAt] =
    useState<Date | null>(null);
  const [occDecisions, setOccDecisions] = useState<
    Record<string, OccDecision>
  >({});
  const [processingConflictId, setProcessingConflictId] =
    useState<string | null>(null);
  const [flightToDelete, setFlightToDelete] = useState<Flight | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const loadFlights = async () => {
    try {
      setLoading(true);
      setError(null);
      setFlights(await flightsApi.getAll());
    } catch (err: any) {
      setError(err?.message || 'Erreur lors du chargement des vols.');
    } finally {
      setLoading(false);
    }
  };

  const loadConflicts = async (silent = false) => {
    try {
      setLoadingConflicts(true);
      if (!silent) setConflictError(null);

      const response = await fetch(`${ML_API_BASE_URL}/flights/conflicts`, {
        headers: { Accept: 'application/json' },
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message ||
            `Erreur détection conflits HTTP ${response.status}`,
        );
      }

      const result = data as ConflictDetectionResult;
      setConflictResult(result);

      setOccDecisions(current => {
        const next = { ...current };
        for (const conflict of result.conflicts || []) {
          const backendDecision =
            conflict.occDecision || conflict.decision;
          if (backendDecision) {
            next[conflict.id] = backendDecision;
          } else if (!next[conflict.id]) {
            next[conflict.id] = 'PENDING';
          }
        }
        return next;
      });

      setLastConflictScanAt(new Date());
      setConflictError(null);
    } catch (err: any) {
      console.error('Erreur détection conflits :', err);
      if (!silent) {
        setConflictError(
          err?.message ||
            'Impossible de détecter les conflits de vols.',
        );
      }
    } finally {
      setLoadingConflicts(false);
    }
  };

  const submitOccDecision = async (
    conflict: FlightConflict,
    decision: Exclude<OccDecision, 'PENDING'>,
  ) => {
    const proposal = conflict.proposal;

    if (
      decision === 'APPROVED' &&
      proposal &&
      ['SHIFT_FLIGHT', 'CANCEL_FLIGHT'].includes(proposal.action)
    ) {
      const confirmed = window.confirm(
        proposal.action === 'CANCEL_FLIGHT'
          ? 'Confirmer la validation OCC de cette proposition d’annulation ?'
          : 'Confirmer la validation OCC de ce décalage de vol ?',
      );
      if (!confirmed) return;
    }

    try {
      setProcessingConflictId(conflict.id);
      setConflictError(null);

      const response = await fetch(
        `${ML_API_BASE_URL}/flights/conflicts/${encodeURIComponent(
          conflict.id,
        )}/decision`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ decision, source: 'OCC_UI' }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message ||
            `Erreur validation OCC HTTP ${response.status}`,
        );
      }

      setOccDecisions(current => ({
        ...current,
        [conflict.id]: decision,
      }));

      await Promise.all([loadFlights(), loadConflicts(true)]);
    } catch (err: any) {
      console.error('Erreur validation OCC :', err);
      setConflictError(
        err?.message ||
          'Impossible d’enregistrer la décision OCC.',
      );
    } finally {
      setProcessingConflictId(null);
    }
  };

  useEffect(() => {
    void Promise.all([loadFlights(), loadConflicts(true)]);
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') {
        void loadConflicts(true);
      }
    };

    const intervalId = window.setInterval(tick, 60_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick();
    };

    document.addEventListener(
      'visibilitychange',
      onVisibilityChange,
    );

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      );
    };
  }, []);

  const confirmDelete = async () => {
    if (!flightToDelete) return;

    try {
      setIsDeleting(true);
      setError(null);
      await flightsApi.delete(flightToDelete.id);
      setFlightToDelete(null);
      await Promise.all([loadFlights(), loadConflicts(true)]);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la suppression.');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderStatusBadge = (statut?: string) => {
    const value = statut?.toUpperCase() || 'PROGRAMME';

    const base =
      'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[11px] font-bold';

    if (['EN_VOL', 'IN_FLIGHT'].includes(value)) {
      return (
        <span
          className={`${base} border-sky-200 bg-sky-50 text-sky-700`}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
          En vol
        </span>
      );
    }

    if (
      ['TERMINE', 'LANDED', 'EFFECTUE', 'EFFECTUÉ'].includes(value)
    ) {
      return (
        <span
          className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Atterri
        </span>
      );
    }

    if (['ANNULE', 'ANNULÉ', 'CANCELLED'].includes(value)) {
      return (
        <span
          className={`${base} border-rose-200 bg-rose-50 text-rose-700`}
        >
          <XCircle className="h-3.5 w-3.5" />
          Annulé
        </span>
      );
    }

    if (['RETARDE', 'RETARDÉ', 'DELAYED'].includes(value)) {
      return (
        <span
          className={`${base} border-amber-200 bg-amber-50 text-amber-700`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Retardé
        </span>
      );
    }

    return (
      <span
        className={`${base} border-slate-200 bg-slate-50 text-slate-600`}
      >
        <Clock className="h-3.5 w-3.5" />
        Programmé
      </span>
    );
  };

  const filteredFlights = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return [...flights]
      .filter(flight => {
        const numeroVol = flight.numeroVol?.toLowerCase() || '';
        const departure =
          flight.aeroportDepart?.toLowerCase() || '';
        const arrival =
          flight.aeroportArrivee?.toLowerCase() || '';

        const matchSearch =
          !search ||
          numeroVol.includes(search) ||
          departure.includes(search) ||
          arrival.includes(search);

        if (!matchSearch) return false;
        if (statusFilter === 'ALL') return true;
        if (statusFilter === 'UNASSIGNED') return !flight.avion;
        if (statusFilter === 'ASSIGNED') return Boolean(flight.avion);

        return flight.statut?.toUpperCase() === statusFilter;
      })
      .sort((a, b) => {
        const timeA = new Date(a.heureDepart).getTime();
        const timeB = new Date(b.heureDepart).getTime();
        return sortAsc ? timeA - timeB : timeB - timeA;
      });
  }, [flights, searchTerm, statusFilter, sortAsc]);

  /* Reset page quand filtres/recherche changent */
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredFlights.length / PAGE_SIZE),
  );

  const paginatedFlights = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredFlights.slice(start, start + PAGE_SIZE);
  }, [filteredFlights, currentPage]);

  /* Sécurité : clamp si currentPage > totalPages */
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const assignedFlightsCount = useMemo(
    () => flights.filter(flight => Boolean(flight.avion)).length,
    [flights],
  );

  const unassignedFlightsCount = flights.length - assignedFlightsCount;

  const conflictCount = conflictResult?.totalConflicts ?? 0;

  const conflictsByFlightId = useMemo(() => {
    const map = new Map<string, FlightConflict[]>();

    for (const conflict of conflictResult?.conflicts || []) {
      const ids = [conflict.flightA?.id, conflict.flightB?.id].filter(
        Boolean,
      ) as string[];

      for (const id of ids) {
        const current = map.get(id) || [];
        current.push(conflict);
        map.set(id, current);
      }
    }

    return map;
  }, [conflictResult]);

  const getConflictSeverityBadge = (severity: ConflictSeverity) =>
    CONFLICT_SEVERITY[severity].badge;
  const getConflictSeverityBorder = (severity: ConflictSeverity) =>
    CONFLICT_SEVERITY[severity].border;
  const getConflictSeverityLabel = (severity: ConflictSeverity) =>
    CONFLICT_SEVERITY[severity].label;
  const getConflictTypeLabel = (type: string) =>
    CONFLICT_TYPE_LABELS[type] || type;
  const getProposalActionLabel = (action?: string) =>
    action ? PROPOSAL_LABELS[action] || action : 'Proposition OCC';

  const getOccDecision = (conflict: FlightConflict): OccDecision =>
    occDecisions[conflict.id] ||
    conflict.occDecision ||
    conflict.decision ||
    'PENDING';

  const getStrongestConflict = (flightId: string) => {
    const flightConflicts = conflictsByFlightId.get(flightId) || [];
    return (
      flightConflicts.find(
        conflict => conflict.severity === 'CRITICAL',
      ) ||
      flightConflicts.find(
        conflict => conflict.severity === 'HIGH',
      ) ||
      flightConflicts[0]
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1500px] space-y-4 p-3 text-slate-800 sm:p-5">
        {/* HEADER */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3 sm:items-center">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">
                <Sparkles className="h-5 w-5" />
                {conflictCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-black text-white">
                    {conflictCount > 99 ? '99+' : conflictCount}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-black leading-tight tracking-tight text-slate-950 sm:text-xl">
                    Détection des conflits de vols
                  </h1>
                </div>

                <p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-slate-500 sm:text-sm">
                  Analyse des rotations, des appareils, des équipages et
                  des contraintes opérationnelles.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadConflicts(false)}
              disabled={loadingConflicts}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-600/20 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-auto sm:text-sm"
            >
              {loadingConflicts ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loadingConflicts
                ? 'Analyse en cours...'
                : 'Analyser les conflits'}
            </button>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-slate-50/40 p-3 sm:grid-cols-3 sm:p-4 lg:grid-cols-5">
            <MetricCard
              label="Total vols"
              value={flights.length}
              icon={<Layers className="h-4 w-4" />}
            />
            <MetricCard
              label="Assignés"
              value={assignedFlightsCount}
              icon={<Plane className="h-4 w-4" />}
              accent="emerald"
            />
            <MetricCard
              label="Non assignés"
              value={unassignedFlightsCount}
              icon={<AlertTriangle className="h-4 w-4" />}
              accent={
                unassignedFlightsCount > 0 ? 'warning' : 'default'
              }
            />
            <MetricCard
              label="Conflits"
              value={conflictCount}
              icon={
                conflictCount > 0 ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )
              }
              accent={conflictCount > 0 ? 'danger' : 'emerald'}
              note={
                conflictResult
                  ? `${conflictResult.criticalConflicts} critique(s)`
                  : undefined
              }
            />
            <div className="col-span-2 sm:col-span-1">
              <MetricCard
                label="Dernière analyse"
                value={
                  lastConflictScanAt
                    ? lastConflictScanAt.toLocaleTimeString(
                        'fr-FR',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        },
                      )
                    : '—'
                }
                icon={<Clock className="h-4 w-4" />}
                compactValue
              />
            </div>
          </div>
        </section>

        {/* ANALYSE CONFLITS */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  conflictCount > 0
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {loadingConflicts ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : conflictCount > 0 ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
              </div>

              <div className="min-w-0">
                <h2 className="text-sm font-black text-slate-900 sm:text-base">
                  Analyse opérationnelle
                </h2>
                <p className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-xs">
                  Résultats du moteur de détection des conflits
                  opérationnels.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadConflicts(false)}
                disabled={loadingConflicts}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-emerald-700 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    loadingConflicts ? 'animate-spin' : ''
                  }`}
                />
                Actualiser
              </button>
            </div>
          </header>

          {conflictError && (
            <div className="flex items-start gap-2.5 border-b border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 sm:px-5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{conflictError}</span>
            </div>
          )}

          {loadingConflicts && !conflictResult ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map(item => (
                <div
                  key={item}
                  className="h-28 animate-pulse rounded-xl border border-slate-100 bg-slate-50"
                />
              ))}
            </div>
          ) : conflictCount === 0 ? (
            <div className="flex min-h-[180px] items-center justify-center px-4 py-8 text-center">
              <div>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
                <p className="mt-3 text-sm font-black text-slate-800">
                  Aucun conflit détecté
                </p>
                <p className="mx-auto mt-1.5 max-w-lg text-xs leading-5 text-slate-500">
                  Les vols actuellement planifiés respectent les
                  contraintes analysées.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-3 sm:p-4">
                <ConflictCounter
                  label="Critiques"
                  value={conflictResult?.criticalConflicts ?? 0}
                  tone="critical"
                />
                <ConflictCounter
                  label="Élevés"
                  value={conflictResult?.highConflicts ?? 0}
                  tone="high"
                />
                <ConflictCounter
                  label="Modérés"
                  value={conflictResult?.mediumConflicts ?? 0}
                  tone="medium"
                />
              </div>

              <div className="space-y-3 bg-slate-50/40 p-3 sm:p-4">
                {(conflictResult?.conflicts || []).map(conflict => {
                  const decision = getOccDecision(conflict);
                  const probability = Math.min(
                    100,
                    Math.max(
                      0,
                      Math.round((conflict.probability || 0) * 100),
                    ),
                  );

                  return (
                    <article
                      key={conflict.id}
                      className={`rounded-xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm ${getConflictSeverityBorder(
                        conflict.severity,
                      )}`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span
                              className={`inline-flex h-7 items-center rounded-md border px-2.5 text-[10px] font-black uppercase tracking-wide ${getConflictSeverityBadge(
                                conflict.severity,
                              )}`}
                            >
                              {getConflictSeverityLabel(
                                conflict.severity,
                              )}
                            </span>
                            <span className="text-sm font-black text-slate-800">
                              {getConflictTypeLabel(conflict.type)}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                            <FlightReference flight={conflict.flightA} />
                            {conflict.flightB && (
                              <>
                                <ArrowRight className="hidden h-4 w-4 text-slate-300 sm:block" />
                                <ArrowRight className="ml-2 h-4 w-4 rotate-90 text-slate-300 sm:hidden" />
                                <FlightReference
                                  flight={conflict.flightB}
                                />
                              </>
                            )}
                            {conflict.aircraftRegistration && (
                              <span className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs font-semibold text-slate-600">
                                <Plane className="h-4 w-4" />
                                {conflict.aircraftRegistration}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="w-full shrink-0 lg:w-44">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                            <span>Confiance ML</span>
                            <span className="font-mono text-slate-700">
                              {probability} %
                            </span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-slate-500 transition-all"
                              style={{ width: `${probability}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Anomalie détectée
                        </span>
                        <p className="mt-1.5 text-sm font-medium leading-6 text-slate-700">
                          {conflict.reason}
                        </p>
                      </div>

                      {(conflict.overlapMinutes != null ||
                        conflict.gapMinutes != null) && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {conflict.overlapMinutes != null &&
                            conflict.overlapMinutes > 0 && (
                              <span className="rounded-lg bg-rose-50 px-3 py-2 font-mono text-xs font-semibold text-rose-700">
                                Chevauchement :{' '}
                                {Math.round(
                                  conflict.overlapMinutes,
                                )}{' '}
                                min
                              </span>
                            )}
                          {conflict.gapMinutes != null && (
                            <span className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs font-semibold text-slate-600">
                              Intervalle :{' '}
                              {Math.round(conflict.gapMinutes)} min
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                          <Sparkles className="h-3.5 w-3.5" />
                          Recommandation
                        </span>
                        <p className="mt-1.5 text-sm font-medium leading-6 text-slate-700">
                          {conflict.recommendation}
                        </p>
                      </div>

                      {conflict.proposal && (
                        <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                              Proposition de résolution
                            </span>
                            <span className="w-fit rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold text-sky-700">
                              {getProposalActionLabel(
                                conflict.proposal.action,
                              )}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-medium leading-6 text-slate-700">
                            {conflict.proposal.description}
                          </p>
                        </div>
                      )}

                      <div className="mt-4 border-t border-slate-100 pt-4">
                        {decision === 'APPROVED' ? (
                          <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            Validé par OCC
                          </span>
                        ) : decision === 'REJECTED' ? (
                          <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm font-bold text-slate-600">
                            <XCircle className="h-4 w-4" />
                            Proposition rejetée
                          </span>
                        ) : conflict.proposal ? (
                          <div className="space-y-3">
                            <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-50 px-3 text-xs font-bold text-amber-700">
                              <Clock className="h-3.5 w-3.5" />
                              Décision OCC requise
                            </span>

                            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  void submitOccDecision(
                                    conflict,
                                    'REJECTED',
                                  )
                                }
                                disabled={
                                  processingConflictId ===
                                  conflict.id
                                }
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-rose-50 disabled:opacity-50"
                              >
                                <XCircle className="h-4 w-4" />
                                Rejeter
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void submitOccDecision(
                                    conflict,
                                    'APPROVED',
                                  )
                                }
                                disabled={
                                  processingConflictId ===
                                  conflict.id
                                }
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                              >
                                {processingConflictId ===
                                conflict.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                Valider OCC
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm leading-6 text-slate-500">
                            Information uniquement — aucune action
                            automatique.
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* ERREUR */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-rose-800">
                Erreur du service
              </p>
              <p className="mt-1 text-sm leading-5 text-rose-700">
                {error}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* TABLEAU VOLS */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Layers className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-sm font-black text-slate-900 sm:text-base">
                    Plan de vol réseau
                  </h2>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                    {filteredFlights.length}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-xs">
                  Consultation des vols, des affectations et de leur
                  état opérationnel.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-[minmax(220px,1fr)_210px_44px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={event =>
                    setSearchTerm(event.target.value)
                  }
                  placeholder="Rechercher un vol ou un aéroport..."
                  className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-9 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-600/10 md:h-10"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Effacer la recherche"
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 md:h-10">
                <Filter className="h-4 w-4 shrink-0 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={event =>
                    setStatusFilter(event.target.value)
                  }
                  className="w-full bg-transparent text-sm font-medium text-slate-600 outline-none"
                >
                  <option value="ALL">Tous les statuts</option>
                  <option value="UNASSIGNED">Non assignés</option>
                  <option value="ASSIGNED">Assignés</option>
                  <option value="EN_VOL">En vol</option>
                  <option value="PROGRAMME">Programmés</option>
                  <option value="RETARDE">Retardés</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => void loadFlights()}
                disabled={loading}
                aria-label="Actualiser les vols"
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 md:h-10"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    loading ? 'animate-spin' : ''
                  }`}
                />
                <span className="md:hidden">Actualiser</span>
              </button>
            </div>
          </header>

          {loading ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <div className="text-center">
                <RefreshCw className="mx-auto h-7 w-7 animate-spin text-emerald-600" />
                <p className="mt-2 text-sm font-medium text-slate-500">
                  Chargement des vols...
                </p>
              </div>
            </div>
          ) : filteredFlights.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center px-4 text-center">
              <div>
                <Plane className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  Aucun vol trouvé
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Modifiez la recherche ou le filtre sélectionné.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* MOBILE : CARTES */}
              <div className="divide-y divide-slate-100 md:hidden">
                {paginatedFlights.map(flight => {
                  const duration = calculateDuration(
                    flight.heureDepart,
                    flight.heureArrivee,
                  );

                  const strongestConflict = getStrongestConflict(
                    flight.id,
                  );

                  return (
                    <article
                      key={flight.id}
                      className={`p-4 ${
                        strongestConflict?.severity === 'CRITICAL'
                          ? 'bg-rose-50/20'
                          : 'bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-sm font-bold text-slate-900">
                          <Plane className="h-4 w-4 text-slate-400" />
                          {flight.numeroVol}
                        </span>
                        {renderStatusBadge(flight.statut)}
                      </div>

                      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Départ
                          </span>
                          <strong className="mt-1 block font-mono text-xl font-black text-slate-900">
                            {flight.aeroportDepart}
                          </strong>
                        </div>
                        <Plane className="h-4 w-4 rotate-90 text-emerald-600" />
                        <div className="text-right">
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Arrivée
                          </span>
                          <strong className="mt-1 block font-mono text-xl font-black text-slate-900">
                            {flight.aeroportArrivee}
                          </strong>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Départ
                          </span>
                          <span className="mt-1 block text-sm font-semibold text-slate-700">
                            {formatShortDateTime(
                              flight.heureDepart,
                            )}
                          </span>
                        </div>
                        <div className="border-l border-slate-200 pl-3">
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Arrivée
                          </span>
                          <span className="mt-1 block text-sm font-semibold text-slate-700">
                            {formatShortDateTime(
                              flight.heureArrivee,
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <InfoCard
                          label="Durée"
                          value={duration || '—'}
                          icon={<Clock className="h-4 w-4" />}
                        />
                        <InfoCard
                          label="Appareil"
                          value={
                            flight.avion
                              ? flight.avion.immatriculation ||
                                flight.avion.id
                              : 'Non assigné'
                          }
                          icon={
                            flight.avion ? (
                              <Plane className="h-4 w-4" />
                            ) : (
                              <AlertTriangle className="h-4 w-4" />
                            )
                          }
                        />
                      </div>

                      <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
                        <div className="min-w-0 flex-1">
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Conflit
                          </span>
                          {strongestConflict ? (
                            <div className="mt-1.5">
                              <span
                                className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${getConflictSeverityBadge(
                                  strongestConflict.severity,
                                )}`}
                              >
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">
                                  {getConflictTypeLabel(
                                    strongestConflict.type,
                                  )}
                                </span>
                              </span>
                              <span className="mt-1.5 block font-mono text-xs text-slate-500">
                                {Math.round(
                                  strongestConflict.probability *
                                    100,
                                )}
                                % de confiance
                              </span>
                            </div>
                          ) : (
                            <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Aucun conflit
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setFlightToDelete(flight)
                          }
                          aria-label={`Supprimer le vol ${flight.numeroVol}`}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* DESKTOP : TABLEAU SANS SCROLL */}
              <div className="hidden md:block">
                <table className="w-full table-fixed border-collapse text-left">
                  <colgroup>
                    <col className="w-[12%]" />
                    <col className="w-[14%]" />
                    <col className="w-[16%]" />
                    <col className="w-[9%]" />
                    <col className="w-[13%]" />
                    <col className="w-[16%]" />
                    <col className="w-[12%]" />
                    <col className="w-[8%]" />
                  </colgroup>
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-3">Vol</th>
                      <th className="px-3 py-3">Trajet</th>
                      <th
                        className="cursor-pointer px-3 py-3"
                        onClick={() =>
                          setSortAsc(current => !current)
                        }
                      >
                        <div className="flex items-center gap-1.5">
                          Horaires
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        </div>
                      </th>
                      <th className="px-3 py-3">Durée</th>
                      <th className="px-3 py-3">Appareil</th>
                      <th className="px-3 py-3">Conflit</th>
                      <th className="px-3 py-3">Statut</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {paginatedFlights.map(flight => {
                      const duration = calculateDuration(
                        flight.heureDepart,
                        flight.heureArrivee,
                      );

                      const strongestConflict = getStrongestConflict(
                        flight.id,
                      );

                      return (
                        <tr
                          key={flight.id}
                          className={`transition hover:bg-slate-50 ${
                            strongestConflict?.severity ===
                            'CRITICAL'
                              ? 'bg-rose-50/20'
                              : strongestConflict
                                ? 'bg-amber-50/10'
                                : ''
                          }`}
                        >
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800">
                              <Plane className="h-3.5 w-3.5 text-slate-400" />
                              <span className="truncate">
                                {flight.numeroVol}
                              </span>
                            </span>
                          </td>

                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-800">
                              <span className="truncate">
                                {flight.aeroportDepart}
                              </span>
                              <ArrowRight className="h-3 w-3 shrink-0 text-slate-300" />
                              <span className="truncate">
                                {flight.aeroportArrivee}
                              </span>
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            <div className="space-y-1 text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                <span className="font-semibold text-slate-700">
                                  {formatShortDateTime(
                                    flight.heureDepart,
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                                <span className="font-semibold text-slate-700">
                                  {formatShortDateTime(
                                    flight.heureArrivee,
                                  )}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-700">
                            {duration || '—'}
                          </td>

                          <td className="px-3 py-3">
                            {flight.avion ? (
                              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 font-mono text-[11px] font-bold text-emerald-700">
                                <Plane className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">
                                  {flight.avion.immatriculation ||
                                    flight.avion.id}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-700">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                Non assigné
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {strongestConflict ? (
                              <div className="min-w-0">
                                <span
                                  className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${getConflictSeverityBadge(
                                    strongestConflict.severity,
                                  )}`}
                                >
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">
                                    {getConflictTypeLabel(
                                      strongestConflict.type,
                                    )}
                                  </span>
                                </span>
                                <span className="mt-1 block font-mono text-[10px] text-slate-500">
                                  {Math.round(
                                    strongestConflict.probability *
                                      100,
                                  )}
                                  % de confiance
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Aucun
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {renderStatusBadge(flight.statut)}
                          </td>

                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setFlightToDelete(flight)
                              }
                              aria-label={`Supprimer le vol ${flight.numeroVol}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              {totalPages > 1 && (
                <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:px-5">
                  <p className="text-xs font-semibold text-slate-500">
                    Page{' '}
                    <span className="font-black text-slate-700">
                      {currentPage}
                    </span>{' '}
                    sur{' '}
                    <span className="font-black text-slate-700">
                      {totalPages}
                    </span>{' '}
                    — {filteredFlights.length} vol
                    {filteredFlights.length > 1 ? 's' : ''}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPage(prev =>
                          Math.max(1, prev - 1),
                        )
                      }
                      disabled={currentPage === 1}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                      Précédent
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from(
                        { length: totalPages },
                        (_, i) => i + 1,
                      )
                        .filter(page => {
                          if (totalPages <= 5) return true;
                          if (
                            page === 1 ||
                            page === totalPages
                          )
                            return true;
                          return (
                            Math.abs(page - currentPage) <= 1
                          );
                        })
                        .map((page, index, array) => {
                          const previousPage =
                            array[index - 1];
                          const showEllipsis =
                            previousPage != null &&
                            page - previousPage > 1;

                          return (
                            <React.Fragment key={page}>
                              {showEllipsis && (
                                <span className="px-1 text-xs font-bold text-slate-400">
                                  …
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setCurrentPage(page)
                                }
                                className={`h-9 min-w-9 rounded-lg border px-2 text-xs font-bold transition ${
                                  page === currentPage
                                    ? 'border-emerald-700 bg-emerald-700 text-white'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {page}
                              </button>
                            </React.Fragment>
                          );
                        })}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPage(prev =>
                          Math.min(totalPages, prev + 1),
                        )
                      }
                      disabled={currentPage === totalPages}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Suivant
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* MODALE SUPPRESSION */}
      {flightToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-[2px] sm:items-center sm:p-4"
          onMouseDown={event => {
            if (
              event.currentTarget === event.target &&
              !isDeleting
            ) {
              setFlightToDelete(null);
            }
          }}
        >
          <div className="w-full rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-[430px] sm:rounded-2xl">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Supprimer le vol
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Cette action est irréversible.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!isDeleting) setFlightToDelete(null);
                }}
                disabled={isDeleting}
                aria-label="Fermer"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <p className="text-sm leading-6 text-slate-600">
                Voulez-vous vraiment retirer ce vol du planning
                opérationnel ?
              </p>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 font-mono text-base font-black text-slate-900">
                    <Plane className="h-4 w-4 text-slate-400" />
                    {flightToDelete.numeroVol}
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-600">
                    <span>{flightToDelete.aeroportDepart}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                    <span>{flightToDelete.aeroportArrivee}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFlightToDelete(null)}
                  disabled={isDeleting}
                  className="h-11 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={isDeleting}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
                >
                  {isDeleting && (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  )}
                  {isDeleting ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================
 * SOUS-COMPOSANTS
 * ========================================================== */

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon,
  note,
  compactValue = false,
  accent = 'default',
}) => {
  const iconStyle = {
    default: 'bg-slate-100 text-slate-500',
    emerald: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-rose-50 text-rose-600',
  }[accent];

  const valueStyle = {
    default: 'text-slate-900',
    emerald: 'text-emerald-700',
    warning: 'text-amber-700',
    danger: 'text-rose-700',
  }[accent];

  return (
    <div className="h-full rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {label}
          </span>
          <strong
            className={`mt-2 block font-black leading-none tabular-nums ${valueStyle} ${
              compactValue ? 'text-xl' : 'text-2xl sm:text-3xl'
            }`}
          >
            {value}
          </strong>
          {note && (
            <p className="mt-2 text-[10px] font-medium text-slate-500">
              {note}
            </p>
          )}
        </div>
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconStyle}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
};

const ConflictCounter: React.FC<ConflictCounterProps> = ({
  label,
  value,
  tone,
}) => {
  const styles = {
    critical: {
      border: 'border-rose-200',
      icon: 'bg-rose-50 text-rose-600',
      value: 'text-rose-700',
    },
    high: {
      border: 'border-orange-200',
      icon: 'bg-orange-50 text-orange-600',
      value: 'text-orange-700',
    },
    medium: {
      border: 'border-amber-200',
      icon: 'bg-amber-50 text-amber-600',
      value: 'text-amber-700',
    },
  }[tone];

  return (
    <div
      className={`flex items-center justify-between rounded-xl border bg-white px-3.5 py-3 shadow-sm ${styles.border}`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}
        >
          <AlertTriangle className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold text-slate-600">
          {label}
        </span>
      </div>
      <strong
        className={`text-xl font-black tabular-nums ${styles.value}`}
      >
        {value}
      </strong>
    </div>
  );
};

const FlightReference: React.FC<{
  flight: ConflictFlightRef;
}> = ({ flight }) => (
  <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 sm:w-auto sm:justify-start">
    <span className="font-mono text-sm font-black text-slate-800">
      {flight.numeroVol}
    </span>
    <span className="flex items-center gap-1.5 font-mono text-xs text-slate-500">
      {flight.aeroportDepart}
      <ArrowRight className="h-3.5 w-3.5" />
      {flight.aeroportArrivee}
    </span>
  </div>
);

const InfoCard: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}> = ({ label, value, icon }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3">
    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
      {label}
    </span>
    <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-slate-700">
      {icon}
      <span className="truncate">{value}</span>
    </span>
  </div>
);

export default FlightOptimizationDashboard;