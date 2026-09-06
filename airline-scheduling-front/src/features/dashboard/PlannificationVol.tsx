import React, { useMemo, useState } from 'react';
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
  | 'Delayed'
  | 'Cancelled'
  | 'In-Flight'
  | 'Effectué';

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
  icon: React.ReactNode;
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
}

/* ========================================================================== */
/* PETITS COMPOSANTS                                                         */
/* ========================================================================== */

const StatusBadge: React.FC<{ style: StatusStyle }> = ({ style }) => (
  <span
    className={`inline-flex h-6 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold ${style.badge}`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
    {style.label}
  </span>
);

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4 p-4 sm:p-5">
    {[1, 2, 3].map((row) => (
      <div
        key={row}
        className="animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white"
      >
        <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="border-b border-slate-200 bg-slate-50 p-5 lg:border-b-0 lg:border-r">
            <div className="h-2.5 w-14 rounded bg-slate-200" />
            <div className="mt-3 h-5 w-28 rounded bg-slate-200" />
            <div className="mt-3 h-3 w-20 rounded bg-slate-200" />
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="mt-3 h-3 w-32 rounded bg-slate-200" />
                <div className="mt-5 h-12 rounded-lg bg-slate-200/70" />
              </div>
            ))}
          </div>
        </div>
      </div>
    ))}
  </div>
);

/* ========================================================================== */
/* CARTE D'UN VOL                                                            */
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

const FlightCard: React.FC<FlightCardProps> = ({
  flight,
  mode,
  statusStyles,
  formatLocalIso,
  formatDuration,
  displayRoute,
  getWeatherIndicator,
  onSelectFlight,
}) => {
  const statusStyle = statusStyles[flight.status] ?? statusStyles.Scheduled;
  const weather = getWeatherIndicator(flight.weatherSeverity);
  const compact = mode === 'desktop';

  const statusBarClass = {
    Scheduled: 'bg-emerald-500',
    Delayed: 'bg-amber-500',
    Cancelled: 'bg-rose-500',
    'In-Flight': 'bg-sky-500',
    Effectué: 'bg-slate-400',
  }[flight.status];

  return (
    <button
      type="button"
      onClick={() => onSelectFlight(flight)}
      className={[
        'group relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left',
        'shadow-sm transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
        'focus:outline-none focus:ring-2 focus:ring-emerald-200',
        compact ? 'p-4' : 'p-4 sm:p-5',
      ].join(' ')}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${statusBarClass}`} />

      <div className="pl-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {flight.status === 'Effectué' && (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}

              <span className="font-mono text-sm font-black tracking-wide text-slate-950">
                {flight.flightNumber}
              </span>

              <StatusBadge style={statusStyle} />
            </div>

            <div className="mt-2 flex items-center gap-2">
              <Plane className="h-3.5 w-3.5 shrink-0 rotate-45 text-emerald-600" />
              <span className="truncate font-mono text-xs font-bold text-slate-700">
                {displayRoute(flight)}
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
              {formatLocalIso(flight.localDeparture || flight.departure)}
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
              {formatLocalIso(flight.localArrival || flight.arrival)}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={`inline-flex h-6 items-center gap-1 rounded-lg border px-2 text-[10px] font-bold ${weather.badge}`}
          >
            {weather.icon}
            {weather.label}
          </span>

          {flight.durationMinutes != null && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
              <Timer className="h-3.5 w-3.5 text-slate-400" />
              {formatDuration(flight.durationMinutes)}
            </span>
          )}

          {flight.stopover && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              Escale
              {flight.stopoverDurationMinutes
                ? ` · ${formatDuration(flight.stopoverDurationMinutes)}`
                : ''}
            </span>
          )}

          {flight.aircraft === UNASSIGNED_AIRCRAFT && (
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

/* ========================================================================== */
/* COMPOSANT PRINCIPAL DU PLANNING                                           */
/* ========================================================================== */

export const FlightPlanning: React.FC<FlightPlanningProps> = ({
  flights,
  fleetAircrafts,
  isFetching,
  statusStyles,
  formatLocalIso,
  formatDuration,
  displayRoute,
  getWeatherIndicator,
  onSelectFlight,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

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
        fleetAircrafts.map((aircraft) => [
          aircraft.id,
          aircraft.immatriculation || aircraft.model,
        ]),
      ),
    [fleetAircrafts],
  );

  const activeFilterCount =
    (statusFilter !== 'ALL' ? 1 : 0) + (searchQuery.trim() ? 1 : 0);

  const resetFilters = () => {
    setStatusFilter('ALL');
    setSearchQuery('');
  };

  const filters: Array<[StatusFilter, string]> = [
    ['ALL', 'Tous'],
    ['Scheduled', 'Planifiés'],
    ['Delayed', 'Retardés'],
    ['In-Flight', 'En vol'],
    ['Effectué', 'Effectués'],
    ['Cancelled', 'Annulés'],
    ['UNASSIGNED', 'Non assignés'],
  ];

  return (
    <>
      {/* RECHERCHE ET FILTRES */}
      <section className="sticky top-2 z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Rechercher vol, aéroport, appareil..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            />

            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
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

            {filters.map(([value, label]) => {
              const active = statusFilter === value;

              return (
                <button
                  type="button"
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`h-8 rounded-lg border px-3 text-[10px] font-bold ${
                    active
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
                {filteredFlights.length} vol(s) affiché(s)
              </p>
            </div>
          </div>

          {isFetching && (
            <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
          )}
        </div>

        {isFetching && flights.length === 0 ? (
          <LoadingSkeleton />
        ) : flightsByAircraft.length === 0 ? (
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
              {flightsByAircraft.map(([aircraft, aircraftFlights]) => {
                const fallbackLabel =
                  aircraftFlights.find((flight) => flight.aircraftModel)
                    ?.aircraftModel || 'Appareil inconnu';

                const aircraftLabel =
                  aircraftLookup.get(aircraft) || fallbackLabel;

                return (
                  <div key={aircraft} className="p-4">
                    <div className="mb-3 flex justify-between">
                      <span className="font-mono text-sm font-black text-slate-900">
                        {aircraft === UNASSIGNED_AIRCRAFT
                          ? 'Non assigné'
                          : aircraftLabel}
                      </span>
                      <span className="text-xs text-slate-500">
                        {aircraftFlights.length} vol(s)
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
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
              <div className="grid grid-cols-[220px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50">
                <div className="border-r border-slate-200 px-5 py-3 text-[9px] font-black uppercase text-slate-400">
                  Aéronef
                </div>
                <div className="px-5 py-3 text-[9px] font-black uppercase text-slate-400">
                  Rotations affectées
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
                        className={`border-r border-slate-200 p-5 ${
                          isUnassigned ? 'bg-rose-50/40' : 'bg-slate-50/50'
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
                                {aircraftLabel}
                              </strong>
                            </div>

                            <span className="mt-2 block font-mono text-[9px] text-slate-400">
                              REF {aircraft.slice(0, 8)}
                            </span>
                          </>
                        )}

                        <div className="mt-4 border-t border-slate-200 pt-3 text-[10px] font-bold text-slate-500">
                          {aircraftFlights.length} rotation(s)
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
    </>
  );
};

export default FlightPlanning;
