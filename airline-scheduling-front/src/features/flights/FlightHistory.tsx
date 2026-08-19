import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Cloud,
  Gauge,
  History,
  MapPin,
  Navigation,
  Plane,
  RefreshCw,
  Search,
  Timer,
  X,
  XCircle,
} from 'lucide-react';

/* ============================================================================
 * TYPES
 * ========================================================================== */

type FlightStatus =
  | 'Scheduled'
  | 'Delayed'
  | 'Cancelled'
  | 'Completed'
  | 'In-Flight'
  | string;

interface WeatherPoint {
  airport?: string | null;
  severity?: number | null;

  available?: boolean;
  forecastAvailable?: boolean;

  fetchedAt?: string;
  targetTime?: string;

  error?: string | null;
}

interface WeatherAI {
  engine?: string;

  evaluatedAt?: string;

  score?: number | null;

  riskLevel?: string;
  riskLabel?: string;

  confidence?: number;

  dataAvailable?: boolean;
  forecastAvailable?: boolean;

  persistentSevere?: boolean;

  forecastPhase?: string;
  forecastPhaseLabel?: string;

  nextReviewAt?: string;
  refreshAfterSeconds?: number;

  canAffectStatus?: boolean;

  recommendedAction?: string;
  recommendedActionLabel?: string;

  explanation?: string;

  departure?: WeatherPoint | null;
  arrival?: WeatherPoint | null;

  stopovers?: WeatherPoint[];
}

export interface Flight {
  id: string;

  flightNumber?: string;

  origin?: string;
  destination?: string;

  route?: string;

  departure?: string | null;
  arrival?: string | null;

  localDeparture?: string | null;
  localArrival?: string | null;

  durationMinutes?: number | null;

  status?: string;

  aircraft?: string | null;
  aircraftModel?: string | null;

  stopover?: string | null;
  stopoverDurationMinutes?: number | null;

  legs?: unknown[];

  weatherSeverity?: number | null;

  weatherRiskLevel?: string;
  weatherRiskLabel?: string;

  weatherConfidence?: number;

  weatherRecommendedAction?: string;
  weatherRecommendedActionLabel?: string;

  weatherUpdatedAt?: string;

  weatherForecastPhase?: string;
  weatherForecastPhaseLabel?: string;

  weatherNextReviewAt?: string;

  weatherRefreshAfterSeconds?: number;

  weatherCanAffectStatus?: boolean;

  weatherAI?: WeatherAI;

  [key: string]: unknown;
}

interface NormalizedFlight {
  id: string;

  flightNumber: string;

  origin: string;
  destination: string;

  route: string;

  departureUtc: string | null;
  arrivalUtc: string | null;

  localDeparture: string | null;
  localArrival: string | null;

  durationMinutes: number | null;

  status: FlightStatus;

  aircraftId: string;
  aircraftRegistration: string;

  stopover: string | null;

  stopoverDurationMinutes:
    | number
    | null;

  weatherAI?: WeatherAI;

  raw: Flight;
}

type StatusFilter =
  | 'ALL'
  | 'Completed'
  | 'Delayed'
  | 'Cancelled';

interface FlightHistoryProps {
  apiUrl?: string;
  token?: string | null;
}

/* ============================================================================
 * CONFIGURATION
 * ========================================================================== */

const DEFAULT_API_URL =
  'http://localhost:5000/flights';

/* ============================================================================
 * HELPERS
 * ========================================================================== */

const normalizeStatus = (
  status?: string,
): FlightStatus => {
  const value =
    String(status ?? '')
      .trim()
      .toLowerCase();

  if (
    value === 'completed' ||
    value === 'effectué' ||
    value === 'effectue' ||
    value === 'done'
  ) {
    return 'Completed';
  }

  if (
    value === 'delayed' ||
    value === 'retardé' ||
    value === 'retarde'
  ) {
    return 'Delayed';
  }

  if (
    value === 'cancelled' ||
    value === 'canceled' ||
    value === 'annulé' ||
    value === 'annule'
  ) {
    return 'Cancelled';
  }

  if (
    value === 'in-flight' ||
    value === 'in flight' ||
    value === 'en vol'
  ) {
    return 'In-Flight';
  }

  if (
    value === 'scheduled' ||
    value === 'planifié' ||
    value === 'planifie' ||
    value === 'programmé' ||
    value === 'programme'
  ) {
    return 'Scheduled';
  }

  return (
    status ||
    'Unknown'
  );
};

const normalizeFlight = (
  flight: Flight,
): NormalizedFlight => {
  return {
    id: String(
      flight.id,
    ),

    flightNumber:
      flight.flightNumber ||
      `VOL-${String(
        flight.id,
      ).slice(0, 8)}`,

    origin:
      flight.origin ||
      '—',

    destination:
      flight.destination ||
      '—',

    route:
      flight.route ||
      `${flight.origin || '—'} → ${
        flight.destination ||
        '—'
      }`,

    departureUtc:
      flight.departure ??
      null,

    arrivalUtc:
      flight.arrival ??
      null,

    localDeparture:
      flight.localDeparture ??
      null,

    localArrival:
      flight.localArrival ??
      null,

    durationMinutes:
      flight.durationMinutes ??
      null,

    status:
      normalizeStatus(
        flight.status,
      ),

    aircraftId:
      flight.aircraft ||
      'NON ASSIGNÉ',

    aircraftRegistration:
      flight.aircraftModel ||
      'Sans immatriculation',

    stopover:
      flight.stopover ??
      null,

    stopoverDurationMinutes:
      flight.stopoverDurationMinutes ??
      null,

    weatherAI:
      flight.weatherAI,

    raw:
      flight,
  };
};

