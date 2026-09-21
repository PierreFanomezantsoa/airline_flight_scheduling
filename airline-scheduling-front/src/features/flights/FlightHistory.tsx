import React, {
  useCallback,
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
  stopoverDurationMinutes: number | null;
  weatherAI?: WeatherAI;
  raw: Flight;
}

type StatusFilter = 'ALL' | 'Completed' | 'Delayed' | 'Cancelled';

interface FlightHistoryProps {
  apiUrl?: string;
  token?: string | null;
}

/* ============================================================================
 * CONFIG
 * ========================================================================== */

const DEFAULT_API_URL = 'http://localhost:5000/flights';
const PAGE_SIZE = 10;

/* ============================================================================
 * HELPERS
 * ========================================================================== */

const normalizeStatus = (status?: string): FlightStatus => {
  const value = String(status ?? '').trim().toLowerCase();
  if (['completed', 'effectué', 'effectue', 'done'].includes(value)) return 'Completed';
  if (['delayed', 'retardé', 'retarde'].includes(value)) return 'Delayed';
  if (['cancelled', 'canceled', 'annulé', 'annule'].includes(value)) return 'Cancelled';
  if (['in-flight', 'in flight', 'en vol'].includes(value)) return 'In-Flight';
  if (['scheduled', 'planifié', 'planifie', 'programmé', 'programme'].includes(value)) return 'Scheduled';
  return status || 'Unknown';
};

const normalizeFlight = (flight: Flight): NormalizedFlight => ({
  id: String(flight.id),
  flightNumber: flight.flightNumber || `VOL-${String(flight.id).slice(0, 8)}`,
  origin: flight.origin || '—',
  destination: flight.destination || '—',
  route: flight.route || `${flight.origin || '—'} → ${flight.destination || '—'}`,
  departureUtc: flight.departure ?? null,
  arrivalUtc: flight.arrival ?? null,
  localDeparture: flight.localDeparture ?? null,
  localArrival: flight.localArrival ?? null,
  durationMinutes: flight.durationMinutes ?? null,
  status: normalizeStatus(flight.status),
  aircraftId: flight.aircraft || 'NON ASSIGNÉ',
  aircraftRegistration: flight.aircraftModel || 'Sans immatriculation',
  stopover: flight.stopover ?? null,
  stopoverDurationMinutes: flight.stopoverDurationMinutes ?? null,
  weatherAI: flight.weatherAI,
  raw: flight,
});

const formatDateTime = (date?: string | null): string => {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
};

const formatDate = (date?: string | null): string => {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
};

const formatTime = (date?: string | null): string => {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
};

const formatDuration = (minutes?: number | null): string => {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours <= 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours} h`;
  return `${hours} h ${String(remainingMinutes).padStart(2, '0')}`;
};

const formatPercentage = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
};

const isHistoryFlight = (flight: NormalizedFlight): boolean => {
  if (['Completed', 'Delayed', 'Cancelled'].includes(flight.status)) return true;
  if (flight.arrivalUtc) {
    const arrival = new Date(flight.arrivalUtc);
    if (!Number.isNaN(arrival.getTime()) && arrival.getTime() < Date.now()) {
      return true;
    }
  }
  return false;
};

/* ============================================================================
 * STATUS BADGE
 * ========================================================================== */

const StatusBadge: React.FC<{ status: FlightStatus }> = ({ status }) => {
  const normalized = normalizeStatus(status);
  const config = {
    Completed: {
      label: 'Effectué',
      icon: <CheckCircle2 size={13} />,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    Delayed: {
      label: 'Retardé',
      icon: <Timer size={13} />,
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    Cancelled: {
      label: 'Annulé',
      icon: <XCircle size={13} />,
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    },
    'In-Flight': {
      label: 'En vol',
      icon: <Plane size={13} />,
      className: 'border-blue-200 bg-blue-50 text-blue-700',
    },
    Scheduled: {
      label: 'Planifié',
      icon: <Clock3 size={13} />,
      className: 'border-slate-200 bg-slate-100 text-slate-700',
    },
  } as const;

  const item = config[normalized as keyof typeof config];
  if (!item) {
    return (
      <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 text-[11px] font-medium text-slate-600">
        {String(status)}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium ${item.className}`}
    >
      {item.icon}
      {item.label}
    </span>
  );
};

