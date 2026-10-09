// src/features/dashboard/PlannificationVol.tsx

import { useEffect, useMemo, useState } from 'react';
import type { FC, ReactNode } from 'react';
import {
  CalendarClock,
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
  flightNumber?: string;
  depAirportCode: string;
  arrAirportCode: string;
  departureTime?: string | null;
  arrivalTime?: string | null;
}

export interface Flight {
  refFlight: string;
  flightNumber: string;
  aircraft: string;
  aircraftModel: string;
  origin: string;
  stopover?: string | string[] | null;
  stopoverMins?: number | null;
  destination: string;
  route?: string;
  departure: string;
  arrival: string;
  localDeparture?: string | null;
  localArrival?: string | null;
  durationMinutes?: number | null;
  flightStatus: FlightStatus;
  weatherSeverity: number;
  legs?: FlightLeg[];
}

export interface AircraftData {
  refAircraft: string;
  model: string;
  registration?: string;
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
  /** Contenu rendu au-dessus — dans la même carte blanche */
  topHeader?: ReactNode;
}

/* ========================================================================== */
/* DESIGN TOKENS — émeraude & blanc                                           */
/* ========================================================================== */

const FOCUS_RING =
  'outline-none transition focus-visible:ring-4 focus-visible:ring-emerald-500/15';

type StatusTone = { badge: string; dot: string; accent: string };

const TONE_SCHEDULED: StatusTone = {
  badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  dot: 'bg-emerald-500',
  accent: 'bg-emerald-400',
};
const TONE_IN_FLIGHT: StatusTone = {
  badge: 'bg-emerald-600 text-white ring-emerald-700/20',
  dot: 'bg-white',
  accent: 'bg-emerald-600',
};
const TONE_DELAYED: StatusTone = {
  badge: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  dot: 'bg-amber-500',
  accent: 'bg-amber-400',
};
const TONE_CANCELLED: StatusTone = {
  badge: 'bg-rose-50 text-rose-700 ring-rose-600/15',
  dot: 'bg-rose-500',
  accent: 'bg-rose-400',
};
const TONE_DONE: StatusTone = {
  badge: 'bg-slate-100 text-slate-600 ring-slate-500/10',
  dot: 'bg-slate-400',
  accent: 'bg-slate-300',
};
const TONE_WAITING: StatusTone = {
  badge: 'bg-white text-slate-600 ring-slate-300',
  dot: 'bg-slate-400',
  accent: 'bg-slate-300',
};

/** Couvre tous les statuts possibles (FR + EN). */
const STATUS_TONE_MAP: Record<string, StatusTone> = {
  Scheduled: TONE_SCHEDULED,
  'On-Time': TONE_SCHEDULED,
  Planifié: TONE_SCHEDULED,
  Ponctuel: TONE_SCHEDULED,
  'In-Flight': TONE_IN_FLIGHT,
  'En Vol': TONE_IN_FLIGHT,
  Delayed: TONE_DELAYED,
  Retardé: TONE_DELAYED,
  Cancelled: TONE_CANCELLED,
  Annulé: TONE_CANCELLED,
  Completed: TONE_DONE,
  Effectué: TONE_DONE,
  'En attente': TONE_WAITING,
};

const getStatusTone = (status: FlightStatus): StatusTone =>
  STATUS_TONE_MAP[String(status)] ?? TONE_WAITING;

/** Filtres statiques */
const FILTERS: ReadonlyArray<readonly [StatusFilter, string]> = [
  ['ALL', 'Tous'],
  ['Planifié', 'Planifiés'],
  ['Retardé', 'Retardés'],
  ['En Vol', 'En flight'],
  ['Effectué', 'Effectués'],
  ['Annulé', 'Annulés'],
  ['UNASSIGNED', 'Non assignés'],
];

