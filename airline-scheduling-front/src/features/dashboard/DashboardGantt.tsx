import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  CloudLightning,
  CloudRain,
  Cpu,
  Gauge,
  Plane,
  RefreshCw,
  Sun,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import { FlightDetailsModal } from './FlightDetailsModal';
import {
  FlightPlanning,
  type AircraftData,
  type Flight,
  type FlightStatus,
  type StatusStyle,
  type WeatherIndicator,
} from './PlannificationVol';

const API_BASE_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_API_BASE_URL ?? 'http://localhost:5000';

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

const FOCUS_RING =
  'outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';

const clampPercentage = (value: number) =>
  Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

const normalizeSeverity = (value?: number | null) =>
  Math.min(1, Math.max(0, Number(value ?? 0)));

const getErrorMessage = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  try {
    const payload = await response.json();
    if (Array.isArray(payload?.message)) return payload.message.join(' | ');
    if (typeof payload?.message === 'object' && payload?.message?.message) {
      return payload.message.message;
    }
    return payload?.message || payload?.error || fallback;
  } catch {
    return fallback;
  }
};

const buildFallbackAnalytics = (flights: Flight[]): Analytics => {
  const totalFlights = flights.length;
  const count = (status: FlightStatus) =>
    flights.filter(flight => flight.status === status).length;
  const onTimeCount = count('Scheduled');
  const delayedCount = count('Delayed');
  const cancelledCount = count('Cancelled');
  const inFlightCount = count('In-Flight');
  const effectueCount = count('Effectué');
  const denominator = Math.max(0, totalFlights - cancelledCount - inFlightCount);
  const otpRate =
    denominator > 0
      ? Number(((onTimeCount / denominator) * 100).toFixed(1))
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
    dot: 'bg-sky-500',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    border: 'border-l-sky-500',
    card: 'hover:border-sky-200',
  },
  Effectué: {
    label: 'Effectué',
    dot: 'bg-slate-400',
    badge: 'border-slate-200 bg-slate-100 text-slate-600',
    border: 'border-l-slate-400',
    card: 'opacity-90 hover:opacity-100',
  },
};

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

