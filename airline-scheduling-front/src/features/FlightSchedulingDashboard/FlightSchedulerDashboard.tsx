import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Plane,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  WandSparkles,
  X,
} from 'lucide-react';

import FlightSchedulerGantt, {
  type AutoScheduleAssignment,
  type GanttPayload,
  type GanttRow,
} from './FlightSchedulerGantt';

import FlightSchedulerDetails, {
  type AnalyticsMetrics,
  type AutoScheduleMetrics,
  type AutoScheduleResponse,
  type Flight,
} from './FlightSchedulerDetails';

/* ============================================================================
 * API
 * ========================================================================== */

const API_BASE_URL =
  (typeof import.meta !==
    'undefined' &&
    import.meta.env
      ?.VITE_API_BASE_URL) ||
  (typeof globalThis !==
    'undefined' &&
    (
      globalThis as any
    ).process?.env
      ?.REACT_APP_API_BASE_URL) ||
  'http://localhost:5000';

const AUTO_SCHEDULE_GENERATE_ENDPOINT =
  '/flights/auto-schedule/generate';

const AUTO_SCHEDULE_GANTT_ENDPOINT =
  '/flights/auto-schedule/gantt';

/* ============================================================================
 * TYPES
 * ========================================================================== */

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

interface RawGanttRow
  extends GanttRow {
  baseAttache?: string | null;
  homeBase?: string | null;
  baseAirport?: string | null;
  positionActuelle?: string | null;
  currentAirport?: string | null;
}

/* ============================================================================
 * STATUS
 * ========================================================================== */

const normalizeFlightStatus = (
  value?: string | null,
) => {
  const normalized =
    String(
      value ?? '',
    )
      .trim()
      .toUpperCase()
      .replace(
        /_/g,
        ' ',
      );

  if (
    [
      'IN-FLIGHT',
      'IN FLIGHT',
      'EN VOL',
    ].includes(
      normalized,
    )
  ) {
    return 'En Vol';
  }

  if (
    [
      'DELAYED',
      'RETARDÉ',
      'RETARDE',
      'SHIFTED',
    ].includes(
      normalized,
    )
  ) {
    return 'Retardé';
  }

  if (
    [
      'CANCELLED',
      'CANCELED',
      'ANNULÉ',
      'ANNULE',
    ].includes(
      normalized,
    )
  ) {
    return 'Annulé';
  }

  if (
    [
      'EFFECTUÉ',
      'EFFECTUE',
      'DONE',
      'COMPLETED',
      'LANDED',
    ].includes(
      normalized,
    )
  ) {
    return 'Effectué';
  }

  return 'Planifié';
};

/* ============================================================================
 * HELPERS
 * ========================================================================== */

const safeDate = (
  value?: string | null,
): Date | null => {
  if (!value) {
    return null;
  }

  const date =
    new Date(
      value,
    );

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date;
};

const flightBelongsToAircraft = (
  flight: Flight,
  row: GanttRow,
): boolean => {
  const aircraftId =
    String(
      flight.aircraft ??
      '',
    )
      .trim()
      .toUpperCase();

  const registration =
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
      aircraftId &&
      rowId &&
      aircraftId ===
        rowId
    ) ||
    (
      registration &&
      rowRegistration &&
      registration ===
        rowRegistration
    ),
  );
};