const normalizeStatus = (status: FlightStatus): string => {
  const normalized = String(status)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[_-]/g, ' ');

  if (['SCHEDULED', 'PLANIFIE', 'ON TIME', 'PONCTUEL'].includes(normalized)) {
    return 'PLANIFIE';
  }
  if (['DELAYED', 'RETARDE', 'SHIFTED'].includes(normalized)) return 'RETARDE';
  if (['IN FLIGHT', 'EN VOL'].includes(normalized)) return 'EN VOL';
  if (['COMPLETED', 'DONE', 'LANDED', 'EFFECTUE'].includes(normalized)) {
    return 'EFFECTUE';
  }
  if (['CANCELLED', 'CANCELED', 'ANNULE'].includes(normalized)) return 'ANNULE';
  return normalized;
};

const matchesFilter = (flight: Flight, filter: StatusFilter) => {
  if (filter === 'ALL') return true;
  if (filter === 'UNASSIGNED') return flight.aircraft === UNASSIGNED_AIRCRAFT;
  return normalizeStatus(flight.flightStatus) === normalizeStatus(filter);
};

/** Extrait l'heure « HH:MM » et le jour « JJ/MM » d'une date déjà formatée « JJ/MM HH:MM ». */
const splitDateTime = (formatted: string) => {
  const [day, time] = formatted.split(' ');
  return time ? { day, time } : { day: '', time: formatted };
};

/* ========================================================================== */
/* PETITS COMPOSANTS                                                          */
/* ========================================================================== */

