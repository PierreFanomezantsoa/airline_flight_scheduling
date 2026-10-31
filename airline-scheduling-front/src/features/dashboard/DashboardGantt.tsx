// src/features/dashboard/DashboardGantt.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudLightning,
  CloudRain,
  Cpu,
  Plane,
  RefreshCw,
  Sun,
  X,
  XCircle,
} from 'lucide-react';
import { FlightDetailsModal } from './FlightDetailsModal';
import {
  FlightPlanning,
  UNASSIGNED_AIRCRAFT,
  normalizeFlightStatus as normalizeFlightStatusValue,

  type AircraftData,

  type Flight,

  type FlightStatus,

  type StatusStyle,

  type WeatherIndicator,
} from './PlannificationVol';

// ✅ Deux helpers : pythonRequestJson/pythonFetch pour Flask (port 5000),
//    requestJson pour NestJS (port 3001 → /fleet)
import {
  ApiError,
  authFetch,
  getAuthSession,
  pythonFetch,
  pythonRequestJson,
} from '../Api/apiService';

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
 * Extrait un message d'erreur lisible depuis une réponse HTTP.
 */
async function getErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = await response.json();
    if (Array.isArray(payload?.message)) {
      return payload.message.join(' | ');
    }
    if (typeof payload?.message === 'object' && payload?.message?.message) {
      return payload.message.message;
    }
    if (typeof payload?.message === 'string') {
      return payload.message;
    }
    return payload?.error || fallback;
  } catch {
    return fallback;
  }
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

/**
 * Requête JSON via authFetch (NestJS uniquement — /fleet, /users, etc.)
 */