const inferAircraftPosition = (
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
      (
        flight,
      ) =>
        flightBelongsToAircraft(
          flight,
          row,
        ),
    );

  const now =
    Date.now();

  const inFlight =
    aircraftFlights.find(
      (
        flight,
      ) =>
        normalizeFlightStatus(
          flight.status,
        ) ===
        'En Vol',
    );

  if (
    inFlight?.destination
  ) {
    return inFlight.destination;
  }

  const completed =
    aircraftFlights
      .filter(
        (
          flight,
        ) => {
          const arrival =
            safeDate(
              flight.arrival,
            );

          return (
            normalizeFlightStatus(
              flight.status,
            ) ===
              'Effectué' ||
            Boolean(
              arrival &&
              arrival.getTime() <=
                now,
            )
          );
        },
      )
      .sort(
        (
          first,
          second,
        ) =>
          (
            safeDate(
              second.arrival,
            )?.getTime() ??
            0
          ) -
          (
            safeDate(
              first.arrival,
            )?.getTime() ??
            0
          ),
      )[0];

  if (
    completed?.destination
  ) {
    return completed.destination;
  }

  const next =
    aircraftFlights
      .filter(
        (
          flight,
        ) => {
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
        (
          first,
          second,
        ) =>
          (
            safeDate(
              first.departure,
            )?.getTime() ??
            Number.MAX_SAFE_INTEGER
          ) -
          (
            safeDate(
              second.departure,
            )?.getTime() ??
            Number.MAX_SAFE_INTEGER
          ),
      )[0];

  return (
    next?.origin ??
    null
  );
};

const normalizeGanttPayload = (
  payload: any,
  flights: Flight[],
): GanttPayload => {
  const gantt =
    payload?.gantt ??
    payload ??
    {};

  const rows:
    RawGanttRow[] =
    Array.isArray(
      gantt.rows,
    )
      ? gantt.rows
      : [];

  return {
    timezone:
      gantt.timezone ??
      'UTC',

    items:
      Array.isArray(
        gantt.items,
      )
        ? gantt.items
        : [],

    rows:
      rows.map(
        (
          row,
        ) => {
          const base =
            row.base ||
            row.baseAttache ||
            row.homeBase ||
            row.baseAirport ||
            null;

          const currentPosition =
            row.currentPosition ||
            row.positionActuelle ||
            row.currentAirport ||
            null;

          const normalized:
            GanttRow = {
            aircraftId:
              row.aircraftId,

            aircraftRegistration:
              row.aircraftRegistration,

            capacity:
              row.capacity ??
              null,

            base,

            currentPosition,

            status:
              row.status ??
              null,
          };

          if (
            !normalized.currentPosition
          ) {
            normalized.currentPosition =
              inferAircraftPosition(
                normalized,
                flights,
              );
          }

          return normalized;
        },
      ),
  };
};

const buildFallbackAnalytics = (
  flights: Flight[],
): AnalyticsMetrics => {
  const statuses =
    flights.map(
      (
        flight,
      ) =>
        normalizeFlightStatus(
          flight.status,
        ),
    );

  const count =
    (
      status: string,
    ) =>
      statuses.filter(
        (
          current,
        ) =>
          current ===
          status,
      ).length;

  const onTimeCount =
    count(
      'Planifié',
    );

  const delayedCount =
    count(
      'Retardé',
    );

  const inFlightCount =
    count(
      'En Vol',
    );

  const cancelledCount =
    count(
      'Annulé',
    );

  const completedCount =
    count(
      'Effectué',
    );

  const denominator =
    Math.max(
      0,
      flights.length -
      cancelledCount -
      inFlightCount,
    );

  return {
    totalFlights:
      flights.length,

    otpRate:
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
        : 0,

    onTimeCount,
    delayedCount,
    inFlightCount,
    cancelledCount,
    completedCount,
  };
};

const getErrorMessage =
  async (
    response: Response,
    fallback: string,
  ): Promise<string> => {
    try {
      const payload =
        await response.json();

      return (
        payload?.message ||
        payload?.error ||
        fallback
      );
    } catch {
      return fallback;
    }
  };

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