/* ============================================================================
 * DATE / TIME
 * ========================================================================== */

const formatDateTime = (
  date?: string | null,
): string => {
  if (!date) {
    return '—';
  }

  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return date;
  }

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(parsed);
};

const formatDate = (
  date?: string | null,
): string => {
  if (!date) {
    return '—';
  }

  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return date;
  }

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    },
  ).format(parsed);
};

const formatTime = (
  date?: string | null,
): string => {
  if (!date) {
    return '—';
  }

  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return date;
  }

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(parsed);
};

const formatDuration = (
  minutes?: number | null,
): string => {
  if (
    minutes === null ||
    minutes === undefined ||
    Number.isNaN(minutes)
  ) {
    return '—';
  }

  const hours =
    Math.floor(
      minutes / 60,
    );

  const remainingMinutes =
    minutes % 60;

  if (
    hours <= 0
  ) {
    return `${remainingMinutes} min`;
  }

  if (
    remainingMinutes === 0
  ) {
    return `${hours} h`;
  }

  return `${hours} h ${String(
    remainingMinutes,
  ).padStart(2, '0')}`;
};

const formatPercentage = (
  value?: number | null,
): string => {
  if (
    value === undefined ||
    value === null ||
    Number.isNaN(value)
  ) {
    return '—';
  }

  return `${Math.round(
    value * 100,
  )}%`;
};

/* ============================================================================
 * HISTORY DETECTION
 * ========================================================================== */

const isHistoryFlight = (
  flight: NormalizedFlight,
): boolean => {
  if (
    flight.status ===
      'Completed' ||
    flight.status ===
      'Delayed' ||
    flight.status ===
      'Cancelled'
  ) {
    return true;
  }

  if (
    flight.arrivalUtc
  ) {
    const arrival =
      new Date(
        flight.arrivalUtc,
      );

    if (
      !Number.isNaN(
        arrival.getTime(),
      ) &&
      arrival.getTime() <
        Date.now()
    ) {
      return true;
    }
  }

  return false;
};

/* ============================================================================
 * STATUS BADGE
 * ========================================================================== */

const StatusBadge:
  React.FC<{
    status: FlightStatus;
  }> = ({
    status,
  }) => {
    const normalized =
      normalizeStatus(
        status,
      );

    const config = {
      Completed: {
        label:
          'Effectué',

        icon: (
          <CheckCircle2 size={13} />
        ),

        className:
          'border-emerald-200 bg-emerald-50 text-emerald-700',
      },

      Delayed: {
        label:
          'Retardé',

        icon: (
          <Timer size={13} />
        ),

        className:
          'border-amber-200 bg-amber-50 text-amber-700',
      },

      Cancelled: {
        label:
          'Annulé',

        icon: (
          <XCircle size={13} />
        ),

        className:
          'border-rose-200 bg-rose-50 text-rose-700',
      },

      'In-Flight': {
        label:
          'En vol',

        icon: (
          <Plane size={13} />
        ),

        className:
          'border-sky-200 bg-sky-50 text-sky-700',
      },

      Scheduled: {
        label:
          'Planifié',

        icon: (
          <Clock3 size={13} />
        ),

        className:
          'border-slate-200 bg-slate-50 text-slate-600',
      },
    } as const;

    const item =
      config[
        normalized as keyof typeof config
      ];

    if (!item) {
      return (
        <span className="inline-flex h-6 items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-bold text-slate-600">
          {String(status)}
        </span>
      );
    }

    return (
      <span
        className={`inline-flex h-6 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold ${item.className}`}
      >
        {item.icon}

        {item.label}
      </span>
    );
  };

/* ============================================================================
 * WEATHER BADGE
 * ========================================================================== */

const WeatherBadge:
  React.FC<{
    weatherAI?: WeatherAI;
  }> = ({
    weatherAI,
  }) => {
    if (
      !weatherAI
    ) {
      return (
        <span className="inline-flex h-6 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-bold text-slate-500">
          <Cloud size={13} />

          Non disponible
        </span>
      );
    }

    const level =
      weatherAI.riskLevel;

    if (
      level ===
      'SKIPPED'
    ) {
      return (
        <span className="inline-flex h-6 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-bold text-slate-600">
          <CheckCircle2 size={13} />

          Analyse clôturée
        </span>
      );
    }

    const className =
      level ===
      'EXTREME'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : level ===
            'SEVERE'
          ? 'border-orange-200 bg-orange-50 text-orange-700'
          : level ===
              'HIGH'
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : level ===
                'MODERATE'
              ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
              : level ===
                  'LOW'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-500';

    const label =
      weatherAI.riskLabel ||
      level ||
      'Indéterminé';

    return (
      <span
        className={`inline-flex h-6 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold ${className}`}
      >
        {level ===
          'EXTREME' ||
        level ===
          'SEVERE' ? (
          <AlertTriangle size={13} />
        ) : (
          <Cloud size={13} />
        )}

        {label}
      </span>
    );
  };

/* ============================================================================
 * STAT CARD
 * ========================================================================== */

interface StatCardProps {
  title: string;

  value:
    | number
    | string;

  icon:
    React.ReactNode;

  subtitle?:
    string;

