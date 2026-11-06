// src/features/dashboard/DashboardGantt.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarDays, CheckCircle2,
  Clock, CloudLightning, CloudRain, Gauge,
  Plane, PlaneLanding, PlaneTakeoff, RefreshCw, Search, Sun,
  UserRound, X, XCircle, Filter,
} from 'lucide-react';
import { FlightDetailsModal } from './FlightDetailsModal';
import {
  UNASSIGNED_AIRCRAFT,
  normalizeFlightStatus as normalizeFlightStatusValue,
  type Flight,
  type FlightStatus,
  type StatusStyle,
  type WeatherIndicator,
} from './PlannificationVol';

import { ApiError, getAuthSession, pythonRequestJson } from '../Api/apiService';

/* ============================================================================
 * TYPES
 * ========================================================================== */

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
  distributions: Record<string, number>;
}

/* ============================================================================
 * DESIGN TOKENS
 * ========================================================================== */

/* ============================================================================
 * HELPERS
 * ========================================================================== */
const normalizeSeverity = (value?: number | null) =>
  Math.min(1, Math.max(0, Number(value ?? 0)));

/**
 * ✅ Détecte un AbortError quel que soit son format :
 *   - DOMException avec name === 'AbortError'
 *   - Error avec name === 'AbortError'
 *   - Objet quelconque avec name === 'AbortError'
 *
 * Nécessaire car les helpers de fetch rejettent maintenant l'AbortError brut
 * (sans le wrapper dans ApiError), et React StrictMode provoque
 * des annulations volontaires au montage/démontage.
 */
function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  return (error as { name?: string }).name === 'AbortError';
}

/**
 * Transforme une erreur quelconque en message utilisateur lisible.
 * Adapté aux deux environnements dev / prod (via ApiError).
 */
function getFriendlyError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0:
        return 'Impossible de contacter le serveur. Vérifiez votre connexion.';
      case 401:
        return 'Votre session a expiré. Veuillez vous reconnecter.';
      case 403:
        return "Vous n'avez pas l'autorisation d'accéder à ces données.";
      case 404:
        return 'Ressource introuvable.';
      case 500:
      case 502:
      case 503:
        return 'Le serveur rencontre un problème. Veuillez réessayer plus tard.';
      default:
        return error.message || fallback;
    }
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

/* ============================================================================
 * FALLBACK ANALYTICS
 * ========================================================================== */
const normalizeFlightStatus = (status?: FlightStatus | null): string => {
  const normalized = String(status ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\_-]/g, ' ');
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