async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await authFetch(path, options);
  if (!response.ok) {
    const message = await getErrorMessage(
      response,
      `Erreur serveur HTTP ${response.status}`,
    );
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
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
    dot: 'bg-emerald-500',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
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
    dot: 'bg-emerald-600',
    badge: 'border-emerald-600 bg-emerald-600 text-white',
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
    dot: 'bg-emerald-500',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
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
    dot: 'bg-emerald-600',
    badge: 'border-emerald-600 bg-emerald-600 text-white',
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
  const canOptimize = ['Planificateur', 'Regulator'].includes(
    String(getAuthSession()?.user.role ?? ''),
  );
  const [flights, setFlights] = useState<Flight[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [fleetAircrafts, setFleetAircrafts] = useState<AircraftData[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  /* ===========================================================================
   * FORMATTERS
   * =========================================================================== */
  const formatDateTime = useCallback((dateString?: string | null) => {
    if (!dateString) return '--/-- --:--';
    if (/^\d{2}:\d{2}$/.test(dateString)) return dateString;
    const parsedDate = new Date(dateString);
    if (Number.isNaN(parsedDate.getTime())) return dateString;
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsedDate);
  }, []);
  const formatLocalIso = useCallback(
    (dateString?: string | null) => {
      if (!dateString) return '--/-- --:--';
      const match = dateString.match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (!match) return formatDateTime(dateString);
      const [, month, day, hour, minute] = match;
      return `${day}/${month} ${hour}:${minute}`;
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
   * ✅ Backend NestJS (port 3001) :
   *      /fleet/aircrafts   → requestJson (authFetch)
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
      setFlights(normalizedFlights);
      // ✅ Analytics — Python + Fleet — NestJS (en parallèle)
      const [analyticsResult, fleetResult] = await Promise.allSettled([
        pythonRequestJson<Analytics>('/flights/analytics', { signal }),
        requestJson<AircraftData[]>('/fleet/aircrafts', { signal }),
      ]);
      // Analytics (Python)
      const fallbackAnalytics = buildFallbackAnalytics(normalizedFlights);
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
      // Flotte (NestJS)
      if (fleetResult.status === 'fulfilled' && Array.isArray(fleetResult.value)) {
        setFleetAircrafts(fleetResult.value);
      } else {
        setFleetAircrafts([]);
      }
    } catch (error: unknown) {
      // ✅ AbortError ignoré silencieusement
      if (isAbortError(error)) return;
      console.error("Erreur d'appel API :", error);
      setGlobalError(
        getFriendlyError(error, 'Impossible de se connecter au serveur central.'),
      );
    } finally {
      setIsFetching(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  /* ===========================================================================
   * OPTIMISATION — Python (Flask)
   * =========================================================================== */
  const triggerOptimization = useCallback(async () => {
    if (!canOptimize || isOptimizing) return;
    setIsOptimizing(true);
    setGlobalError(null);
    setGlobalSuccess(null);
    try {
      // ✅ Python via pythonFetch (URL /python en prod, localhost:5000 en dev)
      const response = await pythonFetch('/flights/optimize', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw new ApiError(
            "La route POST /flights/optimize n'est pas disponible.",
            404,
          );
        }
        const message = await getErrorMessage(
          response,
          "Le moteur d'optimisation a rencontré une anomalie.",
        );
        throw new ApiError(message, response.status);
      }
      let message = 'Programme de vols optimisé avec succès.';
      try {
        const payload = (await response.json()) as {
          resolvedConflicts?: number;
          unresolvedConflicts?: number;
          conflictsBefore?: number;
          conflictsAfter?: number;
          message?: string;
        };
        if (
          typeof payload?.resolvedConflicts === 'number' ||
          typeof payload?.conflictsAfter === 'number'
        ) {
          const resolved = payload.resolvedConflicts ?? 0;
          const unresolved = payload.unresolvedConflicts ?? 0;
          const remaining = payload.conflictsAfter ?? 0;
          message = `Optimisation terminée : ${resolved} conflit(s) résolu(s), ${unresolved} non résolu(s), ${remaining} restant(s).`;
        } else {
          message = 'Programme de vols optimisé avec succès.';
        }
      } catch {
        // Réponse vide autorisée.
      }
      setGlobalSuccess(message);
      await loadData();
    } catch (error: unknown) {
      // ✅ AbortError ignoré silencieusement
      if (isAbortError(error)) return;
      console.error('Erreur optimisation :', error);
      setGlobalError(
        getFriendlyError(
          error,
          "Erreur réseau lors de la communication avec le moteur d'optimisation.",
        ),
      );
    } finally {
      setIsOptimizing(false);
    }
  }, [canOptimize, isOptimizing, loadData]);

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

  /* ===========================================================================
   * RENDER
   * =========================================================================== */
  return (
    <div className="mx-auto max-w-[1480px] space-y-5">
      {/* ═══════════════ ACTIONS ═══════════════ */}
      <header className="flex w-full justify-end py-1">
        <div className="grid w-full gap-3 sm:flex sm:w-auto sm:justify-end">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={isFetching}
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Actualisation…' : 'Actualiser'}
          </button>
          <button
            type="button"
            onClick={triggerOptimization}
            disabled={!canOptimize || isOptimizing || isFetching}
            title={!canOptimize ? "Votre rôle ne permet pas d'optimiser le programme." : undefined}
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:w-auto"
          >
            <Cpu className={`h-4 w-4 ${isOptimizing ? 'animate-spin' : ''}`} />
            {isOptimizing ? 'Analyse en cours…' : 'Optimiser le programme'}
          </button>
        </div>
      </header>
      {/* ═══════════════ ALERTES SYSTÈME ═══════════════ */}
      {globalError && (
        <AlertMessage
          type="error"
          title="Erreur système"
          message={globalError}
          onClose={() => setGlobalError(null)}
        />
      )}
      {globalSuccess && (
        <AlertMessage
          type="success"
          title="Opération réussie"
          message={globalSuccess}
          onClose={() => setGlobalSuccess(null)}
        />
      )}
      {/* ═══════════════ INDICATEURS PRINCIPAUX ═══════════════ */}
      <section
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
        aria-label="Indicateurs principaux du programme de vols"
      >
        <KpiCard
          label="Total vols"
          value={metrics.totalFlights}
          sub="Programme actuel"
          icon={<Plane className="h-[18px] w-[18px]" />}
          loading={isFetching && flights.length === 0}
        />
        <KpiCard
          label="Planifiés"
          value={metrics.onTimeCount}
          sub="À venir"
          icon={<CalendarClock className="h-[18px] w-[18px]" />}
          loading={isFetching && flights.length === 0}
        />
        <KpiCard
          label="En vol"
          value={metrics.inFlightCount}
          sub="Opérations actives"
          icon={<Activity className="h-[18px] w-[18px]" />}
          live={metrics.inFlightCount > 0}
          loading={isFetching && flights.length === 0}
        />
        <KpiCard
          label="Effectués"
          value={metrics.effectueCount}
          sub="Vols terminés"
          icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
          loading={isFetching && flights.length === 0}
        />
        <KpiCard
          label="Retardés"
          value={metrics.delayedCount}
          sub="À surveiller"
          icon={<Clock className="h-[18px] w-[18px]" />}
          alert={metrics.delayedCount > 0 ? 'warning' : undefined}
          loading={isFetching && flights.length === 0}
        />
        <KpiCard
          label="Annulés"
          value={metrics.cancelledCount}
          sub="Action requise"
          icon={<AlertCircle className="h-[18px] w-[18px]" />}
          alert={metrics.cancelledCount > 0 ? 'danger' : undefined}
          loading={isFetching && flights.length === 0}
        />
      </section>
      {/* ═══════════════ POINTS D’ATTENTION ═══════════════ */}
      <section className="grid gap-3 md:grid-cols-3" aria-label="Synthèse opérationnelle">
        <SummaryCard
          label="Ponctualité"
          value={`${Number(metrics.otpRate ?? 0).toFixed(1)} %`}
          description="Indicateur global issu des données analytiques disponibles."
          state={Number(metrics.otpRate ?? 0) >= 80 ? 'ok' : 'warning'}
        />
        <SummaryCard
          label="Vols non affectés"
          value={operationalSummary.unassignedFlights}
          description="Vols nécessitant encore l’affectation d’un aéronef."
          state={operationalSummary.unassignedFlights > 0 ? 'warning' : 'ok'}
        />
        <SummaryCard
          label="Alertes météo"
          value={operationalSummary.weatherAlerts}
          description={`${operationalSummary.aircraftInProgram} aéronef${operationalSummary.aircraftInProgram > 1 ? 's' : ''} mobilisé${operationalSummary.aircraftInProgram > 1 ? 's' : ''} dans le programme.`}
          state={operationalSummary.weatherAlerts > 0 ? 'danger' : 'ok'}
        />
      </section>
      {/* ═══════════════ FLIGHT PLANNING ═══════════════ */}
      <FlightPlanning
        flights={flights}
        fleetAircrafts={fleetAircrafts}
        isFetching={isFetching}
        statusStyles={STATUS_STYLES}
        formatLocalIso={formatLocalIso}
        formatDuration={formatDuration}
        displayRoute={displayRoute}
        getWeatherIndicator={getWeatherIndicator}
        onSelectFlight={setSelectedFlight}
      />
      {/* ═══════════════ MODALE DÉTAILS ═══════════════ */}
      <FlightDetailsModal
        selectedFlight={selectedFlight}
        onClose={() => setSelectedFlight(null)}
        statusStyles={STATUS_STYLES}
        formatDateTime={formatDateTime}
        formatLocalIso={formatLocalIso}
        formatDuration={formatDuration}
        displayRoute={displayRoute}
        getWeatherIndicator={getWeatherIndicator}
      />
    </div>
  );
};

/* ============================================================================
 * SOUS-COMPOSANTS
 * ========================================================================== */

const KpiCard: React.FC<{
  label: string;
  value: number | string;
  sub: string;
  icon: React.ReactNode;

  /** Couleur d'alerte uniquement quand il y a un problème */
  alert?: 'warning' | 'danger';
  live?: boolean;
  loading?: boolean;
}> = ({ label, value, sub, icon, alert, live = false, loading = false }) => {
  const iconTone =
    alert === 'danger'
      ? 'bg-rose-50 text-rose-600 ring-rose-100'
      : alert === 'warning'
        ? 'bg-amber-50 text-amber-600 ring-amber-100'
        : 'bg-emerald-50 text-emerald-600 ring-emerald-100';
  const valueTone =
    alert === 'danger' ? 'text-rose-600' : alert === 'warning' ? 'text-amber-600' : 'text-slate-900';
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03] transition hover:border-emerald-200 hover:shadow-md sm:p-5">
      <span
        className="absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-emerald-400 to-emerald-600 opacity-0 transition group-hover:opacity-100"
        aria-hidden="true"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-slate-600">{label}</span>
        <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${iconTone}`}>
          {icon}
          {live && (
            <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            </span>
          )}
        </div>
      </div>
      <div className="mt-3">
        {loading ? (
          <div className="h-8 w-14 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <span className={`text-[28px] font-bold leading-none tabular-nums tracking-tight ${valueTone}`}>
            {value}
          </span>
        )}
        <p className="mt-1.5 text-xs text-slate-500">{sub}</p>
      </div>
    </article>
  );
};

const SummaryCard: React.FC<{
  label: string;
  value: number | string;
  description: string;
  state: 'ok' | 'warning' | 'danger';
}> = ({ label, value, description, state }) => {
  const tone =
    state === 'danger'
      ? 'border-rose-200 bg-rose-50/60 text-rose-700'
      : state === 'warning'
        ? 'border-amber-200 bg-amber-50/60 text-amber-700'
        : 'border-emerald-200 bg-emerald-50/60 text-emerald-700';
  const dot =
    state === 'danger'
      ? 'bg-rose-500'
      : state === 'warning'
        ? 'bg-amber-500'
        : 'bg-emerald-500';
  return (
    <article className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
    </article>
  );
};

const AlertMessage: React.FC<{
  type: 'error' | 'success';
  title: string;
  message: string;
  onClose: () => void;
}> = ({ type, title, message, onClose }) => {
  const success = type === 'success';
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border bg-white px-4 py-3.5 shadow-sm ${
        success ? 'border-emerald-200' : 'border-rose-200'
      }`}
      role={success ? 'status' : 'alert'}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          success ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
        }`}
      >
        {success ? <CheckCircle2 className="h-[18px] w-[18px]" /> : <XCircle className="h-[18px] w-[18px]" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${success ? 'text-emerald-800' : 'text-rose-800'}`}>{title}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-slate-600">{message}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Fermer le message"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default DashboardGantt;