  tone?:
    string;

  highlight?:
    boolean;
}

const StatCard:
  React.FC<
    StatCardProps
  > = ({
    title,
    value,
    icon,
    subtitle,
    tone =
      'bg-slate-100 text-slate-600',
    highlight =
      false,
  }) => (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">

      {highlight && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-700" />
      )}

      <div className="flex items-start justify-between gap-3">

        <div className="min-w-0">

          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
            {title}
          </p>

          <p className="mt-2 text-2xl font-black tabular-nums tracking-tight text-slate-950 sm:text-3xl">
            {value}
          </p>

          {subtitle && (
            <p className="mt-1 truncate text-[10px] font-medium text-slate-400">
              {subtitle}
            </p>
          )}

        </div>

        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}
        >
          {icon}
        </div>

      </div>

    </article>
  );

/* ============================================================================
 * DETAIL ITEM
 * ========================================================================== */

interface DetailItemProps {
  label: string;
  value: React.ReactNode;
}

const DetailItem:
  React.FC<
    DetailItemProps
  > = ({
    label,
    value,
  }) => (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">

      <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <div className="mt-1.5 wrap-break-word text-xs font-bold text-slate-800">
        {value || '—'}
      </div>

    </div>
  );

/* ============================================================================
 * MAIN
 * ========================================================================== */

