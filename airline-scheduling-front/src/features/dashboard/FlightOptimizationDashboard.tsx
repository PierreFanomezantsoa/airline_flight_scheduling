import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Plane,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
  Clock,
  Layers,
  Search,
  Filter,
  ArrowUpDown,
  X
} from 'lucide-react';
import { flightsApi, type Flight } from '../Api/flightsApi';

const ML_API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  'http://localhost:5000';

type ConflictSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

type ConflictType =
  | 'AIRCRAFT_UNAVAILABLE'
  | 'AIRCRAFT_OVERLAP'
  | 'TURNAROUND_TOO_SHORT'
  | 'AIRCRAFT_POSITIONING'
  | 'AIRCRAFT_MAINTENANCE'
  | 'MAINTENANCE_DUE'
  | 'CREW_OVERLAP'
  | 'CREW_REST'
  | 'UNASSIGNED_AIRCRAFT'
  | 'ML_CONFLICT_RISK'
  | string;

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
  type: ConflictType;
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


export const FlightOptimizationDashboard: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Détection IA des conflits
  const [conflictResult, setConflictResult] =
    useState<ConflictDetectionResult | null>(null);
  const [loadingConflicts, setLoadingConflicts] = useState<boolean>(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [lastConflictScanAt, setLastConflictScanAt] = useState<Date | null>(null);

  // Validation humaine OCC des propositions de résolution.
  // Aucun décalage critique, aucune réaffectation sensible et aucune annulation
  // ne sont appliqués automatiquement depuis cette interface.
  const [occDecisions, setOccDecisions] = useState<Record<string, OccDecision>>({});
  const [processingConflictId, setProcessingConflictId] = useState<string | null>(null);

  // État du Modal de Suppression
  const [flightToDelete, setFlightToDelete] = useState<Flight | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Filtres et recherche dans le tableau
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const loadFlights = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await flightsApi.getAll();
      setFlights(data);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des vols.');
    } finally {
      setLoading(false);
    }
  };


  const loadConflicts = async (silent = false) => {
    try {
      setLoadingConflicts(true);

      if (!silent) {
        setConflictError(null);
      }

      const response = await fetch(
        `${ML_API_BASE_URL}/flights/conflicts`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message ||
            `Erreur détection conflits HTTP ${response.status}`,
        );
      }

      const result = data as ConflictDetectionResult;
      setConflictResult(result);

      setOccDecisions((current) => {
        const next = { ...current };
        for (const conflict of result.conflicts || []) {
          const backendDecision = conflict.occDecision || conflict.decision;
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
        `${ML_API_BASE_URL}/flights/conflicts/${encodeURIComponent(conflict.id)}/decision`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            decision,
            source: 'OCC_UI',
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message ||
            `Erreur validation OCC HTTP ${response.status}`,
        );
      }

      setOccDecisions((current) => ({
        ...current,
        [conflict.id]: decision,
      }));

      // On recharge les vols et les conflits car une proposition approuvée
      // peut modifier une affectation ou un horaire côté serveur.
      await Promise.all([
        loadFlights(),
        loadConflicts(true),
      ]);
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
    void Promise.all([
      loadFlights(),
      loadConflicts(true),
    ]);
  }, []);

  // Rafraîchissement léger toutes les 60 s uniquement si l'onglet est visible.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void loadConflicts(true);
    };

    const intervalId = window.setInterval(tick, 60_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
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

  // Confirmation et exécution de la suppression
  const confirmDelete = async () => {
    if (!flightToDelete) return;
    try {
      setIsDeleting(true);
      await flightsApi.delete(flightToDelete.id);
      setFlightToDelete(null);
      await loadFlights();
      await loadConflicts(true);
    } catch (err: any) {
      setError(err.message || "Erreur lors de la suppression.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Calcul de la durée estimée du vol
  const calculateDuration = (start: string, end: string) => {
    const d1 = new Date(start).getTime();
    const d2 = new Date(end).getTime();
    if (isNaN(d1) || isNaN(d2)) return null;
    const diffMs = d2 - d1;
    if (diffMs <= 0) return null;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins.toString().padStart(2, '0')}m`;
  };

  // Rendu badge de statut personnalisé
  const renderStatusBadge = (statut?: string) => {
    const s = statut?.toUpperCase() || 'PROGRAMME';
    switch (s) {
      case 'EN_VOL':
      case 'IN_FLIGHT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> En vol
          </span>
        );
      case 'TERMINE':
      case 'LANDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Atterri
          </span>
        );
      case 'ANNULE':
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" /> Annulé
          </span>
        );
      case 'RETARDE':
      case 'DELAYED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Retardé
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-500" /> Programmé
          </span>
        );
    }
  };

  // Filtrage dynamique des vols
  const filteredFlights = useMemo(() => {
    return flights
      .filter((flight) => {
        const matchSearch =
          flight.numeroVol.toLowerCase().includes(searchTerm.toLowerCase()) ||
          flight.aeroportDepart.toLowerCase().includes(searchTerm.toLowerCase()) ||
          flight.aeroportArrivee.toLowerCase().includes(searchTerm.toLowerCase());

        if (statusFilter === 'ALL') return matchSearch;
        if (statusFilter === 'UNASSIGNED') return matchSearch && !flight.avion;
        if (statusFilter === 'ASSIGNED') return matchSearch && !!flight.avion;
        return matchSearch && (flight.statut?.toUpperCase() === statusFilter);
      })
      .sort((a, b) => {
        const timeA = new Date(a.heureDepart).getTime();
        const timeB = new Date(b.heureDepart).getTime();
        return sortAsc ? timeA - timeB : timeB - timeA;
      });
  }, [flights, searchTerm, statusFilter, sortAsc]);

  const assignedFlightsCount = flights.filter((f) => !!f.avion).length;
  const unassignedFlightsCount = flights.length - assignedFlightsCount;

  const conflictsByFlightId = useMemo(() => {
    const map = new Map<string, FlightConflict[]>();

    for (const conflict of conflictResult?.conflicts || []) {
      const ids = [
        conflict.flightA?.id,
        conflict.flightB?.id,
      ].filter(Boolean) as string[];

      for (const id of ids) {
        const current = map.get(id) || [];
        current.push(conflict);
        map.set(id, current);
      }
    }

    return map;
  }, [conflictResult]);

  const getConflictSeverityBadge = (
    severity: ConflictSeverity,
  ) => {
    switch (severity) {
      case 'CRITICAL':
        return 'border-rose-200 bg-rose-50 text-rose-700';
      case 'HIGH':
        return 'border-orange-200 bg-orange-50 text-orange-700';
      default:
        return 'border-amber-200 bg-amber-50 text-amber-700';
    }
  };

  const getConflictTypeLabel = (type: string) => {
    switch (type) {
      case 'AIRCRAFT_UNAVAILABLE':
        return 'Appareil indisponible';
      case 'AIRCRAFT_OVERLAP':
        return 'Chevauchement appareil';
      case 'TURNAROUND_TOO_SHORT':
        return 'Rotation trop courte';
      case 'AIRCRAFT_POSITIONING':
        return 'Positionnement appareil';
      case 'AIRCRAFT_MAINTENANCE':
        return 'Conflit maintenance';
      case 'MAINTENANCE_DUE':
        return 'Maintenance requise';
      case 'CREW_OVERLAP':
        return 'Chevauchement équipage';
      case 'CREW_REST':
        return 'Repos équipage insuffisant';
      case 'UNASSIGNED_AIRCRAFT':
        return 'Appareil non assigné';
      case 'ML_CONFLICT_RISK':
        return 'Risque arbre de décision';
      default:
        return type;
    }
  };

  const getProposalActionLabel = (action?: string) => {
    switch (action) {
      case 'REASSIGN_AIRCRAFT':
        return 'Réaffectation appareil';
      case 'SHIFT_FLIGHT':
        return 'Décalage du vol';
      case 'CANCEL_FLIGHT':
        return 'Annulation proposée';
      case 'KEEP_CURRENT':
        return 'Maintenir le planning';
      case 'MANUAL_REVIEW':
        return 'Analyse manuelle OCC';
      default:
        return action || 'Proposition OCC';
    }
  };

  const getOccDecision = (conflict: FlightConflict): OccDecision =>
    occDecisions[conflict.id] ||
    conflict.occDecision ||
    conflict.decision ||
    'PENDING';


  const conflictCount = conflictResult?.totalConflicts ?? 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-2 sm:p-6 text-slate-900 font-sans">
      {/* HEADER & BOUTONS D'ACTION */}
      <div className="relative overflow-hidden rounded-2xl bg-white p-2 sm:p-8 text-slate-900 shadow-xs border border-slate-200/80">
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 m-0 leading-tight">
              Détection  des Conflits de Vols
            </h1>

            <p className="text-slate-500 text-sm font-medium leading-relaxed m-0">
              Détection globale des conflits : disponibilité, chevauchement, turnaround, positionnement, maintenance et équipage. Les changements critiques restent soumis à validation OCC.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => loadConflicts(false)}
              disabled={loadingConflicts}
              className={`inline-flex items-center justify-center gap-2.5 rounded-xl border px-6 py-3 text-sm font-bold shadow-sm transition-all duration-200 ${
                loadingConflicts
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  : 'cursor-pointer border-emerald-700 bg-emerald-700 text-white hover:border-emerald-800 hover:bg-emerald-800 active:scale-[0.98]'
              }`}
            >
              {loadingConflicts ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Analyse IA en cours...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Analyser les conflits</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* METRICS RAPIDES */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="bg-slate-50/70 border border-slate-200/60 hover:border-slate-300 rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Vols</span>
              <Layers className="w-4 h-4 text-slate-400" />
            </div>
            <span className="text-2xl font-black text-slate-900 block">{flights.length}</span>
          </div>

          <div className="bg-emerald-50/40 border border-emerald-100 hover:border-emerald-200 rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Appareils Assignés</span>
              <Plane className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-2xl font-black text-emerald-700 block">{assignedFlightsCount}</span>
          </div>

          <div className="bg-amber-50/40 border border-amber-100 hover:border-amber-200 rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between text-amber-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Non Assignés</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <span className="text-2xl font-black text-amber-600 block">{unassignedFlightsCount}</span>
          </div>

          <div
            className={`rounded-xl p-4 transition-all border ${
              conflictCount > 0
                ? 'bg-rose-50/50 border-rose-200 hover:border-rose-300'
                : 'bg-emerald-50/40 border-emerald-100'
            }`}
          >
            <div
              className={`flex items-center justify-between mb-1 ${
                conflictCount > 0
                  ? 'text-rose-700'
                  : 'text-emerald-700'
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Conflits IA
              </span>
              <AlertTriangle className="w-4 h-4" />
            </div>

            <div className="flex items-end justify-between gap-2">
              <span
                className={`text-2xl font-black ${
                  conflictCount > 0
                    ? 'text-rose-700'
                    : 'text-emerald-700'
                }`}
              >
                {conflictCount}
              </span>

              {conflictResult && (
                <span className="text-[9px] font-bold text-slate-400">
                  {conflictResult.criticalConflicts} critique
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-50/70 border border-slate-200/60 hover:border-slate-300 rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Dernière analyse IA</span>
              <Clock className="w-4 h-4 text-slate-400" />
            </div>
            <span className="text-sm font-bold text-slate-700 mt-2 block truncate">
              {lastConflictScanAt
                ? lastConflictScanAt.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : 'Aucune analyse'}
            </span>
          </div>
        </div>
      </div>

      {/* DÉTECTION IA DES CONFLITS */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                conflictCount > 0
                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-600'
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

            <div>
              <h3 className="m-0 text-sm font-black text-slate-900">
                Analyse des conflits — Arbre de décision
              </h3>
              <p className="m-0 mt-0.5 text-[11px] font-medium text-slate-400">
                Disponibilité, overlap, turnaround, positionnement, maintenance, équipage et recommandations de réaffectation.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {conflictResult?.model?.algorithm && (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-slate-500">
                {conflictResult.model.algorithm}
              </span>
            )}

            {lastConflictScanAt && (
              <span className="text-[10px] font-semibold text-slate-400">
                Scan {lastConflictScanAt.toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            )}

            <button
              type="button"
              onClick={() => loadConflicts(false)}
              disabled={loadingConflicts}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  loadingConflicts ? 'animate-spin' : ''
                }`}
              />
              Relancer l'analyse IA
            </button>
          </div>
        </div>

        {conflictError && (
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-[11px] font-semibold text-amber-800">
            {conflictError}
          </div>
        )}

        {loadingConflicts && !conflictResult ? (
          <div className="space-y-2 p-5">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-16 animate-pulse rounded-xl border border-slate-100 bg-slate-50"
              />
            ))}
          </div>
        ) : conflictCount === 0 ? (
          <div className="flex min-h-32 items-center justify-center p-6 text-center">
            <div>
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
              <p className="mt-2 text-sm font-black text-slate-800">
                Aucun conflit détecté
              </p>
              <p className="mt-1 text-[11px] font-medium text-slate-400">
                Les rotations actuellement chargées sont compatibles avec les règles analysées.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 border-b border-slate-100 p-4 sm:p-5">
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-rose-500">
                  Critiques
                </span>
                <strong className="mt-1 block text-xl font-black text-rose-700">
                  {conflictResult?.criticalConflicts ?? 0}
                </strong>
              </div>

              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-orange-500">
                  Élevés
                </span>
                <strong className="mt-1 block text-xl font-black text-orange-700">
                  {conflictResult?.highConflicts ?? 0}
                </strong>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-500">
                  Modérés
                </span>
                <strong className="mt-1 block text-xl font-black text-amber-700">
                  {conflictResult?.mediumConflicts ?? 0}
                </strong>
              </div>
            </div>

            <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
              {(conflictResult?.conflicts || []).map((conflict) => (
                <article
                  key={conflict.id}
                  className="p-4 transition hover:bg-slate-50/70 sm:p-5"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${getConflictSeverityBadge(
                            conflict.severity,
                          )}`}
                        >
                          {conflict.severity}
                        </span>

                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                          {getConflictTypeLabel(conflict.type)}
                        </span>

                        <span className="font-mono text-[10px] font-black text-slate-400">
                          IA {Math.round((conflict.probability || 0) * 100)}%
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-xs font-black text-slate-800">
                          {conflict.flightA?.numeroVol}
                        </span>

                        {conflict.flightB && (
                          <>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                            <span className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-xs font-black text-slate-800">
                              {conflict.flightB.numeroVol}
                            </span>
                          </>
                        )}

                        {conflict.aircraftRegistration && (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500">
                            <Plane className="h-3 w-3" />
                            {conflict.aircraftRegistration}
                          </span>
                        )}
                      </div>

                      <p className="mt-3 text-xs font-semibold leading-5 text-slate-700">
                        {conflict.reason}
                      </p>

                      <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2">
                        <span className="text-[8px] font-black uppercase tracking-wider text-emerald-700">
                          Recommandation
                        </span>
                        <p className="mt-0.5 text-[10px] font-semibold leading-4 text-emerald-900">
                          {conflict.recommendation}
                        </p>
                      </div>

                      {conflict.proposal && (
                        <div className="mt-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[8px] font-black uppercase tracking-wider text-sky-700">
                              Proposition de résolution
                            </span>

                            <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-sky-700">
                              {getProposalActionLabel(conflict.proposal.action)}
                            </span>
                          </div>

                          <p className="mt-1 text-[10px] font-semibold leading-4 text-sky-900">
                            {conflict.proposal.description}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] font-bold text-slate-500">
                            {conflict.proposal.targetAircraftRegistration && (
                              <span>
                                Appareil proposé : {conflict.proposal.targetAircraftRegistration}
                              </span>
                            )}

                            {conflict.proposal.proposedDeparture && (
                              <span>
                                Départ proposé :{' '}
                                {new Date(
                                  conflict.proposal.proposedDeparture,
                                ).toLocaleString('fr-FR')}
                              </span>
                            )}

                            {conflict.proposal.proposedArrival && (
                              <span>
                                Arrivée proposée :{' '}
                                {new Date(
                                  conflict.proposal.proposedArrival,
                                ).toLocaleString('fr-FR')}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {getOccDecision(conflict) === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Validé par OCC
                          </span>
                        ) : getOccDecision(conflict) === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-slate-600">
                            <XCircle className="h-3 w-3" />
                            Proposition rejetée
                          </span>
                        ) : conflict.proposal ? (
                          <>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-amber-700">
                              <Clock className="h-3 w-3" />
                              Validation OCC requise
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                void submitOccDecision(conflict, 'APPROVED')
                              }
                              disabled={processingConflictId === conflict.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {processingConflictId === conflict.id ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3" />
                              )}
                              Valider OCC
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void submitOccDecision(conflict, 'REJECTED')
                              }
                              disabled={processingConflictId === conflict.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <XCircle className="h-3 w-3" />
                              Rejeter
                            </button>
                          </>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400">
                            Recommandation informative — aucune action automatique.
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-left lg:text-right">
                      {conflict.overlapMinutes != null &&
                        conflict.overlapMinutes > 0 && (
                          <span className="block font-mono text-[10px] font-black text-rose-600">
                            Overlap {Math.round(conflict.overlapMinutes)} min
                          </span>
                        )}

                      {conflict.gapMinutes != null && (
                        <span className="mt-1 block font-mono text-[10px] font-bold text-slate-400">
                          Gap {Math.round(conflict.gapMinutes)} min
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ERREUR */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 animate-in fade-in duration-200">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <strong className="font-bold">Erreur du service :</strong> {error}
          </div>
        </div>
      )}

      {/* BARRE DE RECHERCHE ET FILTRES */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900 m-0">Plan de Vol Réseau</h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
              {filteredFlights.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Recherche */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par N° ou IATA..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            {/* Filtre statut */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl px-2 py-1">
              <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none border-none cursor-pointer pr-1"
              >
                <option value="ALL">Tous les status</option>
                <option value="UNASSIGNED">Non assignés</option>
                <option value="ASSIGNED">Assignés</option>
                <option value="EN_VOL">En vol</option>
                <option value="PROGRAMME">Programmé</option>
                <option value="RETARDE">Retardé</option>
              </select>
            </div>

            {/* Recharger */}
            <button
              onClick={loadFlights}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700 p-2 rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* TABLEAU ENRICHI */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-600" />
            <p className="text-sm font-medium m-0">Chargement des vols en cours...</p>
          </div>
        ) : filteredFlights.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Plane className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
            <p className="text-sm font-semibold text-slate-600 m-0">Aucun vol ne correspond aux critères</p>
            <p className="text-xs text-slate-400 m-0">Essayez de modifier votre recherche ou vos filtres.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
                  <th className="py-3.5 px-4">Vol</th>
                  <th className="py-3.5 px-4">Ligne & Trajet</th>
                  <th 
                    className="py-3.5 px-4 cursor-pointer hover:text-slate-600 transition-colors"
                    onClick={() => setSortAsc(!sortAsc)}
                  >
                    <div className="flex items-center gap-1">
                      <span>Horaires</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4">Durée</th>
                  <th className="py-3.5 px-4">Appareil Assigné</th>
                  <th className="py-3.5 px-4">Conflit IA</th>
                  <th className="py-3.5 px-9">Statut</th>
                  <th className="py-3.5 px-7 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredFlights.map((flight) => {
                  const duration = calculateDuration(
                    flight.heureDepart,
                    flight.heureArrivee,
                  );

                  const flightConflicts =
                    conflictsByFlightId.get(flight.id) || [];

                  const strongestConflict =
                    flightConflicts.find(
                      (conflict) => conflict.severity === 'CRITICAL',
                    ) ||
                    flightConflicts.find(
                      (conflict) => conflict.severity === 'HIGH',
                    ) ||
                    flightConflicts[0];

                  return (
                    <tr 
                      key={flight.id} 
                      className={`transition-colors hover:bg-slate-50/70 ${
                        strongestConflict?.severity === 'CRITICAL'
                          ? 'bg-rose-50/30'
                          : strongestConflict
                            ? 'bg-amber-50/20'
                            : !flight.avion
                              ? 'bg-amber-50/10'
                              : ''
                      }`}
                    >
                      {/* N° Vol */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 font-mono text-xs text-slate-800 border border-slate-200/70">
                          <Plane className="w-3 h-3 text-slate-500" />
                          {flight.numeroVol}
                        </span>
                      </td>

                      {/* Ligne & Trajet */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 font-bold text-slate-800 font-mono text-xs">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {flight.aeroportDepart}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {flight.aeroportArrivee}
                          </span>
                        </div>
                      </td>

                      {/* Horaires */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs space-y-1 text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>
                              Départ :{' '}
                              <strong className="text-slate-800 font-semibold">
                                {new Date(flight.heureDepart).toLocaleString([], {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            <span>
                              Arrivée :{' '}
                              {new Date(flight.heureArrivee).toLocaleString([], {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Durée */}
                      <td className="py-3.5 px-4">
                        {duration ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {duration}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>

                      {/* Appareil Assigné */}
                      <td className="py-3.5 px-4">
                        {flight.avion ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-xs font-bold font-mono">
                            <Plane className="w-3 h-3 text-emerald-600" />
                            {flight.avion.immatriculation || flight.avion.id}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md font-semibold">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Non assigné
                          </span>
                        )}
                      </td>

                      {/* Conflit IA */}
                      <td className="py-3.5 px-4">
                        {strongestConflict ? (
                          <div className="min-w-[135px]">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${getConflictSeverityBadge(
                                strongestConflict.severity,
                              )}`}
                              title={strongestConflict.reason}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {getConflictTypeLabel(
                                strongestConflict.type,
                              )}
                            </span>

                            <span className="mt-1 block font-mono text-[9px] font-bold text-slate-400">
                              {Math.round(
                                strongestConflict.probability * 100,
                              )}
                              % confiance
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Aucun
                          </span>
                        )}
                      </td>

                      {/* Statut */}
                      <td className="py-3.5 px-4">{renderStatusBadge(flight.statut)}</td>

                      {/* Actions */}
                      <td className="py-2.5 px-8 text-right">
                        <button
                          onClick={() => setFlightToDelete(flight)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 text-xs font-semibold transition-all cursor-pointer text-slate-500"
                          title="Supprimer le vol"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE SUPPRESSION PERSONNALISÉ */}
      {flightToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative animate-in zoom-in-95 duration-150">
            {/* Bouton fermer en haut à droite */}
            <button
              onClick={() => !isDeleting && setFlightToDelete(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              disabled={isDeleting}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1 pr-4">
                <h3 className="text-lg font-bold text-slate-900 m-0">Supprimer le vol</h3>
                <p className="text-xs text-slate-500 m-0">
                  Êtes-vous sûr de vouloir retirer ce vol du programme ? Cette action est irréversible.
                </p>
              </div>
            </div>

            {/* Récapitulatif du vol sélectionné */}
            <div className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800">
                <Plane className="w-3.5 h-3.5 text-slate-500" />
                <span>{flightToDelete.numeroVol}</span>
              </div>
              <div className="text-xs font-semibold text-slate-600 font-mono">
                {flightToDelete.aeroportDepart} ➔ {flightToDelete.aeroportArrivee}
              </div>
            </div>

            {/* Actions du Modal */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setFlightToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Suppression...</span>
                  </>
                ) : (
                  <span>Confirmer la suppression</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};