const buildFallbackAnalytics = (flights: Flight[]): Analytics => {
  const totalFlights = flights.length;
  const count = (status: string) =>
    flights.filter(flight => normalizeFlightStatus(flight.flightStatus) === status).length;
  const onTimeCount = count('PLANIFIE');
  const delayedCount = count('RETARDE');
  const cancelledCount = count('ANNULE');
  const inFlightCount = count('EN VOL');
  const effectueCount = count('EFFECTUE');
  // Indicateur simple de ponctualité pour le tableau de bord.
  // Le calcul serveur reste prioritaire lorsqu'il est disponible.
  const completedOrPlanned = onTimeCount + effectueCount + delayedCount;
  const otpRate =
    completedOrPlanned > 0
      ? Number((((onTimeCount + effectueCount) / completedOrPlanned) * 100).toFixed(1))
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
 * STATUS STYLES
 * ========================================================================== */

const STATUS_STYLES: Record<FlightStatus, StatusStyle> = {
  Scheduled: {
    label: 'Planifié',
    dot: 'bg-blue-500',
    badge: 'border-blue-200 bg-blue-50 text-blue-800',
    border: 'border-l-emerald-500',
    card: 'hover:border-emerald-200',
  },
  Delayed: {
    label: 'Retardé',
    dot: 'bg-amber-500',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    border: 'border-l-amber-500',
    card: 'hover:border-amber-200',
  },
  Cancelled: {
    label: 'Annulé',
    dot: 'bg-rose-500',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    border: 'border-l-rose-500',
    card: 'hover:border-rose-200',
  },
  'In-Flight': {
    label: 'En vol',
    dot: 'bg-white',
    badge: 'border-blue-700 bg-blue-700 text-white',
    border: 'border-l-emerald-600',
    card: 'hover:border-emerald-300',
  },
  Effectué: {
    label: 'Effectué',
    dot: 'bg-slate-400',
    badge: 'border-slate-200 bg-slate-100 text-slate-600',
    border: 'border-l-slate-400',
    card: 'opacity-90 hover:opacity-100',
  },
  Planifié: {
    label: 'Planifié',
    dot: 'bg-blue-500',
    badge: 'border-blue-200 bg-blue-50 text-blue-800',
    border: 'border-l-emerald-500',
    card: 'hover:border-emerald-200',
  },
  Ponctuel: {
    label: 'Ponctuel',
    dot: 'bg-emerald-500',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    border: 'border-l-emerald-500',
    card: 'hover:border-emerald-200',
  },
  'On-Time': {
    label: 'Ponctuel',
    dot: 'bg-emerald-500',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    border: 'border-l-emerald-500',
    card: 'hover:border-emerald-200',
  },
  Retardé: {
    label: 'Retardé',
    dot: 'bg-amber-500',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    border: 'border-l-amber-500',
    card: 'hover:border-amber-200',
  },
  Annulé: {
    label: 'Annulé',
    dot: 'bg-rose-500',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    border: 'border-l-rose-500',
    card: 'hover:border-rose-200',
  },
  'En Vol': {
    label: 'En vol',
    dot: 'bg-white',
    badge: 'border-blue-700 bg-blue-700 text-white',
    border: 'border-l-emerald-600',
    card: 'hover:border-emerald-300',
  },
  Completed: {
    label: 'Effectué',
    dot: 'bg-slate-400',
    badge: 'border-slate-200 bg-slate-100 text-slate-600',
    border: 'border-l-slate-400',
    card: 'opacity-90 hover:opacity-100',
  },
};

/* ============================================================================
 * WEATHER CONFIG
 * ========================================================================== */

const WEATHER_CONFIG = {
  extreme: {
    label: 'Extrême',
    icon: <CloudLightning className="h-3.5 w-3.5" />,
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    recommendation:
      'Risque météo extrême. Vérification opérationnelle immédiate requise.',
  },
  critical: {
    label: 'Critique',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    badge: 'border-orange-200 bg-orange-50 text-orange-700',
    recommendation:
      'Risque élevé. Une adaptation de l’horaire ou de la route doit être envisagée.',
  },
  unstable: {
    label: 'Instable',
    icon: <CloudRain className="h-3.5 w-3.5" />,
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    recommendation:
      'Risque modéré de perturbation. Surveillance météo recommandée.',
  },
  favorable: {
    label: 'Favorable',
    icon: <Sun className="h-3.5 w-3.5" />,
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    recommendation:
      'Conditions favorables. Aucune contrainte météo majeure détectée.',
  },
};

/* ============================================================================
 * COMPOSANT PRINCIPAL
 * ========================================================================== */

export const DashboardGantt: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('TOUS');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  /* ===========================================================================
   * FORMATTERS
   * =========================================================================== */
  const formatDateTime = useCallback((dateString?: string | null) => {
    if (!dateString) return '--/--/---- --:--';
    if (/^\d{2}:\d{2}$/.test(dateString)) return dateString;
    const parsedDate = new Date(dateString);
    if (Number.isNaN(parsedDate.getTime())) return dateString;
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(parsedDate).replace(',', '');
  }, []);
  const formatLocalIso = useCallback(
    (dateString?: string | null) => {
      if (!dateString) return '--/--/---- --:--';
      // Conserve l'heure locale fournie par l'API sans conversion de fuseau.
      const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
      if (!match) return formatDateTime(dateString);
      const [, year, month, day, hour, minute] = match;
      return `${day}/${month}/${year} ${hour}:${minute}`;
    },
    [formatDateTime],
  );
  const formatDuration = useCallback((minutes?: number | null) => {
    if (minutes == null || !Number.isFinite(minutes)) return '--';
    const total = Math.max(0, Math.round(minutes));
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    if (hours === 0) return `${rest} min`;
    if (rest === 0) return `${hours} h`;
    return `${hours} h ${rest.toString().padStart(2, '0')}`;
  }, []);
  const displayRoute = useCallback((flight: Flight) => {
    if (flight.route?.trim()) return flight.route;
    const stopovers = Array.isArray(flight.stopover)
      ? flight.stopover
      : typeof flight.stopover === 'string'
        ? flight.stopover
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)
        : [];
    return [flight.origin, ...stopovers, flight.destination]
      .filter(Boolean)
      .join(' → ');
  }, []);

  /* ===========================================================================
   * CHARGEMENT
   * ===========================================================================
   * ✅ Backend Python (Flask, port 5000) :
   *      /flights           → pythonRequestJson
   *      /flights/analytics → pythonRequestJson
   *
   * =========================================================================== */
  const loadData = useCallback(async (signal?: AbortSignal) => {
    setIsFetching(true);
    setGlobalError(null);
    try {
      // ✅ VOLS — Python (Flask)
      const flightsList = await pythonRequestJson<Flight[]>('/flights', {
        method: 'GET',
        signal,
      });
      const normalizedFlights = Array.isArray(flightsList)
        ? flightsList.map(flight => ({
            ...flight,
            flightStatus: normalizeFlightStatusValue(
              flight.flight_status ?? flight.status ?? flight.flightStatus ?? '',
            ),
          }))
        : [];
      if (signal?.aborted) return;
      setFlights(normalizedFlights);
      // ✅ Analytics — Python (Flask)
      const [analyticsResult] = await Promise.allSettled([
        pythonRequestJson<Analytics>('/flights/analytics', { signal }),
      ]);
      // Analytics (Python)
      const fallbackAnalytics = buildFallbackAnalytics(normalizedFlights);
      if (signal?.aborted) return;
      if (analyticsResult.status === 'fulfilled' && analyticsResult.value) {
        const payload = analyticsResult.value;
        setAnalytics({
          ...payload,
          metrics: {
            ...fallbackAnalytics.metrics,
            ...(payload.metrics ?? {}),
          },
          distributions: payload.distributions ?? {},
        });
      } else {
        setAnalytics(fallbackAnalytics);
      }
    } catch (error: unknown) {
      // ✅ AbortError ignoré silencieusement
      if (isAbortError(error)) return;
      console.error("Erreur d'appel API :", error);
      setGlobalError(
        getFriendlyError(error, 'Impossible de se connecter au serveur central.'),
      );
    } finally {
      if (!signal?.aborted) setIsFetching(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  /* ===========================================================================
   * MÉTÉO
   * =========================================================================== */
  const getWeatherIndicator = useCallback(
    (severity: number): WeatherIndicator => {
      const value = normalizeSeverity(severity);
      if (value >= 0.8) return WEATHER_CONFIG.extreme;
      if (value >= 0.7) return WEATHER_CONFIG.critical;
      if (value >= 0.4) return WEATHER_CONFIG.unstable;
      return WEATHER_CONFIG.favorable;
    },
    [],
  );

  /* ===========================================================================
   * DERIVED
   * =========================================================================== */
  const effectiveAnalytics = useMemo(
    () => analytics ?? buildFallbackAnalytics(flights),
    [analytics, flights],
  );
  const { metrics } = effectiveAnalytics;
  const operationalSummary = useMemo(() => {
    const unassignedFlights = flights.filter(
      flight => !flight.aircraft || flight.aircraft === UNASSIGNED_AIRCRAFT,
    ).length;
    const weatherAlerts = flights.filter(
      flight => normalizeSeverity(flight.weatherSeverity) >= 0.7,
    ).length;
    const aircraftInProgram = new Set(
      flights
        .map(flight => flight.aircraft)
        .filter(aircraft => aircraft && aircraft !== UNASSIGNED_AIRCRAFT),
    ).size;
    return { unassignedFlights, weatherAlerts, aircraftInProgram };
  }, [flights]);
  const sortedFlights = useMemo(
    () =>
      [...flights].sort(
        (first, second) =>
          new Date(first.departure).getTime() -
          new Date(second.departure).getTime(),
      ),
    [flights],
  );
  const currentUser = getAuthSession()?.user;
  const userInitials =
    currentUser?.userName
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(name => name[0]?.toUpperCase())
      .join('') || 'U';

  const filteredFlights = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('fr');
    return sortedFlights.filter(flight => {
      const matchesStatus = statusFilter === 'TOUS' ||
        normalizeFlightStatus(flight.flightStatus) === statusFilter;
      const matchesSearch = !needle || [
        flight.flightNumber, flight.origin, flight.destination,
        flight.route, flight.aircraft, flight.aircraftModel,
      ].some(value => String(value ?? '').toLocaleLowerCase('fr').includes(needle));
      return matchesStatus && matchesSearch;
    });
  }, [sortedFlights, search, statusFilter]);

  // Pagination appliquée après recherche et filtres.
  const totalPages = Math.max(1, Math.ceil(filteredFlights.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedFlights = useMemo(
    () => filteredFlights.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredFlights, currentPage],
  );

  // Ne jamais afficher une référence technique (UUID) sous l'aéronef.
  const getAircraftDisplay = (flight: Flight): string => {
    const isUUID = (text: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text.trim());
    const label = [flight.aircraftModel, flight.aircraft]
      .find(value => value && !isUUID(value) && value !== UNASSIGNED_AIRCRAFT);
    return label || 'Non affecté';
  };

  const upcomingFlights = useMemo(() => {
    const now = Date.now();
    return sortedFlights.filter(flight => {
      const time = Date.parse(flight.departure);
      return Number.isFinite(time) && time >= now &&
        !['ANNULE', 'EFFECTUE'].includes(normalizeFlightStatus(flight.flightStatus));
    }).slice(0, 3);
  }, [sortedFlights]);

  const criticalWeather = useMemo(() =>
    [...flights]
      .filter(flight => normalizeSeverity(flight.weatherSeverity) >= 0.4)
      .sort((a, b) => normalizeSeverity(b.weatherSeverity) - normalizeSeverity(a.weatherSeverity))
      .slice(0, 3), [flights]);

  const statusFilters = [
    { value: 'TOUS', label: 'Tous' },
    { value: 'PLANIFIE', label: 'Planifiés' },
    { value: 'EN VOL', label: 'En vol' },
    { value: 'RETARDE', label: 'Retardés' },
    { value: 'EFFECTUE', label: 'Effectués' },
    { value: 'ANNULE', label: 'Annulés' },
  ];

  return (
    <main className="mx-auto w-full max-w-[1640px] min-w-0 space-y-4 bg-slate-50/70 p-3 sm:p-4 lg:p-5">
      {globalError && (
        <AlertMessage title="Erreur de chargement" message={globalError} onClose={() => setGlobalError(null)} />
      )}

      {/* Deux colonnes : tableau à gauche, profil à droite. */}
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_296px] 2xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="min-w-0 space-y-4">
          <section aria-label="Indicateurs de la programmation" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Vols enregistrés" value={metrics.totalFlights} sub="Programme global" icon={<CalendarDays className="h-5 w-5" />} loading={isFetching && !flights.length} />
            <KpiCard label="Vols effectués" value={metrics.effectueCount} sub="Opérations terminées" icon={<CheckCircle2 className="h-5 w-5" />} loading={isFetching && !flights.length} />
            <KpiCard label="Vols retardés" value={metrics.delayedCount} sub="Suivi nécessaire" icon={<Clock className="h-5 w-5" />} loading={isFetching && !flights.length} />
            <KpiCard label="Vols annulés" value={metrics.cancelledCount} sub="Opérations annulées" icon={<XCircle className="h-5 w-5" />} loading={isFetching && !flights.length} />
          </section>

          <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.16fr)_minmax(260px,.84fr)]">
            <article className="min-w-0 h-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-800"><PlaneTakeoff className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Centre des opérations</p>
                    <h2 className="text-base font-bold text-slate-900 sm:text-lg">Pilotage du programme de vols</h2>
                  </div>
                </div>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                <div className="grid grid-cols-3 divide-x divide-blue-100 rounded-lg border border-blue-100 bg-blue-50/50 py-3 text-center">
                  <div className="px-2"><PlaneTakeoff className="mx-auto h-5 w-5 text-blue-700"/><p className="mt-1 text-[11px] text-slate-500">Programmés</p><p className="mt-1 text-xl font-bold tabular-nums text-blue-900">{metrics.onTimeCount}</p></div>
                  <div className="px-2"><Plane className="mx-auto h-5 w-5 text-blue-700"/><p className="mt-1 text-[11px] text-slate-500">En vol</p><p className="mt-1 text-xl font-bold tabular-nums text-blue-900">{metrics.inFlightCount}</p></div>
                  <div className="px-2"><PlaneLanding className="mx-auto h-5 w-5 text-blue-700"/><p className="mt-1 text-[11px] text-slate-500">Effectués</p><p className="mt-1 text-xl font-bold tabular-nums text-blue-900">{metrics.effectueCount}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><Gauge className="h-3.5 w-3.5 text-blue-700"/>Ponctualité (API / estimation)</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{Number(metrics.otpRate ?? 0).toFixed(1)} %</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-700" style={{width: `${Math.min(100, Math.max(0, Number(metrics.otpRate ?? 0)))}%`}}/></div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><Plane className="h-3.5 w-3.5 text-blue-700"/>Aéronefs mobilisés</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{operationalSummary.aircraftInProgram}</p>
                    <p className="mt-2 text-[11px] text-slate-500">Appareils affectés</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                  <span className="text-slate-500">Affectations en attente</span>
                  <span className="font-bold text-blue-800">{operationalSummary.unassignedFlights} vol(s)</span>
                </div>
              </div>
            </article>

            <article className="min-w-0 h-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
                <div><p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Surveillance des risques</p><h2 className="mt-0.5 text-base font-bold text-slate-900">Conditions météo</h2></div>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><CloudRain className="h-5 w-5"/></span>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                  <div><p className="text-xs font-semibold text-slate-800">Vols exposés aux risques météo</p><p className="mt-1 text-[11px] text-slate-500">Vols nécessitant une vigilance météorologique renforcée</p></div>
                  <span className="text-2xl font-bold tabular-nums text-blue-800">{operationalSummary.weatherAlerts}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {criticalWeather.length ? criticalWeather.map(flight => {
                    const weather = getWeatherIndicator(flight.weatherSeverity);
                    return (
                      <button key={flight.refFlight} type="button" onClick={() => setSelectedFlight(flight)} className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-100 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                        <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{flight.flightNumber}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{flight.origin} → {flight.destination}</p></div>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${weather.badge}`}>{weather.icon}{weather.label}</span>
                      </button>
                    );
                  }) : (
                    <div className="py-7 text-center"><Sun className="mx-auto h-7 w-7 text-blue-600"/><p className="mt-2 text-xs font-semibold text-slate-700">Aucune alerte significative</p><p className="mt-1 text-[11px] text-slate-500">D'après les données des vols</p></div>
                  )}
                </div>
              </div>
            </article>
          </section>

          <section aria-labelledby="flights-heading" className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-100 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-800"><CalendarDays className="h-4 w-4"/></span><div><h2 id="flights-heading" className="text-base font-bold text-slate-900">Programmation des vols</h2><p className="text-xs text-slate-500">{filteredFlights.length} résultat{filteredFlights.length !== 1 ? 's' : ''} · {PAGE_SIZE} vols/page · Cliquez sur un numéro de vol pour les détails</p></div></div>
                <button type="button" onClick={() => void loadData()} disabled={isFetching} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-800 px-3 text-xs font-semibold text-white transition hover:bg-blue-900 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`}/>Actualiser</button>
              </div>
              <div className="mt-3 flex flex-col gap-3">
                <label className="relative block"><span className="sr-only">Rechercher un vol, aéroport ou appareil</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500"/><input value={search} onChange={e => {setSearch(e.target.value); setPage(1);}} placeholder="Rechercher : vol, aéroport, aéronef…" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50/60 pl-9 pr-9 text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"/>{search && <button type="button" onClick={() => {setSearch('');setPage(1);}} aria-label="Effacer la recherche" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-blue-700 hover:bg-blue-50"><X className="h-4 w-4"/></button>}</label>
                <div className="flex flex-wrap items-center gap-2"><Filter className="h-4 w-4 shrink-0 text-blue-700"/><div aria-label="Filtrer les vols par statut" className="flex min-w-0 flex-wrap gap-1.5">
                  {statusFilters.map(filter => <button key={filter.value} type="button" onClick={() => {setStatusFilter(filter.value); setPage(1);}} aria-pressed={statusFilter === filter.value} className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${statusFilter === filter.value ? 'border-blue-800 bg-blue-800 text-white' : 'border-blue-100 bg-white text-blue-800 hover:bg-blue-50'}`}>{filter.label}</button>)}
                </div></div>
              </div>
            </header>

            {isFetching && flights.length === 0 ? (
              <div className="space-y-2 p-4" aria-label="Chargement des vols" aria-busy="true">{[0,1,2,3].map(i=><div key={i} className="h-14 animate-pulse rounded-md bg-blue-50"/>)}</div>
            ) : !filteredFlights.length ? (
              <div className="py-12 text-center"><Search className="mx-auto h-8 w-8 text-blue-300"/><p className="mt-2 text-sm font-semibold text-slate-800">Aucun vol trouvé</p><p className="mt-1 text-xs text-slate-500">Modifiez les critères de recherche.</p><button type="button" onClick={() => {setSearch('');setStatusFilter('TOUS');setPage(1);}} className="mt-4 rounded-md bg-blue-800 px-4 py-2 text-xs font-semibold text-white">Réinitialiser les filtres</button></div>
            ) : (
              <>
                {/* Lignes accessibles sur ordinateur, tableau adapté à la largeur de la colonne gauche. */}
                <div className="hidden min-w-0 xl:block">
                  <table className="w-full table-fixed border-collapse text-left text-[11px] 2xl:text-xs">
                    <caption className="sr-only">Vols, itinéraires, horaires, météo, statuts et détails</caption>
                    <colgroup><col style={{width:'12%'}}/><col style={{width:'20%'}}/><col style={{width:'20%'}}/><col style={{width:'9%'}}/><col style={{width:'14%'}}/><col style={{width:'12%'}}/><col style={{width:'13%'}}/></colgroup>
                    <thead className="border-b border-blue-100 bg-blue-50/80 text-[10px] uppercase tracking-wide text-blue-900"><tr>{['Vol', 'Départ', 'Arrivée', 'Durée', 'Aéronef', 'Météo', 'Statut'].map(label=><th scope="col" key={label} className="px-2.5 py-3 font-bold">{label}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedFlights.map(flight => {
                        const status = STATUS_STYLES[String(flight.flightStatus)] ?? STATUS_STYLES.Scheduled;
                        const weather = getWeatherIndicator(flight.weatherSeverity);
                        return (
                          <tr key={flight.refFlight} className="transition-colors even:bg-slate-50/40 hover:bg-blue-50/60">
                            <td className="px-2.5 py-3.5 align-middle"><button type="button" onClick={() => setSelectedFlight(flight)} title={`Détails du vol ${flight.flightNumber}`} className="inline-flex max-w-full items-center gap-1 font-bold text-blue-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"><Plane className="h-3.5 w-3.5 shrink-0"/><span className="min-w-0 break-words underline-offset-2">{flight.flightNumber || '—'}</span></button></td>
                            <td className="px-2.5 py-3.5 align-middle"><p className="font-bold text-slate-900">{flight.origin || '—'}</p><p className="mt-1 leading-4 tabular-nums text-blue-700">{formatLocalIso(flight.localDeparture || flight.departure)}</p></td>
                            <td className="px-2.5 py-3.5 align-middle"><p className="font-bold text-slate-900">{flight.destination || '—'}</p><p className="mt-1 leading-4 tabular-nums text-blue-700">{formatLocalIso(flight.localArrival || flight.arrival)}</p></td>
                            <td className="px-2.5 py-3.5 align-middle font-medium text-slate-700">{formatDuration(flight.durationMinutes)}</td>
                            <td className="break-words px-2.5 py-3.5 align-middle font-medium text-slate-800">{getAircraftDisplay(flight)}</td>
                            <td className="px-2.5 py-3.5 align-middle"><span title={weather.recommendation} className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-1 text-[10px] font-semibold ${weather.badge}`}>{weather.icon}<span className="min-w-0 break-words">{weather.label}</span></span></td>
                            <td className="px-2.5 py-3.5 align-middle"><span className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-1 text-[10px] font-semibold ${status.badge}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`}/><span className="min-w-0 break-words">{status.label}</span></span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Mobile : cartes compactes cliquables avec toutes les informations. */}
                <div className="divide-y divide-slate-100 xl:hidden">
                  {paginatedFlights.map(flight => {
                    const status = STATUS_STYLES[String(flight.flightStatus)] ?? STATUS_STYLES.Scheduled;
                    const weather = getWeatherIndicator(flight.weatherSeverity);
                    return <button key={flight.refFlight} type="button" onClick={() => setSelectedFlight(flight)} className="block w-full p-4 text-left transition hover:bg-blue-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-bold text-blue-900"><Plane className="h-4 w-4"/>{flight.flightNumber}</span><span className={`rounded border px-2 py-1 text-[11px] ${status.badge}`}>{status.label}</span></div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><p className="text-slate-500">Départ</p><p className="font-bold text-slate-900">{flight.origin}</p><p className="tabular-nums text-blue-700">{formatLocalIso(flight.localDeparture || flight.departure)}</p></div><div><p className="text-slate-500">Arrivée</p><p className="font-bold text-slate-900">{flight.destination}</p><p className="tabular-nums text-blue-700">{formatLocalIso(flight.localArrival || flight.arrival)}</p></div><div><p className="text-slate-500">Aéronef</p><p className="font-semibold text-slate-900">{getAircraftDisplay(flight)}</p></div><div><p className="text-slate-500">Durée · Météo</p><p className="font-semibold text-slate-900">{formatDuration(flight.durationMinutes)} · {weather.label}</p></div></div>
                      <p className="mt-3 text-right text-xs font-semibold text-blue-800">Voir les détails →</p>
                    </button>;
                  })}
                </div>
              </>
            )}
            {totalPages > 1 && <nav aria-label="Pagination des vols" className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] font-medium text-slate-500">{(currentPage-1)*PAGE_SIZE+1}–{Math.min(currentPage*PAGE_SIZE,filteredFlights.length)} sur {filteredFlights.length} vols</p>
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)} className="rounded border border-blue-100 px-2.5 py-1.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-40">Précédent</button>
                {Array.from({length:totalPages},(_,i)=>i+1).filter(n=>n===1||n===totalPages||Math.abs(n-currentPage)<=1).map((n,i,arr)=><React.Fragment key={n}>{i>0&&n-arr[i-1]>1&&<span className="px-1 text-slate-400">…</span>}<button type="button" onClick={()=>setPage(n)} aria-current={n===currentPage?'page':undefined} className={`min-w-7 rounded px-2 py-1.5 text-[11px] font-semibold ${n===currentPage?'bg-blue-800 text-white':'border border-blue-100 text-blue-800 hover:bg-blue-50'}`}>{n}</button></React.Fragment>)}
                <button type="button" disabled={currentPage===totalPages} onClick={()=>setPage(currentPage+1)} className="rounded border border-blue-100 px-2.5 py-1.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-40">Suivant</button>
              </div>
            </nav>}
          </section>
        </div>

        <aside aria-label="Utilisateur et suivi des vols" className="min-w-0 space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5 xl:sticky xl:top-4">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-blue-950">Espace opérateur</h2><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-800"><UserRound className="h-4 w-4"/></span></div>
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-800 ring-2 ring-blue-50">{userInitials}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{currentUser?.userName ?? 'Utilisateur'}</p><p className="mt-1 text-xs text-blue-700">{currentUser?.role ?? 'Opérateur'}</p></div></div>
          <dl className="space-y-2 text-xs"><div className="flex items-start justify-between gap-2"><dt className="shrink-0 text-slate-500">Email</dt><dd className="min-w-0 break-all text-right font-medium text-slate-800">{currentUser?.email ?? 'Non renseigné'}</dd></div><div className="flex items-center justify-between gap-2"><dt className="text-slate-500">Session</dt><dd className="font-semibold text-blue-800">Connectée</dd></div></dl>
          <section className="border-t border-slate-100 pt-4"><h3 className="text-sm font-bold text-slate-900">Synthèse opérationnelle</h3><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-md border border-blue-100 bg-blue-50/50 p-3"><p className="text-[11px] text-slate-600">Non affectés</p><p className="mt-1 text-xl font-bold text-blue-900">{operationalSummary.unassignedFlights}</p></div><div className="rounded-md border border-blue-100 bg-blue-50/50 p-3"><p className="text-[11px] text-slate-600">En vol</p><p className="mt-1 text-xl font-bold text-blue-900">{metrics.inFlightCount}</p></div></div></section>
          <section className="border-t border-slate-100 pt-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">Prochains départs</h3><CalendarDays className="h-4 w-4 text-blue-700"/></div><div className="mt-3 space-y-2">{upcomingFlights.length ? upcomingFlights.map(flight => <button key={flight.refFlight} type="button" onClick={()=>setSelectedFlight(flight)} className="block w-full rounded-md border border-slate-200 px-3 py-2.5 text-left transition hover:border-blue-200 hover:bg-blue-50/40"><p className="text-[11px] font-semibold text-blue-700">{formatLocalIso(flight.localDeparture||flight.departure)}</p><p className="mt-1 flex items-center justify-between gap-2 text-xs font-bold text-slate-900"><span>{flight.origin} → {flight.destination}</span><span className="text-blue-700">{flight.flightNumber}</span></p></button>) : <p className="rounded-md bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">Aucun départ à venir dans les données chargées.</p>}</div></section>
        </aside>
      </div>
      <FlightDetailsModal selectedFlight={selectedFlight} onClose={()=>setSelectedFlight(null)} statusStyles={STATUS_STYLES} formatDateTime={formatDateTime} formatLocalIso={formatLocalIso} formatDuration={formatDuration} displayRoute={displayRoute} getWeatherIndicator={getWeatherIndicator}/>
    </main>
  );
};

const KpiCard: React.FC<{
  label: string;
  value: number | string;
  sub: string;
  icon: React.ReactNode;
  loading?: boolean;
}> = ({ label, value, sub, icon, loading = false }) => (
  <article className="group flex min-h-[110px] min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-200 border-t-2 border-t-blue-700 bg-white p-3.5 shadow-sm transition-colors hover:border-blue-300 sm:p-4">
    <div className="min-w-0">
      <p className="text-xs font-semibold leading-4 text-slate-600">{label}</p>
      {loading ? <div className="mt-2 h-8 w-14 animate-pulse rounded bg-blue-50"/> : <p className="mt-2 text-[26px] font-bold tabular-nums tracking-tight text-slate-950">{value}</p>}
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{sub}</p>
    </div>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-800">{icon}</span>
  </article>
);

const AlertMessage: React.FC<{
  title: string;
  message: string;
  onClose: () => void;
}> = ({ title, message, onClose }) => (
  <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-white px-4 py-3.5 shadow-sm" role="alert">
    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
    <div className="min-w-0 flex-1"><p className="text-sm font-bold text-red-800">{title}</p><p className="mt-0.5 text-sm text-slate-600">{message}</p></div>
    <button type="button" onClick={onClose} aria-label="Fermer l’alerte" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
  </div>
);

export default DashboardGantt;
