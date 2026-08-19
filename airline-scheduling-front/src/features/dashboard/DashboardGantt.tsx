import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  CloudLightning,
  CloudRain,
  Cpu,
  Filter,
  Gauge,
  Plane,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  Timer,
  X,
} from 'lucide-react';

import { FlightAddModal } from './FlightAddModal';

/* ============================================================================
 * CONFIGURATION
 * ========================================================================== */

const API_BASE_URL =
  (
    import.meta as unknown as {
      env?: Record<string, string>;
    }
  ).env?.VITE_API_BASE_URL ??
  'http://localhost:5000';

const UNASSIGNED_AIRCRAFT =
  'NON ASSIGNÉ';

/* ============================================================================
 * TYPES
 * ========================================================================== */

type FlightStatus =
  | 'Scheduled'
  | 'Delayed'
  | 'Cancelled'
  | 'In-Flight'
  | 'Effectué';

type StatusFilter =
  | 'ALL'
  | FlightStatus
  | 'UNASSIGNED';

interface FlightLeg {
  numeroVol?: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart?: string | null;
  heureArrivee?: string | null;
}

interface Flight {
  id: string;
  flightNumber: string;

  aircraft: string;
  aircraftModel: string;

  origin: string;

  stopover?:
    | string
    | string[]
    | null;

  stopoverDurationMinutes?:
    | number
    | null;

  destination: string;
  route?: string;

  departure: string;
  arrival: string;

  localDeparture?:
    | string
    | null;

  localArrival?:
    | string
    | null;

  durationMinutes?:
    | number
    | null;

  status: FlightStatus;
  weatherSeverity: number;

  legs?: FlightLeg[];
}

interface Analytics {
  metrics: {
    totalFlights: number;
    otpRate: number;
    onTimeCount: number;
    delayedCount: number;
    cancelledCount: number;
    inFlightCount: number;
    effectueCount: number;
  };

  distributions:
    Record<string, number>;
}

interface AircraftData {
  id: string;
  model: string;
  immatriculation?: string;
}

export interface FlightFormData {
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart: string;
  heureArrivee: string;

  avionId?: string;

  aeroportEscale?:
    | string
    | string[];

  dureeEscale?: number;
}

interface StatusStyle {
  label: string;
  dot: string;
  badge: string;
  border: string;
  card: string;
}

interface WeatherIndicator {
  label: string;
  icon: React.ReactNode;
  badge: string;
  recommendation: string;
}

/* ============================================================================
 * HELPERS
 * ========================================================================== */

const clampPercentage = (
  value: number,
) =>
  Math.min(
    100,
    Math.max(
      0,
      Number.isFinite(value)
        ? value
        : 0,
    ),
  );

const normalizeSeverity = (
  value:
    | number
    | null
    | undefined,
) =>
  Math.min(
    1,
    Math.max(
      0,
      Number(value ?? 0),
    ),
  );

const getErrorMessage =
  async (
    response: Response,
    fallback: string,
  ): Promise<string> => {
    try {
      const payload =
        await response.json();

      if (
        Array.isArray(
          payload?.message,
        )
      ) {
        return payload.message.join(
          ' | ',
        );
      }

      if (
        typeof payload?.message ===
          'object' &&
        payload?.message?.message
      ) {
        return payload.message.message;
      }

      return (
        payload?.message ||
        payload?.error ||
        fallback
      );
    } catch {
      return fallback;
    }
  };

const buildFallbackAnalytics = (
  flights: Flight[],
): Analytics => {
  const totalFlights =
    flights.length;

  const onTimeCount =
    flights.filter(
      (flight) =>
        flight.status ===
        'Scheduled',
    ).length;

  const delayedCount =
    flights.filter(
      (flight) =>
        flight.status ===
        'Delayed',
    ).length;

  const cancelledCount =
    flights.filter(
      (flight) =>
        flight.status ===
        'Cancelled',
    ).length;

  const inFlightCount =
    flights.filter(
      (flight) =>
        flight.status ===
        'In-Flight',
    ).length;

  const effectueCount =
    flights.filter(
      (flight) =>
        flight.status ===
        'Effectué',
    ).length;

  const otpDenominator =
    Math.max(
      0,
      totalFlights -
        cancelledCount -
        inFlightCount,
    );

  const otpRate =
    otpDenominator > 0
      ? Number(
          (
            (onTimeCount /
              otpDenominator) *
            100
          ).toFixed(1),
        )
      : 0;

  return {
    metrics: {
      totalFlights,
      otpRate,
      onTimeCount,
      delayedCount,
      cancelledCount,
      inFlightCount,
      effectueCount,
    },

    distributions: {},
  };
};

/* ============================================================================
 * UI COMPONENTS
 * ========================================================================== */

