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

/* ========================================================================== */
/* CONFIGURATION                                                              */
/* ========================================================================== */

const ML_API_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_API_BASE_URL) ||
  'http://localhost:5000';

/* ========================================================================== */
/* TYPES                                                                      */
/* ========================================================================== */

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

type OccDecision =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

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

/* ========================================================================== */
/* TYPES UI                                                                   */
/* ========================================================================== */

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  note?: string;

  compactValue?: boolean;

  accent?:
    | 'default'
    | 'emerald'
    | 'warning'
    | 'danger';
}

interface ConflictCounterProps {
  label: string;
  value: number;

  tone:
    | 'critical'
    | 'high'
    | 'medium';
}

/* ========================================================================== */
/* HELPERS                                                                    */
/* ========================================================================== */

const formatDateTime = (
  value?: string | null,
) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatShortDateTime = (
  value?: string | null,
) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const calculateDuration = (
  start: string,
  end: string,
) => {
  const d1 = new Date(start).getTime();
  const d2 = new Date(end).getTime();

  if (
    Number.isNaN(d1) ||
    Number.isNaN(d2)
  ) {
    return null;
  }

  const difference = d2 - d1;

  if (difference <= 0) {
    return null;
  }

  const hours = Math.floor(
    difference / 3_600_000,
  );

  const minutes = Math.floor(
    (difference % 3_600_000) / 60_000,
  );

  if (hours === 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${minutes
    .toString()
    .padStart(2, '0')}`;
};

/* ========================================================================== */
/* COMPOSANT PRINCIPAL                                                        */
/* ========================================================================== */

export const FlightOptimizationDashboard: React.FC =
  () => {
    /* ---------------------------------------------------------------------- */
    /* STATES                                                                 */
    /* ---------------------------------------------------------------------- */

    const [flights, setFlights] = useState<
      Flight[]
    >([]);

    const [loading, setLoading] =
      useState(true);

    const [error, setError] = useState<
      string | null
    >(null);

    /* ---------------------------------------------------------------------- */
    /* CONFLITS                                                               */
    /* ---------------------------------------------------------------------- */

    const [
      conflictResult,
      setConflictResult,
    ] =
      useState<ConflictDetectionResult | null>(
        null,
      );

    const [
      loadingConflicts,
      setLoadingConflicts,
    ] = useState(false);

    const [
      conflictError,
      setConflictError,
    ] = useState<string | null>(null);

    const [
      lastConflictScanAt,
      setLastConflictScanAt,
    ] = useState<Date | null>(null);

    /* ---------------------------------------------------------------------- */
    /* OCC                                                                    */
    /* ---------------------------------------------------------------------- */

    const [
      occDecisions,
      setOccDecisions,
    ] = useState<
      Record<string, OccDecision>
    >({});

    const [
      processingConflictId,
      setProcessingConflictId,
    ] = useState<string | null>(null);

    /* ---------------------------------------------------------------------- */
    /* SUPPRESSION                                                            */
    /* ---------------------------------------------------------------------- */

    const [
      flightToDelete,
      setFlightToDelete,
    ] = useState<Flight | null>(null);

    const [
      isDeleting,
      setIsDeleting,
    ] = useState(false);

    /* ---------------------------------------------------------------------- */
    /* RECHERCHE / FILTRES                                                    */
    /* ---------------------------------------------------------------------- */

    const [
      searchTerm,
      setSearchTerm,
    ] = useState('');

    const [
      statusFilter,
      setStatusFilter,
    ] = useState('ALL');

    const [
      sortAsc,
      setSortAsc,
    ] = useState(true);

    /* ====================================================================== */
    /* CHARGEMENT DES VOLS                                                    */
    /* ====================================================================== */

    const loadFlights = async () => {
      try {
        setLoading(true);
        setError(null);

        const data =
          await flightsApi.getAll();

        setFlights(data);
      } catch (err: any) {
        setError(
          err?.message ||
            'Erreur lors du chargement des vols.',
        );
      } finally {
        setLoading(false);
      }
    };

    /* ====================================================================== */
    /* CHARGEMENT DES CONFLITS                                                */
    /* ====================================================================== */

    const loadConflicts = async (
      silent = false,
    ) => {
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

        const data = await response
          .json()
          .catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.message ||
              `Erreur détection conflits HTTP ${response.status}`,
          );
        }

        const result =
          data as ConflictDetectionResult;

        setConflictResult(result);

        setOccDecisions((current) => {
          const next = {
            ...current,
          };

          for (const conflict of
            result.conflicts || []) {
            const backendDecision =
              conflict.occDecision ||
              conflict.decision;

            if (backendDecision) {
              next[conflict.id] =
                backendDecision;
            } else if (
              !next[conflict.id]
            ) {
              next[conflict.id] =
                'PENDING';
            }
          }

          return next;
        });

        setLastConflictScanAt(
          new Date(),
        );

        setConflictError(null);
      } catch (err: any) {
        console.error(
          'Erreur détection conflits :',
          err,
        );

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

    /* ====================================================================== */
    /* DÉCISION OCC                                                           */
    /* ====================================================================== */

    const submitOccDecision = async (
      conflict: FlightConflict,
      decision: Exclude<
        OccDecision,
        'PENDING'
      >,
    ) => {
      const proposal =
        conflict.proposal;

      if (
        decision === 'APPROVED' &&
        proposal &&
        [
          'SHIFT_FLIGHT',
          'CANCEL_FLIGHT',
        ].includes(proposal.action)
      ) {
        const confirmed =
          window.confirm(
            proposal.action ===
              'CANCEL_FLIGHT'
              ? 'Confirmer la validation OCC de cette proposition d’annulation ?'
              : 'Confirmer la validation OCC de ce décalage de vol ?',
          );

        if (!confirmed) {
          return;
        }
      }

      try {
        setProcessingConflictId(
          conflict.id,
        );

        setConflictError(null);

        const response =
          await fetch(
            `${ML_API_BASE_URL}/flights/conflicts/${encodeURIComponent(
              conflict.id,
            )}/decision`,
            {
              method: 'POST',

              headers: {
                Accept:
                  'application/json',
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                decision,
                source: 'OCC_UI',
              }),
            },
          );

        const data = await response
          .json()
          .catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.message ||
              `Erreur validation OCC HTTP ${response.status}`,
          );
        }

        setOccDecisions(
          (current) => ({
            ...current,
            [conflict.id]:
              decision,
          }),
        );

        await Promise.all([
          loadFlights(),
          loadConflicts(true),
        ]);
      } catch (err: any) {
        console.error(
          'Erreur validation OCC :',
          err,
        );

        setConflictError(
          err?.message ||
            'Impossible d’enregistrer la décision OCC.',
        );
      } finally {
        setProcessingConflictId(
          null,
        );
      }
    };

    /* ====================================================================== */
    /* CHARGEMENT INITIAL                                                     */
    /* ====================================================================== */

    useEffect(() => {
      void Promise.all([
        loadFlights(),
        loadConflicts(true),
      ]);
    }, []);

    /* ====================================================================== */
    /* RAFRAÎCHISSEMENT AUTOMATIQUE                                           */
    /* ====================================================================== */

    useEffect(() => {
      const tick = () => {
        if (
          document.visibilityState !==
          'visible'
        ) {
          return;
        }

        void loadConflicts(true);
      };

      const intervalId =
        window.setInterval(
          tick,
          60_000,
        );

      const onVisibilityChange =
        () => {
          if (
            document.visibilityState ===
            'visible'
          ) {
            tick();
          }
        };

      document.addEventListener(
        'visibilitychange',
        onVisibilityChange,
      );

      return () => {
        window.clearInterval(
          intervalId,
        );

        document.removeEventListener(
          'visibilitychange',
          onVisibilityChange,
        );
      };
    }, []);

    /* ====================================================================== */
    /* SUPPRESSION                                                            */
    /* ====================================================================== */

    const confirmDelete =
      async () => {
        if (!flightToDelete) {
          return;
        }

        try {
          setIsDeleting(true);
          setError(null);

          await flightsApi.delete(
            flightToDelete.id,
          );

          setFlightToDelete(null);

          await Promise.all([
            loadFlights(),
            loadConflicts(true),
          ]);
        } catch (err: any) {
          setError(
            err?.message ||
              'Erreur lors de la suppression.',
          );
        } finally {
          setIsDeleting(false);
        }
      };

    /* ====================================================================== */
    /* STATUTS                                                                */
    /* ====================================================================== */

    const renderStatusBadge = (
      statut?: string,
    ) => {
      const value =
        statut?.toUpperCase() ||
        'PROGRAMME';

      const baseClass =
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold whitespace-nowrap';

      switch (value) {
        case 'EN_VOL':
        case 'IN_FLIGHT':
          return (
            <span
              className={`${baseClass} border-sky-200 bg-sky-50 text-sky-700`}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />

              En vol
            </span>
          );

        case 'TERMINE':
        case 'LANDED':
        case 'EFFECTUE':
        case 'EFFECTUÉ':
          return (
            <span
              className={`${baseClass} border-emerald-200 bg-emerald-50 text-emerald-700`}
            >
              <CheckCircle2 className="h-3 w-3" />

              Atterri
            </span>
          );

        case 'ANNULE':
        case 'ANNULÉ':
        case 'CANCELLED':
          return (
            <span
              className={`${baseClass} border-rose-200 bg-rose-50 text-rose-700`}
            >
              <XCircle className="h-3 w-3" />

              Annulé
            </span>
          );

        case 'RETARDE':
        case 'RETARDÉ':
        case 'DELAYED':
          return (
            <span
              className={`${baseClass} border-amber-200 bg-amber-50 text-amber-700`}
            >
              <AlertTriangle className="h-3 w-3" />

              Retardé
            </span>
          );

        default:
          return (
            <span
              className={`${baseClass} border-slate-200 bg-slate-50 text-slate-600`}
            >
              <Clock className="h-3 w-3" />

              Programmé
            </span>
          );
      }
    };

    /* ====================================================================== */
    /* FILTRAGE                                                               */
    /* ====================================================================== */

    const filteredFlights =
      useMemo(() => {
        const search =
          searchTerm
            .trim()
            .toLowerCase();

        return [...flights]
          .filter((flight) => {
            const numeroVol =
              flight.numeroVol?.toLowerCase() ||
              '';

            const departure =
              flight.aeroportDepart?.toLowerCase() ||
              '';

            const arrival =
              flight.aeroportArrivee?.toLowerCase() ||
              '';

            const matchSearch =
              !search ||
              numeroVol.includes(
                search,
              ) ||
              departure.includes(
                search,
              ) ||
              arrival.includes(
                search,
              );

            if (!matchSearch) {
              return false;
            }

            if (
              statusFilter ===
              'ALL'
            ) {
              return true;
            }

            if (
              statusFilter ===
              'UNASSIGNED'
            ) {
              return !flight.avion;
            }

            if (
              statusFilter ===
              'ASSIGNED'
            ) {
              return !!flight.avion;
            }

            return (
              flight.statut?.toUpperCase() ===
              statusFilter
            );
          })
          .sort((a, b) => {
            const timeA =
              new Date(
                a.heureDepart,
              ).getTime();

            const timeB =
              new Date(
                b.heureDepart,
              ).getTime();

            return sortAsc
              ? timeA - timeB
              : timeB - timeA;
          });
      }, [
        flights,
        searchTerm,
        statusFilter,
        sortAsc,
      ]);

    /* ====================================================================== */
    /* DONNÉES DÉRIVÉES                                                      */
    /* ====================================================================== */

    const assignedFlightsCount =
      useMemo(
        () =>
          flights.filter(
            (flight) =>
              !!flight.avion,
          ).length,
        [flights],
      );

    const unassignedFlightsCount =
      flights.length -
      assignedFlightsCount;

    const conflictCount =
      conflictResult?.totalConflicts ??
      0;

    const conflictsByFlightId =
      useMemo(() => {
        const map = new Map<
          string,
          FlightConflict[]
        >();

        for (const conflict of
          conflictResult?.conflicts ||
          []) {
          const ids = [
            conflict.flightA?.id,
            conflict.flightB?.id,
          ].filter(
            Boolean,
          ) as string[];

          for (const id of ids) {
            const current =
              map.get(id) || [];

            current.push(
              conflict,
            );

            map.set(
              id,
              current,
            );
          }
        }

        return map;
      }, [conflictResult]);

    /* ====================================================================== */
    /* HELPERS CONFLITS                                                       */
    /* ====================================================================== */

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

    const getConflictSeverityBorder = (
      severity: ConflictSeverity,
    ) => {
      switch (severity) {
        case 'CRITICAL':
          return 'border-l-rose-500';

        case 'HIGH':
          return 'border-l-orange-400';

        default:
          return 'border-l-amber-400';
      }
    };

    const getConflictSeverityLabel = (
      severity: ConflictSeverity,
    ) => {
      switch (severity) {
        case 'CRITICAL':
          return 'Critique';

        case 'HIGH':
          return 'Élevé';

        default:
          return 'Modéré';
      }
    };

    const getConflictTypeLabel = (
      type: string,
    ) => {
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
          return 'Risque prédictif ML';

        default:
          return type;
      }
    };

    const getProposalActionLabel = (
      action?: string,
    ) => {
      switch (action) {
        case 'REASSIGN_AIRCRAFT':
          return 'Réaffecter l’appareil';

        case 'SHIFT_FLIGHT':
          return 'Décaler le vol';

        case 'CANCEL_FLIGHT':
          return 'Annuler le vol';

        case 'KEEP_CURRENT':
          return 'Conserver le planning';

        case 'MANUAL_REVIEW':
          return 'Analyse manuelle';

        default:
          return (
            action ||
            'Proposition OCC'
          );
      }
    };

    const getOccDecision = (
      conflict: FlightConflict,
    ): OccDecision =>
      occDecisions[conflict.id] ||
      conflict.occDecision ||
      conflict.decision ||
      'PENDING';

    const getStrongestConflict = (
      flightId: string,
    ) => {
      const flightConflicts =
        conflictsByFlightId.get(
          flightId,
        ) || [];

      return (
        flightConflicts.find(
          (conflict) =>
            conflict.severity ===
            'CRITICAL',
        ) ||
        flightConflicts.find(
          (conflict) =>
            conflict.severity ===
            'HIGH',
        ) ||
        flightConflicts[0]
      );
    };

    /* ====================================================================== */
    /* RENDER                                                                 */
    /* ====================================================================== */

    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-[1500px] space-y-3 p-2.5 text-slate-800 sm:space-y-4 sm:p-4">
          {/* ================================================================ */}
          {/* HEADER                                                           */}
          {/* ================================================================ */}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 p-3.5 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3 sm:items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
                  <Sparkles className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <h1 className="text-[15px] font-bold leading-5 text-slate-900 sm:text-lg">
                    Détection des conflits de vols
                  </h1>

                  <p className="mt-1 max-w-2xl text-[11px] leading-4 text-slate-500">
                    Analyse des rotations, appareils,
                    équipages et contraintes
                    opérationnelles
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  void loadConflicts(
                    false,
                  )
                }
                disabled={
                  loadingConflicts
                }
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-auto sm:text-[11px]"
              >
                {loadingConflicts ? (
                  <RefreshCw className="h-4 w-4 animate-spin sm:h-3.5 sm:w-3.5" />
                ) : (
                  <Sparkles className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                )}

                {loadingConflicts
                  ? 'Analyse en cours...'
                  : 'Analyser les conflits'}
              </button>
            </div>

            {/* KPI */}

            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3 sm:grid-cols-3 lg:grid-cols-5">
              <MetricCard
                label="Total vols"
                value={flights.length}
                icon={
                  <Layers className="h-4 w-4" />
                }
              />

              <MetricCard
                label="Assignés"
                value={
                  assignedFlightsCount
                }
                icon={
                  <Plane className="h-4 w-4" />
                }
                accent="emerald"
              />

              <MetricCard
                label="Non assignés"
                value={
                  unassignedFlightsCount
                }
                icon={
                  <AlertTriangle className="h-4 w-4" />
                }
                accent={
                  unassignedFlightsCount >
                  0
                    ? 'warning'
                    : 'default'
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
                accent={
                  conflictCount > 0
                    ? 'danger'
                    : 'emerald'
                }
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
                            minute:
                              '2-digit',
                          },
                        )
                      : '—'
                  }
                  icon={
                    <Clock className="h-4 w-4" />
                  }
                  compactValue
                />
              </div>
            </div>
          </section>

          {/* ================================================================ */}
          {/* ANALYSE DES CONFLITS                                             */}
          {/* ================================================================ */}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {/* HEADER */}

            <header className="flex flex-col gap-3 border-b border-slate-100 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    conflictCount > 0
                      ? 'bg-rose-50 text-rose-600'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {loadingConflicts ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : conflictCount >
                    0 ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </div>

                <div className="min-w-0">
                  <h2 className="text-xs font-bold text-slate-900">
                    Analyse opérationnelle
                  </h2>

                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Résultats du moteur de
                    détection des conflits
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {conflictResult?.model
                  ?.algorithm && (
                  <span className="max-w-full truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-semibold text-slate-500">
                    Modèle :{' '}
                    {
                      conflictResult
                        .model.algorithm
                    }
                  </span>
                )}

                <button
                  type="button"
                  onClick={() =>
                    void loadConflicts(
                      false,
                    )
                  }
                  disabled={
                    loadingConflicts
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-emerald-700 disabled:opacity-50 sm:h-8"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      loadingConflicts
                        ? 'animate-spin'
                        : ''
                    }`}
                  />

                  Actualiser
                </button>
              </div>
            </header>

            {/* ERREUR */}

            {conflictError && (
              <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-3.5 py-3 text-[10px] leading-4 text-amber-800 sm:px-4">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />

                <span>
                  {conflictError}
                </span>
              </div>
            )}

            {/* LOADING */}

            {loadingConflicts &&
            !conflictResult ? (
              <div className="space-y-2.5 p-3 sm:p-4">
                {[1, 2, 3].map(
                  (item) => (
                    <div
                      key={item}
                      className="h-24 animate-pulse rounded-lg border border-slate-100 bg-slate-50"
                    />
                  ),
                )}
              </div>
            ) : conflictCount ===
              0 ? (
              /* AUCUN CONFLIT */

              <div className="flex min-h-[160px] items-center justify-center px-4 py-8 text-center">
                <div>
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>

                  <p className="mt-3 text-xs font-bold text-slate-800">
                    Aucun conflit
                    détecté
                  </p>

                  <p className="mx-auto mt-1 max-w-lg text-[10px] leading-4 text-slate-400">
                    Les vols actuellement
                    planifiés respectent les
                    contraintes analysées par
                    le moteur de détection.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* COMPTEURS */}

                <div className="grid grid-cols-1 gap-2 border-b border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-3">
                  <ConflictCounter
                    label="Critiques"
                    value={
                      conflictResult
                        ?.criticalConflicts ??
                      0
                    }
                    tone="critical"
                  />

                  <ConflictCounter
                    label="Élevés"
                    value={
                      conflictResult
                        ?.highConflicts ??
                      0
                    }
                    tone="high"
                  />

                  <ConflictCounter
                    label="Modérés"
                    value={
                      conflictResult
                        ?.mediumConflicts ??
                      0
                    }
                    tone="medium"
                  />
                </div>

                {/* LISTE DES CONFLITS */}

                <div className="space-y-2 bg-slate-50/40 p-2.5 sm:max-h-[540px] sm:overflow-y-auto sm:p-3">
                  {(
                    conflictResult?.conflicts ||
                    []
                  ).map(
                    (conflict) => {
                      const decision =
                        getOccDecision(
                          conflict,
                        );

                      const probability =
                        Math.min(
                          100,
                          Math.max(
                            0,
                            Math.round(
                              (conflict.probability ||
                                0) *
                                100,
                            ),
                          ),
                        );

                      return (
                        <article
                          key={
                            conflict.id
                          }
                          className={`rounded-lg border border-l-[3px] border-slate-200 bg-white p-3 shadow-sm sm:p-3.5 ${getConflictSeverityBorder(
                            conflict.severity,
                          )}`}
                        >
                          {/* HEADER CONFLIT */}

                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex h-6 items-center rounded-md border px-2 text-[9px] font-bold uppercase tracking-wide ${getConflictSeverityBadge(
                                    conflict.severity,
                                  )}`}
                                >
                                  {getConflictSeverityLabel(
                                    conflict.severity,
                                  )}
                                </span>

                                <span className="text-[11px] font-bold text-slate-700">
                                  {getConflictTypeLabel(
                                    conflict.type,
                                  )}
                                </span>
                              </div>

                              {/* VOLS */}

                              <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                <FlightReference
                                  flight={
                                    conflict.flightA
                                  }
                                />

                                {conflict.flightB && (
                                  <>
                                    <div className="hidden sm:block">
                                      <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                                    </div>

                                    <div className="sm:hidden">
                                      <ArrowRight className="ml-2 h-3.5 w-3.5 rotate-90 text-slate-300" />
                                    </div>

                                    <FlightReference
                                      flight={
                                        conflict.flightB
                                      }
                                    />
                                  </>
                                )}

                                {conflict.aircraftRegistration && (
                                  <span className="inline-flex h-7 w-fit items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 font-mono text-[10px] font-semibold text-slate-500">
                                    <Plane className="h-3 w-3" />

                                    {
                                      conflict.aircraftRegistration
                                    }
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* CONFIANCE ML */}

                            <div className="w-full shrink-0 lg:w-36">
                              <div className="flex items-center justify-between text-[9px] font-semibold text-slate-400">
                                <span>
                                  Confiance
                                  ML
                                </span>

                                <span className="font-mono font-bold text-slate-600">
                                  {
                                    probability
                                  }
                                  %
                                </span>
                              </div>

                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-slate-500 transition-all"
                                  style={{
                                    width: `${probability}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* RAISON */}

                          <div className="mt-3">
                            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                              Anomalie
                              détectée
                            </span>

                            <p className="mt-1 text-[11px] font-medium leading-[18px] text-slate-700">
                              {
                                conflict.reason
                              }
                            </p>
                          </div>

                          {/* MÉTRIQUES */}

                          {(conflict.overlapMinutes !=
                            null ||
                            conflict.gapMinutes !=
                              null) && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {conflict.overlapMinutes !=
                                null &&
                                conflict.overlapMinutes >
                                  0 && (
                                  <span className="rounded-md bg-rose-50 px-2 py-1.5 font-mono text-[9px] font-semibold text-rose-700">
                                    Chevauchement
                                    :{' '}
                                    {Math.round(
                                      conflict.overlapMinutes,
                                    )}{' '}
                                    min
                                  </span>
                                )}

                              {conflict.gapMinutes !=
                                null && (
                                <span className="rounded-md bg-slate-100 px-2 py-1.5 font-mono text-[9px] font-semibold text-slate-500">
                                  Intervalle
                                  :{' '}
                                  {Math.round(
                                    conflict.gapMinutes,
                                  )}{' '}
                                  min
                                </span>
                              )}
                            </div>
                          )}

                          {/* RECOMMANDATION */}

                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                            <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                              Recommandation
                            </span>

                            <p className="mt-1 text-[10px] leading-4 text-slate-600 sm:text-[11px]">
                              {
                                conflict.recommendation
                              }
                            </p>
                          </div>

                          {/* PROPOSITION */}

                          {conflict.proposal && (
                            <div className="mt-2.5 rounded-lg border border-sky-100 bg-sky-50/50 px-3 py-2.5">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-[9px] font-bold uppercase tracking-wide text-sky-700">
                                  Proposition
                                  de
                                  résolution
                                </span>

                                <span className="w-fit rounded-md border border-sky-200 bg-white px-2 py-1 text-[9px] font-semibold text-sky-700">
                                  {getProposalActionLabel(
                                    conflict
                                      .proposal
                                      .action,
                                  )}
                                </span>
                              </div>

                              <p className="mt-2 text-[10px] leading-4 text-slate-700 sm:text-[11px]">
                                {
                                  conflict
                                    .proposal
                                    .description
                                }
                              </p>

                              {(conflict
                                .proposal
                                .targetAircraftRegistration ||
                                conflict
                                  .proposal
                                  .proposedDeparture ||
                                conflict
                                  .proposal
                                  .proposedArrival) && (
                                <div className="mt-2 grid gap-2 border-t border-sky-100 pt-2 text-[10px] text-slate-500 sm:grid-cols-2">
                                  {conflict
                                    .proposal
                                    .targetAircraftRegistration && (
                                    <div>
                                      <span className="block text-[9px] text-slate-400">
                                        Appareil
                                        proposé
                                      </span>

                                      <strong className="mt-0.5 block font-mono text-slate-700">
                                        {
                                          conflict
                                            .proposal
                                            .targetAircraftRegistration
                                        }
                                      </strong>
                                    </div>
                                  )}

                                  {conflict
                                    .proposal
                                    .proposedDeparture && (
                                    <div>
                                      <span className="block text-[9px] text-slate-400">
                                        Départ
                                        proposé
                                      </span>

                                      <strong className="mt-0.5 block text-slate-700">
                                        {formatDateTime(
                                          conflict
                                            .proposal
                                            .proposedDeparture,
                                        )}
                                      </strong>
                                    </div>
                                  )}

                                  {conflict
                                    .proposal
                                    .proposedArrival && (
                                    <div>
                                      <span className="block text-[9px] text-slate-400">
                                        Arrivée
                                        proposée
                                      </span>

                                      <strong className="mt-0.5 block text-slate-700">
                                        {formatDateTime(
                                          conflict
                                            .proposal
                                            .proposedArrival,
                                        )}
                                      </strong>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* OCC */}

                          <div className="mt-3 border-t border-slate-100 pt-3">
                            {decision ===
                            'APPROVED' ? (
                              <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />

                                Validé par
                                OCC
                              </span>
                            ) : decision ===
                              'REJECTED' ? (
                              <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-3 text-[10px] font-semibold text-slate-600">
                                <XCircle className="h-3.5 w-3.5" />

                                Proposition
                                rejetée
                              </span>
                            ) : conflict.proposal ? (
                              <div className="space-y-2.5">
                                <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-50 px-3 text-[10px] font-semibold text-amber-700">
                                  <Clock className="h-3.5 w-3.5" />

                                  Décision
                                  OCC
                                  requise
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
                                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />

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
                                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-[11px] font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8"
                                  >
                                    {processingConflictId ===
                                    conflict.id ? (
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    )}

                                    Valider
                                    OCC
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] leading-4 text-slate-400">
                                Information
                                uniquement
                                — aucune
                                action
                                automatique.
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    },
                  )}
                </div>
              </>
            )}
          </section>

          {/* ================================================================ */}
          {/* ERREUR GLOBALE                                                   */}
          {/* ================================================================ */}

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-rose-800">
                  Erreur du
                  service
                </p>

                <p className="mt-0.5 text-[10px] leading-4 text-rose-700">
                  {error}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setError(null)
                }
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-rose-500 hover:bg-rose-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* ================================================================ */}
          {/* PLAN DE VOL                                                      */}
          {/* ================================================================ */}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {/* HEADER / FILTRES */}

            <header className="border-b border-slate-100 p-3 sm:p-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Layers className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-bold text-slate-900">
                      Plan de vol
                      réseau
                    </h2>

                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {
                        filteredFlights.length
                      }
                    </span>
                  </div>

                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Liste et
                    affectation des
                    vols
                  </p>
                </div>
              </div>

              {/* TOOLBAR */}

              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(220px,1fr)_190px_40px]">
                {/* RECHERCHE */}

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                  <input
                    type="text"
                    value={
                      searchTerm
                    }
                    onChange={(
                      event,
                    ) =>
                      setSearchTerm(
                        event.target
                          .value,
                      )
                    }
                    placeholder="Rechercher un vol ou un aéroport..."
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 md:h-9 md:text-[11px]"
                  />

                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() =>
                        setSearchTerm(
                          '',
                        )
                      }
                      aria-label="Effacer la recherche"
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* FILTRE */}

                <div className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 md:h-9">
                  <Filter className="h-4 w-4 shrink-0 text-slate-400 md:h-3.5 md:w-3.5" />

                  <select
                    value={
                      statusFilter
                    }
                    onChange={(
                      event,
                    ) =>
                      setStatusFilter(
                        event.target
                          .value,
                      )
                    }
                    className="w-full cursor-pointer border-none bg-transparent text-xs font-medium text-slate-600 outline-none md:text-[10px]"
                  >
                    <option value="ALL">
                      Tous les
                      statuts
                    </option>

                    <option value="UNASSIGNED">
                      Non assignés
                    </option>

                    <option value="ASSIGNED">
                      Assignés
                    </option>

                    <option value="EN_VOL">
                      En vol
                    </option>

                    <option value="PROGRAMME">
                      Programmés
                    </option>

                    <option value="RETARDE">
                      Retardés
                    </option>
                  </select>
                </div>

                {/* REFRESH */}

                <button
                  type="button"
                  onClick={() =>
                    void loadFlights()
                  }
                  disabled={loading}
                  aria-label="Actualiser les vols"
                  title="Actualiser les vols"
                  className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-emerald-700 disabled:opacity-50 md:h-9 md:w-10 md:px-0"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      loading
                        ? 'animate-spin'
                        : ''
                    }`}
                  />

                  <span className="md:hidden">
                    Actualiser
                  </span>
                </button>
              </div>
            </header>

            {/* ============================================================ */}
            {/* LOADING                                                      */}
            {/* ============================================================ */}

            {loading ? (
              <div className="flex min-h-[190px] items-center justify-center">
                <div className="text-center">
                  <RefreshCw className="mx-auto h-7 w-7 animate-spin text-emerald-600" />

                  <p className="mt-2 text-[11px] font-medium text-slate-400">
                    Chargement des
                    vols...
                  </p>
                </div>
              </div>
            ) : filteredFlights.length ===
              0 ? (
              /* ========================================================== */
              /* EMPTY                                                      */
              /* ========================================================== */

              <div className="flex min-h-[190px] items-center justify-center px-4 text-center">
                <div>
                  <Plane className="mx-auto h-8 w-8 text-slate-300" />

                  <p className="mt-2 text-xs font-semibold text-slate-600">
                    Aucun vol
                    trouvé
                  </p>

                  <p className="mt-1 text-[10px] text-slate-400">
                    Modifiez la
                    recherche ou le
                    filtre
                    sélectionné.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* ======================================================== */}
                {/* MOBILE : CARTES                                         */}
                {/* ======================================================== */}

                <div className="divide-y divide-slate-100 md:hidden">
                  {filteredFlights.map(
                    (flight) => {
                      const duration =
                        calculateDuration(
                          flight.heureDepart,
                          flight.heureArrivee,
                        );

                      const strongestConflict =
                        getStrongestConflict(
                          flight.id,
                        );

                      return (
                        <article
                          key={
                            flight.id
                          }
                          className={`p-3.5 ${
                            strongestConflict
                              ?.severity ===
                            'CRITICAL'
                              ? 'bg-rose-50/20'
                              : 'bg-white'
                          }`}
                        >
                          {/* HEADER */}

                          <div className="flex items-start justify-between gap-3">
                            <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 font-mono text-[11px] font-bold text-slate-900">
                              <Plane className="h-3.5 w-3.5 text-slate-400" />

                              {
                                flight.numeroVol
                              }
                            </span>

                            {renderStatusBadge(
                              flight.statut,
                            )}
                          </div>

                          {/* TRAJET */}

                          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <div>
                              <span className="block text-[10px] font-medium text-slate-400">
                                Départ
                              </span>

                              <strong className="mt-0.5 block font-mono text-xl font-bold text-slate-900">
                                {
                                  flight.aeroportDepart
                                }
                              </strong>
                            </div>

                            <div className="flex items-center">
                              <div className="h-px w-4 bg-slate-200" />

                              <Plane className="mx-2 h-4 w-4 rotate-90 text-emerald-600" />

                              <div className="h-px w-4 bg-slate-200" />
                            </div>

                            <div className="text-right">
                              <span className="block text-[10px] font-medium text-slate-400">
                                Arrivée
                              </span>

                              <strong className="mt-0.5 block font-mono text-xl font-bold text-slate-900">
                                {
                                  flight.aeroportArrivee
                                }
                              </strong>
                            </div>
                          </div>

                          {/* HORAIRES */}

                          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
                            <div>
                              <span className="block text-[9px] font-medium uppercase tracking-wide text-slate-400">
                                Départ
                              </span>

                              <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-700">
                                {formatShortDateTime(
                                  flight.heureDepart,
                                )}
                              </span>
                            </div>

                            <div className="border-l border-slate-200 pl-3">
                              <span className="block text-[9px] font-medium uppercase tracking-wide text-slate-400">
                                Arrivée
                              </span>

                              <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-700">
                                {formatShortDateTime(
                                  flight.heureArrivee,
                                )}
                              </span>
                            </div>
                          </div>

                          {/* DURÉE + APPAREIL */}

                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                              <span className="block text-[9px] uppercase tracking-wide text-slate-400">
                                Durée
                              </span>

                              <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />

                                {duration ||
                                  '—'}
                              </span>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                              <span className="block text-[9px] uppercase tracking-wide text-slate-400">
                                Appareil
                              </span>

                              {flight.avion ? (
                                <span className="mt-1 inline-flex max-w-full items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                                  <Plane className="h-3.5 w-3.5 shrink-0" />

                                  <span className="truncate font-mono">
                                    {flight
                                      .avion
                                      .immatriculation ||
                                      flight
                                        .avion
                                        .id}
                                  </span>
                                </span>
                              ) : (
                                <span className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-700">
                                  <AlertTriangle className="h-3.5 w-3.5" />

                                  Non
                                  assigné
                                </span>
                              )}
                            </div>
                          </div>

                          {/* CONFLIT */}

                          <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
                            <div className="min-w-0 flex-1">
                              <span className="block text-[9px] font-medium uppercase tracking-wide text-slate-400">
                                Conflit IA
                              </span>

                              {strongestConflict ? (
                                <div className="mt-1">
                                  <span
                                    className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-semibold ${getConflictSeverityBadge(
                                      strongestConflict.severity,
                                    )}`}
                                  >
                                    <AlertTriangle className="h-3 w-3 shrink-0" />

                                    <span className="truncate">
                                      {getConflictTypeLabel(
                                        strongestConflict.type,
                                      )}
                                    </span>
                                  </span>

                                  <span className="mt-1 block font-mono text-[9px] text-slate-400">
                                    {Math.round(
                                      strongestConflict.probability *
                                        100,
                                    )}
                                    %
                                    confiance
                                  </span>
                                </div>
                              ) : (
                                <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                                  <CheckCircle2 className="h-3.5 w-3.5" />

                                  Aucun
                                  conflit
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setFlightToDelete(
                                  flight,
                                )
                              }
                              aria-label={`Supprimer le vol ${flight.numeroVol}`}
                              title="Supprimer le vol"
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </article>
                      );
                    },
                  )}
                </div>

                {/* ======================================================== */}
                {/* TABLETTE / DESKTOP : TABLEAU                            */}
                {/* ======================================================== */}

                <div className="hidden max-h-[580px] overflow-auto md:block">
                  <table className="w-full min-w-[1050px] border-collapse text-left">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-2.5">
                          Vol
                        </th>

                        <th className="px-3 py-2.5">
                          Trajet
                        </th>

                        <th
                          className="cursor-pointer px-3 py-2.5 transition hover:text-slate-600"
                          onClick={() =>
                            setSortAsc(
                              (
                                current,
                              ) =>
                                !current,
                            )
                          }
                        >
                          <div className="flex items-center gap-1.5">
                            Horaires

                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </th>

                        <th className="px-3 py-2.5">
                          Durée
                        </th>

                        <th className="px-3 py-2.5">
                          Appareil
                        </th>

                        <th className="px-3 py-2.5">
                          Conflit
                        </th>

                        <th className="px-3 py-2.5">
                          Statut
                        </th>

                        <th className="px-3 py-2.5 text-right">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {filteredFlights.map(
                        (
                          flight,
                        ) => {
                          const duration =
                            calculateDuration(
                              flight.heureDepart,
                              flight.heureArrivee,
                            );

                          const strongestConflict =
                            getStrongestConflict(
                              flight.id,
                            );

                          return (
                            <tr
                              key={
                                flight.id
                              }
                              className={`transition hover:bg-slate-50 ${
                                strongestConflict
                                  ?.severity ===
                                'CRITICAL'
                                  ? 'bg-rose-50/20'
                                  : strongestConflict
                                    ? 'bg-amber-50/10'
                                    : ''
                              }`}
                            >
                              {/* VOL */}

                              <td className="whitespace-nowrap px-3 py-3">
                                <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 font-mono text-[10px] font-bold text-slate-800">
                                  <Plane className="h-3 w-3 text-slate-400" />

                                  {
                                    flight.numeroVol
                                  }
                                </span>
                              </td>

                              {/* TRAJET */}

                              <td className="whitespace-nowrap px-3 py-3">
                                <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-slate-700">
                                  <span>
                                    {
                                      flight.aeroportDepart
                                    }
                                  </span>

                                  <ArrowRight className="h-3 w-3 text-slate-300" />

                                  <span>
                                    {
                                      flight.aeroportArrivee
                                    }
                                  </span>
                                </div>
                              </td>

                              {/* HORAIRES */}

                              <td className="px-3 py-3">
                                <div className="min-w-[170px] space-y-1 text-[9px]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

                                    <span className="text-slate-400">
                                      Départ
                                    </span>

                                    <strong className="font-medium text-slate-700">
                                      {formatDateTime(
                                        flight.heureDepart,
                                      )}
                                    </strong>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />

                                    <span className="text-slate-400">
                                      Arrivée
                                    </span>

                                    <span className="text-slate-600">
                                      {formatDateTime(
                                        flight.heureArrivee,
                                      )}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* DURÉE */}

                              <td className="whitespace-nowrap px-3 py-3">
                                {duration ? (
                                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                                    <Clock className="h-3 w-3 text-slate-400" />

                                    {
                                      duration
                                    }
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-300">
                                    —
                                  </span>
                                )}
                              </td>

                              {/* APPAREIL */}

                              <td className="whitespace-nowrap px-3 py-3">
                                {flight.avion ? (
                                  <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-emerald-100 bg-emerald-50 px-2 font-mono text-[9px] font-semibold text-emerald-700">
                                    <Plane className="h-3 w-3" />

                                    {flight
                                      .avion
                                      .immatriculation ||
                                      flight
                                        .avion
                                        .id}
                                  </span>
                                ) : (
                                  <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-100 bg-amber-50 px-2 text-[9px] font-semibold text-amber-700">
                                    <AlertTriangle className="h-3 w-3" />

                                    Non
                                    assigné
                                  </span>
                                )}
                              </td>

                              {/* CONFLIT */}

                              <td className="px-3 py-3">
                                {strongestConflict ? (
                                  <div className="min-w-[150px]">
                                    <span
                                      title={
                                        strongestConflict.reason
                                      }
                                      className={`inline-flex max-w-[190px] items-center gap-1 rounded-md border px-2 py-1 text-[8px] font-semibold ${getConflictSeverityBadge(
                                        strongestConflict.severity,
                                      )}`}
                                    >
                                      <AlertTriangle className="h-2.5 w-2.5 shrink-0" />

                                      <span className="truncate">
                                        {getConflictTypeLabel(
                                          strongestConflict.type,
                                        )}
                                      </span>
                                    </span>

                                    <span className="mt-1 block font-mono text-[8px] text-slate-400">
                                      {Math.round(
                                        strongestConflict.probability *
                                          100,
                                      )}
                                      %
                                      confiance
                                    </span>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-600">
                                    <CheckCircle2 className="h-3 w-3" />

                                    Aucun
                                  </span>
                                )}
                              </td>

                              {/* STATUT */}

                              <td className="whitespace-nowrap px-3 py-3">
                                {renderStatusBadge(
                                  flight.statut,
                                )}
                              </td>

                              {/* ACTION */}

                              <td className="px-3 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setFlightToDelete(
                                      flight,
                                    )
                                  }
                                  title="Supprimer le vol"
                                  aria-label={`Supprimer le vol ${flight.numeroVol}`}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>

        {/* ================================================================== */}
        {/* MODAL / BOTTOM SHEET SUPPRESSION                                  */}
        {/* ================================================================== */}

        {flightToDelete && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4"
            onMouseDown={(
              event,
            ) => {
              if (
                event.currentTarget ===
                  event.target &&
                !isDeleting
              ) {
                setFlightToDelete(
                  null,
                );
              }
            }}
          >
            <div className="w-full rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-[430px] sm:rounded-xl">
              {/* POIGNÉE MOBILE */}

              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

              {/* HEADER */}

              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Supprimer le
                      vol
                    </h3>

                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Cette action
                      est
                      irréversible
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    !isDeleting &&
                    setFlightToDelete(
                      null,
                    )
                  }
                  disabled={
                    isDeleting
                  }
                  aria-label="Fermer"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* BODY */}

              <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p className="text-xs leading-5 text-slate-600">
                  Voulez-vous
                  vraiment retirer
                  ce vol du
                  planning
                  opérationnel ?
                </p>

                {/* VOL */}

                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 font-mono text-sm font-bold text-slate-900">
                      <Plane className="h-3.5 w-3.5 text-slate-400" />

                      {
                        flightToDelete.numeroVol
                      }
                    </span>

                    <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-slate-600">
                      <span>
                        {
                          flightToDelete.aeroportDepart
                        }
                      </span>

                      <ArrowRight className="h-3 w-3 text-slate-300" />

                      <span>
                        {
                          flightToDelete.aeroportArrivee
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* ACTIONS */}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFlightToDelete(
                        null,
                      )
                    }
                    disabled={
                      isDeleting
                    }
                    className="h-11 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Annuler
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void confirmDelete()
                    }
                    disabled={
                      isDeleting
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDeleting && (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    )}

                    {isDeleting
                      ? 'Suppression...'
                      : 'Supprimer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

/* ========================================================================== */
/* KPI                                                                        */
/* ========================================================================== */

const MetricCard: React.FC<
  MetricCardProps
> = ({
  label,
  value,
  icon,
  note,
  compactValue = false,
  accent = 'default',
}) => {
  const iconStyle = {
    default:
      'bg-slate-100 text-slate-500',

    emerald:
      'bg-emerald-50 text-emerald-700',

    warning:
      'bg-amber-50 text-amber-600',

    danger:
      'bg-rose-50 text-rose-600',
  }[accent];

  return (
    <div className="h-full rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400 sm:text-[10px]">
            {label}
          </span>

          <strong
            className={`mt-1.5 block font-bold leading-none text-slate-900 ${
              compactValue
                ? 'text-base'
                : 'text-xl sm:text-2xl'
            }`}
          >
            {value}
          </strong>

          {note && (
            <p className="mt-1.5 text-[9px] text-slate-400">
              {note}
            </p>
          )}
        </div>

        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconStyle}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
};

/* ========================================================================== */
/* COMPTEUR CONFLIT                                                           */
/* ========================================================================== */

const ConflictCounter: React.FC<
  ConflictCounterProps
> = ({
  label,
  value,
  tone,
}) => {
  const styles = {
    critical: {
      border:
        'border-rose-100',

      icon:
        'bg-rose-50 text-rose-600',
    },

    high: {
      border:
        'border-orange-100',

      icon:
        'bg-orange-50 text-orange-600',
    },

    medium: {
      border:
        'border-amber-100',

      icon:
        'bg-amber-50 text-amber-600',
    },
  }[tone];

  return (
    <div
      className={`flex items-center justify-between rounded-lg border bg-white px-3 py-2.5 ${styles.border}`}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </div>

        <span className="text-[10px] font-semibold text-slate-500 sm:text-[9px]">
          {label}
        </span>
      </div>

      <strong className="text-lg font-bold text-slate-900">
        {value}
      </strong>
    </div>
  );
};

/* ========================================================================== */
/* RÉFÉRENCE VOL DANS CONFLIT                                                 */
/* ========================================================================== */

const FlightReference: React.FC<{
  flight: ConflictFlightRef;
}> = ({ flight }) => (
  <div className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 sm:w-auto sm:justify-start">
    <span className="font-mono text-[11px] font-bold text-slate-800">
      {flight.numeroVol}
    </span>

    <span className="flex items-center gap-1 font-mono text-[9px] font-medium text-slate-400">
      {flight.aeroportDepart}

      <ArrowRight className="h-3 w-3" />

      {flight.aeroportArrivee}
    </span>
  </div>
);

export default FlightOptimizationDashboard;