const FlightHistory:
  React.FC<
    FlightHistoryProps
  > = ({
    apiUrl =
      DEFAULT_API_URL,

    token,
  }) => {
    /* =========================================================================
     * STATES
     * ======================================================================= */

    const [
      flights,
      setFlights,
    ] =
      useState<
        NormalizedFlight[]
      >(
        [],
      );

    const [
      loading,
      setLoading,
    ] =
      useState(
        true,
      );

    const [
      refreshing,
      setRefreshing,
    ] =
      useState(
        false,
      );

    const [
      error,
      setError,
    ] =
      useState('');

    const [
      search,
      setSearch,
    ] =
      useState('');

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
      dateFrom,
      setDateFrom,
    ] =
      useState('');

    const [
      dateTo,
      setDateTo,
    ] =
      useState('');

    const [
      expandedId,
      setExpandedId,
    ] =
      useState<
        string | null
      >(
        null,
      );

    const [
      selectedFlight,
      setSelectedFlight,
    ] =
      useState<
        NormalizedFlight | null
      >(
        null,
      );

    /* =========================================================================
     * FETCH
     * ======================================================================= */

    const fetchFlights =
      async (
        showRefresh =
          false,
      ) => {
        try {
          if (
            showRefresh
          ) {
            setRefreshing(
              true,
            );
          } else {
            setLoading(
              true,
            );
          }

          setError('');

          const storedToken =
            token ||
            localStorage.getItem(
              'token',
            ) ||
            localStorage.getItem(
              'accessToken',
            ) ||
            localStorage.getItem(
              'authToken',
            );

          const headers:
            HeadersInit =
              {};

          if (
            storedToken
          ) {
            headers.Authorization =
              `Bearer ${storedToken}`;
          }

          const response =
            await fetch(
              apiUrl,
              {
                method:
                  'GET',

                headers,
              },
            );

          if (
            !response.ok
          ) {
            if (
              response.status ===
              401
            ) {
              throw new Error(
                'Session expirée ou accès non autorisé.',
              );
            }

            if (
              response.status ===
              403
            ) {
              throw new Error(
                "Accès à l'historique refusé.",
              );
            }

            if (
              response.status ===
              404
            ) {
              throw new Error(
                'Endpoint historique introuvable.',
              );
            }

            if (
              response.status >=
              500
            ) {
              throw new Error(
                "Erreur serveur pendant le chargement de l'historique.",
              );
            }

            throw new Error(
              `Impossible de charger les vols (${response.status}).`,
            );
          }

          const data =
            await response.json();

          const flightArray:
            Flight[] =
              Array.isArray(
                data,
              )
                ? data
                : Array.isArray(
                      data?.flights,
                    )
                  ? data.flights
                  : Array.isArray(
                        data?.data,
                      )
                    ? data.data
                    : Array.isArray(
                          data?.results,
                        )
                      ? data.results
                      : [];

          const normalized =
            flightArray
              .map(
                normalizeFlight,
              )
              .filter(
                isHistoryFlight,
              )
              .sort(
                (
                  a,
                  b,
                ) => {
                  const dateA =
                    new Date(
                      a.arrivalUtc ||
                        a.departureUtc ||
                        0,
                    ).getTime();

                  const dateB =
                    new Date(
                      b.arrivalUtc ||
                        b.departureUtc ||
                        0,
                    ).getTime();

                  return (
                    dateB -
                    dateA
                  );
                },
              );

          setFlights(
            normalized,
          );
        } catch (
          err
        ) {
          console.error(
            'Erreur historique vols :',
            err,
          );

          if (
            err instanceof TypeError
          ) {
            setError(
              'Impossible de contacter le serveur Flask.',
            );
          } else if (
            err instanceof Error
          ) {
            setError(
              err.message,
            );
          } else {
            setError(
              'Une erreur inconnue est survenue.',
            );
          }
        } finally {
          setLoading(
            false,
          );

          setRefreshing(
            false,
          );
        }
      };

    useEffect(
      () => {
        void fetchFlights();
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        apiUrl,
      ],
    );

    /* =========================================================================
     * ESC / SCROLL MODAL
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

      const handleKeyDown =
        (
          event:
            KeyboardEvent,
        ) => {
          if (
            event.key ===
            'Escape'
          ) {
            setSelectedFlight(
              null,
            );
          }
        };

      window.addEventListener(
        'keydown',
        handleKeyDown,
      );

      return () => {
        document.body.style.overflow =
          previousOverflow;

        window.removeEventListener(
          'keydown',
          handleKeyDown,
        );
      };
    }, [
      selectedFlight,
    ]);

    /* =========================================================================
     * FILTERS
     * ======================================================================= */

    const filteredFlights =
      useMemo(
        () => {
          return flights.filter(
            (
              flight,
            ) => {
              const query =
                search
                  .trim()
                  .toLowerCase();

              const matchesSearch =
                !query ||
                flight.flightNumber
                  .toLowerCase()
                  .includes(
                    query,
                  ) ||
                flight.origin
                  .toLowerCase()
                  .includes(
                    query,
                  ) ||
                flight.destination
                  .toLowerCase()
                  .includes(
                    query,
                  ) ||
                flight.route
                  .toLowerCase()
                  .includes(
                    query,
                  ) ||
                flight.aircraftRegistration
                  .toLowerCase()
                  .includes(
                    query,
                  );

              const matchesStatus =
                statusFilter ===
                  'ALL' ||
                flight.status ===
                  statusFilter;

              let matchesFrom =
                true;

              let matchesTo =
                true;

              if (
                flight.departureUtc
              ) {
                const flightDate =
                  new Date(
                    flight.departureUtc,
                  );

                if (
                  dateFrom
                ) {
                  const from =
                    new Date(
                      `${dateFrom}T00:00:00`,
                    );

                  matchesFrom =
                    flightDate >=
                    from;
                }

                if (
                  dateTo
                ) {
                  const to =
                    new Date(
                      `${dateTo}T23:59:59`,
                    );

                  matchesTo =
                    flightDate <=
                    to;
                }
              }

              return (
                matchesSearch &&
                matchesStatus &&
                matchesFrom &&
                matchesTo
              );
            },
          );
        },
        [
          flights,
          search,
          statusFilter,
          dateFrom,
          dateTo,
        ],
      );

    /* =========================================================================
     * STATS
     * ======================================================================= */

    const statistics =
      useMemo(
        () => {
          const completed =
            flights.filter(
              (
                flight,
              ) =>
                flight.status ===
                'Completed',
            ).length;

          const delayed =
            flights.filter(
              (
                flight,
              ) =>
                flight.status ===
                'Delayed',
            ).length;

          const cancelled =
            flights.filter(
              (
                flight,
              ) =>
                flight.status ===
                'Cancelled',
            ).length;

          const completionRate =
            flights.length >
            0
              ? Math.round(
                  (
                    completed /
                    flights.length
                  ) *
                    100,
                )
              : 0;

          return {
            total:
              flights.length,

            completed,

            delayed,

            cancelled,

            completionRate,
          };
        },
        [
          flights,
        ],
      );

    const resetFilters =
      () => {
        setSearch('');

        setStatusFilter(
          'ALL',
        );

        setDateFrom('');

        setDateTo('');
      };

    const activeFilterCount =
      (
        search.trim()
          ? 1
          : 0
      ) +
      (
        statusFilter !==
        'ALL'
          ? 1
          : 0
      ) +
      (
        dateFrom
          ? 1
          : 0
      ) +
      (
        dateTo
          ? 1
          : 0
      );

    /* =========================================================================
     * LOADING
     * ======================================================================= */

    if (
      loading
    ) {
      return (
        <div className="flex min-h-125 items-center justify-center">

          <div className="rounded-2xl border border-slate-200 bg-white px-10 py-8 text-center shadow-sm">

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">

              <RefreshCw
                size={22}
                className="animate-spin"
              />

            </div>

            <p className="mt-4 text-sm font-bold text-slate-700">
              Chargement de l&apos;historique
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Synchronisation des vols archivés...
            </p>

          </div>

        </div>
      );
    }

    /* =========================================================================
     * RENDER
     * ======================================================================= */

    return (
      <div className="space-y-4">

        {/* =====================================================================
            HEADER
        ===================================================================== */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">

            <div className="flex min-w-0 items-center gap-3">

              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">

                <History size={20} />

                <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />

              </div>

              <div className="min-w-0">

                <h1 className="truncate text-base font-black tracking-tight text-slate-950 sm:text-lg">
                  Historique des vols
                </h1>

                <p className="mt-1 text-[11px] font-medium text-slate-500">
                  Consultation des opérations clôturées, retardées et annulées
                </p>

              </div>

            </div>

            <button
              type="button"
              onClick={() =>
                void fetchFlights(
                  true,
                )
              }
              disabled={
                refreshing
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >

              <RefreshCw
                size={16}
                className={
                  refreshing
                    ? 'animate-spin'
                    : ''
                }
              />

              {refreshing
                ? 'Actualisation...'
                : 'Actualiser'}

            </button>

          </div>

        </section>

        {/* =====================================================================
            ERROR
        ===================================================================== */}

        {error && (

          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 shadow-sm"
          >

            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">

              <AlertTriangle size={16} />

            </div>

            <div className="min-w-0 flex-1">

              <p className="text-xs font-bold text-rose-800">
                Impossible de charger l&apos;historique
              </p>

              <p className="mt-0.5 text-xs leading-5 text-rose-700">
                {error}
              </p>

            </div>

          </div>

        )}

        {/* =====================================================================
            STATS
        ===================================================================== */}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">

          <StatCard
            title="Historique total"
            value={
              statistics.total
            }
            icon={
              <History size={18} />
            }
            subtitle="Vols archivés"
            tone="bg-slate-100 text-slate-600"
            highlight
          />

          <StatCard
            title="Effectués"
            value={
              statistics.completed
            }
            icon={
              <CheckCircle2 size={18} />
            }
            subtitle={`${statistics.completionRate}% de l'historique`}
            tone="bg-emerald-50 text-emerald-700"
          />

          <StatCard
            title="Retardés"
            value={
              statistics.delayed
            }
            icon={
              <Timer size={18} />
            }
            subtitle="Vols avec retard"
            tone="bg-amber-50 text-amber-700"
          />

          <StatCard
            title="Annulés"
            value={
              statistics.cancelled
            }
            icon={
              <XCircle size={18} />
            }
            subtitle="Annulations enregistrées"
            tone="bg-rose-50 text-rose-700"
          />

        </section>

        {/* =====================================================================
            FILTERS
        ===================================================================== */}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

          <div className="grid gap-3 xl:grid-cols-[minmax(280px,1.5fr)_210px_170px_170px]">

            {/* SEARCH */}

            <div className="relative">

              <Search
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={
                  search
                }
                onChange={(
                  event,
                ) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Vol, route, aéroport ou appareil..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-xs font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />

              {search && (

                <button
                  type="button"
                  onClick={() =>
                    setSearch('')
                  }
                  aria-label="Effacer la recherche"
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200"
                >

                  <X size={13} />

                </button>

              )}

            </div>

            {/* STATUS */}

            <select
              value={
                statusFilter
              }
              onChange={(
                event,
              ) =>
                setStatusFilter(
                  event.target
                    .value as StatusFilter,
                )
              }
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="ALL">
                Tous les statuts
              </option>

              <option value="Completed">
                Effectués
              </option>

              <option value="Delayed">
                Retardés
              </option>

              <option value="Cancelled">
                Annulés
              </option>
            </select>

            {/* DATE FROM */}

            <input
              type="date"
              value={
                dateFrom
              }
              onChange={(
                event,
              ) =>
                setDateFrom(
                  event.target.value,
                )
              }
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              title="Date de début"
            />

            {/* DATE TO */}

            <input
              type="date"
              value={
                dateTo
              }
              onChange={(
                event,
              ) =>
                setDateTo(
                  event.target.value,
                )
              }
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              title="Date de fin"
            />

          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">

            <p className="text-[10px] font-medium text-slate-400">

              <span className="font-black text-slate-700">
                {
                  filteredFlights.length
                }
              </span>{' '}

              résultat
              {filteredFlights.length >
              1
                ? 's'
                : ''}

              {activeFilterCount >
                0 && (
                <>
                  {' '}•{' '}
                  {activeFilterCount}{' '}
                  filtre
                  {activeFilterCount >
                  1
                    ? 's'
                    : ''}{' '}
                  actif
                  {activeFilterCount >
                  1
                    ? 's'
                    : ''}
                </>
              )}

            </p>

            {activeFilterCount >
              0 && (

              <button
                type="button"
                onClick={
                  resetFilters
                }
                className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 transition hover:bg-emerald-50 hover:text-emerald-800"
              >
                Réinitialiser
              </button>

            )}

          </div>

        </section>

        {/* =====================================================================
            TABLE
        ===================================================================== */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          {/* TABLE HEADER */}

          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:px-5">

            <div>

              <h2 className="text-sm font-black text-slate-900">
                Registre des vols
              </h2>

              <p className="mt-0.5 text-[10px] text-slate-400">
                Historique opérationnel par ordre chronologique décroissant
              </p>

            </div>

            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-500">
              {
                filteredFlights.length
              }
            </span>

          </div>

          {filteredFlights.length ===
          0 ? (

            <div className="flex min-h-75 flex-col items-center justify-center p-8 text-center">

              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">

                <Plane size={21} />

              </div>

              <h3 className="mt-4 text-sm font-black text-slate-700">
                Aucun vol historique
              </h3>

              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
                Aucun vol ne correspond aux critères actuellement sélectionnés.
              </p>

            </div>

          ) : (

            <div className="overflow-x-auto">

              <table className="min-w-300 w-full">

                <thead className="border-b border-slate-200 bg-slate-50">

                  <tr>

                    {[
                      'Vol',
                      'Trajet',
                      'Départ local',
                      'Arrivée locale',
                      'Durée',
                      'Avion',
                      'Statut',
                      'Météo',
                    ].map(
                      (
                        label,
                      ) => (

                        <th
                          key={
                            label
                          }
                          className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.12em] text-slate-400"
                        >
                          {
                            label
                          }
                        </th>

                      ),
                    )}

                    <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                      Détails
                    </th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-100">

                  {filteredFlights.map(
                    (
                      flight,
                    ) => {
                      const isExpanded =
                        expandedId ===
                        flight.id;

                      return (

                        <React.Fragment
                          key={
                            flight.id
                          }
                        >

                          {/* ===================================================
                              MAIN ROW
                          =================================================== */}

                          <tr
                            className={`transition-colors ${
                              isExpanded
                                ? 'bg-emerald-50/30'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >

                            {/* VOL */}

                            <td className="whitespace-nowrap px-4 py-3.5">

                              <div className="flex items-center gap-3">

                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">

                                  <Plane size={16} />

                                </div>

                                <div>

                                  <p className="font-mono text-sm font-black text-slate-950">
                                    {
                                      flight.flightNumber
                                    }
                                  </p>

                                  <p className="mt-0.5 font-mono text-[9px] text-slate-400">
                                    {
                                      flight.id.slice(
                                        0,
                                        8,
                                      )
                                    }
                                  </p>

                                </div>

                              </div>

                            </td>

                            {/* ROUTE */}

                            <td className="whitespace-nowrap px-4 py-3.5">

                              <div className="flex items-center gap-2">

                                <span className="font-mono text-xs font-black text-slate-800">
                                  {
                                    flight.origin
                                  }
                                </span>

                                <Navigation
                                  size={13}
                                  className="rotate-90 text-slate-300"
                                />

                                <span className="font-mono text-xs font-black text-slate-800">
                                  {
                                    flight.destination
                                  }
                                </span>

                              </div>

                              {flight.stopover && (

                                <p className="mt-1 text-[9px] font-semibold text-amber-600">
                                  Escale :{' '}
                                  {
                                    flight.stopover
                                  }
                                </p>

                              )}

                            </td>

                            {/* DEP */}

                            <td className="whitespace-nowrap px-4 py-3.5">

                              <p className="font-mono text-xs font-bold text-slate-700">
                                {formatDate(
                                  flight.localDeparture,
                                )}
                              </p>

                              <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                                {formatTime(
                                  flight.localDeparture,
                                )}{' '}
                                local
                              </p>

                            </td>

                            {/* ARR */}

                            <td className="whitespace-nowrap px-4 py-3.5">

                              <p className="font-mono text-xs font-bold text-slate-700">
                                {formatDate(
                                  flight.localArrival,
                                )}
                              </p>

                              <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                                {formatTime(
                                  flight.localArrival,
                                )}{' '}
                                local
                              </p>

                            </td>

                            {/* DURATION */}

                            <td className="whitespace-nowrap px-4 py-3.5">

                              <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-slate-700">

                                <Timer
                                  size={13}
                                  className="text-slate-400"
                                />

                                {formatDuration(
                                  flight.durationMinutes,
                                )}

                              </span>

                            </td>

                            {/* AIRCRAFT */}

                            <td className="whitespace-nowrap px-4 py-3.5">

                              <p className="font-mono text-xs font-black text-slate-800">
                                {
                                  flight.aircraftRegistration
                                }
                              </p>

                              <p
                                className="mt-0.5 max-w-30 truncate font-mono text-[9px] text-slate-400"
                                title={
                                  flight.aircraftId
                                }
                              >
                                {
                                  flight.aircraftId
                                }
                              </p>

                            </td>

                            {/* STATUS */}

                            <td className="whitespace-nowrap px-4 py-3.5">

                              <StatusBadge
                                status={
                                  flight.status
                                }
                              />

                            </td>

                            {/* WEATHER */}

                            <td className="whitespace-nowrap px-4 py-3.5">

                              <WeatherBadge
                                weatherAI={
                                  flight.weatherAI
                                }
                              />

                            </td>

                            {/* ACTION */}

                            <td className="whitespace-nowrap px-4 py-3.5 text-right">

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedId(
                                    isExpanded
                                      ? null
                                      : flight.id,
                                  )
                                }
                                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold transition ${
                                  isExpanded
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                              >

                                {isExpanded ? (
                                  <>
                                    Masquer

                                    <ChevronUp size={14} />
                                  </>
                                ) : (
                                  <>
                                    Détails

                                    <ChevronDown size={14} />
                                  </>
                                )}

                              </button>

                            </td>

                          </tr>

                          {/* ===================================================
                              EXPANDED
                          =================================================== */}

                          {isExpanded && (

                            <tr>

                              <td
                                colSpan={
                                  9
                                }
                                className="bg-slate-50/70 px-4 py-4"
                              >

                                {/* =================================================
                                    INFO SUMMARY
                                ================================================= */}

                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">

                                  {/* LOCAL */}

                                  <div className="rounded-xl border border-slate-200 bg-white p-4">

                                    <div className="mb-3 flex items-center gap-2">

                                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">

                                        <Clock3 size={14} />

                                      </div>

                                      <span className="text-xs font-black text-slate-800">
                                        Horaires locaux
                                      </span>

                                    </div>

                                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                      Départ
                                    </p>

                                    <p className="mt-1 font-mono text-xs font-bold text-slate-700">
                                      {formatDateTime(
                                        flight.localDeparture,
                                      )}
                                    </p>

                                    <p className="mt-3 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                      Arrivée
                                    </p>

                                    <p className="mt-1 font-mono text-xs font-bold text-slate-700">
                                      {formatDateTime(
                                        flight.localArrival,
                                      )}
                                    </p>

                                  </div>

                                  {/* UTC */}

                                  <div className="rounded-xl border border-slate-200 bg-white p-4">

                                    <div className="mb-3 flex items-center gap-2">

                                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">

                                        <CalendarDays size={14} />

                                      </div>

                                      <span className="text-xs font-black text-slate-800">
                                        Horaires UTC
                                      </span>

                                    </div>

                                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                      Départ
                                    </p>

                                    <p className="mt-1 font-mono text-xs font-bold text-slate-700">
                                      {formatDateTime(
                                        flight.departureUtc,
                                      )}
                                    </p>

                                    <p className="mt-3 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                      Arrivée
                                    </p>

                                    <p className="mt-1 font-mono text-xs font-bold text-slate-700">
                                      {formatDateTime(
                                        flight.arrivalUtc,
                                      )}
                                    </p>

                                  </div>

                                  {/* DURATION */}

                                  <div className="rounded-xl border border-slate-200 bg-white p-4">

                                    <div className="mb-3 flex items-center gap-2">

                                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">

                                        <Timer size={14} />

                                      </div>

                                      <span className="text-xs font-black text-slate-800">
                                        Durée
                                      </span>

                                    </div>

                                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                      Temps de vol
                                    </p>

                                    <p className="mt-1 font-mono text-lg font-black text-slate-900">
                                      {formatDuration(
                                        flight.durationMinutes,
                                      )}
                                    </p>

                                    {flight.stopover && (

                                      <>

                                        <p className="mt-3 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                          Escale
                                        </p>

                                        <p className="mt-1 font-mono text-xs font-bold text-slate-700">
                                          {formatDuration(
                                            flight.stopoverDurationMinutes,
                                          )}
                                        </p>

                                      </>

                                    )}

                                  </div>

                                  {/* AIRCRAFT */}

                                  <div className="rounded-xl border border-slate-200 bg-white p-4">

                                    <div className="mb-3 flex items-center gap-2">

                                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">

                                        <Plane size={14} />

                                      </div>

                                      <span className="text-xs font-black text-slate-800">
                                        Appareil
                                      </span>

                                    </div>

                                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                      Immatriculation
                                    </p>

                                    <p className="mt-1 font-mono text-sm font-black text-slate-900">
                                      {
                                        flight.aircraftRegistration
                                      }
                                    </p>

                                    <p className="mt-3 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                      ID
                                    </p>

                                    <p className="mt-1 break-all font-mono text-[9px] text-slate-500">
                                      {
                                        flight.aircraftId
                                      }
                                    </p>

                                  </div>

                                </div>

                                {/* =================================================
                                    OPERATIONAL + WEATHER
                                ================================================= */}

                                <div className="mt-3 grid gap-3 lg:grid-cols-2">

                                  {/* OPERATIONAL */}

                                  <section className="rounded-xl border border-slate-200 bg-white p-4">

                                    <div className="flex items-center gap-2">

                                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">

                                        <MapPin size={14} />

                                      </div>

                                      <h4 className="text-xs font-black text-slate-800">
                                        Informations opérationnelles
                                      </h4>

                                    </div>

                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">

                                      <DetailItem
                                        label="Route"
                                        value={
                                          flight.route
                                        }
                                      />

                                      <DetailItem
                                        label="Statut final"
                                        value={
                                          <StatusBadge
                                            status={
                                              flight.status
                                            }
                                          />
                                        }
                                      />

                                      {flight.stopover && (

                                        <DetailItem
                                          label="Escale"
                                          value={
                                            flight.stopover
                                          }
                                        />

                                      )}

                                      <DetailItem
                                        label="Numéro de vol"
                                        value={
                                          flight.flightNumber
                                        }
                                      />

                                    </div>

                                  </section>

                                  {/* WEATHER */}

                                  <section className="rounded-xl border border-slate-200 bg-white p-4">

                                    <div className="flex items-center gap-2">

                                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">

                                        <Cloud size={14} />

                                      </div>

                                      <h4 className="text-xs font-black text-slate-800">
                                        Analyse météo OCC
                                      </h4>

                                    </div>

                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">

                                      <DetailItem
                                        label="État"
                                        value={
                                          <WeatherBadge
                                            weatherAI={
                                              flight.weatherAI
                                            }
                                          />
                                        }
                                      />

                                      <DetailItem
                                        label="Niveau de risque"
                                        value={
                                          flight.weatherAI
                                            ?.riskLabel ||
                                          'Non évalué'
                                        }
                                      />

                                      <DetailItem
                                        label="Score météo"
                                        value={
                                          flight.weatherAI
                                            ?.riskLevel ===
                                          'SKIPPED'
                                            ? 'Analyse clôturée'
                                            : formatPercentage(
                                                flight.weatherAI
                                                  ?.score,
                                              )
                                        }
                                      />

                                      <DetailItem
                                        label="Confiance"
                                        value={
                                          flight.weatherAI
                                            ?.riskLevel ===
                                          'SKIPPED'
                                            ? '—'
                                            : formatPercentage(
                                                flight.weatherAI
                                                  ?.confidence,
                                              )
                                        }
                                      />

                                      <div className="sm:col-span-2">

                                        <DetailItem
                                          label="Recommandation"
                                          value={
                                            flight.weatherAI
                                              ?.recommendedActionLabel ||
                                            'Aucune recommandation'
                                          }
                                        />

                                      </div>

                                    </div>

                                    {flight.weatherAI
                                      ?.explanation && (

                                      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">

                                        <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                                          Explication
                                        </p>

                                        <p className="mt-1.5 text-[11px] leading-5 text-slate-600">
                                          {
                                            flight.weatherAI
                                              .explanation
                                          }
                                        </p>

                                      </div>

                                    )}

                                  </section>

                                </div>

                                {/* ACTION */}

                                <div className="mt-3 flex justify-end">

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedFlight(
                                        flight,
                                      )
                                    }
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-[10px] font-bold text-white shadow-sm transition hover:bg-emerald-800"
                                  >
                                    Fiche complète

                                    <ArrowRight size={13} />
                                  </button>

                                </div>

                              </td>

                            </tr>

                          )}

                        </React.Fragment>

                      );
                    },
                  )}

                </tbody>

              </table>

            </div>

          )}

        </section>

        {/* =====================================================================
            COMPLETE MODAL
        ===================================================================== */}

        {selectedFlight && (

          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Historique du vol ${selectedFlight.flightNumber}`}
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

            <div className="w-full max-w-190 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">

              {/* ===============================================================
                  MODAL HEADER
              =============================================================== */}

              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">

                <div className="min-w-0">

                  <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
                    Fiche historique OCC
                  </span>

                  <div className="mt-1 flex flex-wrap items-center gap-2">

                    <h2 className="font-mono text-xl font-black text-slate-950">
                      {
                        selectedFlight.flightNumber
                      }
                    </h2>

                    <StatusBadge
                      status={
                        selectedFlight.status
                      }
                    />

                  </div>

                  <p className="mt-1 truncate font-mono text-[11px] font-semibold text-slate-500">
                    {
                      selectedFlight.route
                    }
                  </p>

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

                  <X size={16} />

                </button>

              </div>

              {/* ===============================================================
                  BODY
              =============================================================== */}

              <div className="space-y-3 p-4">

                {/* ROUTE HERO */}

                <section className="overflow-hidden rounded-2xl bg-emerald-700 px-5 py-4 text-white">

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">

                    <div>

                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-100">
                        Origine
                      </span>

                      <strong className="mt-1 block font-mono text-2xl font-black">
                        {
                          selectedFlight.origin
                        }
                      </strong>

                    </div>

                    <div className="flex items-center">

                      <div className="h-px w-7 bg-emerald-400/80" />

                      <Plane className="mx-2 h-4 w-4 rotate-90" />

                      <div className="h-px w-7 bg-emerald-400/80" />

                    </div>

                    <div className="text-right">

                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-100">
                        Destination
                      </span>

                      <strong className="mt-1 block font-mono text-2xl font-black">
                        {
                          selectedFlight.destination
                        }
                      </strong>

                    </div>

                  </div>

                </section>

                {/* MAIN INFO */}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

                  <DetailItem
                    label="Numéro de vol"
                    value={
                      selectedFlight.flightNumber
                    }
                  />

                  <DetailItem
                    label="Immatriculation"
                    value={
                      selectedFlight.aircraftRegistration
                    }
                  />

                  <DetailItem
                    label="Durée"
                    value={
                      formatDuration(
                        selectedFlight.durationMinutes,
                      )
                    }
                  />

                  <DetailItem
                    label="Départ local"
                    value={
                      formatDateTime(
                        selectedFlight.localDeparture,
                      )
                    }
                  />

                  <DetailItem
                    label="Arrivée locale"
                    value={
                      formatDateTime(
                        selectedFlight.localArrival,
                      )
                    }
                  />

                  <DetailItem
                    label="Statut"
                    value={
                      <StatusBadge
                        status={
                          selectedFlight.status
                        }
                      />
                    }
                  />

                </div>

                {/* UTC */}

                <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">

                  <div className="mb-3 flex items-center gap-2">

                    <CalendarDays
                      size={15}
                      className="text-slate-500"
                    />

                    <h3 className="text-xs font-black text-slate-800">
                      Références UTC
                    </h3>

                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">

                    <DetailItem
                      label="Départ UTC"
                      value={
                        formatDateTime(
                          selectedFlight.departureUtc,
                        )
                      }
                    />

                    <DetailItem
                      label="Arrivée UTC"
                      value={
                        formatDateTime(
                          selectedFlight.arrivalUtc,
                        )
                      }
                    />

                  </div>

                </section>

                {/* WEATHER */}

                <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">

                  <div className="mb-3 flex items-center justify-between gap-3">

                    <div className="flex items-center gap-2">

                      <Gauge
                        size={15}
                        className="text-emerald-700"
                      />

                      <h3 className="text-xs font-black text-slate-800">
                        Données météo / OCC
                      </h3>

                    </div>

                    <WeatherBadge
                      weatherAI={
                        selectedFlight.weatherAI
                      }
                    />

                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">

                    <DetailItem
                      label="Niveau de risque"
                      value={
                        selectedFlight.weatherAI
                          ?.riskLabel ||
                        'Non évalué'
                      }
                    />

                    <DetailItem
                      label="Phase météo"
                      value={
                        selectedFlight.weatherAI
                          ?.forecastPhaseLabel ||
                        '—'
                      }
                    />

                    <DetailItem
                      label="Action recommandée"
                      value={
                        selectedFlight.weatherAI
                          ?.recommendedActionLabel ||
                        'Aucune'
                      }
                    />

                    <DetailItem
                      label="Analyse effectuée"
                      value={
                        formatDateTime(
                          selectedFlight.weatherAI
                            ?.evaluatedAt,
                        )
                      }
                    />

                  </div>

                  {selectedFlight.weatherAI
                    ?.explanation && (

                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">

                      <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                        Explication du moteur
                      </p>

                      <p className="mt-1.5 text-[11px] leading-5 text-slate-600">
                        {
                          selectedFlight.weatherAI
                            .explanation
                        }
                      </p>

                    </div>

                  )}

                </section>

                {/* FOOTER */}

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

export default FlightHistory;