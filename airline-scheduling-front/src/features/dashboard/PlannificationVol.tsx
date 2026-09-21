// src/features/dashboard/PlannificationVol.tsx

import { useMemo, useState } from 'react';
import type { FC, ReactNode } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Filter,
  Plane,
  RefreshCw,
  Search,
  ShieldAlert,
  Timer,
  X,
} from 'lucide-react';

/* ========================================================================== */
/* TYPES PARTAGÉS                                                            */
/* ========================================================================== */

export type FlightStatus =
  | 'Scheduled'
  | 'Planifié'
  | 'Delayed'
  | 'Retardé'
  | 'Cancelled'
  | 'Annulé'
  | 'In-Flight'
  | 'En Vol'
  | 'Effectué'
  | 'Ponctuel'
  | 'On-Time'
  | 'Completed'
  | string;

export type StatusFilter = 'ALL' | FlightStatus | 'UNASSIGNED';

export interface FlightLeg {
  numeroVol?: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart?: string | null;
  heureArrivee?: string | null;
}

export interface Flight {
  id: string;
  flightNumber: string;
  aircraft: string;
  aircraftModel: string;
  origin: string;
  stopover?: string | string[] | null;
  stopoverDurationMinutes?: number | null;
  destination: string;
  route?: string;
  departure: string;
  arrival: string;
  localDeparture?: string | null;
  localArrival?: string | null;
  durationMinutes?: number | null;
  status: FlightStatus;
  weatherSeverity: number;
  legs?: FlightLeg[];
}

export interface AircraftData {
  id: string;
  model: string;
  immatriculation?: string;
}

export interface StatusStyle {
  label: string;
  dot: string;
  badge: string;
  border: string;
  card: string;
}

export interface WeatherIndicator {
  label: string;
  icon: ReactNode;
  badge: string;
  recommendation: string;
}

export const UNASSIGNED_AIRCRAFT = 'NON ASSIGNÉ';

/* ========================================================================== */
/* PROPS                                                                      */
/* ========================================================================== */

interface FlightPlanningProps {
  flights: Flight[];
  fleetAircrafts: AircraftData[];
  isFetching: boolean;
  statusStyles: Record<FlightStatus, StatusStyle>;
  formatLocalIso: (dateString?: string | null) => string;
  formatDuration: (minutes?: number | null) => string;
  displayRoute: (flight: Flight) => string;
  getWeatherIndicator: (severity: number) => WeatherIndicator;
  onSelectFlight: (flight: Flight) => void;
  /** Contenu rendu au-dessus — dans le même div et le même fond blanc */
  topHeader?: ReactNode;
}

/* ========================================================================== */
/* DESIGN TOKENS                                                              */
/* ========================================================================== */

const FOCUS_RING =
  'outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';

/**
 * ✅ Map étendue pour couvrir tous les statuts possibles (FR + EN).
 * Chaque entrée contient : classes du badge + couleur du dot.
 */
const STATUS_BADGE_MAP: Record<
  string,
  { badge: string; dot: string }
> = {
  // Anglais
  Scheduled: {
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  Delayed: {
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
  },
  Cancelled: {
    badge: 'bg-rose-100 text-rose-700',
    dot: 'bg-rose-500',
  },
  'In-Flight': {
    badge: 'bg-sky-100 text-sky-700',
    dot: 'bg-sky-500',
  },
  Completed: {
    badge: 'bg-slate-100 text-slate-600',
    dot: 'bg-slate-400',
  },
  'On-Time': {
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
  },

  // Français
  Planifié: {
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  'En attente': {
    badge: 'bg-slate-100 text-slate-700',
    dot: 'bg-slate-500',
  },
  Ponctuel: {
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  Retardé: {
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
  },
  'En Vol': {
    badge: 'bg-sky-100 text-sky-700',
    dot: 'bg-sky-500',
  },
  Annulé: {
    badge: 'bg-rose-100 text-rose-700',
    dot: 'bg-rose-500',
  },
  Effectué: {
    badge: 'bg-slate-100 text-slate-600',
    dot: 'bg-slate-400',
  },
};

/**
 * ✅ Fallback ultime si le statut est totalement inconnu.
 */
const DEFAULT_STATUS_STYLE = {
  badge: 'bg-slate-100 text-slate-600',
  dot: 'bg-slate-400',
};

/** Filtres statiques (évite de recréer le tableau à chaque render) */
const FILTERS: ReadonlyArray<readonly [StatusFilter, string]> = [
  ['ALL', 'Tous'],
  ['Scheduled', 'Planifiés'],
  ['Delayed', 'Retardés'],
  ['In-Flight', 'En vol'],
  ['Effectué', 'Effectués'],
  ['Cancelled', 'Annulés'],
  ['UNASSIGNED', 'Non assignés'],
];

/* ========================================================================== */
/* PETITS COMPOSANTS                                                          */
/* ========================================================================== */

interface StatusBadgeProps {
  status: FlightStatus;
  label: string;
}

const StatusBadge: FC<StatusBadgeProps> = ({ status, label }) => {
  // ✅ Fallback à 3 niveaux : map exacte → Scheduled → default
  const config =
    STATUS_BADGE_MAP[String(status)] ??
    STATUS_BADGE_MAP.Scheduled ??
    DEFAULT_STATUS_STYLE;

  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium ${config.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {label || String(status)}
    </span>
  );
};

/* ========================================================================== */
/* LOADING SKELETON                                                           */
/* ========================================================================== */

const LoadingSkeleton: FC = () => (
  <div className="space-y-3 p-4 sm:p-5">
    {[1, 2, 3].map((row) => (
      <div
        key={row}
        className="animate-pulse overflow-hidden rounded-xl border border-slate-200 bg-white"
      >
        <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="border-b border-slate-200 bg-slate-50/70 p-5 lg:border-b-0 lg:border-r">
            <div className="h-2.5 w-14 rounded bg-slate-200" />
            <div className="mt-3 h-5 w-28 rounded bg-slate-200" />
            <div className="mt-4 h-3 w-20 rounded bg-slate-200" />
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"
              >
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="mt-3 h-3 w-32 rounded bg-slate-200" />
                <div className="mt-4 h-10 rounded-lg bg-slate-200/70" />
              </div>
            ))}
          </div>
        </div>
      </div>
    ))}
  </div>
);