export const FlightSchedulerDashboard:
  React.FC = () => {
    /* ======================================================================
     * STATES
     * ==================================================================== */

    const [
      flights,
      setFlights,
    ] =
      useState<
        Flight[]
      >([]);

    const [
      analytics,
      setAnalytics,
    ] =
      useState<
        AnalyticsMetrics | null
      >(null);

    const [
      currentGantt,
      setCurrentGantt,
    ] =
      useState<GanttPayload>({
        rows: [],
        items: [],
        timezone:
          'UTC',
      });

    const [
      currentMetrics,
      setCurrentMetrics,
    ] =
      useState<AutoScheduleMetrics>({
        totalFlights: 0,
        assignedFlights: 0,
        unassignedFlights: 0,
      });

    const [
      previewScenario,
      setPreviewScenario,
    ] =
      useState<
        AutoScheduleResponse | null
      >(null);

    const [
      loading,
      setLoading,
    ] =
      useState(
        false,
      );

    const [
      generating,
      setGenerating,
    ] =
      useState(
        false,
      );

    const [
      applying,
      setApplying,
    ] =
      useState(
        false,
      );

    const [
      message,
      setMessage,
    ] =
      useState<
        MessageState | null
      >(null);

    const [
      searchTerm,
      setSearchTerm,
    ] =
      useState('');

    const [
      selectedStatus,
      setSelectedStatus,
    ] =
      useState(
        'TOUS',
      );

    const [
      lastUpdatedAt,
      setLastUpdatedAt,
    ] =
      useState<
        Date | null
      >(null);

    const [
      options,
    ] =
      useState<AutoScheduleOptions>({
        horizonDays:
          7,

        turnaroundMinutes:
          45,

        shiftStepMinutes:
          15,

        maxShiftMinutes:
          360,
      });

    /* ======================================================================
     * LOAD DATA
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
            const ganttUrl =
              `${API_BASE_URL}${AUTO_SCHEDULE_GANTT_ENDPOINT}` +
              `?horizonDays=${options.horizonDays}`;

            const [
              flightsResponse,
              analyticsResponse,
              ganttResponse,
            ] =
              await Promise.all([
                fetch(
                  `${API_BASE_URL}/flights`,
                ),

                fetch(
                  `${API_BASE_URL}/flights/analytics`,
                ),

                fetch(
                  ganttUrl,
                ),
              ]);

            if (
              !flightsResponse.ok
            ) {
              throw new Error(
                'Impossible de charger les vols.',
              );
            }

            const flightPayload =
              await flightsResponse.json();

            const flightList:
              Flight[] =
              Array.isArray(
                flightPayload,
              )
                ? flightPayload
                : [];

            setFlights(
              flightList,
            );

            /* ANALYTICS */

            if (
              analyticsResponse.ok
            ) {
              const payload =
                await analyticsResponse.json();

              const metrics =
                payload?.metrics ??
                {};

              setAnalytics({
                totalFlights:
                  Number(
                    metrics.totalFlights,
                  ) ||
                  flightList.length,

                otpRate:
                  Number(
                    metrics.otpRate,
                  ) ||
                  0,

                onTimeCount:
                  Number(
                    metrics.onTimeCount,
                  ) ||
                  0,

                delayedCount:
                  Number(
                    metrics.delayedCount,
                  ) ||
                  0,

                inFlightCount:
                  Number(
                    metrics.inFlightCount,
                  ) ||
                  0,

                cancelledCount:
                  Number(
                    metrics.cancelledCount,
                  ) ||
                  0,

                completedCount:
                  Number(
                    metrics.completedCount ??
                    metrics.effectueCount,
                  ) ||
                  0,
              });
            } else {
              setAnalytics(
                buildFallbackAnalytics(
                  flightList,
                ),
              );
            }

            /* GANTT */

            if (
              ganttResponse.ok
            ) {
              const payload =
                await ganttResponse.json();

              const gantt =
                normalizeGanttPayload(
                  payload,
                  flightList,
                );

              setCurrentGantt(
                gantt,
              );

              setCurrentMetrics(
                payload?.metrics ?? {
                  totalFlights:
                    gantt.items.length,

                  assignedFlights:
                    gantt.items.filter(
                      (
                        item,
                      ) =>
                        item.rowId !==
                        'UNASSIGNED',
                    ).length,

                  unassignedFlights:
                    gantt.items.filter(
                      (
                        item,
                      ) =>
                        item.rowId ===
                        'UNASSIGNED',
                    ).length,
                },
              );
            }

            setLastUpdatedAt(
              new Date(),
            );
          } catch (
            error:
              unknown
          ) {
            setMessage({
              type:
                'error',

              text:
                error instanceof
                  Error
                  ? error.message
                  : 'Erreur lors du chargement.',
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
      () => {
        void fetchData();
      },
      [
        fetchData,
      ],
    );

    /* ======================================================================
     * GENERATION
     * ==================================================================== */

    const runAutomaticGeneration =
      async (
        apply:
          boolean,
      ) => {
        if (
          generating ||
          applying
        ) {
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

        setMessage(
          null,
        );

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

          if (
            !response.ok
          ) {
            throw new Error(
              await getErrorMessage(
                response,
                'Impossible de générer le planning.',
              ),
            );
          }

          const rawResult =
            await response.json();

          const result =
            {
              ...rawResult,

              gantt:
                normalizeGanttPayload(
                  rawResult,
                  flights,
                ),
            } as AutoScheduleResponse;

          if (
            apply
          ) {
            setPreviewScenario(
              null,
            );

            setMessage({
              type:
                'success',

              text:
                result.message ||
                'La programmation a été appliquée.',
            });

            await fetchData();

            return;
          }

          setPreviewScenario(
            result,
          );

          const unassigned =
            result.metrics
              .unassignedFlights ??
            0;

          setMessage({
            type:
              unassigned >
              0
                ? 'info'
                : 'success',

            text:
              unassigned >
              0
                ? `Scénario : ${result.metrics.assignedFlights}/${result.metrics.totalFlights} vols affectés.`
                : 'Scénario généré avec succès.',
          });
        } catch (
          error:
            unknown
        ) {
          setMessage({
            type:
              'error',

            text:
              error instanceof
                Error
                ? error.message
                : 'Erreur de génération.',
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
     * DERIVED DATA
     * ==================================================================== */

    const normalizedFlights =
      useMemo(
        () =>
          flights.map(
            (
              flight,
            ) => ({
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
                [
                  flight.flightNumber,
                  flight.origin,
                  flight.destination,
                  flight.aircraft,
                  flight.aircraftModel,
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

    const effectiveAnalytics =
      analytics ??
      buildFallbackAnalytics(
        flights,
      );

    const activeSchedule =
      previewScenario
        ?.gantt as GanttPayload ??
      currentGantt;

    const activeMetrics =
      previewScenario
        ?.metrics ??
      currentMetrics;

    const isPreview =
      Boolean(
        previewScenario,
      );

    const assignmentLookup =
      useMemo(
        () => {
          const map =
            new Map<
              string,
              AutoScheduleAssignment
            >();

          const assignments =
            previewScenario
              ?.assignments as
              | AutoScheduleAssignment[]
              | undefined;

          assignments?.forEach(
            (
              assignment,
            ) =>
              map.set(
                assignment.flightId,
                assignment,
              ),
          );

          return map;
        },
        [
          previewScenario,
        ],
      );

    /* ======================================================================
     * RENDER
     * ==================================================================== */

    return (
      <div className="min-h-screen bg-slate-100 p-4 text-slate-800 sm:p-6 lg:p-8">

        <div className="mx-auto max-w-[1600px] space-y-5">

          {/* HEADER */}

          <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">

            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">

              <div className="flex items-center gap-3">

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-white">
                  <Plane className="h-5 w-5 rotate-45" />
                </div>

                <div>

                  <h1 className="text-lg font-black text-slate-950 sm:text-xl">
                    Génération automatique et programmation des vols
                  </h1>

                  <p className="mt-1 text-xs text-slate-500">
                    Horizon {options.horizonDays} jours · Turnaround {options.turnaroundMinutes} min
                  </p>

                </div>

              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex">

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
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700"
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
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white"
                >

                  <WandSparkles className="h-4 w-4" />

                  {generating
                    ? 'Génération...'
                    : 'Générer'}

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
                        applying
                      }
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-xs font-black text-white"
                    >

                      <Play className="h-4 w-4" />

                      Appliquer

                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setPreviewScenario(
                          null,
                        )
                      }
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black"
                    >

                      <RotateCcw className="h-4 w-4" />

                      Actuel

                    </button>
                  </>
                )}

              </div>

            </div>

            {lastUpdatedAt && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] font-semibold text-slate-400">
                Dernière synchronisation :{' '}
                {lastUpdatedAt.toLocaleTimeString(
                  'fr-FR',
                )}
              </p>
            )}

          </header>

          {/* MESSAGE */}

          {message && (
            <div
              className={`flex items-center justify-between rounded-2xl border p-4 ${
                message.type ===
                'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : message.type ===
                      'info'
                    ? 'border-sky-200 bg-sky-50 text-sky-900'
                    : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >

              <span className="text-xs font-semibold">
                {message.text}
              </span>

              <button
                type="button"
                onClick={() =>
                  setMessage(
                    null,
                  )
                }
              >
                <X className="h-4 w-4" />
              </button>

            </div>
          )}

          {/* KPI */}

          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">

            <MetricCard
              label="Vols horizon"
              value={
                activeMetrics.totalFlights
              }
              icon={
                <Calendar className="h-4 w-4" />
              }
            />

            <MetricCard
              label="Affectés"
              value={
                activeMetrics.assignedFlights
              }
              icon={
                <CheckCircle2 className="h-4 w-4" />
              }
            />

            <MetricCard
              label="Non affectés"
              value={
                activeMetrics.unassignedFlights
              }
              icon={
                <AlertTriangle className="h-4 w-4" />
              }
            />

            <MetricCard
              label="Décalés"
              value={
                previewScenario
                  ?.metrics
                  .shiftedFlights ??
                0
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
                  .operationalAircraft ??
                activeSchedule.rows.filter(
                  (
                    row,
                  ) =>
                    row.aircraftId !==
                    'UNASSIGNED',
                ).length
              }
              icon={
                <Plane className="h-4 w-4" />
              }
            />

            <MetricCard
              label="OTP"
              value={`${effectiveAnalytics.otpRate}%`}
              icon={
                <ShieldCheck className="h-4 w-4" />
              }
            />

          </section>

          {/* FILTER */}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

            <div className="grid gap-3 xl:grid-cols-[420px_1fr]">

              <div className="relative">

                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  value={
                    searchTerm
                  }
                  onChange={(
                    event,
                  ) =>
                    setSearchTerm(
                      event.target.value,
                    )
                  }
                  placeholder="Vol, itinéraire, appareil..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-xs"
                />

              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">

                {[
                  'TOUS',
                  'Planifié',
                  'En Vol',
                  'Retardé',
                  'Effectué',
                  'Annulé',
                ].map(
                  (
                    status,
                  ) => (
                    <button
                      key={
                        status
                      }
                      type="button"
                      onClick={() =>
                        setSelectedStatus(
                          status,
                        )
                      }
                      className={`h-10 rounded-xl border text-[10px] font-black ${
                        selectedStatus ===
                        status
                          ? 'border-emerald-700 bg-emerald-700 text-white'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {status}
                    </button>
                  ),
                )}

              </div>

            </div>

          </section>

          {/* CHILD 1 */}

          <FlightSchedulerGantt
            schedule={
              activeSchedule
            }
            searchTerm={
              searchTerm
            }
            selectedStatus={
              selectedStatus
            }
            isPreview={
              isPreview
            }
            assignmentLookup={
              assignmentLookup
            }
          />

          {/* CHILD 2 */}

          <FlightSchedulerDetails
            flights={
              filteredFlights
            }
            analytics={
              effectiveAnalytics
            }
            previewScenario={
              previewScenario
            }
          />

        </div>

      </div>
    );
  };

/* ============================================================================
 * KPI
 * ========================================================================== */

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;

  value:
    string | number;

  icon:
    React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

      <div className="flex items-center justify-between text-slate-400">

        <span className="text-[9px] font-black uppercase tracking-wider">
          {label}
        </span>

        {icon}

      </div>

      <div className="mt-2 text-2xl font-black text-slate-900">
        {value}
      </div>

    </div>
  );
}

export default FlightSchedulerDashboard;