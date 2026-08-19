import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';

import {
  Plane,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  BarChart3,
  Layers,
  Search,
  ShieldCheck,
  X,
  Filter,
  Play,
  RotateCcw,
  WandSparkles,
  MapPin,
} from 'lucide-react';

/* ============================================================================
 * CONFIGURATION
 * ========================================================================== */

const API_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_API_BASE_URL) ||
  (typeof globalThis !== 'undefined' &&
    (globalThis as any).process?.env?.REACT_APP_API_BASE_URL) ||
  'http://localhost:5000';

const AUTO_SCHEDULE_GENERATE_ENDPOINT =
  '/flights/auto-schedule/generate';

const AUTO_SCHEDULE_GANTT_ENDPOINT =
  '/flights/auto-schedule/gantt';
/* ============================================================================
 * TYPES
 * ========================================================================== */
export type FlightStatus =
  | 'Planifié'
  | 'En Vol'
  | 'Retardé'
  | 'Annulé'
  | 'Effectué';

export interface Flight {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  localDeparture?: string | null;
  localArrival?: string | null;
  durationMinutes?: number | null;
  status: FlightStatus | string;
  aircraft?: string | null;
  aircraftModel?: string | null;
  weatherSeverity?: number | null;
}

export interface AnalyticsMetrics {
  totalFlights: number;
  otpRate: number;
  onTimeCount: number;
  delayedCount: number;
  inFlightCount: number;
  cancelledCount: number;
  completedCount: number;
}

interface StatusConfigItem {
  bg: string;
  border: string;
  text: string;
  bar: string;
  badgeBg: string;
  dot: string;
}

interface GanttRow {
  aircraftId: string;
  aircraftRegistration: string;
  capacity?: number | null;
  base?: string | null;
  currentPosition?: string | null;
  status?: string | null;
}
/**
 * Structure permissive pour supporter
 * différentes appellations backend.
 */
interface RawGanttRow extends GanttRow {
  baseAttache?: string | null;
  homeBase?: string | null;
  baseAirport?: string | null;
  positionActuelle?: string | null;
  currentAirport?: string | null;
}

interface GanttItem {
  id: string;
  flightId: string;
  flightNumber?: string | null;
  rowId: string;
  aircraftRegistration?: string | null;
  start: string;
  end: string;
  localStart?: string | null;
  localEnd?: string | null;
  origin?: string | null;
  destination?: string | null;
  durationMinutes?: number | null;
  label?: string | null;
  status?: string | null;
  shiftMinutes?: number;
}

interface GanttPayload {
  timezone?: string;
  rows: GanttRow[];
  items: GanttItem[];
}

interface AutoScheduleMetrics {
  totalFlights: number;
  assignedFlights: number;
  unassignedFlights: number;
  shiftedFlights?: number;
  directAssignments?: number;
  operationalAircraft?: number;
}

interface AutoScheduleAssignment {
  flightId: string;
  flightNumber?: string | null;
  aircraftId: string;
  aircraftRegistration?: string | null;
  origin?: string | null;
  destination?: string | null;
  originalDeparture?: string;
  originalArrival?: string;
  departure: string;
  arrival: string;
  localDeparture?: string | null;
  localArrival?: string | null;
  durationMinutes?: number;
  shiftMinutes?: number;
  reason?: string;
}

interface AutoScheduleUnassigned {
  flightId: string;
  flightNumber?: string | null;
  origin?: string | null;
  destination?: string | null;
  departure?: string;
  arrival?: string;
  reason?: string;
}

interface AutoScheduleResponse {
  status: string;
  message?: string;
  generatedAt?: string;
  strategy?: string;
  applied?: boolean;
  turnaroundMinutes?: number;
  shiftStepMinutes?: number;
  maxShiftMinutes?: number;
  assignments?: AutoScheduleAssignment[];
  unassigned?: AutoScheduleUnassigned[];
  metrics: AutoScheduleMetrics;
  gantt: GanttPayload;
}

interface AutoScheduleOptions {
  horizonDays: number;
  turnaroundMinutes: number;
  shiftStepMinutes: number;
  maxShiftMinutes: number;
}

interface MessageState {
  text: string;
  type:
    | 'success'
    | 'error'
    | 'info';
}
/* ============================================================================
 * STATUS CONFIG
 * ========================================================================== */
const STATUS_CONFIG: Record<
  FlightStatus,
  StatusConfigItem
