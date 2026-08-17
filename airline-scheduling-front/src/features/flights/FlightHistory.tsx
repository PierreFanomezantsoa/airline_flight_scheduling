import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Search,
  RefreshCw,
  Plane,
  CalendarDays,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  ChevronDown,
  ChevronUp,
  History,
  Cloud,
  Navigation,
  Clock3,
  Gauge,
} from "lucide-react";

/* =========================================================
   TYPES
========================================================= */

type FlightStatus =
  | "Scheduled"
  | "Delayed"
  | "Cancelled"
  | "Completed"
  | "In-Flight"
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
  stopoverDurationMinutes: number | null;

  weatherAI?: WeatherAI;

  raw: Flight;
}

type StatusFilter =
  | "ALL"
  | "Completed"
  | "Delayed"
  | "Cancelled";

interface FlightHistoryProps {
  apiUrl?: string;
  token?: string | null;
}

/* =========================================================
   CONFIG
========================================================= */

const DEFAULT_API_URL =
  "http://localhost:5000/flights";

/* =========================================================
   HELPERS
========================================================= */

const normalizeStatus = (
  status?: string,
): FlightStatus => {
  const value = String(
    status ?? "",
  )
    .trim()
    .toLowerCase();

  if (
    value === "completed" ||
    value === "effectué" ||
    value === "effectue" ||
    value === "done"
  ) {
    return "Completed";
  }

  if (
    value === "delayed" ||
    value === "retardé" ||
    value === "retarde"
  ) {
    return "Delayed";
  }

  if (
    value === "cancelled" ||
    value === "canceled" ||
    value === "annulé" ||
    value === "annule"
  ) {
    return "Cancelled";
  }

  if (
    value === "in-flight" ||
    value === "in flight" ||
    value === "en vol"
  ) {
    return "In-Flight";
  }

  if (
    value === "scheduled" ||
    value === "planifié" ||
    value === "planifie" ||
    value === "programmé" ||
    value === "programme"
  ) {
    return "Scheduled";
  }

  return status || "Unknown";
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
      ).slice(
        0,
        8,
      )}`,

    origin:
      flight.origin ||
      "—",

    destination:
      flight.destination ||
      "—",

    route:
      flight.route ||
      `${flight.origin || "—"} → ${
        flight.destination || "—"
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
      "NON ASSIGNÉ",

    aircraftRegistration:
      flight.aircraftModel ||
      "Sans immatriculation",

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

const formatDateTime = (
  date?: string | null,
): string => {
  if (!date) {
    return "—";
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
    "fr-FR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(
    parsed,
  );
};

const formatDate = (
  date?: string | null,
): string => {
  if (!date) {
    return "—";
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
    "fr-FR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  ).format(
    parsed,
  );
};

const formatTime = (
  date?: string | null,
): string => {
  if (!date) {
    return "—";
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
    "fr-FR",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(
    parsed,
  );
};

const formatDuration = (
  minutes?: number | null,
): string => {
  if (
    minutes === null ||
    minutes === undefined ||
    Number.isNaN(minutes)
  ) {
    return "—";
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

  return `${hours} h ${String(
    remainingMinutes,
  ).padStart(
    2,
    "0",
  )}`;
};

const formatPercentage = (
  value?: number | null,
): string => {
  if (
    value === undefined ||
    value === null ||
    Number.isNaN(value)
  ) {
    return "—";
  }

  return `${Math.round(
    value * 100,
  )}%`;
};

const isHistoryFlight = (
  flight: NormalizedFlight,
): boolean => {
  if (
    flight.status ===
      "Completed" ||
    flight.status ===
      "Delayed" ||
    flight.status ===
      "Cancelled"
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

/* =========================================================
   STATUS BADGE
========================================================= */

const StatusBadge: React.FC<{
  status: FlightStatus;
}> = ({
  status,
}) => {
  const normalized =
    normalizeStatus(
      status,
    );

  if (
    normalized ===
    "Completed"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 size={14} />
        Effectué
      </span>
    );
  }

  if (
    normalized ===
    "Delayed"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
        <Timer size={14} />
        Retardé
      </span>
    );
  }

  if (
    normalized ===
    "Cancelled"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
        <XCircle size={14} />
        Annulé
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
      {
        status
      }
    </span>
  );
};

/* =========================================================
   WEATHER BADGE
========================================================= */

const WeatherBadge: React.FC<{
  weatherAI?: WeatherAI;
}> = ({
  weatherAI,
}) => {
  if (
    !weatherAI
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
        <Cloud size={13} />
        Non disponible
      </span>
    );
  }

  const level =
    weatherAI.riskLevel;

  if (
    level === "SKIPPED"
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
        <CheckCircle2 size={13} />
        Analyse clôturée
      </span>
    );
  }

  if (
    level === "EXTREME"
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
        <AlertTriangle size={13} />
        Extrême
      </span>
    );
  }

  if (
    level === "SEVERE"
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
        <AlertTriangle size={13} />
        Sévère
      </span>
    );
  }

  if (
    level === "HIGH"
  ) {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
        Élevé
      </span>
    );
  }

  if (
    level === "MODERATE"
  ) {
    return (
      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
        Modéré
      </span>
    );
  }

  if (
    level === "LOW"
  ) {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
        Faible
      </span>
    );
  }

  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
      {
        weatherAI.riskLabel ||
        "Indéterminé"
      }
    </span>
  );
};