const StatusBadge:
  React.FC<{
    status: FlightStatus;
    style: StatusStyle;
  }> = ({
    style,
  }) => (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold ${style.badge}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`}
      />

      {style.label}
    </span>
  );

const LoadingSkeleton =
  () => (
    <div className="space-y-4 p-4 sm:p-5">

      {[1, 2, 3].map(
        (
          row,
        ) => (
          <div
            key={
              row
            }
            className="animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >

            <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">

              <div className="border-b border-slate-200 bg-slate-50 p-5 lg:border-b-0 lg:border-r">

                <div className="h-2.5 w-14 rounded bg-slate-200" />

                <div className="mt-3 h-5 w-28 rounded bg-slate-200" />

                <div className="mt-3 h-3 w-20 rounded bg-slate-200" />

              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">

                {[1, 2, 3].map(
                  (
                    item,
                  ) => (
                    <div
                      key={
                        item
                      }
                      className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                    >

                      <div className="h-4 w-24 rounded bg-slate-200" />

                      <div className="mt-3 h-3 w-32 rounded bg-slate-200" />

                      <div className="mt-5 h-12 rounded-lg bg-slate-200/70" />

                    </div>
                  ),
                )}

              </div>

            </div>

          </div>
        ),
      )}

    </div>
  );

/* ============================================================================
 * MAIN COMPONENT
 * ========================================================================== */

export const DashboardGantt:
  React.FC = () => {
    /* =========================================================================
     * STATES
     * ======================================================================= */

    const [
      flights,
      setFlights,
    ] =
      useState<
        Flight[]
      >(
        [],
      );

    const [
      analytics,
      setAnalytics,
    ] =
      useState<
        Analytics | null
      >(
        null,
      );

    const [
      fleetAircrafts,
      setFleetAircrafts,
    ] =
      useState<
        AircraftData[]
      >(
        [],
      );

    const [
      selectedFlight,
      setSelectedFlight,
    ] =
      useState<
        Flight | null
      >(
        null,
      );

    const [
      isAddModalOpen,
      setIsAddModalOpen,
    ] =
      useState(
        false,
      );

    const [
      isFetching,
      setIsFetching,
    ] =
      useState(
        false,
      );

    const [
      isLoadingFleet,
      setIsLoadingFleet,
    ] =
      useState(
        false,
      );

    const [
      isOptimizing,
      setIsOptimizing,
    ] =
      useState(
        false,
      );

    const [
      isCreating,
      setIsCreating,
    ] =
      useState(
        false,
      );

    const [
      globalError,
      setGlobalError,
    ] =
      useState<
        string | null
      >(
        null,
      );

    const [
      globalSuccess,
      setGlobalSuccess,
    ] =
      useState<
        string | null
      >(
        null,
      );

    const [
      statusFilter,
      setStatusFilter,
    ] =
      useState<
        StatusFilter
      >(
        'ALL',
      );

    const [
      searchQuery,
      setSearchQuery,
    ] =
      useState('');

    const [
      lastUpdatedAt,
      setLastUpdatedAt,
    ] =
      useState<
        Date | null
      >(
        null,
      );

    /* =========================================================================
     * FORMATTERS
     * ======================================================================= */

    const formatDateTime =
      useCallback(
        (
          dateString?:
            | string
            | null,
        ) => {
          if (
            !dateString
          ) {
            return '--/-- --:--';
          }

          if (
            /^\d{2}:\d{2}$/.test(
              dateString,
            )
          ) {
            return dateString;
          }

          const parsedDate =
            new Date(
              dateString,
            );

          if (
            Number.isNaN(
              parsedDate.getTime(),
            )
          ) {
            return dateString;
          }

          return new Intl.DateTimeFormat(
            'fr-FR',
            {
              day:
                '2-digit',

              month:
                '2-digit',

              hour:
                '2-digit',

              minute:
                '2-digit',
            },
          ).format(
            parsedDate,
          );
        },
        [],
      );

    const formatLocalIso =
      useCallback(
        (
          dateString?:
            | string
            | null,
        ) => {
          if (
            !dateString
          ) {
            return '--/-- --:--';
          }

          const match =
            dateString.match(
              /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/,
            );

          if (
            !match
          ) {
            return formatDateTime(
              dateString,
            );
          }

          const [
            ,
            month,
            day,
            hour,
            minute,
          ] =
            match;

          return `${day}/${month} ${hour}:${minute}`;
        },
        [
          formatDateTime,
        ],
      );

    const formatDuration =
      useCallback(
        (
          minutes?:
            | number
            | null,
        ) => {
          if (
            minutes ==
              null ||
            !Number.isFinite(
              minutes,
            )
          ) {
            return '--';
          }

          const total =
            Math.max(
              0,
              Math.round(
                minutes,
              ),
            );

          const hours =
            Math.floor(
              total /
                60,
            );

          const rest =
            total %
            60;

          if (
            hours ===
            0
          ) {
            return `${rest} min`;
          }

          if (
            rest ===
            0
          ) {
            return `${hours} h`;
          }

          return `${hours} h ${rest
            .toString()
            .padStart(
              2,
              '0',
            )}`;
        },
        [],
      );

    const displayRoute =
      useCallback(
        (
          flight:
            Flight,
        ) => {
          if (
            flight.route?.trim()
          ) {
            return flight.route;
          }

          const stopovers =
            Array.isArray(
              flight.stopover,
            )
              ? flight.stopover
              : typeof flight.stopover ===
                  'string'
                ? flight.stopover
                    .split(
                      ',',
                    )
                    .map(
                      (
                        value,
                      ) =>
                        value.trim(),
                    )
                    .filter(
                      Boolean,
                    )
                : [];

          return [
            flight.origin,
            ...stopovers,
            flight.destination,
          ]
            .filter(
              Boolean,
            )
            .join(
              ' → ',
            );
        },
        [],
      );

    /* =========================================================================
     * ESCAPE
     * ======================================================================= */

    useEffect(() => {
      const onKeyDown =
        (
          event:
            KeyboardEvent,
        ) => {
          if (
            event.key !==
            'Escape'
          ) {
            return;
          }

          if (
            selectedFlight
          ) {
            setSelectedFlight(
              null,
            );

            return;
          }

          if (
            isAddModalOpen
          ) {
            setIsAddModalOpen(
              false,
            );
          }
        };

      window.addEventListener(
        'keydown',
        onKeyDown,
      );

      return () =>
        window.removeEventListener(
          'keydown',
          onKeyDown,
        );
    }, [
      selectedFlight,
      isAddModalOpen,
    ]);

    /* =========================================================================
     * BLOQUER LE SCROLL DE LA PAGE
     * ======================================================================= */

    useEffect(() => {
      if (
        !selectedFlight
      ) {
        return;
      }

      const previousOverflow =
        document.body.style
          .overflow;

      document.body.style.overflow =
        'hidden';

      return () => {
        document.body.style.overflow =
          previousOverflow;
      };
    }, [
      selectedFlight,
    ]);

    /* =========================================================================
     * LOAD DATA
     * ======================================================================= */

    const loadData =
      useCallback(
        async (
          signal?:
            AbortSignal,
        ) => {
          setIsFetching(
            true,
          );

          setIsLoadingFleet(
            true,
          );

          setGlobalError(
            null,
          );

          try {
            const flightsResponse =
              await fetch(
                `${API_BASE_URL}/flights`,
                {
                  signal,
                },
              );

            if (
              !flightsResponse.ok
            ) {
              throw new Error(
                await getErrorMessage(
                  flightsResponse,
                  `Erreur API Vols : statut ${flightsResponse.status}`,
                ),
              );
            }

            const flightsPayload =
              await flightsResponse.json();

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

            const [
              analyticsResult,
              fleetResult,
            ] =
              await Promise.allSettled(
                [
                  fetch(
                    `${API_BASE_URL}/flights/analytics`,
                    {
                      signal,
                    },
                  ),

                  fetch(
                    `${API_BASE_URL}/fleet/aircrafts`,
                    {
                      signal,
                    },
                  ),
                ],
              );

            if (
              analyticsResult.status ===
                'fulfilled' &&
              analyticsResult.value.ok
            ) {
              const payload =
                await analyticsResult.value.json();

              setAnalytics(
                {
                  ...payload,

                  metrics: {
                    ...payload.metrics,

                    effectueCount:
                      payload.metrics
                        ?.effectueCount ??
                      flightsList.filter(
                        (
                          flight,
                        ) =>
                          flight.status ===
                          'Effectué',
                      ).length,
                  },
                },
              );
            } else {
              setAnalytics(
                buildFallbackAnalytics(
                  flightsList,
                ),
              );
            }

            if (
              fleetResult.status ===
                'fulfilled' &&
              fleetResult.value.ok
            ) {
              const payload =
                await fleetResult.value.json();

              setFleetAircrafts(
                Array.isArray(
                  payload,
                )
                  ? payload
                  : [],
              );
            } else {
              setFleetAircrafts(
                [],
              );
            }

            setLastUpdatedAt(
              new Date(),
            );
          } catch (
            error:
              unknown
          ) {
            if (
              (
                error as Error
              ).name ===
              'AbortError'
            ) {
              return;
            }

            console.error(
              "Erreur d'appel API :",
              error,
            );

            setGlobalError(
              (
                error as Error
              ).message ||
                'Impossible de se connecter au serveur central.',
            );
          } finally {
            setIsFetching(
              false,
            );

            setIsLoadingFleet(
              false,
            );
          }
        },
        [],
      );

    useEffect(() => {
      const controller =
        new AbortController();

      void loadData(
        controller.signal,
      );

      return () =>
        controller.abort();
    }, [
      loadData,
    ]);

    /* =========================================================================
     * OPTIMISATION
     * ======================================================================= */

    const triggerOptimization =
      useCallback(
        async () => {
          if (
            isOptimizing
          ) {
            return;
          }

          setIsOptimizing(
            true,
          );

          setGlobalError(
            null,
          );

          setGlobalSuccess(
            null,
          );

          try {
            const response =
              await fetch(
                `${API_BASE_URL}/flights/optimize`,
                {
                  method:
                    'POST',

                  headers: {
                    Accept:
                      'application/json',
                  },
                },
              );

            if (
              !response.ok
            ) {
              if (
                response.status ===
                404
              ) {
                throw new Error(
                  "La route POST /flights/optimize n'est pas disponible dans le backend Flask.",
                );
              }

              throw new Error(
                await getErrorMessage(
                  response,
                  "Le moteur d'optimisation a rencontré une anomalie.",
                ),
              );
            }

            let message =
              'Planning optimisé avec succès.';

            try {
              const payload =
                await response.json();

              message =
                payload?.message ||
                message;
            } catch {
              // Réponse vide autorisée.
            }

            setGlobalSuccess(
              message,
            );

            await loadData();
          } catch (
            error:
              unknown
          ) {
            console.error(
              'Erreur optimisation :',
              error,
            );

            setGlobalError(
              (
                error as Error
              ).message ||
                "Erreur réseau lors de la communication avec le moteur d'optimisation.",
            );
          } finally {
            setIsOptimizing(
              false,
            );
          }
        },
        [
          isOptimizing,
          loadData,
        ],
      );

    /* =========================================================================
     * CREATE FLIGHT
     * ======================================================================= */

    const handleCreateFlightSubmit =
      useCallback(
        async (
          formData:
            FlightFormData,
        ) => {
          if (
            isCreating
          ) {
            return;
          }

          setGlobalError(
            null,
          );

          setGlobalSuccess(
            null,
          );

          setIsCreating(
            true,
          );

          try {
            const departure =
              new Date(
                formData.heureDepart,
              );

            const arrival =
              new Date(
                formData.heureArrivee,
              );

            if (
              Number.isNaN(
                departure.getTime(),
              ) ||
              Number.isNaN(
                arrival.getTime(),
              )
            ) {
              throw new Error(
                'Les dates de départ et d’arrivée sont invalides.',
              );
            }

            if (
              arrival <=
              departure
            ) {
              throw new Error(
                "L'heure d'arrivée doit être postérieure à l'heure de départ.",
              );
            }

            const response =
              await fetch(
                `${API_BASE_URL}/flights`,
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
                    JSON.stringify(
                      {
                        ...formData,

                        numeroVol:
                          formData.numeroVol
                            .trim()
                            .toUpperCase(),

                        aeroportDepart:
                          formData.aeroportDepart
                            .trim()
                            .toUpperCase(),

                        aeroportArrivee:
                          formData.aeroportArrivee
                            .trim()
                            .toUpperCase(),

                        heureDepart:
                          departure.toISOString(),

                        heureArrivee:
                          arrival.toISOString(),

                        avionId:
                          formData.avionId ||
                          undefined,
                      },
                    ),
                },
              );

            if (
              !response.ok
            ) {
              throw new Error(
                await getErrorMessage(
                  response,
                  response.status ===
                    409
                    ? "Conflit d'affectation : cet avion est déjà utilisé sur ce créneau."
                    : 'Impossible de créer le vol.',
                ),
              );
            }

            setIsAddModalOpen(
              false,
            );

            setGlobalSuccess(
              'Le vol a été créé avec succès.',
            );

            await loadData();
          } catch (
            error:
              unknown
          ) {
            console.error(
              'Erreur création vol :',
              error,
            );

            setGlobalError(
              (
                error as Error
              ).message ||
                'Erreur réseau lors de la création du vol.',
            );
          } finally {
            setIsCreating(
              false,
            );
          }
        },
        [
          isCreating,
          loadData,
        ],
      );

    /* =========================================================================
     * UI CONFIGURATION
     * ======================================================================= */

    const statusStyles:
      Record<
        FlightStatus,
        StatusStyle
      > =
      useMemo(
        () => ({
          Scheduled: {
            label:
              'Planifié',

            dot:
              'bg-emerald-500',

            badge:
              'border-emerald-200 bg-emerald-50 text-emerald-700',

            border:
              'border-l-emerald-500',

            card:
              'hover:border-emerald-200',
          },

          Delayed: {
            label:
              'Retardé',

            dot:
              'bg-amber-500',

            badge:
              'border-amber-200 bg-amber-50 text-amber-700',

            border:
              'border-l-amber-500',

            card:
              'hover:border-amber-200',
          },

          Cancelled: {
            label:
              'Annulé',

            dot:
              'bg-rose-500',

            badge:
              'border-rose-200 bg-rose-50 text-rose-700',

            border:
              'border-l-rose-500',

            card:
              'hover:border-rose-200',
          },

          'In-Flight': {
            label:
              'En vol',

            dot:
              'bg-sky-500',

            badge:
              'border-sky-200 bg-sky-50 text-sky-700',

            border:
              'border-l-sky-500',

            card:
              'hover:border-sky-200',
          },

          Effectué: {
            label:
              'Effectué',

            dot:
              'bg-slate-400',

            badge:
              'border-slate-200 bg-slate-100 text-slate-600',

            border:
              'border-l-slate-400',

            card:
              'opacity-90 hover:opacity-100',
          },
        }),
        [],
      );

    const weatherConfig =
      useMemo(
        () => ({
          extreme: {
            label:
              'Extrême',

            icon: (
              <CloudLightning className="h-3.5 w-3.5" />
            ),

            badge:
              'border-rose-200 bg-rose-50 text-rose-700',

            recommendation:
              'Risque météo extrême. Vérification opérationnelle immédiate requise.',
          },

          critical: {
            label:
              'Critique',

            icon: (
              <AlertTriangle className="h-3.5 w-3.5" />
            ),

            badge:
              'border-orange-200 bg-orange-50 text-orange-700',

            recommendation:
              'Risque élevé. Une adaptation de l’horaire ou de la route doit être envisagée.',
          },

          unstable: {
            label:
              'Instable',

            icon: (
              <CloudRain className="h-3.5 w-3.5" />
            ),

            badge:
              'border-amber-200 bg-amber-50 text-amber-700',

            recommendation:
              'Risque modéré de perturbation. Surveillance météo recommandée.',
          },

          favorable: {
            label:
              'Favorable',

            icon: (
              <Sun className="h-3.5 w-3.5" />
            ),

            badge:
              'border-emerald-200 bg-emerald-50 text-emerald-700',

            recommendation:
              'Conditions favorables. Aucune contrainte météo majeure détectée.',
          },
        }),
        [],
      );

    const getWeatherIndicator =
      useCallback(
        (
          severity:
            number,
        ): WeatherIndicator => {
          const value =
            normalizeSeverity(
              severity,
            );

          if (
            value >=
            0.8
          ) {
            return weatherConfig.extreme;
          }

          if (
            value >=
            0.7
          ) {
            return weatherConfig.critical;
          }

          if (
            value >=
            0.4
          ) {
            return weatherConfig.unstable;
          }

          return weatherConfig.favorable;
        },
        [
          weatherConfig,
        ],
      );

    /* =========================================================================
     * DERIVED DATA
     * ======================================================================= */

    const filteredFlights =
      useMemo(
        () => {
          const needle =
            searchQuery
              .trim()
              .toLowerCase();

          return flights
            .filter(
              (
                flight,
              ) => {
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
                  return (
                    flight.aircraft ===
                    UNASSIGNED_AIRCRAFT
                  );
                }

                return (
                  flight.status ===
                  statusFilter
                );
              },
            )
            .filter(
              (
                flight,
              ) => {
                if (
                  !needle
                ) {
                  return true;
                }

                return [
                  flight.flightNumber,
                  flight.origin,
                  flight.destination,
                  flight.route,
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
                          needle,
                        ),
                  );
              },
            )
            .sort(
              (
                a,
                b,
              ) =>
                new Date(
                  a.departure,
                ).getTime() -
                new Date(
                  b.departure,
                ).getTime(),
            );
        },
        [
          flights,
          searchQuery,
          statusFilter,
        ],
      );

    const flightsByAircraft =
      useMemo(
        () => {
          const groups =
            new Map<
              string,
              Flight[]
            >();

          for (
            const flight of
            filteredFlights
          ) {
            const key =
              flight.aircraft ||
              UNASSIGNED_AIRCRAFT;

            const current =
              groups.get(
                key,
              ) ??
              [];

            current.push(
              flight,
            );

            groups.set(
              key,
              current,
            );
          }

          return Array.from(
            groups.entries(),
          ).sort(
            (
              [
                a,
              ],
              [
                b,
              ],
            ) => {
              if (
                a ===
                UNASSIGNED_AIRCRAFT
              ) {
                return 1;
              }

              if (
                b ===
                UNASSIGNED_AIRCRAFT
              ) {
                return -1;
              }

              return a.localeCompare(
                b,
              );
            },
          );
        },
        [
          filteredFlights,
        ],
      );

    const aircraftLookup =
      useMemo(
        () =>
          new Map(
            fleetAircrafts.map(
              (
                aircraft,
              ) => [
                aircraft.id,

                aircraft.immatriculation ||
                  aircraft.model,
              ],
            ),
          ),
        [
          fleetAircrafts,
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
    const kpiCards =
      useMemo(
        () => [
          {
            label:
              'Total vols',
            value:
              effectiveAnalytics
                .metrics
                .totalFlights,
            icon: (
              <Plane className="h-5 w-5" />
            ),
            tone:
              'bg-emerald-700 text-white',
            sub:
              'Planning actuel',
          },
          {
            label:
              'OTP',

            value: `${clampPercentage(
              effectiveAnalytics
                .metrics
                .otpRate,
            )}%`,
            icon: (
              <Gauge className="h-5 w-5" />
            ),
            tone:
              'bg-emerald-50 text-emerald-700',
            sub:
              'Ponctualité globale',
          },
          {
            label:
              'Retardés',
            value:
              effectiveAnalytics
                .metrics
                .delayedCount,
            icon: (
              <Clock className="h-5 w-5" />
            ),
            tone:
              'bg-amber-50 text-amber-700',
            sub:
              'À surveiller',
          },
          {
            label:
              'En vol',
            value:
              effectiveAnalytics
                .metrics
                .inFlightCount,
            icon: (
              <Activity className="h-5 w-5" />
            ),
            tone:
              'bg-sky-50 text-sky-700',
            sub:
              'Opérations actives',
          },
          {
            label:
              'Annulés',

            value:
              effectiveAnalytics
                .metrics
                .cancelledCount,

            icon: (
              <AlertCircle className="h-5 w-5" />
            ),

            tone:
              'bg-rose-50 text-rose-700',

            sub:
              'Action requise',
          },
        ],
        [
          effectiveAnalytics,
        ],
      );
    const activeFilterCount =
      (
        statusFilter !==
        'ALL'
          ? 1
          : 0
      ) +
      (
        searchQuery.trim()
          ? 1
          : 0
      );
    /* =========================================================================
     * FLIGHT CARD
     * ======================================================================= */
    const renderFlightCard =
      (
        flight:
          Flight,
        mode:
          | 'mobile'
          | 'desktop',
      ) => {
        const statusStyle =
          statusStyles[
            flight.status
          ] ??
          statusStyles.Scheduled;
        const weather =
          getWeatherIndicator(
            flight.weatherSeverity,
          );
        const compact =
          mode ===
          'desktop';
        return (
          <button
            type="button"
            key={
              flight.id
            }
            onClick={() =>
              setSelectedFlight(
                flight,
              )
            }
            className={[
              'group relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left',
              'shadow-sm transition-all duration-200',
              'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
              'focus:outline-none focus:ring-2 focus:ring-emerald-200',
              compact
                ? 'p-4'
                : 'p-4 sm:p-5',
            ].join(
              ' ',
            )}
          >
            <span
              className={`absolute inset-y-0 left-0 w-1 ${
                flight.status ===
                'Scheduled'
                  ? 'bg-emerald-500'
                  : flight.status ===
                      'Delayed'
                    ? 'bg-amber-500'
                    : flight.status ===
                        'Cancelled'
                      ? 'bg-rose-500'
                      : flight.status ===
                          'In-Flight'
                        ? 'bg-sky-500'
                        : 'bg-slate-400'
              }`}
            />
            <div className="pl-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {flight.status ===
                      'Effectué' && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    )}
                    <span className="font-mono text-sm font-black tracking-wide text-slate-950">
                      {  flight.flightNumber}
                    </span>
                    <StatusBadge
                      status={  flight.status}
                      style={  statusStyle}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Plane className="h-3.5 w-3.5 shrink-0 rotate-45 text-emerald-600" />
                    <span className="truncate font-mono text-xs font-bold text-slate-700">
                      {
                        displayRoute(
                          flight,
                        )
                      }
                    </span>
                  </div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-emerald-600" />
              </div>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                <div>
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Départ
                  </span>
                  <span className="mt-1 block font-mono text-xs font-black text-slate-800">
                    {formatLocalIso(
                      flight.localDeparture ||
                        flight.departure,
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-px w-3 bg-slate-300" />
                  <Plane className="h-3.5 w-3.5 rotate-90 text-slate-400" />
                  <div className="h-px w-3 bg-slate-300" />
                </div>
                <div className="text-right">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Arrivée
                  </span>
                  <span className="mt-1 block font-mono text-xs font-black text-slate-800">
                    {formatLocalIso(
                      flight.localArrival ||
                        flight.arrival,
                    )}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  className={`inline-flex h-6 items-center gap-1 rounded-lg border px-2 text-[10px] font-bold ${weather.badge}`}
                >
                  {  weather.icon}
                  {  weather.label}
                </span>
                {flight.durationMinutes !=
                  null && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                    <Timer className="h-3.5 w-3.5 text-slate-400" />
                    {formatDuration(
                      flight.durationMinutes,
                    )}
                  </span>
                )}
                {flight.stopover && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                    Escale
                    {flight.stopoverDurationMinutes
                      ? ` · ${formatDuration(
                          flight.stopoverDurationMinutes,
                        )}`
                      : ''}
                  </span>
                )}
                {flight.aircraft ===
                  UNASSIGNED_AIRCRAFT && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-rose-600">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Affectation requise
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      };
    /* =========================================================================
     * RENDER
     * ======================================================================= */
    return (
      <div className="min-h-screen bg-slate-100 p-2 text-slate-800 antialiased sm:p-3">
        <div className="mx-auto max-w-[1600px] space-y-4">
          {/* HEADER */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">
                  <Plane className="h-5 w-5 rotate-45" />
                  <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-black tracking-tight text-slate-950 sm:text-lg">
                    Airline Operations Control
                  </h1>
                  <p className="mt-1 truncate text-[11px] font-medium text-slate-500">
                    Supervision des vols, rotations et ressources opérationnelles
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  onClick={() =>  void loadData()}
                  disabled={  isFetching}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      isFetching
                        ? 'animate-spin'
                        : ''
                    }`}
                  />
                  Actualiser
                </button>
                <button
                  type="button"
                  onClick={
                    triggerOptimization
                  }
                  disabled={
                    isOptimizing ||
                    isFetching
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                >
                  <Cpu
                    className={`h-4 w-4 ${
                      isOptimizing
                        ? 'animate-spin'
                        : ''
                    }`}
                  />
                  {isOptimizing
                    ? 'Analyse...'
                    : 'Optimiser'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setIsAddModalOpen(  true,)
                  }
                  disabled={  isCreating}
                  className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50 sm:col-span-1"
                >
                  <Plus className="h-4 w-4" />
                  Nouveau vol
                </button>
              </div>
            </div>
          </section>
          {/* ALERTES */}
          {globalError && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 shadow-sm">
              <AlertCircle className="mt-1 h-4 w-4 text-rose-600" />
              <div className="flex-1">
                <p className="text-xs font-bold text-rose-800">
                  Erreur système
                </p>
                <p className="mt-0.5 text-xs text-rose-700">
                  {  globalError}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setGlobalError(
                    null,
                  )
                }
              >
                <X className="h-4 w-4 text-rose-500" />
              </button>
            </div>
          )}
          {globalSuccess && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 shadow-sm">
              <CheckCircle2 className="mt-1 h-4 w-4 text-emerald-600" />
              <div className="flex-1">
                <p className="text-xs font-bold text-emerald-800">
                  Opération réussie
                </p>
                <p className="mt-0.5 text-xs text-emerald-700">
                  {  globalSuccess}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setGlobalSuccess(
                    null,
                  )
                }
              >
                <X className="h-4 w-4 text-emerald-500" />
              </button>
            </div>
          )}
          {/* KPI */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {kpiCards.map(
              (  item,  index,) => (
                <article
                  key={  item.label}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  {index ===
                    0 && (
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-700" />
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                        {  item.label}
                      </span>
                      <strong className="mt-2 block text-2xl font-black text-slate-950 sm:text-3xl">
                        {  item.value}
                      </strong>
                    </div>
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.tone}`}
                    >
                      {  item.icon}
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    {  item.sub}
                  </p>
                </article>
              ),
            )}
          </section>
          {/* OTP */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-800">
                    Ponctualité opérationnelle
                  </h2>
                  <p className="text-[10px] text-slate-400">
                    On-Time Performance du planning
                  </p>
                </div>
              </div>
              <span className="font-mono text-xl font-black text-slate-950">
                {clampPercentage(
                  effectiveAnalytics
                    .metrics
                    .otpRate,
                )}
                %
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-700"
                style={{
                  width: `${clampPercentage(
                    effectiveAnalytics
                      .metrics
                      .otpRate,
                  )}%`,
                }}
              />
            </div>
          </section>
          {/* RECHERCHE / FILTRES */}
          <section className="sticky top-2 z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
            <div className="grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={
                    searchQuery
                  }
                  onChange={(
                    event,
                  ) =>
                    setSearchQuery(
                      event.target.value,
                    )
                  }
                  placeholder="Rechercher vol, aéroport, appareil..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() =>
                      setSearchQuery(
                        '',
                      )
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    <X className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400">
                  <Filter className="h-3.5 w-3.5" />
                  Statut
                </div>
                {[
                  [
                    'ALL',
                    'Tous',
                  ],
                  [
                    'Scheduled',
                    'Planifiés',
                  ],
                  [
                    'Delayed',
                    'Retardés',
                  ],
                  [
                    'In-Flight',
                    'En vol',
                  ],
                  [
                    'Effectué',
                    'Effectués',
                  ],
                  [
                    'Cancelled',
                    'Annulés',
                  ],
                  [
                    'UNASSIGNED',
                    'Non assignés',
                  ],
                ].map(
                  (
                    [
                      value,
                      label,
                    ],
                  ) => {
                    const active =
                      statusFilter ===
                      value;
                    return (
                      <button
                        type="button"
                        key={
                          value
                        }
                        onClick={() =>
                          setStatusFilter(
                            value as StatusFilter,
                          )
                        }
                        className={`h-8 rounded-lg border px-3 text-[10px] font-bold ${
                          active
                            ? 'border-emerald-700 bg-emerald-700 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {
                          label
                        }
                      </button>
                    );
                  },
                )}
                {activeFilterCount >
                  0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter(
                        'ALL',
                      );

                      setSearchQuery(
                        '',
                      );
                    }}
                    className="ml-auto text-[10px] font-bold text-slate-400"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
          </section>
          {/* PLANNING */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    Planning des rotations
                  </h2>
                  <p className="text-[10px] text-slate-400">
                    {
                      filteredFlights.length
                    }{' '}
                    vol(s) affiché(s)
                  </p>
                </div>
              </div>
              {isFetching && (
                <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
              )}
            </div>
            {isFetching &&
            flights.length ===
              0 ? (
              <LoadingSkeleton />
            ) : flightsByAircraft.length ===
              0 ? (
              <div className="flex min-h-70 flex-col items-center justify-center p-6">
                <Search className="h-6 w-6 text-slate-300" />
                <p className="mt-2 text-sm font-bold text-slate-700">
                  Aucun vol trouvé
                </p>
              </div>
            ) : (
              <>
                {/* MOBILE */}
                <div className="divide-y divide-slate-100 lg:hidden">
                  {flightsByAircraft.map(
                    (
                      [
                        aircraft,
                        aircraftFlights,
                      ],
                    ) => {
                      const fallbackLabel =
                        aircraftFlights.find(
                          (
                            flight,
                          ) =>
                            flight.aircraftModel,
                        )
                          ?.aircraftModel ||
                        'Appareil inconnu';

                      const aircraftLabel =
                        aircraftLookup.get(
                          aircraft,
                        ) ||
                        fallbackLabel;
                      return (
                        <div
                          key={
                            aircraft
                          }
                          className="p-4"
                        >
                          <div className="mb-3 flex justify-between">
                            <span className="font-mono text-sm font-black text-slate-900">
                              {
                                aircraft ===
                                UNASSIGNED_AIRCRAFT
                                  ? 'Non assigné'
                                  : aircraftLabel
                              }
                            </span>
                            <span className="text-xs text-slate-500">
                              {
                                aircraftFlights.length
                              }{' '}
                              vol(s)
                            </span>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {aircraftFlights.map(
                              (
                                flight,
                              ) =>
                                renderFlightCard(
                                  flight,
                                  'mobile',
                                ),
                            )}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
                {/* DESKTOP */}
                <div className="hidden lg:block">
                  <div className="grid grid-cols-[220px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50">
                    <div className="border-r border-slate-200 px-5 py-3 text-[9px] font-black uppercase text-slate-400">
                      Aéronef
                    </div>
                    <div className="px-5 py-3 text-[9px] font-black uppercase text-slate-400">
                      Rotations affectées
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {flightsByAircraft.map(
                      (
                        [
                          aircraft,
                          aircraftFlights,
                        ],
                      ) => {
                        const fallbackLabel =
                          aircraftFlights.find(
                            (
                              flight,
                            ) =>
                              flight.aircraftModel,
                          )
                            ?.aircraftModel ||
                          'Appareil inconnu';
                        const aircraftLabel =
                          aircraftLookup.get(
                            aircraft,
                          ) ||
                          fallbackLabel;
                        const isUnassigned =
                          aircraft ===
                          UNASSIGNED_AIRCRAFT;
                        return (
                          <div
                            key={
                              aircraft
                            }
                            className="grid grid-cols-[220px_minmax(0,1fr)]"
                          >
                            <aside
                              className={`border-r border-slate-200 p-5 ${
                                isUnassigned
                                  ? 'bg-rose-50/40'
                                  : 'bg-slate-50/50'
                              }`}
                            >
                              {isUnassigned ? (
                                <span className="text-xs font-bold text-rose-700">
                                  Non assigné
                                </span>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-emerald-700 ring-1 ring-slate-200">
                                      <Plane className="h-4 w-4" />
                                    </div>
                                    <strong className="font-mono text-sm font-black text-slate-950">
                                      {
                                        aircraftLabel
                                      }
                                    </strong>
                                  </div>
                                  <span className="mt-2 block font-mono text-[9px] text-slate-400">
                                    REF{' '}
                                    {aircraft.slice(
                                      0,
                                      8,
                                    )}
                                  </span>
                                </>
                              )}
                              <div className="mt-4 border-t border-slate-200 pt-3 text-[10px] font-bold text-slate-500">
                                {
                                  aircraftFlights.length
                                }{' '}
                                rotation(s)
                              </div>
                            </aside>
                            <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-2 2xl:grid-cols-3">
                              {aircraftFlights.map(
                                (
                                  flight,
                                ) =>
                                  renderFlightCard(
                                    flight,
                                    'desktop',
                                  ),
                              )}
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
        {/* AJOUT VOL */}
        <FlightAddModal
          isOpen={
            isAddModalOpen
          }
          onClose={() => {
            if (
              !isCreating
            ) {
              setIsAddModalOpen(
                false,
              );
            }
          }}
          onSubmit={
            handleCreateFlightSubmit
          }
          fleetAircrafts={
            fleetAircrafts
          }
          isLoadingFleet={
            isLoadingFleet ||
            isCreating
          }
        />
        {/* ================================================================
            FICHE VOL CENTRÉE SANS SCROLL
        ================================================================= */}
        {selectedFlight && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Détails du vol ${selectedFlight.flightNumber}`}
            onMouseDown={(
              event,
            ) => {
              if (
                event.currentTarget ===
                event.target
              ) {
                setSelectedFlight(
                  null,
                );
              }
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
          >
            <div className="w-full max-w-[560px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
              {/* HEADER */}
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <div className="min-w-0">
                  <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Fiche opérationnelle
                  </span>
                  <h3 className="mt-1 truncate font-mono text-lg font-black text-slate-950">
                    {
                      selectedFlight.flightNumber
                    }
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedFlight(
                      null,
                    )
                  }
                  aria-label="Fermer"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* CONTENT */}
              <div className="space-y-3 p-4">
                {/* ROUTE */}
                <section className="overflow-hidden rounded-2xl bg-emerald-700 px-5 py-4 text-white shadow-sm">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <div>
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-emerald-100">
                        Origine
                      </span>
                      <strong className="mt-1 block font-mono text-2xl font-black">
                        {
                          selectedFlight.origin
                        }
                      </strong>
                    </div>
                    <div className="flex items-center">
                      <div className="h-px w-5 bg-emerald-400/80" />
                      <Plane className="mx-2 h-4 w-4 rotate-90 text-white" />
                      <div className="h-px w-5 bg-emerald-400/80" />
                    </div>
                    <div className="text-right">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-emerald-100">
                        Destination
                      </span>
                      <strong className="mt-1 block font-mono text-2xl font-black">
                        {
                          selectedFlight.destination
                        }
                      </strong>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-emerald-600/70 pt-2.5 text-center font-mono text-[10px] font-semibold text-emerald-100">
                    {
                      displayRoute(
                        selectedFlight,
                      )
                    }
                  </div>
                </section>
                {/* STATUT APPAREIL */}
                <section className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Statut
                    </span>
                    <div className="mt-2">
                      <StatusBadge
                        status={
                          selectedFlight.status
                        }
                        style={
                          statusStyles[
                            selectedFlight.status
                          ] ??
                          statusStyles.Scheduled
                        }
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Appareil
                    </span>
                    <strong className="mt-2 block truncate font-mono text-xs font-black text-slate-900">
                      {selectedFlight.aircraft ===
                      UNASSIGNED_AIRCRAFT
                        ? 'NON ASSIGNÉ'
                        : selectedFlight.aircraftModel}
                    </strong>
                  </div>
                </section>
                {/* HORAIRES */}
                <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div>
                      <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">
                        Départ local
                      </span>
                      <strong className="mt-1 block font-mono text-sm font-black text-slate-900">
                        {formatLocalIso(
                          selectedFlight.localDeparture ||
                            selectedFlight.departure,
                        )}
                      </strong>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300" />
                    <div className="text-right">
                      <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">
                        Arrivée locale
                      </span>
                      <strong className="mt-1 block font-mono text-sm font-black text-slate-900">
                        {formatLocalIso(
                          selectedFlight.localArrival ||
                            selectedFlight.arrival,
                        )}
                      </strong>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                      <Timer className="h-3.5 w-3.5" />
                      Durée
                    </span>
                    <span className="font-mono text-xs font-black text-slate-700">
                      {formatDuration(
                        selectedFlight.durationMinutes,
                      )}
                    </span>
                  </div>
                </section>
                {/* METEO */}
                {(() => {
                  const weather =
                    getWeatherIndicator(
                      selectedFlight.weatherSeverity,
                    );
                  return (
                    <section className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">
                            Météo opérationnelle
                          </span>
                          <span className="mt-1 block font-mono text-[10px] text-slate-500">
                            Indice{' '}
                            {normalizeSeverity(
                              selectedFlight.weatherSeverity,
                            ).toFixed(
                              2,
                            )}
                            /1.00
                          </span>
                        </div>
                        <span
                          className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold ${weather.badge}`}
                        >
                          {
                            weather.icon
                          }
                          {
                            weather.label
                          }
                        </span>
                      </div>
                      <p className="mt-2.5 border-t border-slate-200 pt-2.5 text-[10px] font-medium leading-4 text-slate-600">
                        {
                          weather.recommendation
                        }
                      </p>
                    </section>
                  );
                })()}
                {/* TRONCONS */}
                {selectedFlight.legs &&
                  selectedFlight.legs
                    .length >
                    0 && (
                  <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-emerald-600" />
                        <div>
                          <h4 className="text-[11px] font-black text-slate-700">
                            Tronçons
                          </h4>
                          <p className="text-[9px] text-slate-400">
                            Détail de l&apos;itinéraire
                          </p>
                        </div>
                      </div>
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">
                        {
                          selectedFlight.legs.length
                        }
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedFlight.legs.map(
                        (
                          leg,
                          index,
                        ) => (
                          <div
                            key={`${leg.aeroportDepart}-${leg.aeroportArrivee}-${index}`}
                            className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                          >
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                              <span className="font-mono text-[10px] font-black text-slate-900">
                                {
                                  leg.aeroportDepart
                                }
                              </span>
                              <ArrowRight className="h-3 w-3 text-slate-400" />
                              <span className="text-right font-mono text-[10px] font-black text-slate-900">
                                {
                                  leg.aeroportArrivee
                                }
                              </span>
                            </div>
                            <div className="mt-1.5 grid grid-cols-2 border-t border-slate-200 pt-1.5 font-mono text-[8px] font-semibold text-slate-400">
                              <span>
                                {formatDateTime(
                                  leg.heureDepart,
                                )}
                              </span>
                              <span className="text-right">
                                {formatDateTime(
                                  leg.heureArrivee,
                                )}
                              </span>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </section>
                )}
                {/* CLOSE */}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedFlight(
                      null,
                    )
                  }
                  className="h-10 w-full rounded-xl bg-emerald-700 text-xs font-black text-white shadow-sm transition hover:bg-emerald-800"
                >
                  Fermer la fiche
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

export default DashboardGantt;