export const DashboardGantt: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [fleetAircrafts, setFleetAircrafts] = useState<AircraftData[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

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

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setIsFetching(true);
    setGlobalError(null);
    try {
      const flightsResponse = await fetch(`${API_BASE_URL}/flights`, {
        signal,
      });
      if (!flightsResponse.ok) {
        throw new Error(
          await getErrorMessage(
            flightsResponse,
            `Erreur API Vols : statut ${flightsResponse.status}`,
          ),
        );
      }
      const flightsPayload = await flightsResponse.json();
      const flightsList: Flight[] = Array.isArray(flightsPayload)
        ? flightsPayload
        : [];
      setFlights(flightsList);

      const [analyticsResult, fleetResult] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/flights/analytics`, { signal }),
        fetch(`${API_BASE_URL}/fleet/aircrafts`, { signal }),
      ]);

      if (analyticsResult.status === 'fulfilled' && analyticsResult.value.ok) {
        const payload = await analyticsResult.value.json();
        setAnalytics({
          ...payload,
          metrics: {
            ...payload.metrics,
            effectueCount:
              payload.metrics?.effectueCount ??
              flightsList.filter(flight => flight.status === 'Effectué').length,
          },
        });
      } else {
        setAnalytics(buildFallbackAnalytics(flightsList));
      }

      if (fleetResult.status === 'fulfilled' && fleetResult.value.ok) {
        const payload = await fleetResult.value.json();
        setFleetAircrafts(Array.isArray(payload) ? payload : []);
      } else {
        setFleetAircrafts([]);
      }
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') return;
      console.error("Erreur d'appel API :", error);
      setGlobalError(
        (error as Error).message ||
          'Impossible de se connecter au serveur central.',
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

  const triggerOptimization = useCallback(async () => {
    if (isOptimizing) return;
    setIsOptimizing(true);
    setGlobalError(null);
    setGlobalSuccess(null);
    try {
      const response = await fetch(`${API_BASE_URL}/flights/optimize`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        if (response.status === 404) {
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
      let message = 'Planning optimisé avec succès.';
      try {
        const payload = await response.json();
        message = payload?.message || message;
      } catch {
        // Réponse vide autorisée.
      }
      setGlobalSuccess(message);
      await loadData();
    } catch (error: unknown) {
      console.error('Erreur optimisation :', error);
      setGlobalError(
        (error as Error).message ||
          "Erreur réseau lors de la communication avec le moteur d'optimisation.",
      );
    } finally {
      setIsOptimizing(false);
    }
  }, [isOptimizing, loadData]);

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

  const effectiveAnalytics = useMemo(
    () => analytics ?? buildFallbackAnalytics(flights),
    [analytics, flights],
  );

  const otpRate = clampPercentage(effectiveAnalytics.metrics.otpRate);
  const otpTier =
    otpRate >= 85
      ? { label: 'Excellent', tone: 'text-emerald-700', bg: 'bg-emerald-500' }
      : otpRate >= 70
        ? { label: 'Correct', tone: 'text-sky-700', bg: 'bg-sky-500' }
        : otpRate >= 50
          ? { label: 'À surveiller', tone: 'text-amber-700', bg: 'bg-amber-500' }
          : { label: 'Critique', tone: 'text-rose-700', bg: 'bg-rose-500' };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-5 lg:p-6">
      <div className="mx-auto max-w-[1480px] space-y-5">
        {/* ═══════════════ HEADER ═══════════════ */}
        <header className="flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={isFetching}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 ${FOCUS_RING}`}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Actualiser
          </button>

          <button
            type="button"
            onClick={triggerOptimization}
            disabled={isOptimizing || isFetching}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 ${FOCUS_RING}`}
          >
            <Cpu className={`h-4 w-4 ${isOptimizing ? 'animate-spin' : ''}`} />
            {isOptimizing ? 'Analyse...' : 'Optimiser'}
          </button>
        </header>

        {/* ═══════════════ ALERTES ═══════════════ */}
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

        {/* ═══════════════ KPI ═══════════════ */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            label="Total vols"
            value={effectiveAnalytics.metrics.totalFlights}
            sub="Planning actuel"
            icon={<Plane className="h-4 w-4" />}
            tone="bg-emerald-50 text-emerald-600"
          />
          <KpiCard
            label="Ponctualité"
            value={`${otpRate}%`}
            sub={otpTier.label}
            icon={<Gauge className="h-4 w-4" />}
            tone={
              otpRate >= 85
                ? 'bg-emerald-50 text-emerald-600'
                : otpRate >= 60
                  ? 'bg-sky-50 text-sky-600'
                  : 'bg-amber-50 text-amber-600'
            }
            isWarning={otpRate < 60}
          />
          <KpiCard
            label="Retardés"
            value={effectiveAnalytics.metrics.delayedCount}
            sub="À surveiller"
            icon={<Clock className="h-4 w-4" />}
            tone={
              effectiveAnalytics.metrics.delayedCount > 0
                ? 'bg-amber-50 text-amber-600'
                : 'bg-slate-50 text-slate-500'
            }
            isWarning={effectiveAnalytics.metrics.delayedCount > 0}
          />
          <KpiCard
            label="En vol"
            value={effectiveAnalytics.metrics.inFlightCount}
            sub="Opérations actives"
            icon={<Activity className="h-4 w-4" />}
            tone="bg-sky-50 text-sky-600"
          />
          <KpiCard
            label="Annulés"
            value={effectiveAnalytics.metrics.cancelledCount}
            sub="Action requise"
            icon={<AlertCircle className="h-4 w-4" />}
            tone={
              effectiveAnalytics.metrics.cancelledCount > 0
                ? 'bg-rose-50 text-rose-600'
                : 'bg-slate-50 text-slate-500'
            }
            isWarning={effectiveAnalytics.metrics.cancelledCount > 0}
          />
        </section>

        {/* ═══════════════ UN SEUL DIV : OTP + RECHERCHE + PLANNING ═══════════════ */}
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
          topHeader={
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              {/* Identité OTP */}
              <div className="flex items-center gap-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Ponctualité opérationnelle
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    On-Time Performance du planning en cours
                  </p>
                </div>
              </div>

              {/* Métriques + jauge */}
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      À l'heure
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-bold text-emerald-700">
                      {effectiveAnalytics.metrics.onTimeCount}
                    </p>
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                  <div className="text-right">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      Effectués
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-bold text-slate-700">
                      {effectiveAnalytics.metrics.effectueCount}
                    </p>
                  </div>
                </div>

                <div className="flex min-w-[220px] flex-1 items-center gap-3 lg:flex-initial lg:min-w-[280px]">
                  <div className="relative flex-1">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${otpTier.bg}`}
                        style={{ width: `${otpRate}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <TrendingUp
                      className={`h-4 w-4 ${otpTier.tone}`}
                      strokeWidth={2.5}
                    />
                    <span
                      className={`font-mono text-lg font-bold ${otpTier.tone}`}
                    >
                      {otpRate}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          }
        />
      </div>

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

/* ========================================================================== */
/* SOUS-COMPOSANTS                                                            */
/* ========================================================================== */

const KpiCard: React.FC<{
  label: string;
  value: number | string;
  sub: string;
  icon: React.ReactNode;
  tone?: string;
  isWarning?: boolean;
}> = ({
  label,
  value,
  sub,
  icon,
  tone = 'bg-slate-50 text-slate-500',
  isWarning = false,
}) => {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium text-slate-600">{label}</span>
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${tone}`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span
          className={`text-3xl font-bold tabular-nums tracking-tight ${
            isWarning ? 'text-amber-600' : 'text-slate-900'
          }`}
        >
          {value}
        </span>
        <span className="text-xs font-medium text-slate-400">{sub}</span>
      </div>
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
      className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 ${
        success
          ? 'border-emerald-200 bg-emerald-50/60'
          : 'border-rose-200 bg-rose-50/60'
      }`}
      role="alert"
    >
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          success
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-rose-100 text-rose-600'
        }`}
      >
        {success ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <XCircle className="h-4 w-4" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${
            success ? 'text-emerald-800' : 'text-rose-800'
          }`}
        >
          {title}
        </p>
        <p
          className={`mt-0.5 text-xs leading-5 ${
            success ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {message}
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${
          success
            ? 'text-emerald-600 hover:bg-emerald-100'
            : 'text-rose-500 hover:bg-rose-100'
        }`}
        aria-label="Fermer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default DashboardGantt;