/* =========================================================
   STAT CARD
========================================================= */

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  subtitle?: string;
}

const StatCard: React.FC<
  StatCardProps
> = ({
  title,
  value,
  icon,
  subtitle,
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {
              title
            }
          </p>

          <p className="mt-2 text-3xl font-bold text-slate-900">
            {
              value
            }
          </p>

          {subtitle && (
            <p className="mt-1 text-xs text-slate-400">
              {
                subtitle
              }
            </p>
          )}
        </div>

        <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
          {
            icon
          }
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   DETAIL ITEM
========================================================= */

interface DetailItemProps {
  label: string;
  value: React.ReactNode;
}

const DetailItem: React.FC<
  DetailItemProps
> = ({
  label,
  value,
}) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-400">
        {
          label
        }
      </p>

      <div className="mt-1 break-words text-sm font-semibold text-slate-800">
        {
          value ||
          "—"
        }
      </div>
    </div>
  );
};

/* =========================================================
   MAIN
========================================================= */

const FlightHistory: React.FC<
  FlightHistoryProps
> = ({
  apiUrl = DEFAULT_API_URL,
  token,
}) => {
  const [
    flights,
    setFlights,
  ] = useState<
    NormalizedFlight[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(
    true,
  );

  const [
    refreshing,
    setRefreshing,
  ] = useState(
    false,
  );

  const [
    error,
    setError,
  ] = useState(
    "",
  );

  const [
    search,
    setSearch,
  ] = useState(
    "",
  );

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<StatusFilter>(
      "ALL",
    );

  const [
    dateFrom,
    setDateFrom,
  ] = useState(
    "",
  );

  const [
    dateTo,
    setDateTo,
  ] = useState(
    "",
  );

  const [
    expandedId,
    setExpandedId,
  ] = useState<
    string | null
  >(null);

  const [
    selectedFlight,
    setSelectedFlight,
  ] =
    useState<NormalizedFlight | null>(
      null,
    );

  /* =======================================================
     FETCH
  ======================================================= */

  const fetchFlights =
    async (
      showRefresh = false,
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

        setError(
          "",
        );

        const storedToken =
          token ||
          localStorage.getItem(
            "token",
          ) ||
          localStorage.getItem(
            "accessToken",
          ) ||
          localStorage.getItem(
            "authToken",
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
                "GET",
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
              "Session expirée ou accès non autorisé.",
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
              "Endpoint historique introuvable.",
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
          "Erreur historique vols :",
          err,
        );

        if (
          err instanceof TypeError
        ) {
          setError(
            "Impossible de contacter le serveur Flask.",
          );
        } else if (
          err instanceof Error
        ) {
          setError(
            err.message,
          );
        } else {
          setError(
            "Une erreur inconnue est survenue.",
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
      fetchFlights();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      apiUrl,
    ],
  );

  /* =======================================================
     FILTERS
  ======================================================= */

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
                "ALL" ||
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

  /* =======================================================
     STATS
  ======================================================= */

  const statistics =
    useMemo(
      () => {
        const completed =
          flights.filter(
            (
              flight,
            ) =>
              flight.status ===
              "Completed",
          ).length;

        const delayed =
          flights.filter(
            (
              flight,
            ) =>
              flight.status ===
              "Delayed",
          ).length;

        const cancelled =
          flights.filter(
            (
              flight,
            ) =>
              flight.status ===
              "Cancelled",
          ).length;

        const completionRate =
          flights.length >
          0
            ? Math.round(
                (completed /
                  flights.length) *
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
      setSearch(
        "",
      );

      setStatusFilter(
        "ALL",
      );

      setDateFrom(
        "",
      );

      setDateTo(
        "",
      );
    };

  /* =======================================================
     LOADING
  ======================================================= */

  if (
    loading
  ) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <div className="text-center">
          <RefreshCw
            size={
              36
            }
            className="mx-auto animate-spin text-emerald-700"
          />

          <p className="mt-4 text-sm font-medium text-slate-600">
            Chargement de l'historique des vols...
          </p>
        </div>
      </div>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="space-y-6">

      {/* ===================================================
          HEADER
      =================================================== */}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div className="flex items-start gap-4">

            <div className="rounded-2xl bg-emerald-700 p-3 text-white shadow-sm shadow-emerald-700/20">
              <History
                size={
                  24
                }
              />
            </div>

            <div>

              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                Historique des vols
              </h1>

              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Consultation des vols effectués, retardés ou annulés avec horaires locaux, appareil et informations OCC.
              </p>

            </div>

          </div>

          <button
            type="button"
            onClick={() =>
              fetchFlights(
                true,
              )
            }
            disabled={
              refreshing
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={
                17
              }
              className={
                refreshing
                  ? "animate-spin"
                  : ""
              }
            />

            {refreshing
              ? "Actualisation..."
              : "Actualiser"}
          </button>

        </div>

      </section>

      {/* ===================================================
          ERROR
      =================================================== */}

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">

          <AlertTriangle
            size={
              20
            }
            className="mt-0.5 shrink-0 text-red-600"
          />

          <div>

            <p className="font-bold text-red-800">
              Impossible de charger l'historique
            </p>

            <p className="mt-1 text-sm text-red-700">
              {
                error
              }
            </p>

          </div>

        </div>
      )}

      {/* ===================================================
          STATS
      =================================================== */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <StatCard
          title="Historique total"
          value={
            statistics.total
          }
          icon={
            <History size={21} />
          }
          subtitle="Vols clôturés ou perturbés"
        />

        <StatCard
          title="Vols effectués"
          value={
            statistics.completed
          }
          icon={
            <CheckCircle2 size={21} />
          }
          subtitle={`${statistics.completionRate}% de l'historique`}
        />

        <StatCard
          title="Vols retardés"
          value={
            statistics.delayed
          }
          icon={
            <Timer size={21} />
          }
          subtitle="Vols enregistrés en retard"
        />

        <StatCard
          title="Vols annulés"
          value={
            statistics.cancelled
          }
          icon={
            <XCircle size={21} />
          }
          subtitle="Annulations enregistrées"
        />

      </div>

      {/* ===================================================
          FILTERS
      =================================================== */}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">

          <div className="relative xl:col-span-2">

            <Search
              size={
                18
              }
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
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
              placeholder="Vol, trajet, aéroport ou immatriculation..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />

          </div>

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
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
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
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
            title="Date de début"
          />

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
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
            title="Date de fin"
          />

        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">

          <p className="text-sm text-slate-500">
            <span className="font-bold text-slate-800">
              {
                filteredFlights.length
              }
            </span>{" "}
            résultat
            {
              filteredFlights.length >
              1
                ? "s"
                : ""
            }
          </p>

          <button
            type="button"
            onClick={
              resetFilters
            }
            className="text-sm font-bold text-emerald-700 hover:text-emerald-800"
          >
            Réinitialiser les filtres
          </button>

        </div>

      </section>

      {/* ===================================================
          TABLE
      =================================================== */}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        {filteredFlights.length ===
        0 ? (

          <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">

            <Plane
              size={
                44
              }
              className="text-slate-300"
            />

            <h3 className="mt-4 text-lg font-bold text-slate-800">
              Aucun vol historique
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Aucun vol ne correspond aux critères sélectionnés.
            </p>

          </div>

        ) : (

          <div className="overflow-x-auto">

            <table className="min-w-full">

              <thead className="border-b border-slate-200 bg-slate-50">

                <tr>

                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Vol
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Trajet
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Départ local
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Arrivée locale
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Durée
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Avion
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Statut
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Météo
                  </th>

                  <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
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

                        <tr className="transition hover:bg-slate-50">

                          {/* VOL */}

                          <td className="whitespace-nowrap px-5 py-4">

                            <div className="flex items-center gap-3">

                              <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">

                                <Plane
                                  size={
                                    17
                                  }
                                />

                              </div>

                              <div>

                                <p className="font-bold text-slate-900">
                                  {
                                    flight.flightNumber
                                  }
                                </p>

                                <p className="mt-1 text-[10px] text-slate-400">
                                  {
                                    flight.id.slice(
                                      0,
                                      8,
                                    )
                                  }
                                  …
                                </p>

                              </div>

                            </div>

                          </td>

                          {/* ROUTE */}

                          <td className="whitespace-nowrap px-5 py-4">

                            <div className="flex items-center gap-2">

                              <span className="font-bold text-slate-800">
                                {
                                  flight.origin
                                }
                              </span>

                              <Navigation
                                size={
                                  14
                                }
                                className="text-slate-300"
                              />

                              <span className="font-bold text-slate-800">
                                {
                                  flight.destination
                                }
                              </span>

                            </div>

                            {flight.stopover && (
                              <p className="mt-1 text-xs font-medium text-amber-600">
                                Escale :{" "}
                                {
                                  flight.stopover
                                }
                              </p>
                            )}

                          </td>

                          {/* LOCAL DEP */}

                          <td className="whitespace-nowrap px-5 py-4">

                            <p className="text-sm font-bold text-slate-700">
                              {
                                formatDate(
                                  flight.localDeparture,
                                )
                              }
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              {
                                formatTime(
                                  flight.localDeparture,
                                )
                              }{" "}
                              local
                            </p>

                          </td>

                          {/* LOCAL ARR */}

                          <td className="whitespace-nowrap px-5 py-4">

                            <p className="text-sm font-bold text-slate-700">
                              {
                                formatDate(
                                  flight.localArrival,
                                )
                              }
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              {
                                formatTime(
                                  flight.localArrival,
                                )
                              }{" "}
                              local
                            </p>

                          </td>

                          {/* DURATION */}

                          <td className="whitespace-nowrap px-5 py-4">

                            <span className="font-semibold text-slate-700">
                              {
                                formatDuration(
                                  flight.durationMinutes,
                                )
                              }
                            </span>

                          </td>

                          {/* AIRCRAFT */}

                          <td className="whitespace-nowrap px-5 py-4">

                            <p className="font-bold text-slate-800">
                              {
                                flight.aircraftRegistration
                              }
                            </p>

                            <p
                              className="mt-1 max-w-[120px] truncate text-[10px] text-slate-400"
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

                          <td className="whitespace-nowrap px-5 py-4">

                            <StatusBadge
                              status={
                                flight.status
                              }
                            />

                          </td>

                          {/* WEATHER */}

                          <td className="whitespace-nowrap px-5 py-4">

                            <WeatherBadge
                              weatherAI={
                                flight.weatherAI
                              }
                            />

                          </td>

                          {/* ACTION */}

                          <td className="whitespace-nowrap px-5 py-4 text-right">

                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(
                                  isExpanded
                                    ? null
                                    : flight.id,
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                            >

                              {isExpanded ? (
                                <>
                                  Masquer
                                  <ChevronUp
                                    size={
                                      16
                                    }
                                  />
                                </>
                              ) : (
                                <>
                                  Voir
                                  <ChevronDown
                                    size={
                                      16
                                    }
                                  />
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
                              className="bg-slate-50 px-5 py-5"
                            >

                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">

                                {/* LOCAL TIMES */}

                                <div className="rounded-xl border border-slate-200 bg-white p-4">

                                  <div className="mb-3 flex items-center gap-2 font-bold text-slate-800">
                                    <Clock3
                                      size={
                                        17
                                      }
                                    />
                                    Horaires locaux
                                  </div>

                                  <p className="text-xs text-slate-400">
                                    Départ
                                  </p>

                                  <p className="mt-1 text-sm font-semibold text-slate-700">
                                    {
                                      formatDateTime(
                                        flight.localDeparture,
                                      )
                                    }
                                  </p>

                                  <p className="mt-3 text-xs text-slate-400">
                                    Arrivée
                                  </p>

                                  <p className="mt-1 text-sm font-semibold text-slate-700">
                                    {
                                      formatDateTime(
                                        flight.localArrival,
                                      )
                                    }
                                  </p>

                                </div>

                                {/* UTC */}

                                <div className="rounded-xl border border-slate-200 bg-white p-4">

                                  <div className="mb-3 flex items-center gap-2 font-bold text-slate-800">
                                    <CalendarDays
                                      size={
                                        17
                                      }
                                    />
                                    Horaires UTC
                                  </div>

                                  <p className="text-xs text-slate-400">
                                    Départ UTC
                                  </p>

                                  <p className="mt-1 text-sm font-semibold text-slate-700">
                                    {
                                      formatDateTime(
                                        flight.departureUtc,
                                      )
                                    }
                                  </p>

                                  <p className="mt-3 text-xs text-slate-400">
                                    Arrivée UTC
                                  </p>

                                  <p className="mt-1 text-sm font-semibold text-slate-700">
                                    {
                                      formatDateTime(
                                        flight.arrivalUtc,
                                      )
                                    }
                                  </p>

                                </div>

                                {/* PERFORMANCE */}

                                <div className="rounded-xl border border-slate-200 bg-white p-4">

                                  <div className="mb-3 flex items-center gap-2 font-bold text-slate-800">
                                    <Timer
                                      size={
                                        17
                                      }
                                    />
                                    Durée
                                  </div>

                                  <p className="text-xs text-slate-400">
                                    Durée du vol
                                  </p>

                                  <p className="mt-1 text-lg font-extrabold text-slate-800">
                                    {
                                      formatDuration(
                                        flight.durationMinutes,
                                      )
                                    }
                                  </p>

                                  {flight.stopover && (
                                    <>
                                      <p className="mt-3 text-xs text-slate-400">
                                        Durée escale
                                      </p>

                                      <p className="mt-1 text-sm font-semibold text-slate-700">
                                        {
                                          formatDuration(
                                            flight.stopoverDurationMinutes,
                                          )
                                        }
                                      </p>
                                    </>
                                  )}

                                </div>

                                {/* AIRCRAFT */}

                                <div className="rounded-xl border border-slate-200 bg-white p-4">

                                  <div className="mb-3 flex items-center gap-2 font-bold text-slate-800">
                                    <Plane
                                      size={
                                        17
                                      }
                                    />
                                    Appareil
                                  </div>

                                  <p className="text-xs text-slate-400">
                                    Immatriculation
                                  </p>

                                  <p className="mt-1 text-sm font-extrabold text-slate-800">
                                    {
                                      flight.aircraftRegistration
                                    }
                                  </p>

                                  <p className="mt-3 text-xs text-slate-400">
                                    ID avion
                                  </p>

                                  <p className="mt-1 break-all text-xs font-medium text-slate-500">
                                    {
                                      flight.aircraftId
                                    }
                                  </p>

                                </div>

                              </div>

                              {/* =================================================
                                  WEATHER + ROUTE
                              ================================================= */}

                              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">

                                {/* ROUTE */}

                                <div className="rounded-xl border border-slate-200 bg-white p-5">

                                  <h4 className="flex items-center gap-2 font-bold text-slate-800">

                                    <MapPin
                                      size={
                                        17
                                      }
                                    />

                                    Informations opérationnelles

                                  </h4>

                                  <div className="mt-4 space-y-4">

                                    <div>

                                      <p className="text-xs text-slate-400">
                                        Route
                                      </p>

                                      <p className="mt-1 text-sm font-bold text-slate-700">
                                        {
                                          flight.route
                                        }
                                      </p>

                                    </div>

                                    <div>

                                      <p className="text-xs text-slate-400">
                                        Statut final
                                      </p>

                                      <div className="mt-2">
                                        <StatusBadge
                                          status={
                                            flight.status
                                          }
                                        />
                                      </div>

                                    </div>

                                    {flight.stopover && (

                                      <div>

                                        <p className="text-xs text-slate-400">
                                          Escale
                                        </p>

                                        <p className="mt-1 text-sm font-semibold text-slate-700">
                                          {
                                            flight.stopover
                                          }
                                        </p>

                                      </div>

                                    )}

                                  </div>

                                </div>

                                {/* WEATHER */}

                                <div className="rounded-xl border border-slate-200 bg-white p-5">

                                  <h4 className="flex items-center gap-2 font-bold text-slate-800">

                                    <Cloud
                                      size={
                                        17
                                      }
                                    />

                                    Analyse météo OCC

                                  </h4>

                                  <div className="mt-4 space-y-4">

                                    <div>

                                      <p className="text-xs text-slate-400">
                                        État de l'analyse
                                      </p>

                                      <div className="mt-2">

                                        <WeatherBadge
                                          weatherAI={
                                            flight.weatherAI
                                          }
                                        />

                                      </div>

                                    </div>

                                    <div>

                                      <p className="text-xs text-slate-400">
                                        Niveau de risque
                                      </p>

                                      <p className="mt-1 text-sm font-bold text-slate-700">
                                        {
                                          flight.weatherAI
                                            ?.riskLabel ||
                                          "Non évalué"
                                        }
                                      </p>

                                    </div>

                                    <div>

                                      <p className="text-xs text-slate-400">
                                        Score météo
                                      </p>

                                      <p className="mt-1 text-sm font-bold text-slate-700">
                                        {
                                          flight.weatherAI
                                            ?.riskLevel ===
                                          "SKIPPED"
                                            ? "Analyse clôturée"
                                            : formatPercentage(
                                                flight.weatherAI
                                                  ?.score,
                                              )
                                        }
                                      </p>

                                    </div>

                                    <div>

                                      <p className="text-xs text-slate-400">
                                        Confiance
                                      </p>

                                      <p className="mt-1 text-sm font-bold text-slate-700">
                                        {
                                          flight.weatherAI
                                            ?.riskLevel ===
                                          "SKIPPED"
                                            ? "—"
                                            : formatPercentage(
                                                flight.weatherAI
                                                  ?.confidence,
                                              )
                                        }
                                      </p>

                                    </div>

                                    <div>

                                      <p className="text-xs text-slate-400">
                                        Recommandation
                                      </p>

                                      <p className="mt-1 text-sm font-semibold text-slate-700">
                                        {
                                          flight.weatherAI
                                            ?.recommendedActionLabel ||
                                          "Aucune recommandation"
                                        }
                                      </p>

                                    </div>

                                    {flight.weatherAI
                                      ?.explanation && (

                                      <div>

                                        <p className="text-xs text-slate-400">
                                          Explication
                                        </p>

                                        <p className="mt-1 text-sm leading-6 text-slate-600">
                                          {
                                            flight.weatherAI
                                              .explanation
                                          }
                                        </p>

                                      </div>

                                    )}

                                  </div>

                                </div>

                              </div>

                              <div className="mt-4 flex justify-end">

                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedFlight(
                                      flight,
                                    )
                                  }
                                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
                                >
                                  Fiche complète
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

      {/* ===================================================
          MODAL
      =================================================== */}

      {selectedFlight && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() =>
            setSelectedFlight(
              null,
            )
          }
        >

          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
            onClick={(
              event,
            ) =>
              event.stopPropagation()
            }
          >

            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">

              <div>

                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  Fiche historique OCC
                </p>

                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                  {
                    selectedFlight.flightNumber
                  }
                </h2>

                <p className="mt-1 text-sm text-slate-500">
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
                className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
              >
                <XCircle
                  size={
                    22
                  }
                />
              </button>

            </div>

            <div className="space-y-6 p-6">

              <div className="flex flex-wrap items-center gap-3">

                <StatusBadge
                  status={
                    selectedFlight.status
                  }
                />

                <WeatherBadge
                  weatherAI={
                    selectedFlight.weatherAI
                  }
                />

              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">

                <DetailItem
                  label="Numéro de vol"
                  value={
                    selectedFlight.flightNumber
                  }
                />

                <DetailItem
                  label="Route"
                  value={
                    selectedFlight.route
                  }
                />

                <DetailItem
                  label="Immatriculation"
                  value={
                    selectedFlight.aircraftRegistration
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
                  label="Durée"
                  value={
                    formatDuration(
                      selectedFlight.durationMinutes,
                    )
                  }
                />

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

                <DetailItem
                  label="ID appareil"
                  value={
                    selectedFlight.aircraftId
                  }
                />

              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">

                <div className="flex items-center gap-2">

                  <Gauge
                    size={
                      18
                    }
                    className="text-emerald-700"
                  />

                  <h3 className="font-extrabold text-slate-800">
                    Données météo / OCC
                  </h3>

                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">

                  <DetailItem
                    label="Niveau de risque"
                    value={
                      selectedFlight.weatherAI
                        ?.riskLabel ||
                      "Non évalué"
                    }
                  />

                  <DetailItem
                    label="Phase météo"
                    value={
                      selectedFlight.weatherAI
                        ?.forecastPhaseLabel ||
                      "—"
                    }
                  />

                  <DetailItem
                    label="Action recommandée"
                    value={
                      selectedFlight.weatherAI
                        ?.recommendedActionLabel ||
                      "Aucune"
                    }
                  />

                  <DetailItem
                    label="Analyse effectuée le"
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

                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">

                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Explication du moteur
                    </p>

                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {
                        selectedFlight.weatherAI
                          .explanation
                      }
                    </p>

                  </div>

                )}

              </div>

            </div>

          </div>

        </div>

      )}

    </div>
  );
};

export default FlightHistory;