/* ============================================================================
 * WEATHER BADGE
 * ========================================================================== */

const WeatherBadge: React.FC<{ weatherAI?: WeatherAI }> = ({ weatherAI }) => {
  if (!weatherAI) {
    return (
      <span className="inline-flex h-6 max-w-full items-center gap-1.5 truncate rounded-full border border-slate-200 bg-slate-100 px-2.5 text-[11px] font-medium text-slate-500">
        <Cloud size={13} className="shrink-0" />
        <span className="truncate">Indisponible</span>
      </span>
    );
  }

  const level = weatherAI.riskLevel;

  if (level === 'SKIPPED') {
    return (
      <span className="inline-flex h-6 max-w-full items-center gap-1.5 truncate rounded-full border border-slate-200 bg-slate-100 px-2.5 text-[11px] font-medium text-slate-600">
        <CheckCircle2 size={13} className="shrink-0" />
        <span className="truncate">Clôturée</span>
      </span>
    );
  }

  const className =
    level === 'EXTREME'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : level === 'SEVERE'
        ? 'border-orange-200 bg-orange-50 text-orange-700'
        : level === 'HIGH'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : level === 'MODERATE'
            ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
            : level === 'LOW'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-100 text-slate-500';

  const label = weatherAI.riskLabel || level || 'Indéterminé';

  return (
    <span
      className={`inline-flex h-6 max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 text-[11px] font-medium ${className}`}
    >
      {level === 'EXTREME' || level === 'SEVERE' ? (
        <AlertTriangle size={13} className="shrink-0" />
      ) : (
        <Cloud size={13} className="shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
};

/* ============================================================================
 * STAT CARD
 * ========================================================================== */

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  subtitle?: string;
  tone?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  subtitle,
  tone = 'bg-slate-50 text-slate-600',
}) => (
  <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-slate-500">{title}</span>
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>
        {icon}
      </div>
    </div>
    <div className="mt-4 flex items-baseline gap-2">
      <span className="text-3xl font-bold text-slate-900">{value}</span>
      {subtitle && (
        <span className="text-xs font-medium text-slate-400">{subtitle}</span>
      )}
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

const DetailItem: React.FC<DetailItemProps> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-3.5 py-2.5">
    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
      {label}
    </p>
    <div className="mt-1 break-words text-xs font-semibold text-slate-800">
      {value || '—'}
    </div>
  </div>
);

/* ============================================================================
 * MOBILE CARD
 * ========================================================================== */

const MobileHistoryCard: React.FC<{
  flight: NormalizedFlight;
  onOpen: (flight: NormalizedFlight) => void;
}> = ({ flight, onOpen }) => (
  <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <Plane size={18} />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold text-slate-900">
            {flight.flightNumber}
          </p>
        </div>
      </div>
      <StatusBadge status={flight.status} />
    </div>

    <div className="space-y-3 p-4">
      <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-bold text-slate-800">
            {flight.origin}
          </span>
          <Navigation size={14} className="rotate-90 text-slate-300" />
          <span className="font-mono text-sm font-bold text-slate-800">
            {flight.destination}
          </span>
        </div>
        {flight.stopover && (
          <p className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-amber-600">
            <MapPin size={11} />
            Escale : {flight.stopover}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-100 p-3">
          <p className="text-[10px] font-medium text-slate-400">Départ local</p>
          <p className="mt-1 font-mono text-xs font-semibold text-slate-800">
            {formatDate(flight.localDeparture)}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-slate-500">
            {formatTime(flight.localDeparture)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-100 p-3">
          <p className="text-[10px] font-medium text-slate-400">Arrivée locale</p>
          <p className="mt-1 font-mono text-xs font-semibold text-slate-800">
            {formatDate(flight.localArrival)}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-slate-500">
            {formatTime(flight.localArrival)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-100 p-3">
          <p className="text-[10px] font-medium text-slate-400">Durée</p>
          <p className="mt-1 font-mono text-xs font-semibold text-slate-800">
            {formatDuration(flight.durationMinutes)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-100 p-3">
          <p className="text-[10px] font-medium text-slate-400">Appareil</p>
          <p className="mt-1 truncate font-mono text-xs font-semibold text-slate-800">
            {flight.aircraftRegistration}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-3">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Météo
        </span>
        <WeatherBadge weatherAI={flight.weatherAI} />
      </div>
    </div>

    <div className="border-t border-slate-100 p-3">
      <button
        type="button"
        onClick={() => onOpen(flight)}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700"
      >
        Voir la fiche complète
        <ArrowRight size={14} />
      </button>
    </div>
  </article>
);

/* ============================================================================
 * MAIN
 * ========================================================================== */

const FlightHistory: React.FC<FlightHistoryProps> = ({
  apiUrl = DEFAULT_API_URL,
  token,
}) => {
  const [flights, setFlights] = useState<NormalizedFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<NormalizedFlight | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  /* FETCH */
  const fetchFlights = useCallback(
    async (showRefresh = false) => {
      try {
        if (showRefresh) setRefreshing(true);
        else setLoading(true);

        setError('');

        const storedToken =
          token ||
          localStorage.getItem('token') ||
          localStorage.getItem('accessToken') ||
          localStorage.getItem('authToken');

        const headers: HeadersInit = {};
        if (storedToken) {
          headers.Authorization = `Bearer ${storedToken}`;
        }

        const response = await fetch(apiUrl, { method: 'GET', headers });

        if (!response.ok) {
          if (response.status === 401) throw new Error('Session expirée ou accès non autorisé.');
          if (response.status === 403) throw new Error("Accès à l'historique refusé.");
          if (response.status === 404) throw new Error('Endpoint historique introuvable.');
          if (response.status >= 500) throw new Error("Erreur serveur pendant le chargement de l'historique.");
          throw new Error(`Impossible de charger les vols (${response.status}).`);
        }

        const data = await response.json();
        const flightArray: Flight[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.flights)
            ? data.flights
            : Array.isArray(data?.data)
              ? data.data
              : Array.isArray(data?.results)
                ? data.results
                : [];

        const normalized = flightArray
          .map(normalizeFlight)
          .filter(isHistoryFlight)
          .sort((a, b) => {
            const dateA = new Date(a.arrivalUtc || a.departureUtc || 0).getTime();
            const dateB = new Date(b.arrivalUtc || b.departureUtc || 0).getTime();
            return dateB - dateA;
          });

        setFlights(normalized);
      } catch (err) {
        console.error('Erreur historique vols :', err);
        if (err instanceof TypeError) setError('Impossible de contacter le serveur Flask.');
        else if (err instanceof Error) setError(err.message);
        else setError('Une erreur inconnue est survenue.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiUrl, token],
  );

  useEffect(() => {
    void fetchFlights();
  }, [fetchFlights]);

  /* ESC / SCROLL MODAL */
  useEffect(() => {
    if (!selectedFlight) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedFlight(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedFlight]);

  /* FILTERS */
  const filteredFlights = useMemo(() => {
    return flights.filter((flight) => {
      const query = search.trim().toLowerCase();

      const matchesSearch =
        !query ||
        flight.flightNumber.toLowerCase().includes(query) ||
        flight.origin.toLowerCase().includes(query) ||
        flight.destination.toLowerCase().includes(query) ||
        flight.route.toLowerCase().includes(query) ||
        flight.aircraftRegistration.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === 'ALL' || flight.status === statusFilter;

      let matchesFrom = true;
      let matchesTo = true;

      if (flight.departureUtc) {
        const flightDate = new Date(flight.departureUtc);

        if (dateFrom) {
          const from = new Date(`${dateFrom}T00:00:00`);
          matchesFrom = flightDate >= from;
        }
        if (dateTo) {
          const to = new Date(`${dateTo}T23:59:59`);
          matchesTo = flightDate <= to;
        }
      }

      return matchesSearch && matchesStatus && matchesFrom && matchesTo;
    });
  }, [flights, search, statusFilter, dateFrom, dateTo]);

  /* RESET PAGE WHEN FILTERS CHANGE */
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredFlights.length / PAGE_SIZE));

  const paginatedFlights = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredFlights.slice(start, start + PAGE_SIZE);
  }, [filteredFlights, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  /* STATS */
  const statistics = useMemo(() => {
    const completed = flights.filter((f) => f.status === 'Completed').length;
    const delayed = flights.filter((f) => f.status === 'Delayed').length;
    const cancelled = flights.filter((f) => f.status === 'Cancelled').length;
    const completionRate =
      flights.length > 0 ? Math.round((completed / flights.length) * 100) : 0;

    return { total: flights.length, completed, delayed, cancelled, completionRate };
  }, [flights]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
  };

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  /* LOADING */
  if (loading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <div className="rounded-2xl border border-slate-200 bg-white px-10 py-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <RefreshCw size={22} className="animate-spin" />
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-700">
            Chargement de l&apos;historique
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Synchronisation des vols archivés...
          </p>
        </div>
      </div>
    );
  }

  /* RENDER */
  return (
    <div className="space-y-5">
      {/* HEADER (Bouton Actualiser uniquement) */}
      <section className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void fetchFlights(true)}
          disabled={refreshing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Actualisation...' : 'Actualiser'}
        </button>
      </section>

      {/* ERROR */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
            <AlertTriangle size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-800">
              Impossible de charger l&apos;historique
            </p>
            <p className="mt-1 text-xs leading-5 text-rose-700">{error}</p>
          </div>
        </div>
      )}

      {/* STATS */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          title="Historique total"
          value={statistics.total}
          icon={<History size={18} />}
          subtitle="Vols archivés"
          tone="bg-slate-50 text-slate-600"
        />
        <StatCard
          title="Effectués"
          value={statistics.completed}
          icon={<CheckCircle2 size={18} />}
          subtitle={`${statistics.completionRate}% du total`}
          tone="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title="Retardés"
          value={statistics.delayed}
          icon={<Timer size={18} />}
          subtitle="Vols avec retard"
          tone="bg-amber-50 text-amber-600"
        />
        <StatCard
          title="Annulés"
          value={statistics.cancelled}
          icon={<XCircle size={18} />}
          subtitle="Annulations"
          tone="bg-rose-50 text-rose-600"
        />
      </section>

      {/* TABLEAU / CARTES (Avec filtres intégrés) */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        
        {/* SEARCH + FILTRES INTÉGRÉS */}
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(280px,1.5fr)_200px_160px_160px]">
            <div className="relative">
              <Search
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Vol, route, aéroport ou appareil..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-9 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Effacer la recherche"
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="Completed">Effectués</option>
              <option value="Delayed">Retardés</option>
              <option value="Cancelled">Annulés</option>
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              title="Date de début"
            />

            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              title="Date de fin"
            />
          </div>
        </div>

        {filteredFlights.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400">
              <Plane size={22} />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">
              Aucun vol historique
            </h3>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Aucun vol ne correspond aux critères actuellement sélectionnés.
            </p>
          </div>
        ) : (
          <>
            {/* MOBILE : cartes */}
            <div className="space-y-3 bg-slate-50/50 p-4 md:hidden">
              {paginatedFlights.map((flight) => (
                <MobileHistoryCard
                  key={flight.id}
                  flight={flight}
                  onOpen={setSelectedFlight}
                />
              ))}
            </div>

            {/* DESKTOP : tableau */}
            <div className="hidden md:block">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[12%]" /> {/* Vol */}
                  <col className="w-[14%]" /> {/* Trajet */}
                  <col className="w-[16%]" /> {/* Horaires */}
                  <col className="w-[10%]" /> {/* Durée */}
                  <col className="w-[12%]" /> {/* Avion */}
                  <col className="w-[10%]" /> {/* Statut */}
                  <col className="w-[14%]" /> {/* Météo */}
                  <col className="w-[12%]" /> {/* Détails */}
                </colgroup>
                <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3 text-left align-middle">Vol</th>
                    <th className="px-4 py-3 text-left align-middle">Trajet</th>
                    <th className="px-4 py-3 text-left align-middle">Horaires</th>
                    <th className="px-4 py-3 text-left align-middle">Durée</th>
                    <th className="px-4 py-3 text-left align-middle">Avion</th>
                    <th className="px-4 py-3 text-left align-middle">Statut</th>
                    <th className="px-4 py-3 text-left align-middle">Météo</th>
                    <th className="px-5 py-3 text-right align-middle">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedFlights.map((flight) => {
                    const isExpanded = expandedId === flight.id;
                    return (
                      <React.Fragment key={flight.id}>
                        <tr
                          className={`transition-colors ${
                            isExpanded
                              ? 'bg-emerald-50/30'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          {/* VOL (UUID supprimé) */}
                          <td className="px-5 py-4 align-middle">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                                <Plane size={14} />
                              </div>
                              <p className="truncate font-mono text-xs font-bold text-slate-900">
                                {flight.flightNumber}
                              </p>
                            </div>
                          </td>

                          {/* TRAJET */}
                          <td className="px-4 py-4 align-middle">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-mono text-xs font-semibold text-slate-800">
                                {flight.origin}
                              </span>
                              <Navigation
                                size={11}
                                className="shrink-0 rotate-90 text-slate-300"
                              />
                              <span className="truncate font-mono text-xs font-semibold text-slate-800">
                                {flight.destination}
                              </span>
                            </div>
                            {flight.stopover && (
                              <p className="mt-1 truncate text-[10px] font-medium text-amber-600">
                                Escale : {flight.stopover}
                              </p>
                            )}
                          </td>

                          {/* HORAIRES */}
                          <td className="px-4 py-4 align-middle">
                            <div className="flex flex-col gap-1">
                              <p className="truncate font-mono text-[11px] text-slate-600">
                                <span className="font-semibold text-slate-400">
                                  D{' '}
                                </span>
                                {formatDate(flight.localDeparture)}{' '}
                                {formatTime(flight.localDeparture)}
                              </p>
                              <p className="truncate font-mono text-[11px] text-slate-600">
                                <span className="font-semibold text-slate-400">
                                  A{' '}
                                </span>
                                {formatDate(flight.localArrival)}{' '}
                                {formatTime(flight.localArrival)}
                              </p>
                            </div>
                          </td>

                          {/* DURÉE */}
                          <td className="px-4 py-4 align-middle">
                            <span className="inline-flex items-center gap-1 font-mono text-xs font-medium text-slate-700">
                              <Timer
                                size={12}
                                className="shrink-0 text-slate-400"
                              />
                              {formatDuration(flight.durationMinutes)}
                            </span>
                          </td>

                          {/* AVION (UUID supprimé) */}
                          <td className="px-4 py-4 align-middle">
                            <p className="truncate font-mono text-xs font-semibold text-slate-800">
                              {flight.aircraftRegistration}
                            </p>
                          </td>

                          {/* STATUT */}
                          <td className="px-4 py-4 align-middle">
                            <StatusBadge status={flight.status} />
                          </td>

                          {/* MÉTÉO */}
                          <td className="px-4 py-4 align-middle">
                            <WeatherBadge weatherAI={flight.weatherAI} />
                          </td>

                          {/* ACTION */}
                          <td className="px-5 py-4 text-right align-middle">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : flight.id)
                              }
                              className={`inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium shadow-sm transition ${
                                isExpanded
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              {isExpanded ? (
                                <>
                                  <span className="hidden lg:inline">
                                    Masquer
                                  </span>
                                  <ChevronUp size={14} />
                                </>
                              ) : (
                                <>
                                  <span className="hidden lg:inline">
                                    Détails
                                  </span>
                                  <ChevronDown size={14} />
                                </>
                              )}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="bg-slate-50/70 px-5 py-5">
                              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                  <div className="mb-3 flex items-center gap-2">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                                      <Clock3 size={14} />
                                    </div>
                                    <span className="text-xs font-semibold text-slate-800">
                                      Horaires locaux
                                    </span>
                                  </div>
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                    Départ
                                  </p>
                                  <p className="mt-1 font-mono text-xs font-semibold text-slate-700">
                                    {formatDateTime(flight.localDeparture)}
                                  </p>
                                  <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                    Arrivée
                                  </p>
                                  <p className="mt-1 font-mono text-xs font-semibold text-slate-700">
                                    {formatDateTime(flight.localArrival)}
                                  </p>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                  <div className="mb-3 flex items-center gap-2">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                                      <CalendarDays size={14} />
                                    </div>
                                    <span className="text-xs font-semibold text-slate-800">
                                      Horaires UTC
                                    </span>
                                  </div>
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                    Départ
                                  </p>
                                  <p className="mt-1 font-mono text-xs font-semibold text-slate-700">
                                    {formatDateTime(flight.departureUtc)}
                                  </p>
                                  <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                    Arrivée
                                  </p>
                                  <p className="mt-1 font-mono text-xs font-semibold text-slate-700">
                                    {formatDateTime(flight.arrivalUtc)}
                                  </p>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                  <div className="mb-3 flex items-center gap-2">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                                      <Timer size={14} />
                                    </div>
                                    <span className="text-xs font-semibold text-slate-800">
                                      Durée
                                    </span>
                                  </div>
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                    Temps de vol
                                  </p>
                                  <p className="mt-1 font-mono text-lg font-bold text-slate-900">
                                    {formatDuration(flight.durationMinutes)}
                                  </p>
                                  {flight.stopover && (
                                    <>
                                      <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                        Escale
                                      </p>
                                      <p className="mt-1 font-mono text-xs font-semibold text-slate-700">
                                        {formatDuration(
                                          flight.stopoverDurationMinutes,
                                        )}
                                      </p>
                                    </>
                                  )}
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                  <div className="mb-3 flex items-center gap-2">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                                      <Plane size={14} />
                                    </div>
                                    <span className="text-xs font-semibold text-slate-800">
                                      Appareil
                                    </span>
                                  </div>
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                    Immatriculation
                                  </p>
                                  <p className="mt-1 font-mono text-sm font-bold text-slate-900">
                                    {flight.aircraftRegistration}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                                      <MapPin size={14} />
                                    </div>
                                    <h4 className="text-xs font-semibold text-slate-800">
                                      Informations opérationnelles
                                    </h4>
                                  </div>
                                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <DetailItem
                                      label="Route"
                                      value={flight.route}
                                    />
                                    <DetailItem
                                      label="Statut final"
                                      value={
                                        <StatusBadge status={flight.status} />
                                      }
                                    />
                                    {flight.stopover && (
                                      <DetailItem
                                        label="Escale"
                                        value={flight.stopover}
                                      />
                                    )}
                                    <DetailItem
                                      label="Numéro de vol"
                                      value={flight.flightNumber}
                                    />
                                  </div>
                                </section>

                                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                                      <Cloud size={14} />
                                    </div>
                                    <h4 className="text-xs font-semibold text-slate-800">
                                      Analyse météo OCC
                                    </h4>
                                  </div>
                                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <DetailItem
                                      label="État"
                                      value={
                                        <WeatherBadge
                                          weatherAI={flight.weatherAI}
                                        />
                                      }
                                    />
                                    <DetailItem
                                      label="Niveau de risque"
                                      value={
                                        flight.weatherAI?.riskLabel ||
                                        'Non évalué'
                                      }
                                    />
                                    <DetailItem
                                      label="Score météo"
                                      value={
                                        flight.weatherAI?.riskLevel ===
                                        'SKIPPED'
                                          ? 'Analyse clôturée'
                                          : formatPercentage(
                                              flight.weatherAI?.score,
                                            )
                                      }
                                    />
                                    <DetailItem
                                      label="Confiance"
                                      value={
                                        flight.weatherAI?.riskLevel ===
                                        'SKIPPED'
                                          ? '—'
                                          : formatPercentage(
                                              flight.weatherAI?.confidence,
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
                                  {flight.weatherAI?.explanation && (
                                    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                        Explication
                                      </p>
                                      <p className="mt-1.5 text-xs leading-5 text-slate-600">
                                        {flight.weatherAI.explanation}
                                      </p>
                                    </div>
                                  )}
                                </section>
                              </div>

                              <div className="mt-4 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => setSelectedFlight(flight)}
                                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700"
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
                  })}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row">
                <p className="text-xs font-medium text-slate-500">
                  Page{' '}
                  <span className="font-semibold text-slate-700">
                    {currentPage}
                  </span>{' '}
                  sur{' '}
                  <span className="font-semibold text-slate-700">
                    {totalPages}
                  </span>{' '}
                  — {filteredFlights.length} vol
                  {filteredFlights.length > 1 ? 's' : ''}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ArrowRight size={14} className="rotate-180" />
                    Précédent
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        if (totalPages <= 5) return true;
                        if (page === 1 || page === totalPages) return true;
                        return Math.abs(page - currentPage) <= 1;
                      })
                      .map((page, index, array) => {
                        const previousPage = array[index - 1];
                        const showEllipsis =
                          previousPage != null && page - previousPage > 1;

                        return (
                          <React.Fragment key={page}>
                            {showEllipsis && (
                              <span className="px-1 text-xs text-slate-400">
                                …
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setCurrentPage(page)}
                              className={`h-8 min-w-[32px] rounded-md px-2 text-xs font-medium transition ${
                                page === currentPage
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {page}
                            </button>
                          </React.Fragment>
                        );
                      })}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Suivant
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* MODAL */}
      {selectedFlight && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Historique du vol ${selectedFlight.flightNumber}`}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setSelectedFlight(null);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                  Fiche historique OCC
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="font-mono text-xl font-bold text-slate-900">
                    {selectedFlight.flightNumber}
                  </h2>
                  <StatusBadge status={selectedFlight.status} />
                </div>
                <p className="mt-1 truncate font-mono text-xs text-slate-500">
                  {selectedFlight.route}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFlight(null)}
                aria-label="Fermer"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-6">
              <section className="overflow-hidden rounded-xl bg-emerald-600 px-5 py-4 text-white">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-200">
                      Origine
                    </span>
                    <strong className="mt-1 block font-mono text-2xl font-bold">
                      {selectedFlight.origin}
                    </strong>
                  </div>
                  <div className="flex items-center">
                    <div className="h-px w-7 bg-emerald-400" />
                    <Plane className="mx-2 h-4 w-4 rotate-90" />
                    <div className="h-px w-7 bg-emerald-400" />
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-200">
                      Destination
                    </span>
                    <strong className="mt-1 block font-mono text-2xl font-bold">
                      {selectedFlight.destination}
                    </strong>
                  </div>
                </div>
              </section>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem
                  label="Numéro de vol"
                  value={selectedFlight.flightNumber}
                />
                <DetailItem
                  label="Immatriculation"
                  value={selectedFlight.aircraftRegistration}
                />
                <DetailItem
                  label="Durée"
                  value={formatDuration(selectedFlight.durationMinutes)}
                />
                <DetailItem
                  label="Départ local"
                  value={formatDateTime(selectedFlight.localDeparture)}
                />
                <DetailItem
                  label="Arrivée locale"
                  value={formatDateTime(selectedFlight.localArrival)}
                />
                <DetailItem
                  label="Statut"
                  value={<StatusBadge status={selectedFlight.status} />}
                />
              </div>

              <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CalendarDays size={15} className="text-slate-500" />
                  <h3 className="text-xs font-semibold text-slate-800">
                    Références UTC
                  </h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailItem
                    label="Départ UTC"
                    value={formatDateTime(selectedFlight.departureUtc)}
                  />
                  <DetailItem
                    label="Arrivée UTC"
                    value={formatDateTime(selectedFlight.arrivalUtc)}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Gauge size={15} className="text-emerald-600" />
                    <h3 className="text-xs font-semibold text-slate-800">
                      Données météo / OCC
                    </h3>
                  </div>
                  <WeatherBadge weatherAI={selectedFlight.weatherAI} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailItem
                    label="Niveau de risque"
                    value={
                      selectedFlight.weatherAI?.riskLabel || 'Non évalué'
                    }
                  />
                  <DetailItem
                    label="Phase météo"
                    value={
                      selectedFlight.weatherAI?.forecastPhaseLabel || '—'
                    }
                  />
                  <DetailItem
                    label="Action recommandée"
                    value={
                      selectedFlight.weatherAI?.recommendedActionLabel ||
                      'Aucune'
                    }
                  />
                  <DetailItem
                    label="Analyse effectuée"
                    value={formatDateTime(
                      selectedFlight.weatherAI?.evaluatedAt,
                    )}
                  />
                </div>
                {selectedFlight.weatherAI?.explanation && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Explication du moteur
                    </p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-600">
                      {selectedFlight.weatherAI.explanation}
                    </p>
                  </div>
                )}
              </section>

              <button
                type="button"
                onClick={() => setSelectedFlight(null)}
                className="h-10 w-full rounded-xl bg-emerald-600 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700"
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