> = {
  Planifié: {
    bg: 'bg-blue-50/90 hover:bg-blue-100/90',
    border: 'border-blue-300',
    text: 'text-blue-900',
    bar: '#2563eb',
    badgeBg:
      'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },

  'En Vol': {
    bg: 'bg-amber-50/90 hover:bg-amber-100/90',
    border: 'border-amber-300',
    text: 'text-amber-900',
    bar: '#d97706',
    badgeBg:
      'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500 animate-pulse',
  },

  Retardé: {
    bg: 'bg-orange-50/90 hover:bg-orange-100/90',
    border: 'border-orange-300',
    text: 'text-orange-900',
    bar: '#ea580c',
    badgeBg:
      'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
  },

  Annulé: {
    bg: 'bg-rose-50/90 hover:bg-rose-100/90',
    border: 'border-rose-300',
    text: 'text-rose-900',
    bar: '#dc2626',
    badgeBg:
      'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },

  Effectué: {
    bg: 'bg-emerald-50/90 hover:bg-emerald-100/90',
    border: 'border-emerald-300',
    text: 'text-emerald-900',
    bar: '#10b981',
    badgeBg:
      'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
};

const DEFAULT_STATUS_CONFIG =
  STATUS_CONFIG.Planifié;

/* ============================================================================
 * STATUS HELPERS
 * ========================================================================== */

const normalizeFlightStatus = (
  value?: string | null,
): FlightStatus => {
  const normalized =
    String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/_/g, ' ');

  if (
    normalized === 'IN-FLIGHT' ||
    normalized === 'IN FLIGHT' ||
    normalized === 'EN VOL'
  ) {
    return 'En Vol';
  }

  if (
    normalized === 'DELAYED' ||
    normalized === 'RETARDÉ' ||
    normalized === 'RETARDE' ||
    normalized === 'SHIFTED'
  ) {
    return 'Retardé';
  }

  if (
    normalized === 'CANCELLED' ||
    normalized === 'CANCELED' ||
    normalized === 'ANNULÉ' ||
    normalized === 'ANNULE'
  ) {
    return 'Annulé';
  }

  if (
    normalized === 'EFFECTUÉ' ||
    normalized === 'EFFECTUE' ||
    normalized === 'DONE' ||
    normalized === 'COMPLETED' ||
    normalized === 'LANDED'
  ) {
    return 'Effectué';
  }
  return 'Planifié';
};

/* ============================================================================
 * DATE HELPERS
 * ========================================================================== */
const safeDate = (
  value?: string | null,
): Date | null => {
  if (!value) {
    return null;
  }
  const date =
    new Date(value);
  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }
  return date;
};
const formatDateTime = (
  value?: string | null,
): string => {
  const date =
    safeDate(value);
  if (!date) {
    return '--:--';
  }
  return date.toLocaleString(
    'fr-FR',
    {
      dateStyle:
        'short',
      timeStyle:
        'short',
    },
  );
};
const formatUtcTick = (
  timestamp: number,
): string =>
  new Intl.DateTimeFormat(
    'fr-FR',
    {
      timeZone:
        'UTC',
      hour:
        '2-digit',
      minute:
        '2-digit',
      hour12:
        false,
    },
  ).format(
    new Date(timestamp),
  );
const formatUtcDay = (
  timestamp: number,
): string =>
  new Intl.DateTimeFormat(
    'fr-FR',
    {
      timeZone:
        'UTC',
      day:
        '2-digit',
      month:
        '2-digit',
    },
  ).format(
    new Date(timestamp),
  );
/* ============================================================================
 * AIRCRAFT HELPERS
 * ========================================================================== */

/**
 * Vérifie si un vol appartient à une ligne Gantt.
 *
 * On compare :
 * - UUID avion ;
 * - immatriculation ;
 * car ton endpoint /flights fournit actuellement
 * ces deux types d'informations.
 */
const flightBelongsToAircraft = (
  flight: Flight,
  row: GanttRow,
): boolean => {
  const flightAircraftId =
    String(
      flight.aircraft ??
        '',
    )
      .trim()
      .toUpperCase();

  const flightRegistration =
    String(
      flight.aircraftModel ??
        '',
    )
      .trim()
      .toUpperCase();
  const rowId =
    String(
      row.aircraftId ??
        '',
    )
      .trim()
      .toUpperCase();
  const rowRegistration =
    String(
      row.aircraftRegistration ??
        '',
    )
      .trim()
      .toUpperCase();

  return Boolean(
    (
      flightAircraftId && rowId && flightAircraftId === rowId)
       || ( flightRegistration && rowRegistration && flightRegistration === rowRegistration
      ),
  );
};

/**
 * Détermine la position opérationnelle actuelle.
 *
 * Priorité :
 *
 * 1. dernier vol Effectué => destination ;
 * 2. vol En Vol => destination comme prochaine position ;
 * 3. premier vol futur => origine ;
 * 4. sinon null.
 *
 * ATTENTION :
 * cette information n'est PAS la base permanente
 * de l'avion.
 */
const inferAircraftCurrentPosition = (
  row: GanttRow,
  flights: Flight[],
): string | null => {
  if (
    row.aircraftId ===
    'UNASSIGNED'
  ) {
    return null;
  }

  const aircraftFlights =
    flights.filter(
      (flight) =>
        flightBelongsToAircraft(
          flight,
          row,
        ),
    );

  if (
    aircraftFlights.length ===
    0
  ) {
    return null;
  }
  const now =
    Date.now();
  /* ----------------------------------------------------------------------
   * 1. VOL EN COURS
   * -------------------------------------------------------------------- */
  const inFlight =
    aircraftFlights
      .filter(
        (flight) =>
          normalizeFlightStatus(
            flight.status,
          ) ===
          'En Vol',
      )
      .sort((a,b,) =>
          (
            safeDate(
              b.departure,
            )?.getTime() ??
            0
          ) -
          (
            safeDate(
              a.departure,
            )?.getTime() ??
            0
          ),
      )[0];
  if (
    inFlight?.destination
  ) {
    return inFlight.destination;
  }
  /* ----------------------------------------------------------------------
   * 2. DERNIER VOL TERMINÉ
   * -------------------------------------------------------------------- */
  const completed =
    aircraftFlights
      .filter(
        (flight) => {
          const status =
            normalizeFlightStatus(
              flight.status,
            );

          const arrival =
            safeDate(
              flight.arrival,
            );

          return (
            status ===
              'Effectué' ||
            (
              arrival !==
                null &&
              arrival.getTime() <=
                now
            )
          );
        },
      )
      .sort(
        (a,b,) =>
          (
            safeDate(
              b.arrival,
            )?.getTime() ??
            0
          ) -
          (
            safeDate(
              a.arrival,
            )?.getTime() ??
            0
          ),
      )[0];
  if (
    completed?.destination
  ) {
    return completed.destination;
  }
  /* ----------------------------------------------------------------------
   * 3. PREMIER VOL FUTUR
   * -------------------------------------------------------------------- */
  const nextFlight =
    aircraftFlights
      .filter(
        (flight) => {
          const departure =
            safeDate(
              flight.departure,
            );
          return Boolean(
            departure &&
              departure.getTime() >
                now,
          );
        },
      )
      .sort(
        (a,b,) =>
          (
            safeDate(
              a.departure,
            )?.getTime() ??
            Number.MAX_SAFE_INTEGER
          ) -
          (
            safeDate(
              b.departure,
            )?.getTime() ??
            Number.MAX_SAFE_INTEGER
          ),
      )[0];

  if (
    nextFlight?.origin
  ) {
    return nextFlight.origin;
  }

  return null;
};

/**
 * Normalise une ligne venant du backend.
 *
 * Supporte :
 * base
 * baseAttache
 * homeBase
 * baseAirport
 *
 * et :
 * currentPosition
 * positionActuelle
 * currentAirport
 */
const normalizeGanttRow = (
  rawRow: RawGanttRow,
  flights: Flight[],
): GanttRow => {
  const base =
    rawRow.base ||
    rawRow.baseAttache ||
    rawRow.homeBase ||
    rawRow.baseAirport ||
    null;

  const backendPosition =
    rawRow.currentPosition ||
    rawRow.positionActuelle ||
    rawRow.currentAirport ||
    null;

  const normalizedRow:
    GanttRow = {
      aircraftId:
        rawRow.aircraftId,
      aircraftRegistration:
        rawRow.aircraftRegistration,
      capacity:
        rawRow.capacity ??
        null,
      base,
      currentPosition:
        backendPosition,
      status:
        rawRow.status ??
        null,
    };
  if (
    !normalizedRow.currentPosition
  ) {
    normalizedRow.currentPosition =
      inferAircraftCurrentPosition(
        normalizedRow,
        flights,
      );
  }
  return normalizedRow;
};
const normalizeGanttPayload = (
  payload: any,
  flights: Flight[],
): GanttPayload => {
  const rawGantt =
    payload?.gantt ??
    payload ??
    {};
  const rawRows:
    RawGanttRow[] =
      Array.isArray(
        rawGantt.rows,
      )
        ? rawGantt.rows
        : [];
  const items:
    GanttItem[] =
      Array.isArray(
        rawGantt.items,
      )
        ? rawGantt.items
        : [];
  return {
    timezone:
      rawGantt.timezone ??
      'UTC',
    rows:
      rawRows.map(
        (row) =>
          normalizeGanttRow(
            row,
            flights,
          ),
      ),
    items,
  };
};

/* ============================================================================
 * API HELPERS
 * ========================================================================== */
const getErrorMessage =
  async (
    response: Response,
    fallback: string,
  ): Promise<string> => {
    try {
      const payload: unknown =
        await response.json();
      if (
        payload &&
        typeof payload ===
          'object'
      ) {
        const data =
          payload as {
            message?: string;

            error?: string;
          };
        return (
          data.message ||
          data.error ||
          fallback
        );
      }
    } catch {
      //
    }
    return fallback;
  };

/* ============================================================================
 * ANALYTICS
 * ========================================================================== */
const buildFallbackAnalytics = (
  flights: Flight[],
): AnalyticsMetrics => {
  const normalized =
    flights.map(
      (
        flight,
      ) => ({
        ...flight,
        uiStatus:
          normalizeFlightStatus(
            flight.status,
          ),
      }),
    );
  const onTimeCount =
    normalized.filter(
      (
        flight,
      ) =>
        flight.uiStatus ===
        'Planifié',
    ).length;
  const delayedCount =
    normalized.filter(
      (flight,) =>
        flight.uiStatus ===
        'Retardé',
    ).length;

  const inFlightCount =
    normalized.filter(
      (flight,) =>
        flight.uiStatus ===
        'En Vol',
    ).length;
  const cancelledCount =
    normalized.filter(
      (flight,) =>
        flight.uiStatus ===
        'Annulé',
    ).length;

  const completedCount =
    normalized.filter(
      (flight,) =>
        flight.uiStatus ===
        'Effectué',
    ).length;

  const denominator =
    Math.max(
      0,
      flights.length -
        cancelledCount -
        inFlightCount,
    );

  const otpRate =
    denominator >
    0
      ? Number(
          (
            (
              onTimeCount /
              denominator
            ) *
            100
          ).toFixed(
            1,
          ),
        )
      : 0;

  return {
    totalFlights:
      flights.length,
    otpRate,
    onTimeCount,
    delayedCount,
    inFlightCount,
    cancelledCount,
    completedCount,
  };
};

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

export const FlightSchedulerDashboard:
  React.FC = () => {
    const [flights,setFlights,] =
      useState<
        Flight[]
      >([]);
    const [analytics,setAnalytics,] =
      useState<
        AnalyticsMetrics | null
      >(
        null,
      );

    const [currentGantt,setCurrentGantt,] =
      useState<GanttPayload>({
        rows: [],
        items: [],
        timezone:
          'UTC',
      });
    const [ currentScheduleMetrics, setCurrentScheduleMetrics,] =
      useState<AutoScheduleMetrics>({
        totalFlights: 0,
        assignedFlights: 0,
        unassignedFlights: 0,
      });
    const [ previewScenario, setPreviewScenario,] =
      useState <AutoScheduleResponse | null >(
        null,
      );
    const [loading,setLoading,] =
      useState(
        false,
      );
    const [ generating, setGenerating ] =
      useState(
        false,
      );
    const [ applying, setApplying ] =
      useState(
        false,
      );

    const [ message, setMessage ] =
      useState <MessageState | null >(
        null,
      );
    const [ searchTerm, setSearchTerm ] =
      useState(
        '',
      );
    const [ selectedStatus, setSelectedStatus ] =
      useState(
        'TOUS',
      );
    const [ lastUpdatedAt, setLastUpdatedAt ] =
      useState<Date | null>(
        null,
      );
    const [ options ] =
      useState<AutoScheduleOptions>({
        horizonDays: 7,
        turnaroundMinutes: 45,
        shiftStepMinutes: 15,
        maxShiftMinutes: 360,
      });
    /* ======================================================================
     * API
     * ==================================================================== */
    const fetchData =
      useCallback(
        async () => {
          setLoading(
            true,
          );
          setMessage(
            null,
          );
          try {
            const ganttUrl = `${API_BASE_URL}${AUTO_SCHEDULE_GANTT_ENDPOINT}` + `?horizonDays=${options.horizonDays}`;
            const [
              flightsResult,
              analyticsResult,
              ganttResult,
            ] =
              await Promise.allSettled(
                [
                  fetch(
                    `${API_BASE_URL}/flights`,
                  ),
                  fetch(
                    `${API_BASE_URL}/flights/analytics`,
                  ),
                  fetch(
                    ganttUrl,
                  ),
                ],
              );
            /* --------------------------------------------------------------
             * FLIGHTS
             * ------------------------------------------------------------ */
            if (
              flightsResult.status !==
                'fulfilled' ||
              !flightsResult
                .value.ok
            ) {
              throw new Error(
                'Impossible de charger les vols.',
              );
            }
            const flightsPayload: unknown =
              await flightsResult.value.json();
            const flightsList:
              Flight[] =
                Array.isArray(
                  flightsPayload,
                )
                  ? flightsPayload
                  : [];
            setFlights(
              flightsList,
            );
            /* --------------------------------------------------------------
             * ANALYTICS
             * ------------------------------------------------------------ */
            if (
              analyticsResult.status ===
                'fulfilled' &&
              analyticsResult
                .value.ok
            ) {
              const payload =
                await analyticsResult.value.json();

              const metrics =
                payload?.metrics ??
                {};
              setAnalytics({
                totalFlights:
                  Number(
                    metrics.totalFlights,
                  ) ||
                  flightsList.length,
                otpRate:
                  Number(
                    metrics.otpRate,
                  ) || 0,
                onTimeCount:
                  Number(
                    metrics.onTimeCount,
                  ) || 0,
                delayedCount:
                  Number(
                    metrics.delayedCount,
                  ) || 0,
                inFlightCount:
                  Number(
                    metrics.inFlightCount,
                  ) || 0,
                cancelledCount:
                  Number(
                    metrics.cancelledCount,
                  ) || 0,
                completedCount:
                  Number(
                    metrics.completedCount ??
                      metrics.effectueCount,
                  ) || 0,
              });
            } else {
              setAnalytics(
                buildFallbackAnalytics(
                  flightsList,
                ),
              );
            }
            /* --------------------------------------------------------------
             * GANTT
             * ------------------------------------------------------------ */
            if (
              ganttResult.status ===
                'fulfilled' &&
              ganttResult
                .value.ok
            ) {
              const payload =
                await ganttResult.value.json();
              const normalizedGantt =
                normalizeGanttPayload(
                  payload,
                  flightsList,
                );
              setCurrentGantt(
                normalizedGantt,
              );
              setCurrentScheduleMetrics(
                payload?.metrics ?? {
                  totalFlights:
                    normalizedGantt
                      .items
                      .length,
                  assignedFlights:
                    normalizedGantt
                      .items
                      .filter(
                        (
                          item,
                        ) =>
                          item.rowId !==
                          'UNASSIGNED',
                      )
                      .length,
                  unassignedFlights:
                    normalizedGantt
                      .items
                      .filter(
                        (
                          item,
                        ) =>
                          item.rowId ===
                          'UNASSIGNED',
                      )
                      .length,
                },
              );
            } else {
              setCurrentGantt({
                rows:[],
                items:[],
                timezone:
                  'UTC',
              });
            }
            setLastUpdatedAt(
              new Date(),
            );
          } catch (
            error: unknown
          ) {
            setMessage({
              text:
                error instanceof
                Error
                  ? error.message
                  : 'Erreur lors du chargement des données.',
              type:
                'error',
            });
          } finally {
            setLoading(
              false,
            );
          }
        },
        [
          options.horizonDays,
        ],
      );

    useEffect(
      () => {void fetchData();},
      [
        fetchData,
      ],
    );

    /* ======================================================================
     * GENERATION
     * ==================================================================== */
    const runAutomaticGeneration =
      async (
        apply: boolean,
      ): Promise<void> => {
        if ( generating || applying ) {
          return;
        }
        if (
          apply
        ) {
          setApplying(
            true,
          );
        } else {
          setGenerating(
            true,
          );
        }
        setMessage( null,);
        try {
          const response =
            await fetch(
              `${API_BASE_URL}${AUTO_SCHEDULE_GENERATE_ENDPOINT}`,
              {
                method:
                  'POST',
                headers: {
                  'Content-Type':
                    'application/json',
                  Accept:
                    'application/json',
                },
                body:
                  JSON.stringify({
                    ...options,
                    apply,
                  }),
              },
            );
          if ( !response.ok) {
            throw new Error(
              await getErrorMessage(
                response,
                'Impossible de générer automatiquement le planning.',
              ),
            );
          }
          const rawResult =
            await response.json();
          const normalizedGantt =
            normalizeGanttPayload(
              rawResult,
              flights,
            );
          const result:
            AutoScheduleResponse =
              {
                ...rawResult,
                gantt:
                  normalizedGantt,
              };
          if (
            apply
          ) {
            setPreviewScenario(
              null,
            );
            setMessage({
              text:
                result.message ||
                'La programmation générée a été appliquée.',
              type:
                'success',
            });
            await fetchData();
          } else {
            setPreviewScenario(result,);
            const unassigned =
              result.metrics
                ?.unassignedFlights ??
              0;
            setMessage({
              text:
                unassigned > 0
                  ? `Scénario généré : ${result.metrics.assignedFlights}/${result.metrics.totalFlights} vols affectés. ${unassigned} vol(s) restent à traiter.`
                  : result.message ||
                    'Scénario automatique généré avec succès.',
              type:
                unassigned > 0
                  ? 'info'
                  : 'success',
            });
          }
        } catch (
          error: unknown
        ) {
          setMessage({
            text:
              error instanceof
                Error
                ? error.message
                : 'Erreur de communication avec le générateur automatique.',
            type:
              'error',
          });
        } finally {
          setGenerating(
            false,
          );
          setApplying(
            false,
          );
        }
      };

    /* ======================================================================
     * NORMALIZED FLIGHTS
     * ==================================================================== */

    const normalizedFlights =
      useMemo(
        () =>
          flights.map(
            (flight,) => ({
              ...flight,
              status:
                normalizeFlightStatus(
                  flight.status,
                ),
            }),
          ),
        [
          flights,
        ],
      );

    const effectiveAnalytics =
      useMemo(
        () =>
          analytics ??
          buildFallbackAnalytics(
            flights,
          ),
        [
          analytics,
          flights,
        ],
      );

    /* ======================================================================
     * FILTERS
     * ==================================================================== */

    const filteredFlights =
      useMemo(
        () => {
          const term =
            searchTerm
              .trim()
              .toLowerCase();

          return normalizedFlights.filter(
            (
              flight,
            ) => {
              const matchesSearch =
                !term ||
                flight.flightNumber
                  .toLowerCase()
                  .includes(
                    term,
                  ) ||
                flight.origin
                  .toLowerCase()
                  .includes(
                    term,
                  ) ||
                flight.destination
                  .toLowerCase()
                  .includes(
                    term,
                  ) ||
                (
                  flight.aircraftModel ||
                  flight.aircraft ||
                  ''
                )
                  .toLowerCase()
                  .includes(
                    term,
                  );

              const matchesStatus =
                selectedStatus ===
                  'TOUS' ||
                flight.status ===
                  selectedStatus;

              return (
                matchesSearch &&
                matchesStatus
              );
            },
          );
        },
        [
          normalizedFlights,
          searchTerm,
          selectedStatus,
        ],
      );

    /* ======================================================================
     * ACTIVE SCHEDULE
     * ==================================================================== */

    const activeSchedule =
      previewScenario
        ?.gantt ??
      currentGantt;

    const activeMetrics =
      previewScenario
        ?.metrics ??
      currentScheduleMetrics;

    const isPreview =
      previewScenario !==
      null;

    const assignmentLookup =
      useMemo(
        () => {
          const map =
            new Map<
              string,
              AutoScheduleAssignment
            >();

          for (
            const assignment of
            previewScenario
              ?.assignments ??
            []
          ) {
            map.set(
              assignment.flightId,

              assignment,
            );
          }

          return map;
        },
        [
          previewScenario,
        ],
      );

    /* ======================================================================
     * GANTT
     * ==================================================================== */

    const ganttData =
      useMemo(
        () => {
          const term =
            searchTerm
              .trim()
              .toLowerCase();

          const filteredItems =
            (
              activeSchedule.items ??
              []
            ).filter(
              (
                item,
              ) => {
                const uiStatus =
                  normalizeFlightStatus(
                    item.status,
                  );

                const matchesStatus =
                  selectedStatus ===
                    'TOUS' ||
                  uiStatus ===
                    selectedStatus;

                const matchesSearch =
                  !term ||
                  [
                    item.flightNumber,
                    item.origin,
                    item.destination,
                    item.aircraftRegistration,
                    item.label,
                  ]
                    .filter(
                      Boolean,
                    )
                    .some(
                      (
                        value,
                      ) =>
                        String(
                          value,
                        )
                          .toLowerCase()
                          .includes(
                            term,
                          ),
                    );

                return (
                  matchesStatus &&
                  matchesSearch
                );
              },
            );

          const itemsByRow =
            new Map<
              string,
              GanttItem[]
            >();

          for (
            const item of
            filteredItems
          ) {
            const rowItems =
              itemsByRow.get(
                item.rowId,
              ) ??
              [];

            rowItems.push(
              item,
            );

            itemsByRow.set(
              item.rowId,

              rowItems,
            );
          }

          const rows =
            (
              activeSchedule.rows ??
              []
            )
              .filter(
                (
                  row,
                ) =>
                  itemsByRow.has(
                    row.aircraftId,
                  ),
              )
              .map(
                (
                  row,
                ) => ({
                  ...row,

                  items:
                    itemsByRow.get(
                      row.aircraftId,
                    ) ??
                    [],
                }),
              );

          const validItems =
            filteredItems.filter(
              (
                item,
              ) => {
                const start =
                  safeDate(
                    item.start,
                  );

                const end =
                  safeDate(
                    item.end,
                  );

                return Boolean(
                  start &&
                    end &&
                    end.getTime() >
                      start.getTime(),
                );
              },
            );

          if (
            validItems.length ===
            0
          ) {
            return {
              rows,

              minTime:
                0,

              maxTime:
                0,

              totalDuration:
                1,

              hourTicks:
                [] as number[],
            };
          }

          const times =
            validItems.flatMap(
              (
                item,
              ) => [
                new Date(
                  item.start,
                ).getTime(),

                new Date(
                  item.end,
                ).getTime(),
              ],
            );

          const rawMin =
            Math.min(
              ...times,
            );

          const rawMax =
            Math.max(
              ...times,
            );

          const minDate =
            new Date(
              rawMin,
            );

          minDate.setUTCHours(
            0,
            0,
            0,
            0,
          );

          const maxDate =
            new Date(
              rawMax,
            );

          maxDate.setUTCHours(
            23,
            59,
            59,
            999,
          );

          const minTime =
            minDate.getTime();

          const maxTime =
            maxDate.getTime();

          const totalDuration =
            Math.max(
              1,

              maxTime -
                minTime,
            );

          const durationDays =
            totalDuration /
            (
              24 *
              3600 *
              1000
            );

          let stepHours =
            3;

          if (
            durationDays >
            7
          ) {
            stepHours =
              24;
          } else if (
            durationDays >
            3
          ) {
            stepHours =
              12;
          } else if (
            durationDays >
            1
          ) {
            stepHours =
              6;
          }

          const stepMs =
            stepHours *
            3600 *
            1000;

          const hourTicks:
            number[] =
              [];

          for (
            let t =
              minTime;
            t <=
            maxTime;
            t +=
            stepMs
          ) {
            hourTicks.push(
              t,
            );
          }

          return {
            rows,

            minTime,

            maxTime,

            totalDuration,

            hourTicks,
          };
        },
        [
          activeSchedule,
          searchTerm,
          selectedStatus,
        ],
      );

    /* ======================================================================
     * CHARTS
     * ==================================================================== */

    const pieChartData =
      useMemo(
        () =>
          [
            {
              name:
                'Planifiés',

              value:
                effectiveAnalytics.onTimeCount ||
                0,

              color:
                STATUS_CONFIG.Planifié.bar,
            },

            {
              name:
                'En Vol',

              value:
                effectiveAnalytics.inFlightCount ||
                0,

              color:
                STATUS_CONFIG[
                  'En Vol'
                ].bar,
            },

            {
              name:
                'Retardés',

              value:
                effectiveAnalytics.delayedCount ||
                0,

              color:
                STATUS_CONFIG.Retardé.bar,
            },

            {
              name:
                'Annulés',

              value:
                effectiveAnalytics.cancelledCount ||
                0,

              color:
                STATUS_CONFIG.Annulé.bar,
            },

            {
              name:
                'Effectués',

              value:
                effectiveAnalytics.completedCount ||
                0,

              color:
                STATUS_CONFIG.Effectué.bar,
            },
          ].filter(
            (
              item,
            ) =>
              item.value >
              0,
          ),
        [
          effectiveAnalytics,
        ],
      );

    const barChartData =
      useMemo(
        () => {
          const hourlyData:
            Record<
              string,
              number
            > =
            {};

          filteredFlights.forEach(
            (
              flight,
            ) => {
              const departure =
                safeDate(
                  flight.departure,
                );

              if (
                !departure
              ) {
                return;
              }

              const hourKey =
                `${departure
                  .getHours()
                  .toString()
                  .padStart(
                    2,
                    '0',
                  )}h`;

              hourlyData[
                hourKey
              ] =
                (
                  hourlyData[
                    hourKey
                  ] ||
                  0
                ) +
                1;
            },
          );

          return Object.keys(
            hourlyData,
          )
            .sort(
              (
                a,
                b,
              ) =>
                parseInt(
                  a,
                  10,
                ) -
                parseInt(
                  b,
                  10,
                ),
            )
            .map(
              (
                hour,
              ) => ({
                hour,

                vols:
                  hourlyData[
                    hour
                  ],
              }),
            );
        },
        [
          filteredFlights,
        ],
      );

    const scenarioShifted =
      previewScenario
        ?.metrics
        ?.shiftedFlights ??
      0;

    const scenarioUnassigned =
      previewScenario
        ?.metrics
        ?.unassignedFlights ??
      activeMetrics
        .unassignedFlights ??
      0;

    /* ======================================================================
     * RENDER
     * ==================================================================== */

    return (
      <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-800 antialiased sm:p-6 lg:p-8">

        <div className="mx-auto max-w-[1600px] space-y-5">

          {/* ============================================================= */}
          {/* HEADER                                                        */}
          {/* ============================================================= */}

          <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:p-6">

            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">

              <div className="flex min-w-0 items-center gap-3 sm:gap-4">

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-md shadow-emerald-950/15">
                  <Plane className="h-5 w-5 rotate-45" />
                </div>

                <div className="min-w-0">

                  <h1 className="truncate text-lg font-black tracking-tight text-slate-950 sm:text-xl">
                    Génération automatique et programmation des vols
                  </h1>

                </div>

              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">

                <button
                  type="button"
                  onClick={() =>
                    void fetchData()
                  }
                  disabled={
                    loading ||
                    generating ||
                    applying
                  }
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >

                  <RefreshCw
                    className={`h-4 w-4 ${
                      loading
                        ? 'animate-spin'
                        : ''
                    }`}
                  />

                  Actualiser

                </button>

                <button
                  type="button"
                  onClick={() =>
                    void runAutomaticGeneration(
                      false,
                    )
                  }
                  disabled={
                    generating ||
                    applying
                  }
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-700 px-4 text-xs font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >

                  <WandSparkles
                    className={`h-4 w-4 ${
                      generating
                        ? 'animate-pulse'
                        : ''
                    }`}
                  />

                  {generating
                    ? 'Génération...'
                    : 'Générer automatiquement'}

                </button>

                {previewScenario && (
                  <>

                    <button
                      type="button"
                      onClick={() =>
                        void runAutomaticGeneration(
                          true,
                        )
                      }
                      disabled={
                        applying ||
                        generating
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-700 bg-sky-700 px-4 text-xs font-black text-white transition hover:bg-sky-800 disabled:opacity-50"
                    >

                      <Play
                        className={`h-4 w-4 ${
                          applying
                            ? 'animate-pulse'
                            : ''
                        }`}
                      />

                      {applying
                        ? 'Application...'
                        : 'Appliquer'}

                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setPreviewScenario(
                          null,
                        )
                      }
                      disabled={
                        applying
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 transition hover:bg-slate-50"
                    >

                      <RotateCcw className="h-4 w-4" />

                      Planning actuel

                    </button>

                  </>
                )}

              </div>

            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">

              <span>
                Horizon :{' '}
                {
                  options.horizonDays
                }{' '}
                jour(s)
              </span>

              <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />

              <span>
                Turnaround :{' '}
                {
                  options.turnaroundMinutes
                }{' '}
                min
              </span>

              <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />

              <span>
                Vue :{' '}
                {isPreview
                  ? 'Scénario généré'
                  : 'Planning appliqué'}
              </span>

              {lastUpdatedAt && (
                <>

                  <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />

                  <span>
                    Synchronisation{' '}
                    {lastUpdatedAt.toLocaleTimeString(
                      'fr-FR',
                      {
                        hour:
                          '2-digit',

                        minute:
                          '2-digit',

                        second:
                          '2-digit',
                      },
                    )}
                  </span>

                </>
              )}

            </div>

          </header>

          {/* ============================================================= */}
          {/* MESSAGE                                                       */}
          {/* ============================================================= */}

          {message && (

            <div
              className={[
                'flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm sm:p-5',

                message.type ===
                'success'
                  ? 'border-emerald-200 bg-emerald-50/90 text-emerald-900'
                  : message.type ===
                      'info'
                    ? 'border-sky-200 bg-sky-50/90 text-sky-900'
                    : 'border-rose-200 bg-rose-50/90 text-rose-900',
              ].join(
                ' ',
              )}
            >

              <div className="flex items-center gap-3 text-xs font-medium sm:text-sm">

                {message.type ===
                'success' ? (

                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />

                ) : (

                  <AlertTriangle
                    className={`h-5 w-5 shrink-0 ${
                      message.type ===
                      'info'
                        ? 'text-sky-600'
                        : 'text-rose-600'
                    }`}
                  />

                )}

                <span>
                  {
                    message.text
                  }
                </span>

              </div>

              <button
                type="button"
                onClick={() =>
                  setMessage(
                    null,
                  )
                }
                className="rounded-lg p-1 text-slate-400 transition hover:text-slate-600"
                aria-label="Fermer"
              >

                <X className="h-4 w-4" />

              </button>

            </div>

          )}


          {/* ============================================================= */}
          {/* KPI                                                           */}
          {/* ============================================================= */}

          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">

            <MetricCard
              label="Vols horizon"
              value={
                activeMetrics.totalFlights ??
                0
              }
              icon={
                <Calendar className="h-4 w-4" />
              }
            />

            <MetricCard
              label="Affectés"
              value={
                activeMetrics.assignedFlights ??
                0
              }
              icon={
                <CheckCircle2 className="h-4 w-4" />
              }
            />

            <MetricCard
              label="Non affectés"
              value={ activeMetrics.unassignedFlights ??  0}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <MetricCard
              label="Décalés"
              value={
                scenarioShifted
              }
              icon={
                <RefreshCw className="h-4 w-4" />
              }
            />
            <MetricCard
              label="Appareils actifs"
              value={
                previewScenario
                  ?.metrics
                  ?.operationalAircraft ??
                activeSchedule.rows.filter(
                  ( row,) =>
                    row.aircraftId !== 'UNASSIGNED',
                ).length
              }
              icon={<Plane className="h-4 w-4" />}
            />
            <MetricCard label="OTP" value={`${effectiveAnalytics.otpRate ?? 0}%`} icon={
                <ShieldCheck className="h-4 w-4" />
              }
            />
          </section>
          {/* ============================================================= */}
          {/* SEARCH                                                        */}
          {/* ============================================================= */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="grid gap-3 xl:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] xl:items-end">
              <div>
                <label className="mb-2 block text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
                  Recherche opérationnelle
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Vol, itinéraire, appareil..."
                    value={searchTerm}
                    onChange={(
                      event,
                    ) => setSearchTerm(event.target.value,)
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-xs font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:bg-white focus:ring-4 focus:ring-emerald-100/70"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() =>
                        setSearchTerm('',)
                      }
                      className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
                  <Filter className="h-3.5 w-3.5" />
                  Statut
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    'TOUS',
                    'Planifié',
                    'En Vol',
                    'Retardé',
                    'Effectué',
                    'Annulé',
                  ].map(
                    (status,) => (
                      <button
                        type="button"
                        key={
                          status
                        }
                        onClick={() =>
                          setSelectedStatus(
                            status,
                          )
                        }
                        className={`h-10 min-w-0 rounded-xl border px-2 text-[9px] font-black uppercase tracking-wide transition sm:text-[10px] ${
                          selectedStatus ===
                          status
                            ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-800'
                        }`}
                      >
                        {status ===
                        'TOUS'
                          ? 'Tous'
                          : status}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>
          </section>
          {/* ============================================================= */}
          {/* GANTT                                                         */}
          {/* ============================================================= */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">

                <BarChart3 className="h-4 w-4 text-emerald-700" />
                <h2 className="text-base font-bold text-slate-900">
                  Programmation graphique des vols
                </h2>
                {isPreview && (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-sky-700">
                    Prévisualisation
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold text-slate-500">
                <LegendDot
                  className="bg-blue-500"
                  label="Programmé"
                />
                <LegendDot
                  className="bg-orange-500"
                  label="Décalé / retardé"
                />
                <LegendDot
                  className="bg-emerald-500"
                  label="Effectué"
                />
              </div>
            </div>
            {ganttData.rows.length ===
            0 ? (
              <div className="flex min-h-60 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
                <div>
                  <Plane className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-3 text-xs font-semibold text-slate-400">
                    Aucun élément Gantt disponible pour les critères sélectionnés.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/20">
                <div className="min-w-362.5 pb-4">
                  {/* ------------------------------------------------------- */}
                  {/* TIME HEADER                                             */}
                  {/* ------------------------------------------------------- */}
                  <div className="sticky top-0 z-30 flex border-b border-slate-200 bg-white/95 py-2.5 shadow-sm">
                    <div className="sticky left-0 z-40 flex w-64 shrink-0 items-center border-r border-slate-200 bg-white pl-4 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Appareil / position
                    </div>
                    <div className="relative h-9 flex-1">
                      {ganttData.hourTicks.map(
                        (tickTime,) => {
                          const left =
                            (  (tickTime -ganttData.minTime ) /  ganttData.totalDuration) *100;
                          return (
                            <div
                              key={  tickTime}
                              className="absolute flex h-full -translate-x-1/2 flex-col items-center justify-between border-l border-slate-200/80 pl-1"
                              style={{left:  `${left}%`,}}
                            >
                              <span className="rounded border border-slate-200/60 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                                {formatUtcTick(
                                  tickTime,
                                )}
                              </span>
                              <span className="font-mono text-[9px] font-semibold text-slate-400">
                                {formatUtcDay(
                                  tickTime,
                                )}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                  {/* ------------------------------------------------------- */}
                  {/* ROWS                                                    */}
                  {/* ------------------------------------------------------- */}
                  <div className="divide-y divide-slate-100">
                    {ganttData.rows.map(
                      (  row,) => (
                        <div
                          key={  row.aircraftId}
                          className="group flex items-center transition hover:bg-slate-50/80">
                          {/* ------------------------------------------------ */}
                          {/* AIRCRAFT                                         */}
                          {/* ------------------------------------------------ */}
                          <div className="sticky left-0 z-20 flex w-64 shrink-0 items-center gap-2.5 border-r border-slate-200 bg-white px-4 py-3 group-hover:bg-slate-50">
                            <div
                              className={`shrink-0 rounded-lg border p-1.5 ${
                                row.aircraftId ===
                                'UNASSIGNED'
                                  ? 'border-rose-100 bg-rose-50 text-rose-600'
                                  : 'border-emerald-100 bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              <Plane className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <span
                                className="block truncate text-xs font-bold text-slate-800"
                                title={  row.aircraftRegistration}>
                                {  row.aircraftRegistration}
                              </span>
                              {/* ============================================ */}
                              {/* CORRECTION BASE / POSITION                   */}
                              {/* ============================================ */}
                              {row.aircraftId ===
                              'UNASSIGNED' ? (
                                <span className="mt-0.5 block truncate text-[9px] font-semibold text-rose-500">
                                  Affectation requise
                                </span>
                              ) : (
                                <>
                                  {row.base && (
                                    <span className="mt-0.5 block truncate text-[9px] font-semibold text-slate-500">
                                      Base :{' '}
                                      <strong>
                                        { row.base}
                                      </strong>
                                      {row.capacity
                                        ? ` · ${row.capacity} sièges`
                                        : ''}
                                    </span>
                                  )}
                                  <span
                                    className={`mt-0.5 flex items-center gap-1 truncate text-[9px] font-semibold ${
                                      row.currentPosition
                                        ? 'text-emerald-700'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                                    {row.currentPosition
                                      ? `Position : ${row.currentPosition}`
                                      : row.base
                                        ? `Position initiale : ${row.base}`
                                        : 'Position à déterminer'}
                                  </span>
                                  {!row.base &&
                                    row.capacity && (
                                      <span className="mt-0.5 block truncate text-[9px] font-semibold text-slate-400">
                                        {
                                          row.capacity
                                        }{' '}
                                        sièges
                                      </span>
                                    )}
                                </>
                              )}
                            </div>
                          </div>
                          {/* ------------------------------------------------ */}
                          {/* TIMELINE                                         */}
                          {/* ------------------------------------------------ */}
                          <div className="relative mx-2 my-1 h-16 flex-1 rounded-lg bg-white/40">
                            {ganttData.hourTicks.map(
                              (
                                tickTime,
                              ) => {
                                const left =
                                  (
                                    (
                                      tickTime -
                                      ganttData.minTime
                                    ) /
                                    ganttData.totalDuration
                                  ) *
                                  100;
                                return (
                                  <div
                                    key={`grid-${row.aircraftId}-${tickTime}`}
                                    className="absolute bottom-0 top-0 border-l border-slate-100"
                                    style={{
                                      left:
                                        `${left}%`,
                                    }}
                                  />

                                );
                              },
                            )}
                            {row.items.map(
                              (item,) => {
                                const start =
                                  safeDate(  item.start,);
                                const end =
                                  safeDate(  item.end,);
                                if (
                                  !start ||
                                  !end
                                ) {
                                  return null;
                                }
                                const startMs =
                                  start.getTime();
                                const endMs =
                                  end.getTime();
                                const left =
                                  Math.max(
                                    0,
                                    (
                                      (
                                        startMs -
                                        ganttData.minTime
                                      ) /
                                      ganttData.totalDuration
                                    ) *
                                      100,
                                  );
                                const width =
                                  Math.max(
                                    0.5,
                                    (
                                      (
                                        endMs -
                                        startMs
                                      ) /
                                      ganttData.totalDuration
                                    ) *
                                      100,
                                  );
                                const uiStatus =
                                  normalizeFlightStatus(
                                    item.status,
                                  );

                                const config =
                                  STATUS_CONFIG[
                                    uiStatus
                                  ] ??
                                  DEFAULT_STATUS_CONFIG;
                                const assignment =
                                  assignmentLookup.get(
                                    item.flightId,
                                  );
                                const shiftMinutes =
                                  item.shiftMinutes ??
                                  assignment
                                    ?.shiftMinutes ??
                                  0;
                                const localStart =
                                  item.localStart ??
                                  assignment
                                    ?.localDeparture;
                                const localEnd =
                                  item.localEnd ??
                                  assignment
                                    ?.localArrival;
                                return (
                                  <div
                                    key={
                                      item.id
                                    }
                                    className={`absolute bottom-2 top-2 flex min-w-31.25 cursor-pointer items-center justify-between rounded-xl border px-3 py-1.5 shadow-sm transition hover:z-30 hover:scale-[1.01] hover:shadow-md ${config.bg} ${config.border}`}
                                    style={{
                                      left:
                                        `${left}%`,
                                      width:
                                        `${width}%`,
                                    }}
                                    title={[
                                      `Vol ${item.flightNumber ?? ''}`,
                                      `${item.origin ?? '?'} → ${item.destination ?? '?'}`,
                                      `Départ UTC : ${formatDateTime(item.start)}`,
                                      `Arrivée UTC : ${formatDateTime(item.end)}`,
                                      localStart
                                        ? `Départ local : ${formatDateTime(localStart)}`
                                        : '',
                                      localEnd
                                        ? `Arrivée locale : ${formatDateTime(localEnd)}`
                                        : '',
                                      row.base
                                        ? `Base appareil : ${row.base}`
                                        : '',
                                      row.currentPosition
                                        ? `Position : ${row.currentPosition}`
                                        : '',
                                      shiftMinutes >
                                      0
                                        ? `Décalage automatique : +${shiftMinutes} min`
                                        : 'Aucun décalage',
                                    ]
                                      .filter(
                                        Boolean,
                                      )
                                      .join(
                                        '\n',
                                      )}
                                  >
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      <span
                                        className={`h-2 w-2 shrink-0 rounded-full ${config.dot}`}
                                      />
                                      <span
                                        className={`truncate text-xs font-extrabold tracking-tight ${config.text}`}
                                      >
                                        {item.flightNumber}
                                      </span>
                                      {shiftMinutes >
                                        0 && (

                                        <span className="shrink-0 rounded-full border border-orange-200 bg-white/80 px-1.5 py-0.5 text-[8px] font-black text-orange-700">
                                          +
                                          {
                                            shiftMinutes
                                          }
                                          m
                                        </span>
                                      )}
                                    </div>
                                    <div className="ml-2 flex shrink-0 items-center gap-1 rounded border border-slate-200/50 bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                      <span>
                                        {item.origin}
                                      </span>
                                      <span className="text-slate-400">
                                        ➔
                                      </span>
                                      <span>
                                        {item.destination}
                                      </span>
                                    </div>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
          {/* ============================================================= */}
          {/* PREVIEW                                                       */}
          {/* ============================================================= */}
          {previewScenario && (
            <section className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 sm:p-5">
                <h3 className="text-sm font-black text-sky-900">
                  Résultat du générateur
                </h3>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <SmallValue
                    label="Affectations directes"
                    value={
                      previewScenario
                        .metrics
                        .directAssignments ??
                      0
                    }
                  />
                  <SmallValue
                    label="Vols décalés"
                    value={
                      previewScenario
                        .metrics
                        .shiftedFlights ??
                      0
                    }
                  />
                  <SmallValue
                    label="Avions opérationnels"
                    value={
                      previewScenario
                        .metrics
                        .operationalAircraft ??
                      0
                    }
                  />
                  <SmallValue
                    label="Stratégie"
                    value={
                      previewScenario.strategy ??
                      'deterministic-greedy-v1'
                    }
                  />
                </div>
              </div>
              <div
                className={`rounded-2xl border p-4 sm:p-5 ${
                  scenarioUnassigned >
                  0
                    ? 'border-amber-200 bg-amber-50/60'
                    : 'border-emerald-200 bg-emerald-50/60'
                }`}>
                <h3
                  className={`text-sm font-black ${
                    scenarioUnassigned >
                    0
                      ? 'text-amber-900'
                      : 'text-emerald-900'
                  }`}
                >
                  Vols non affectés
                </h3>
                {(
                  previewScenario.unassigned ??
                  []
                ).length ===
                0 ? (
                  <p className="mt-3 text-xs font-semibold text-emerald-700">
                    Tous les vols du scénario ont reçu une affectation.
                  </p>
                ) : (
                  <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
                    {( previewScenario.unassigned ?? []).map((item,) => (
                        <div
                          key={item.flightId}
                          className="flex items-center
                                     justify-between 
                                     gap-3 rounded-xl 
                                     border border-amber-200
                                   bg-white px-3 py-2"
                        >
                          <div>
                            <span className="font-mono text-xs font-black text-slate-900">
                              {item.flightNumber}
                            </span>
                            <span className="ml-2 text-[10px] font-semibold text-slate-500">
                              {item.origin}{' '}→{' '}
                              {item.destination}
                            </span>
                          </div>
                          <span className="text-[9px] font-black uppercase text-amber-700">
                            {item.reason}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
          {/* ============================================================= */}
          {/* CHARTS                                                        */}
          {/* ============================================================= */}
          <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="mb-2 text-sm font-bold text-slate-900">
                Répartition par statut
              </h3>
              <div className="relative h-60 w-full">
                {pieChartData.length >
                0 ? (
                  <>
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <PieChart>
                        <Pie
                          data={
                            pieChartData
                          }
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={85}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {pieChartData.map(
                            (
                              entry,
                              index,
                            ) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={
                                  entry.color
                                }
                                stroke="#ffffff"
                                strokeWidth={
                                  2
                                }
                              />
                            ),
                          )}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-slate-800">
                        {
                          effectiveAnalytics.totalFlights
                        }
                      </span>
                      <span className="text-[10px] font-semibold uppercase text-slate-400">
                        Vols
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    Aucune donnée disponible
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="mb-2 text-sm font-bold text-slate-900">
                Départs par tranche horaire
              </h3>
              <div className="h-60 w-full">
                {barChartData.length >
                0 ? (
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <BarChart
                      data={
                        barChartData
                      }
                      margin={{
                        top:10,
                        right:10,
                        left:-20,
                        bottom:0,
                      }}
                    >
                      <XAxis
                        dataKey="hour"
                        stroke="#94a3b8"
                        tick={{
                          fill:
                            '#64748b',

                          fontSize:
                            11,
                        }}
                        tickLine={
                          false
                        }
                      />
                      <YAxis
                        stroke="#94a3b8"
                        tick={{
                          fill:
                            '#64748b',

                          fontSize:
                            11,
                        }}
                        tickLine={
                          false
                        }
                        allowDecimals={
                          false
                        }
                      />
                      <Tooltip />
                      <Bar
                        dataKey="vols"
                        fill="#047857"
                        radius={[6,6,0,0,]}
                        barSize={
                          24
                        }
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    Aucun départ enregistré
                  </div>
                )}
              </div>
            </div>
          </section>
          {/* ============================================================= */}
          {/* TABLE                                                         */}
          {/* ============================================================= */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 sm:p-5">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Layers className="h-4 w-4 text-emerald-700" />
                Registre des vols
              </h3>
              <span className="text-xs font-semibold text-slate-400">
                {
                  filteredFlights.length
                }{' '}
                vol(s)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-225 text-left text-xs text-slate-600 sm:text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Vol</th>
                    <th className="px-4 py-3">Itinéraire</th>
                    <th className="px-4 py-3">Départ</th>
                    <th className="px-4 py-3">Arrivée</th>
                    <th className="px-4 py-3">Appareil</th>
                    <th className="px-4 py-3 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFlights.length ===
                  0 ? (
                    <tr>
                      <td
                        colSpan={
                          6
                        }
                        className="px-4 py-8 text-center text-xs text-slate-400"
                      >
                        Aucun vol trouvé
                      </td>
                    </tr>
                  ) : (
                    filteredFlights.map(
                      (
                        flight,
                      ) => {
                        const status =
                          normalizeFlightStatus(
                            flight.status,
                          );
                        const config =
                          STATUS_CONFIG[
                            status
                          ] ??
                          DEFAULT_STATUS_CONFIG;
                        return (
                          <tr
                            key={
                              flight.id
                            }
                            className="transition hover:bg-slate-50/80"
                          >
                            <td className="px-4 py-3.5 font-bold text-slate-900">
                              {
                                flight.flightNumber
                              }
                            </td>
                            <td className="px-4 py-3.5 font-semibold text-slate-700">
                              {
                                flight.origin
                              }{' '}
                              ➔{' '}
                              {
                                flight.destination
                              }
                            </td>
                            <td className="px-4 py-3.5 text-slate-500">
                              {formatDateTime(
                                flight.localDeparture ??
                                  flight.departure,
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-slate-500">
                              {formatDateTime(
                                flight.localArrival ??
                                  flight.arrival,
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-slate-600">
                              {flight.aircraftModel ||
                                flight.aircraft ||
                                'Non assigné'}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.badgeBg}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${config.dot}`}
                                />
                                {
                                  status
                                }
                              </span>
                            </td>
                          </tr>
                        );
                      },
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    );
  };
/* ============================================================================
 * SMALL COMPONENTS
 * ========================================================================== */
function NumberField({label,value,min,max,
  onChange,
}: {
  label:string;
  value:number;
  min:number;
  max:number;
  onChange:
    (
      value: number,
    ) => void;
}) {
  return (
    <label className="block">

      <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-slate-400">
        {
          label
        }
      </span>

      <input
        type="number"
        min={
          min
        }
        max={
          max
        }
        value={
          value
        }
        onChange={(
          event,
        ) => {
          const parsed =
            Number(
              event.target.value,
            );

          onChange(
            Math.max(
              min,

              Math.min(
                max,

                Number.isFinite(
                  parsed,
                )
                  ? parsed
                  : min,
              ),
            ),
          );
        }}
        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-emerald-700 focus:bg-white focus:ring-4 focus:ring-emerald-100/60"
      />

    </label>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label:
    string;

  value:
    string |
    number;

  icon:
    React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

      <div className="flex items-center justify-between text-slate-400">

        <span className="text-[9px] font-black uppercase tracking-wider">
          {
            label
          }
        </span>

        {
          icon
        }

      </div>

      <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
        {
          value
        }
      </div>

    </div>
  );
}

function SmallValue({
  label,
  value,
}: {
  label:
    string;

  value:
    string |
    number;
}) {
  return (
    <div className="rounded-xl border border-white/80 bg-white p-3">

      <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
        {
          label
        }
      </span>

      <strong className="mt-1 block truncate text-sm font-black text-slate-800">
        {
          value
        }
      </strong>

    </div>
  );
}

function LegendDot({
  className,
  label,
}: {
  className:
    string;

  label:
    string;
}) {
  return (
    <span className="flex items-center gap-1.5">

      <span
        className={`h-2.5 w-2.5 rounded-full ${className}`}
      />

      {
        label
      }

    </span>
  );
}

export default FlightSchedulerDashboard;