const StatusBadge: FC<{ status: FlightStatus; label: string }> = ({ status, label }) => {
  const tone = getStatusTone(status);
  const live = tone === TONE_IN_FLIGHT;

  return (
    <span
      className={`inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[10.5px] font-semibold ring-1 ring-inset ${tone.badge}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {live && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      </span>
      {label || String(status)}
    </span>
  );
};

/* ========================================================================== */
/* LOADING SKELETON                                                           */
/* ========================================================================== */

const LoadingSkeleton: FC = () => (
  <div className="space-y-3 p-4 sm:p-5" aria-busy="true" aria-label="Chargement du planning">
    {[1, 2, 3].map((row) => (
      <div key={row} className="animate-pulse overflow-hidden rounded-2xl border border-slate-100">
        <div className="grid lg:grid-cols-[200px_minmax(0,1fr)]">
          <div className="border-b border-slate-100 bg-emerald-50/40 p-5 lg:border-b-0 lg:border-r">
            <div className="h-9 w-9 rounded-xl bg-emerald-100" />
            <div className="mt-3 h-4 w-28 rounded-full bg-slate-100" />
            <div className="mt-2 h-3 w-16 rounded-full bg-slate-100" />
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-100 p-4">
                <div className="h-4 w-24 rounded-full bg-slate-100" />
                <div className="mt-4 h-8 rounded-xl bg-slate-100" />
                <div className="mt-3 h-3 w-32 rounded-full bg-slate-100" />
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
  statusStyles: Record<FlightStatus, StatusStyle>;
  formatLocalIso: (dateString?: string | null) => string;
  formatDuration: (minutes?: number | null) => string;
  displayRoute: (flight: Flight) => string;
  getWeatherIndicator: (severity: number) => WeatherIndicator;
  onSelectFlight: (flight: Flight) => void;
}

const FlightCard: FC<FlightCardProps> = ({
  flight,
  statusStyles,
  formatLocalIso,
  formatDuration,
  displayRoute,
  getWeatherIndicator,
  onSelectFlight,
}) => {
  const statusLabel =
    statusStyles[String(flight.flightStatus)]?.label ??
    String(flight.flightStatus ?? 'Inconnu');

  const tone = getStatusTone(flight.flightStatus);
  const weather = getWeatherIndicator(flight.weatherSeverity);
  const isUnassigned = flight.aircraft === UNASSIGNED_AIRCRAFT;
  const isDone =
    flight.flightStatus === 'Effectué' ||
    flight.flightStatus === 'Completed';
  const hasStopover = Boolean(
    Array.isArray(flight.stopover) ? flight.stopover.length : flight.stopover,
  );

  const dep = splitDateTime(formatLocalIso(flight.localDeparture || flight.departure));
  const arr = splitDateTime(formatLocalIso(flight.localArrival || flight.arrival));

  return (
    <button
      type="button"
      onClick={() => onSelectFlight(flight)}
      aria-label={`Vol ${flight.flightNumber}, ${displayRoute(flight)}, ${statusLabel}`}
      className={[
        'group relative w-full overflow-hidden rounded-xl border bg-white p-3 pl-4 text-left',
        'transition-all duration-200 hover:shadow-md hover:shadow-emerald-900/5',
        FOCUS_RING,
        isUnassigned
          ? 'border-rose-200 hover:border-rose-300'
          : 'border-slate-200/80 hover:border-emerald-300',
        isDone ? 'bg-slate-50/40' : '',
      ].join(' ')}
    >
      {/* Barre d'accent couleur du status */}
      <span className={`absolute inset-y-0 left-0 w-1 ${tone.accent}`} aria-hidden="true" />

      {/* En-tête */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[13px] font-bold tracking-wide text-slate-900">
            {flight.flightNumber}
          </span>
          {isDone && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge status={flight.flightStatus} label={statusLabel} />
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
        </div>
      </div>

      {/* Trajet */}
      <div className="mt-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
        <div>
          <p className="font-mono text-base font-bold leading-none text-slate-900">{flight.origin}</p>
          <p className="mt-1 font-mono text-xs font-semibold text-emerald-700">{dep.time}</p>
          {dep.day && <p className="text-[10px] text-slate-400">{dep.day}</p>}
        </div>

        <div className="flex flex-col items-center">
          <div className="flex w-full items-center">
            <span className="h-1.5 w-1.5 rounded-full border border-emerald-400 bg-white" />
            <span className="h-px flex-1 border-t border-dashed border-emerald-300" />
            <span className="mx-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <Plane className="h-3 w-3" />
            </span>
            <span className="h-px flex-1 border-t border-dashed border-emerald-300" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </div>
          <p className="mt-1 text-[10px] font-medium text-slate-400">
            {flight.durationMinutes != null ? formatDuration(flight.durationMinutes) : 'Direct'}
            {hasStopover && ' · escale'}
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono text-base font-bold leading-none text-slate-900">
            {flight.destination}
          </p>
          <p className="mt-1 font-mono text-xs font-semibold text-emerald-700">{arr.time}</p>
          {arr.day && <p className="text-[10px] text-slate-400">{arr.day}</p>}
        </div>
      </div>

      {hasStopover && (
        <p className="mt-1.5 truncate font-mono text-[11px] text-slate-500" title={displayRoute(flight)}>
          {displayRoute(flight)}
        </p>
      )}

      {/* Pied */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
        <span
          className={`inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10.5px] font-medium ${weather.badge}`}
          title={weather.recommendation || weather.label}
        >
          {weather.icon}
          {weather.label}
        </span>

        {hasStopover && flight.stopoverMins ? (
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-slate-50 px-2 text-[10.5px] font-medium text-slate-600">
            <Timer className="h-3 w-3 text-slate-400" />
            Escale {formatDuration(flight.stopoverMins)}
          </span>
        ) : null}

        {isUnassigned && (
          <span className="ml-auto inline-flex h-5 items-center gap-1 rounded-full bg-rose-50 px-2 text-[10.5px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
            <ShieldAlert className="h-3 w-3" />
            Affectation requise
          </span>
        )}
      </div>
    </button>
  );
};

/* ========================================================================== */
/* EN-TÊTE D'UN AÉRONEF                                                       */
/* ========================================================================== */

const AircraftHeader: FC<{
  aircraft: string;
  label: string;
  count: number;
  layout: 'row' | 'column';
}> = ({ aircraft, label, count, layout }) => {
  const isUnassigned = aircraft === UNASSIGNED_AIRCRAFT;
  const countLabel = `${count} rotation${count > 1 ? 's' : ''}`;

  const icon = (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
        isUnassigned
          ? 'bg-rose-100 text-rose-600'
          : 'bg-linear-to-br from-emerald-500 to-emerald-700 text-white shadow-sm shadow-emerald-700/25'
      }`}
    >
      {isUnassigned ? <ShieldAlert className="h-4 w-4" /> : <Plane className="h-4 w-4 -rotate-45" />}
    </div>
  );

  const title = (
    <div className="min-w-0">
      <p
        className={`truncate font-mono text-sm font-bold ${
          isUnassigned ? 'text-rose-700' : 'text-slate-900'
        }`}
      >
        {isUnassigned ? 'Non assigné' : label}
      </p>
      <p className={`truncate text-[11px] ${isUnassigned ? 'text-rose-600/80' : 'text-slate-400'}`}>
        {isUnassigned ? "En attente d'affectation" : `Réf. ${aircraft.slice(0, 8).toUpperCase()}`}
      </p>
    </div>
  );

  if (layout === 'row') {
    return (
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon}
          {title}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            isUnassigned ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {countLabel}
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2.5">
        {icon}
        {title}
      </div>
      <div className="mt-4">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            isUnassigned
              ? 'bg-rose-100/70 text-rose-700'
              : 'bg-white text-emerald-700 ring-1 ring-emerald-200'
          }`}
        >
          {countLabel}
        </span>
      </div>
    </>
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
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const startOfPreviousMonth = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() - 1,
    1,
  ).getTime();

  useEffect(() => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const timeout = window.setTimeout(
      () => setReferenceDate(new Date()),
      Math.max(0, nextMonth.getTime() - now.getTime()),
    );
    return () => window.clearTimeout(timeout);
  }, [referenceDate]);

  const flightsInDateRange = useMemo(() => {
    return flights.filter((flight) => {
      const departure = new Date(flight.departure).getTime();
      return Number.isFinite(departure) && departure >= startOfPreviousMonth;
    });
  }, [flights, startOfPreviousMonth]);

  /* ---------------------------------------------------------------------- */
  /* COMPTEURS PAR FILTRE                                                   */
  /* ---------------------------------------------------------------------- */

  const filterCounts = useMemo(() => {
    const counts = new Map<StatusFilter, number>();
    FILTERS.forEach(([value]) => {
      counts.set(
        value,
        flightsInDateRange.filter((flight) => matchesFilter(flight, value)).length,
      );
    });
    return counts;
  }, [flightsInDateRange]);

  /* ---------------------------------------------------------------------- */
  /* FLIGHTS FILTRÉS                                                        */
  /* ---------------------------------------------------------------------- */

  const filteredFlights = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();

    return flightsInDateRange
      .filter((flight) => matchesFilter(flight, statusFilter))
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
      .sort((a, b) => new Date(a.departure).getTime() - new Date(b.departure).getTime());
  }, [flightsInDateRange, searchQuery, statusFilter]);

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

  const aircraftLookup = useMemo(
    () =>
      new Map(
        fleetAircrafts.map((aircraft) => [aircraft.refAircraft, aircraft.registration || aircraft.model]),
      ),
    [fleetAircrafts],
  );

  const activeFilterCount =
    (statusFilter !== 'ALL' ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  const aircraftWithFlightsCount = flightsByAircraft.filter(
    ([key]) => key !== UNASSIGNED_AIRCRAFT,
  ).length;

  const resetFilters = () => {
    setStatusFilter('ALL');
    setSearchQuery('');
  };

  const getAircraftLabel = (aircraft: string, aircraftFlights: Flight[]) =>
    aircraftLookup.get(aircraft) ||
    aircraftFlights.find((flight) => flight.aircraftModel)?.aircraftModel ||
    'Appareil inconnu';

  const cardProps = {
    statusStyles,
    formatLocalIso,
    formatDuration,
    displayRoute,
    getWeatherIndicator,
    onSelectFlight,
  };

  /* ══════════════════════════════════════════════════════════════════════ */
  /* RENDER                                                                */
  /* ══════════════════════════════════════════════════════════════════════ */

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
      {topHeader && <div className="border-b border-slate-100 p-5">{topHeader}</div>}

      {/* ─────────────── EN-TÊTE ─────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Planning des rotations</h2>
            <p className="text-[11px] text-slate-500">
              {filteredFlights.length} flight{filteredFlights.length > 1 ? 's' : ''} ·{' '}
              {aircraftWithFlightsCount} appareil{aircraftWithFlightsCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {isFetching && (
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Actualisation
          </span>
        )}
      </div>

      {/* ─────────────── RECHERCHE + FILTRES ─────────────── */}
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Rechercher un flight, appareil…"
            aria-label="Rechercher un flight"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none]">
            <span className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-slate-500 sm:inline-flex">
              <Filter className="h-4 w-4 text-slate-400" />
              Filtrer :
            </span>

            {FILTERS.map(([value, label]) => {
              const active = statusFilter === value;
              const isUnassignedFilter = value === 'UNASSIGNED';

              return (
                <button
                  type="button"
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  aria-pressed={active}
                  title={`${filterCounts.get(value) ?? 0} flight(s)`}
                  className={`h-9 shrink-0 cursor-pointer rounded-full px-4 text-sm font-medium transition ${FOCUS_RING} ${
                    active
                      ? isUnassignedFilter
                        ? 'bg-rose-600 font-semibold text-white shadow-sm shadow-rose-600/25'
                        : 'bg-emerald-600 font-semibold text-white shadow-sm shadow-emerald-600/25'
                      : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
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
                aria-label="Réinitialiser les filtres"
                title="Réinitialiser les filtres"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
        </div>
      </div>

      {/* ─────────────── CONTENU ─────────────── */}
      {isFetching && flights.length === 0 ? (
        <LoadingSkeleton />
      ) : flightsByAircraft.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
            {activeFilterCount > 0 ? <Search className="h-6 w-6" /> : <Plane className="h-6 w-6" />}
          </div>
          <p className="mt-4 text-sm font-bold text-slate-900">Aucun flight trouvé</p>
          <p className="mt-1 text-sm text-slate-500">
            {activeFilterCount > 0
              ? 'Ajustez vos filtres ou votre recherche.'
              : 'Aucune rotation planifiée pour le moment.'}
          </p>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className={`mt-4 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3.5 text-[13px] font-semibold text-emerald-700 transition hover:bg-emerald-50 ${FOCUS_RING}`}
            >
              <X className="h-3.5 w-3.5" />
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <>
          {/* MOBILE / TABLETTE */}
          <div className="divide-y divide-slate-100 lg:hidden">
            {flightsByAircraft.map(([aircraft, aircraftFlights]) => (
              <div key={aircraft} className="p-3">
                <AircraftHeader
                  aircraft={aircraft}
                  label={getAircraftLabel(aircraft, aircraftFlights)}
                  count={aircraftFlights.length}
                  layout="row"
                />
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {aircraftFlights.map((flight) => (
                    <FlightCard key={flight.refFlight} flight={flight} {...cardProps} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-[200px_minmax(0,1fr)] border-b border-slate-100 bg-slate-50/60">
              <div className="border-r border-slate-100 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                Aéronef
              </div>
              <div className="px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                Rotations affectées
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {flightsByAircraft.map(([aircraft, aircraftFlights]) => {
                const isUnassigned = aircraft === UNASSIGNED_AIRCRAFT;
                return (
                  <div key={aircraft} className="grid grid-cols-[200px_minmax(0,1fr)]">
                    <aside
                      className={`border-r border-slate-100 p-4 ${
                        isUnassigned ? 'bg-rose-50/40' : 'bg-emerald-50/30'
                      }`}
                    >
                      <AircraftHeader
                        aircraft={aircraft}
                        label={getAircraftLabel(aircraft, aircraftFlights)}
                        count={aircraftFlights.length}
                        layout="column"
                      />
                    </aside>

                    <div className="grid grid-cols-1 gap-2.5 p-3 xl:grid-cols-2 2xl:grid-cols-3">
                      {aircraftFlights.map((flight) => (
                        <FlightCard key={flight.refFlight} flight={flight} {...cardProps} />
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