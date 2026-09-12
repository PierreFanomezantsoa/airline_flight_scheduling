import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, BarChart3, CheckCircle2, Clock,
  CloudLightning, CloudRain, Cpu, Gauge, Plane, Plus, RefreshCw, Sun, X,
} from 'lucide-react';
import { FlightAddModal } from './FlightAddModal';
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

export interface FlightFormData {
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart: string;
  heureArrivee: string;
  avionId?: string;
  aeroportEscale?: string | string[];
  dureeEscale?: number;
}

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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isLoadingFleet, setIsLoadingFleet] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
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
      const match = dateString.match(
        /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/,
      );
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
    setIsLoadingFleet(true);
    setGlobalError(null);
    try {
      const flightsResponse = await fetch(`${API_BASE_URL}/flights`, { signal });
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
      if (
        analyticsResult.status === 'fulfilled' &&
        analyticsResult.value.ok
      ) {
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
      setIsLoadingFleet(false);
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
  const handleCreateFlightSubmit = useCallback(
    async (formData: FlightFormData) => {
      if (isCreating) return;
      setGlobalError(null);
      setGlobalSuccess(null);
      setIsCreating(true);
      try {
        const departure = new Date(formData.heureDepart);
        const arrival = new Date(formData.heureArrivee);
        if (
          Number.isNaN(departure.getTime()) ||
          Number.isNaN(arrival.getTime())
        ) {
          throw new Error('Les dates de départ et d’arrivée sont invalides.');
        }
        if (arrival <= departure) {
          throw new Error(
            "L'heure d'arrivée doit être postérieure à l'heure de départ.",
          );
        }
        const response = await fetch(`${API_BASE_URL}/flights`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            ...formData,
            numeroVol: formData.numeroVol.trim().toUpperCase(),
            aeroportDepart: formData.aeroportDepart.trim().toUpperCase(),
            aeroportArrivee: formData.aeroportArrivee.trim().toUpperCase(),
            heureDepart: departure.toISOString(),
            heureArrivee: arrival.toISOString(),
            avionId: formData.avionId || undefined,
          }),
        });
        if (!response.ok) {
          throw new Error(
            await getErrorMessage(
              response,
              response.status === 409
                ? "Conflit d'affectation : cet avion est déjà utilisé sur ce créneau."
                : 'Impossible de créer le vol.',
            ),
          );
        }
        setIsAddModalOpen(false);
        setGlobalSuccess('Le vol a été créé avec succès.');
        await loadData();
      } catch (error: unknown) {
        console.error('Erreur création vol :', error);
        setGlobalError(
          (error as Error).message ||
            'Erreur réseau lors de la création du vol.',
        );
      } finally {
        setIsCreating(false);
      }
    },
    [isCreating, loadData],
  );
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

  const kpiCards = useMemo(
    () => [
      {
        label: 'Total vols',
        value: effectiveAnalytics.metrics.totalFlights,
        icon: <Plane className="h-4 w-4" />,
        tone: 'bg-emerald-700 text-white',
        sub: 'Planning actuel',
      },
      {
        label: 'OTP',
        value: `${clampPercentage(effectiveAnalytics.metrics.otpRate)}%`,
        icon: <Gauge className="h-4 w-4" />,
        tone: 'bg-emerald-50 text-emerald-700',
        sub: 'Ponctualité globale',
      },
      {
        label: 'Retardés',
        value: effectiveAnalytics.metrics.delayedCount,
        icon: <Clock className="h-4 w-4" />,
        tone: 'bg-slate-100 text-slate-600',
        sub: 'À surveiller',
      },
      {
        label: 'En vol',
        value: effectiveAnalytics.metrics.inFlightCount,
        icon: <Activity className="h-4 w-4" />,
        tone: 'bg-slate-100 text-slate-600',
        sub: 'Opérations actives',
      },
      {
        label: 'Annulés',
        value: effectiveAnalytics.metrics.cancelledCount,
        icon: <AlertCircle className="h-4 w-4" />,
        tone: 'bg-slate-100 text-slate-600',
        sub: 'Action requise',
      },
    ],
    [effectiveAnalytics],
  );
  return (
    <div className="min-h-screen bg-slate-50 p-3 text-slate-800 antialiased sm:p-4">
      <div className="mx-auto max-w-[1480px] space-y-3">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
                <Plane className="h-4 w-4 rotate-45" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold tracking-tight text-slate-900">
                  Airline Operations Control
                </h1>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  Supervision des vols, rotations et ressources opérationnelles
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={() => void loadData()}
                disabled={isFetching}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`}
                />
                Actualiser
              </button>
              <button
                type="button"
                onClick={triggerOptimization}
                disabled={isOptimizing || isFetching}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
              >
                <Cpu
                  className={`h-3.5 w-3.5 ${
                    isOptimizing ? 'animate-spin' : ''
                  }`}
                />
                {isOptimizing ? 'Analyse...' : 'Optimiser'}
              </button>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                disabled={isCreating}
                className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 text-[11px] font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50 sm:col-span-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau vol
              </button>
            </div>
          </div>
        </section>
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
        <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
          {kpiCards.map((item, index) => (
            <article
              key={item.label}
              className="relative rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm transition hover:border-slate-300"
            >
              {index === 0 && (
                <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-emerald-700" />
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="block truncate text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                    {item.label}
                  </span>
                  <strong className="mt-1.5 block text-xl font-bold leading-none text-slate-900 sm:text-2xl">
                    {item.value}
                  </strong>
                </div>
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.tone}`}
                >
                  {item.icon}
                </div>
              </div>
              <p className="mt-2 text-[9px] text-slate-400">{item.sub}</p>
            </article>
          ))}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-[11px] font-bold text-slate-800">
                  Ponctualité opérationnelle
                </h2>
                <p className="mt-0.5 truncate text-[9px] text-slate-400">
                  On-Time Performance du planning
                </p>
              </div>
            </div>
            <span className="shrink-0 font-mono text-lg font-bold text-slate-900">
              {clampPercentage(effectiveAnalytics.metrics.otpRate)}%
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-700 transition-all duration-500"
              style={{
                width: `${clampPercentage(
                  effectiveAnalytics.metrics.otpRate,
                )}%`,
              }}
            />
          </div>
        </section>
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
      </div>
      <FlightAddModal
        isOpen={isAddModalOpen}
        onClose={() => {
          if (!isCreating) setIsAddModalOpen(false);
        }}
        onSubmit={handleCreateFlightSubmit}
        fleetAircrafts={fleetAircrafts}
        isLoadingFleet={isLoadingFleet || isCreating}
      />
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
const AlertMessage: React.FC<{
  type: 'error' | 'success';
  title: string;
  message: string;
  onClose: () => void;
}> = ({ type, title, message, onClose }) => {
  const success = type === 'success';
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 ${
        success
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-rose-200 bg-rose-50'
      }`}
    >
      {success ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={`text-[11px] font-bold ${
            success ? 'text-emerald-800' : 'text-rose-800'
          }`}
        >
          {title}
        </p>
        <p
          className={`mt-0.5 text-[11px] leading-4 ${
            success ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {message}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className={`flex h-6 w-6 items-center justify-center rounded-md ${
          success
            ? 'text-emerald-600 hover:bg-emerald-100'
            : 'text-rose-500 hover:bg-rose-100'
        }`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default DashboardGantt;