/* ========================================================================== */
/* CARTE D'UN VOL                                                             */
/* ========================================================================== */

interface FlightCardProps {
  flight: Flight;
  mode: 'mobile' | 'desktop';
  statusStyles: Record<FlightStatus, StatusStyle>;
  formatLocalIso: (dateString?: string | null) => string;
  formatDuration: (minutes?: number | null) => string;
  displayRoute: (flight: Flight) => string;
  getWeatherIndicator: (severity: number) => WeatherIndicator;
  onSelectFlight: (flight: Flight) => void;
}

const FlightCard: FC<FlightCardProps> = ({
  flight,
  mode,
  statusStyles,
  formatLocalIso,
  formatDuration,
  displayRoute,
  getWeatherIndicator,
  onSelectFlight,
}) => {
  // ✅ Fallback sûr pour le style du statut
  const statusStyle =
    statusStyles[String(flight.status)] ??
    statusStyles.Scheduled ??
    {
      label: String(flight.status ?? 'Inconnu'),
      dot: 'bg-slate-400',
      badge: 'border-slate-200 bg-slate-100 text-slate-600',
      border: 'border-l-slate-400',
      card: '',
    };

  const weather = getWeatherIndicator(flight.weatherSeverity);
  const compact = mode === 'desktop';
  const isUnassigned = flight.aircraft === UNASSIGNED_AIRCRAFT;
  const isDone =
    flight.status === 'Effectué' || flight.status === 'Completed';
  const isInFlight =
    flight.status === 'In-Flight' || flight.status === 'En Vol';

  return (
    <button
      type="button"
      onClick={() => onSelectFlight(flight)}
      className={[
        'group relative w-full overflow-hidden rounded-xl border bg-white text-left',
        'transition-all duration-200',
        'hover:border-slate-300 hover:shadow-md',
        FOCUS_RING,
        isUnassigned ? 'border-rose-200' : 'border-slate-200',
        compact ? 'p-3.5' : 'p-4',
        isDone ? 'opacity-90' : '',
      ].join(' ')}
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold tracking-wide text-slate-900">
                {flight.flightNumber}
              </span>
              <StatusBadge status={flight.status} label={statusStyle.label} />
              {isInFlight && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                  Live
                </span>
              )}
              {isDone && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              )}
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              <span className="truncate font-mono text-xs font-medium text-slate-500">
                {displayRoute(flight)}
              </span>
            </div>
          </div>

          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5">
          <div>
            <span className="block text-[10px] font-medium text-slate-400">
              Départ
            </span>
            <span className="mt-0.5 block font-mono text-xs font-semibold text-slate-800">
              {formatLocalIso(flight.localDeparture || flight.departure)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <div className="h-px w-3 bg-slate-300" />
            <Plane className="h-3 w-3 rotate-90 text-slate-400" />
            <div className="h-px w-3 bg-slate-300" />
          </div>

          <div className="text-right">
            <span className="block text-[10px] font-medium text-slate-400">
              Arrivée
            </span>
            <span className="mt-0.5 block font-mono text-xs font-semibold text-slate-800">
              {formatLocalIso(flight.localArrival || flight.arrival)}
            </span>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span
            className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium ${weather.badge}`}
            title={weather.recommendation || weather.label}
          >
            {weather.icon}
            {weather.label}
          </span>

          {flight.durationMinutes != null && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
              <Timer className="h-3 w-3 text-slate-400" />
              {formatDuration(flight.durationMinutes)}
            </span>
          )}

          {flight.stopover && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
              <ArrowRight className="h-3 w-3 text-slate-400" />
              Escale
              {flight.stopoverDurationMinutes
                ? ` · ${formatDuration(flight.stopoverDurationMinutes)}`
                : ''}
            </span>
          )}

          {isUnassigned && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700">
              <ShieldAlert className="h-3 w-3" />
              Affectation requise
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

/* ========================================================================== */
/* COMPOSANT PRINCIPAL DU PLANNING                                            */
/* ========================================================================== */

export const FlightPlanning: FC<FlightPlanningProps> = ({
  flights,
  fleetAircrafts,
  isFetching,
  statusStyles,
  formatLocalIso,
  formatDuration,
  displayRoute,
  getWeatherIndicator,
  onSelectFlight,
  topHeader,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  /* ---------------------------------------------------------------------- */
  /* FLIGHTS FILTRÉS                                                        */
  /* ---------------------------------------------------------------------- */

  const filteredFlights = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();

    return flights
      .filter((flight) => {
        if (statusFilter === 'ALL') return true;
        if (statusFilter === 'UNASSIGNED') {
          return flight.aircraft === UNASSIGNED_AIRCRAFT;
        }
        return flight.status === statusFilter;
      })
      .filter((flight) => {
        if (!needle) return true;

        return [
          flight.flightNumber,
          flight.origin,
          flight.destination,
          flight.route,
          flight.aircraft,
          flight.aircraftModel,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort(
        (a, b) =>
          new Date(a.departure).getTime() - new Date(b.departure).getTime(),
      );
  }, [flights, searchQuery, statusFilter]);

  /* ---------------------------------------------------------------------- */
  /* GROUPES PAR AÉRONEF                                                    */
  /* ---------------------------------------------------------------------- */

  const flightsByAircraft = useMemo(() => {
    const groups = new Map<string, Flight[]>();

    filteredFlights.forEach((flight) => {
      const key = flight.aircraft || UNASSIGNED_AIRCRAFT;
      groups.set(key, [...(groups.get(key) ?? []), flight]);
    });

    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === UNASSIGNED_AIRCRAFT) return 1;
      if (b === UNASSIGNED_AIRCRAFT) return -1;
      return a.localeCompare(b);
    });
  }, [filteredFlights]);

  /* ---------------------------------------------------------------------- */
  /* LOOKUP AÉRONEFS                                                        */
  /* ---------------------------------------------------------------------- */

  const aircraftLookup = useMemo(
    () =>
      new Map(
        fleetAircrafts.map((aircraft) => [
          aircraft.id,
          aircraft.immatriculation || aircraft.model,
        ]),
      ),
    [fleetAircrafts],
  );

  /* ---------------------------------------------------------------------- */
  /* COMPTEURS                                                              */
  /* ---------------------------------------------------------------------- */

  const activeFilterCount = useMemo(
    () =>
      (statusFilter !== 'ALL' ? 1 : 0) + (searchQuery.trim() ? 1 : 0),
    [statusFilter, searchQuery],
  );

  const aircraftWithFlightsCount = useMemo(
    () =>
      flightsByAircraft.filter(([key]) => key !== UNASSIGNED_AIRCRAFT).length,
    [flightsByAircraft],
  );

  /* ---------------------------------------------------------------------- */
  /* ACTIONS                                                                */
  /* ---------------------------------------------------------------------- */

  const resetFilters = () => {
    setStatusFilter('ALL');
    setSearchQuery('');
  };

  /* ══════════════════════════════════════════════════════════════════════ */
  /* RENDER                                                                */
  /* ══════════════════════════════════════════════════════════════════════ */
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* ─────────────── TOP HEADER (OTP) ─────────────── */}
      {topHeader && (
        <div className="border-b border-slate-100 p-5">{topHeader}</div>
      )}

      {/* ─────────────── RECHERCHE + FILTRES ─────────────── */}
      <div className="border-b border-slate-100 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-[320px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Vol, aéroport, appareil..."
              className={`h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-9 text-sm text-slate-700 placeholder:text-slate-400 ${FOCUS_RING}`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Effacer la recherche"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1.5 text-sm font-medium text-slate-500 sm:inline-flex">
              <Filter className="h-4 w-4 text-slate-400" />
              Filtrer :
            </span>

            {FILTERS.map(([value, label]) => {
              const active = statusFilter === value;
              const isUnassigned = value === 'UNASSIGNED';

              return (
                <button
                  type="button"
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`h-8 rounded-full px-3.5 text-sm font-medium transition ${
                    active
                      ? isUnassigned
                        ? 'bg-rose-600 text-white'
                        : 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-3 w-3" />
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─────────────── HEADER PLANNING ─────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Activity className="h-4 w-4" />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Planning des rotations
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {filteredFlights.length} vol
              {filteredFlights.length > 1 ? 's' : ''} ·{' '}
              {aircraftWithFlightsCount} appareil
              {aircraftWithFlightsCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {isFetching && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Actualisation
          </span>
        )}
      </div>

      {/* ─────────────── CONTENU ─────────────── */}
      {isFetching && flights.length === 0 ? (
        <LoadingSkeleton />
      ) : flightsByAircraft.length === 0 ? (
        <div className="flex min-h-70 flex-col items-center justify-center p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-50 text-slate-300">
            <Search className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-700">
            Aucun vol trouvé
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {activeFilterCount > 0
              ? 'Ajustez vos filtres ou votre recherche.'
              : 'Aucune rotation planifiée pour le moment.'}
          </p>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className={`mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 ${FOCUS_RING}`}
            >
              <X className="h-3.5 w-3.5" />
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <>
          {/* MOBILE */}
          <div className="divide-y divide-slate-100 lg:hidden">
            {flightsByAircraft.map(([aircraft, aircraftFlights]) => {
              const fallbackLabel =
                aircraftFlights.find((flight) => flight.aircraftModel)
                  ?.aircraftModel || 'Appareil inconnu';

              const aircraftLabel =
                aircraftLookup.get(aircraft) || fallbackLabel;

              const isUnassigned = aircraft === UNASSIGNED_AIRCRAFT;

              return (
                <div key={aircraft} className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          isUnassigned
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        <Plane className="h-3.5 w-3.5" />
                      </div>
                      <span
                        className={`font-mono text-sm font-bold ${
                          isUnassigned ? 'text-rose-700' : 'text-slate-900'
                        }`}
                      >
                        {isUnassigned ? 'Non assigné' : aircraftLabel}
                      </span>
                    </div>

                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {aircraftFlights.length} vol
                      {aircraftFlights.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {aircraftFlights.map((flight) => (
                      <FlightCard
                        key={flight.id}
                        flight={flight}
                        mode="mobile"
                        statusStyles={statusStyles}
                        formatLocalIso={formatLocalIso}
                        formatDuration={formatDuration}
                        displayRoute={displayRoute}
                        getWeatherIndicator={getWeatherIndicator}
                        onSelectFlight={onSelectFlight}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-[220px_minmax(0,1fr)] border-b border-slate-100 bg-slate-50/70">
              <div className="border-r border-slate-100 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                AÉRONEF
              </div>
              <div className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                ROTATIONS AFFECTÉES
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {flightsByAircraft.map(([aircraft, aircraftFlights]) => {
                const fallbackLabel =
                  aircraftFlights.find((flight) => flight.aircraftModel)
                    ?.aircraftModel || 'Appareil inconnu';

                const aircraftLabel =
                  aircraftLookup.get(aircraft) || fallbackLabel;

                const isUnassigned = aircraft === UNASSIGNED_AIRCRAFT;

                return (
                  <div
                    key={aircraft}
                    className="grid grid-cols-[220px_minmax(0,1fr)]"
                  >
                    <aside
                      className={`border-r border-slate-100 p-5 ${
                        isUnassigned ? 'bg-rose-50/40' : 'bg-slate-50/40'
                      }`}
                    >
                      {isUnassigned ? (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                              <ShieldAlert className="h-4 w-4" />
                            </div>
                            <span className="text-xs font-semibold text-rose-700">
                              Non assigné
                            </span>
                          </div>
                          <p className="mt-3 text-[10px] leading-4 text-rose-600/80">
                            Vols en attente d'affectation
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                              <Plane className="h-4 w-4" />
                            </div>
                            <strong className="truncate font-mono text-sm font-bold text-slate-900">
                              {aircraftLabel}
                            </strong>
                          </div>

                          <span className="mt-2 block font-mono text-[10px] text-slate-400">
                            REF {aircraft.slice(0, 8).toUpperCase()}
                          </span>
                        </>
                      )}

                      <div className="mt-4 flex items-center gap-1.5 border-t border-slate-200/80 pt-3">
                        <span className="text-[10px] font-medium text-slate-500">
                          {aircraftFlights.length} rotation
                          {aircraftFlights.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </aside>

                    <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-2 2xl:grid-cols-3">
                      {aircraftFlights.map((flight) => (
                        <FlightCard
                          key={flight.id}
                          flight={flight}
                          mode="desktop"
                          statusStyles={statusStyles}
                          formatLocalIso={formatLocalIso}
                          formatDuration={formatDuration}
                          displayRoute={displayRoute}
                          getWeatherIndicator={getWeatherIndicator}
                          onSelectFlight={onSelectFlight}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default FlightPlanning;