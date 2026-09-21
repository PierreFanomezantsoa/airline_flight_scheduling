import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock,
  CloudLightning, CloudRain, Cpu, Edit2, Filter, Globe, Loader2, MapPin, Plane,
  Plus, RefreshCw, Search, ShieldAlert, Sparkles, Sun, Trash2, X, XCircle,
  MoreVertical,
} from 'lucide-react';
import { FlightAddModal, type FlightFormData } from '../dashboard/FlightAddModal';

export type FlightStatus =
  | 'Scheduled' | 'Delayed' | 'In-Flight' | 'Cancelled' | 'On-Time'
  | 'En attente' | 'Planifié' | 'Retardé' | 'En Vol' | 'Annulé'
  | 'Ponctuel' | 'Effectué';

export type NormalizedStatus =
  | 'En attente' | 'Ponctuel' | 'Retardé' | 'En Vol' | 'Annulé' | 'Effectué';

type WeatherRiskLevel =
  | 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'EXTREME' | 'UNKNOWN' | 'SKIPPED';

interface WeatherPoint {
  airport?: string | null;
  severity?: number | null;
  available?: boolean;
  fetchedAt?: string | null;
  targetTime?: string | null;
  error?: string | null;
}

interface WeatherAI {
  engine?: string;
  evaluatedAt?: string | null;
  score?: number | null;
  riskLevel?: WeatherRiskLevel;
  riskLabel?: string;
  confidence?: number | null;
  dataAvailable?: boolean;
  persistentSevere?: boolean;
  minutesToDeparture?: number | null;
  recommendedAction?: string;
  recommendedActionLabel?: string;
  explanation?: string;
  departure?: WeatherPoint | null;
  arrival?: WeatherPoint | null;
  stopovers?: WeatherPoint[];
}

interface Flight {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  stopover?: string | string[] | null;
  stops?: string[];
  stopoverDurationMinutes?: number | null;
  route?: string;
  departure: string;
  arrival: string;
  localDeparture?: string | null;
  localArrival?: string | null;
  durationMinutes?: number | null;
  status: FlightStatus;
  aircraft: string;
  aircraftModel: string;
  weatherSeverity?: number | null;
  weatherPending?: boolean;
  weatherAI?: WeatherAI;
  weatherRiskLevel?: WeatherRiskLevel;
  weatherRiskLabel?: string;
  weatherConfidence?: number | null;
  weatherRecommendedAction?: string;
  weatherRecommendedActionLabel?: string;
  weatherUpdatedAt?: string | null;
}

interface WeatherAlert {
  flightId: string;
  weatherAI: WeatherAI;
}

interface WeatherAlertsResponse {
  status: string;
  generatedAt?: string;
  alerts?: WeatherAlert[];
}

interface AircraftData {
  id: string;
  model: string;
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface MobileFlightCardProps {
  flight: Flight;
  computedStatus: NormalizedStatus;
  onEdit: (flight: Flight) => void;
  onDelete: (flight: Flight) => void;
}

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof globalThis !== 'undefined' &&
    (globalThis as any).process?.env?.REACT_APP_API_BASE_URL) ||
  'http://localhost:5000';

// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════

const SURFACE = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const FOCUS_RING = 'outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';

const STATUS_STYLES: Record<NormalizedStatus, { badge: string; dot: string }> = {
  'En attente': { badge: 'bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
  Ponctuel: { badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  Retardé: { badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  'En Vol': { badge: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  Annulé: { badge: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  Effectué: { badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
};

const STATUS_FILTERS = [
  { id: 'ALL', label: 'Tous' },
  { id: 'En attente', label: 'En attente' },
  { id: 'Ponctuel', label: 'Ponctuels' },
  { id: 'En Vol', label: 'En Vol' },
  { id: 'Retardé', label: 'Retardés' },
  { id: 'Annulé', label: 'Annulés' },
] as const;

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const normalizeStops = (flight: Flight): string[] => {
  if (Array.isArray(flight.stops)) return flight.stops.filter(Boolean);
  if (Array.isArray(flight.stopover)) {
    return flight.stopover.map(value => String(value).trim().toUpperCase()).filter(Boolean);
  }
  if (typeof flight.stopover === 'string') {
    return flight.stopover.split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
  }
  return [];
};

const normalizeSeverity = (value?: number | null) => {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(1, Number(value)));
};

const formatWeatherPercent = (value?: number | null) => {
  const normalized = normalizeSeverity(value);
  return normalized == null ? '--' : `${Math.round(normalized * 100)}%`;
};

const calculateDuration = (departureStr: string, arrivalStr: string): string | null => {
  const dep = new Date(departureStr);
  const arr = new Date(arrivalStr);
  if (Number.isNaN(dep.getTime()) || Number.isNaN(arr.getTime())) return null;
  const diffMs = arr.getTime() - dep.getTime();
  if (diffMs <= 0) return null;
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
};

const formatMobileDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

const formatMobileTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const getWeatherVisual = (flight: Flight) => {
  const ai = flight.weatherAI;
  const level = ai?.riskLevel ?? flight.weatherRiskLevel;

  if (flight.weatherPending && !ai) {
    return { label: 'Analyse...', icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />, badge: 'bg-slate-50 text-slate-600', bar: 'bg-slate-300' };
  }
  if (ai?.dataAvailable === false || level === 'UNKNOWN') {
    return { label: 'Indisponible', icon: <AlertCircle className="h-3.5 w-3.5" />, badge: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' };
  }
  if (level === 'EXTREME') {
    return { label: ai?.riskLabel || 'Extrême', icon: <CloudLightning className="h-3.5 w-3.5" />, badge: 'bg-rose-50 text-rose-700', bar: 'bg-rose-500' };
  }
  if (level === 'SEVERE' || level === 'HIGH') {
    return { label: ai?.riskLabel || 'Élevé', icon: <AlertTriangle className="h-3.5 w-3.5" />, badge: 'bg-orange-50 text-orange-700', bar: 'bg-orange-500' };
  }
  if (level === 'MODERATE') {
    return { label: ai?.riskLabel || 'Modéré', icon: <CloudRain className="h-3.5 w-3.5" />, badge: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' };
  }
  if (level === 'LOW') {
    return { label: ai?.riskLabel || 'Faible', icon: <Sun className="h-3.5 w-3.5" />, badge: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' };
  }

  const severity = normalizeSeverity(flight.weatherSeverity);
  if (severity == null) return { label: 'Non évalué', icon: <Cpu className="h-3.5 w-3.5" />, badge: 'bg-slate-50 text-slate-600', bar: 'bg-slate-300' };
  if (severity >= 0.92) return { label: 'Extrême', icon: <CloudLightning className="h-3.5 w-3.5" />, badge: 'bg-rose-50 text-rose-700', bar: 'bg-rose-500' };
  if (severity >= 0.7) return { label: 'Élevé', icon: <AlertTriangle className="h-3.5 w-3.5" />, badge: 'bg-orange-50 text-orange-700', bar: 'bg-orange-500' };
  if (severity >= 0.45) return { label: 'Modéré', icon: <CloudRain className="h-3.5 w-3.5" />, badge: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' };
  
  return { label: 'Faible', icon: <Sun className="h-3.5 w-3.5" />, badge: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' };
};

// ═══════════════════════════════════════════════════════════════
// ROUTE BADGE
// ═══════════════════════════════════════════════════════════════
const RouteBadge: React.FC<{ origin: string; destination: string; stops?: string[]; departure: string; arrival: string; }> = ({ origin, destination, stops = [], departure, arrival }) => {
  const duration = calculateDuration(departure, arrival);
  const hasStops = stops.length > 0;

  return (
    <div className="min-w-47.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-xs font-bold text-slate-800">{origin}</span>
        {stops.map((stop, index) => (
          <React.Fragment key={`${stop}-${index}`}>
            <ArrowRight className="h-3 w-3 shrink-0 text-slate-300" />
            <span className="font-mono text-xs font-semibold text-slate-500">{stop}</span>
          </React.Fragment>
        ))}
        <ArrowRight className="h-3 w-3 shrink-0 text-slate-300" />
        <span className="font-mono text-xs font-bold text-slate-800">{destination}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-medium text-slate-500">
        {duration && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{duration}</span>}
        {hasStops ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{stops.length} escale{stops.length > 1 ? 's' : ''}</span> : <span className="text-slate-400">Vol direct</span>}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// MOBILE FLIGHT CARD
// ═══════════════════════════════════════════════════════════════
const MobileFlightCard: React.FC<MobileFlightCardProps> = ({ flight, computedStatus, onEdit, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const stops = normalizeStops(flight);
  const duration = calculateDuration(flight.departure, flight.arrival);
  const weather = getWeatherVisual(flight);
  const aircraftLabel = flight.aircraftModel || flight.aircraft || 'Non assigné';
  const isUnassigned = !flight.aircraft || flight.aircraft === 'NON ASSIGNÉ';
  const isInFlight = computedStatus === 'En Vol';

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isInFlight ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-600'}`}>
            <Plane className={`h-3.5 w-3.5 ${isInFlight ? 'rotate-45' : ''}`} />
          </div>
          <span className="font-mono text-sm font-bold text-slate-900">{flight.flightNumber}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[computedStatus].badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[computedStatus].dot} ${isInFlight ? 'animate-pulse' : ''}`} />
            {computedStatus}
          </span>
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen(v => !v)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <button type="button" className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <button type="button" onClick={() => { setMenuOpen(false); onEdit(flight); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <Edit2 className="h-3.5 w-3.5" /> Modifier
                  </button>
                  <button type="button" onClick={() => { setMenuOpen(false); onDelete(flight); }} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50">
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-700">
          <span>{flight.origin}</span>
          {stops.map((stop, index) => (<React.Fragment key={`${stop}-${index}`}><ArrowRight className="h-3 w-3 text-slate-300" /><span className="text-slate-500">{stop}</span></React.Fragment>))}
          <ArrowRight className="h-3 w-3 text-slate-300" />
          <span>{flight.destination}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500"><Plane className="h-3 w-3 rotate-45" />Départ</p>
            <p className="mt-1 font-mono text-xs font-semibold text-slate-900">{formatMobileDate(flight.departure)} {formatMobileTime(flight.departure)}</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500"><MapPin className="h-3 w-3" />Arrivée</p>
            <p className="mt-1 font-mono text-xs font-semibold text-slate-900">{formatMobileDate(flight.arrival)} {formatMobileTime(flight.arrival)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-100 p-2.5">
            <p className="text-[10px] font-medium text-slate-500">Durée</p>
            <p className="mt-1 font-mono text-xs font-semibold text-slate-900">{duration || '--'}</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-2.5">
            <p className="text-[10px] font-medium text-slate-500">Aéronef</p>
            <p className={`mt-1 truncate font-mono text-xs font-semibold ${isUnassigned ? 'text-rose-600' : 'text-slate-900'}`}>{aircraftLabel}</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-slate-500">Météo</p>
            <span className="font-mono text-[11px] font-bold text-slate-600">{formatWeatherPercent(flight.weatherAI?.score ?? flight.weatherSeverity)}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${weather.badge}`}>{weather.icon}{weather.label}</span>
          </div>
          {flight.weatherAI?.recommendedAction && !['NORMAL', 'NONE'].includes(flight.weatherAI.recommendedAction) && (
            <div className="mt-2 flex items-start gap-1.5 border-t border-slate-200 pt-2 text-[11px] text-slate-600">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              <span>{flight.weatherAI.recommendedActionLabel || 'Surveillance renforcée'}</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 p-3">
        <button type="button" onClick={() => onEdit(flight)} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700">
          Voir les détails <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
};

// ═══════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export const FlightsPlanning: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [fleet, setFleet] = useState<AircraftData[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState<Flight | null>(null);
  const [loadingFlights, setLoadingFlights] = useState(true);
  const [loadingFleet, setLoadingFleet] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWeatherRefreshing, setIsWeatherRefreshing] = useState(false);
  const [weatherLastUpdatedAt, setWeatherLastUpdatedAt] = useState<Date | null>(null);
  const [weatherSyncError, setWeatherSyncError] = useState<string | null>(null);
  const [deletingFlight, setDeletingFlight] = useState<Flight | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(previous => [...previous, { id, type, message }]);
    window.setTimeout(() => { setToasts(previous => previous.filter(toast => toast.id !== id)); }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => { setToasts(previous => previous.filter(toast => toast.id !== id)); }, []);

  const getCalculatedStatus = useCallback((flight: Flight): NormalizedStatus => {
    const rawStatus = flight.status;
    if (['Cancelled', 'Annulé'].includes(rawStatus)) return 'Annulé';
    if (['Delayed', 'Retardé'].includes(rawStatus)) return 'Retardé';
    if (['In-Flight', 'En Vol'].includes(rawStatus)) return 'En Vol';
    if (rawStatus === 'Effectué') return 'Effectué';
    if (['On-Time', 'Ponctuel'].includes(rawStatus)) return 'Ponctuel';
    if (['Scheduled', 'Planifié', 'En attente'].includes(rawStatus)) return 'En attente';

    const now = new Date();
    const dep = new Date(flight.departure);
    const arr = new Date(flight.arrival);
    if (!Number.isNaN(dep.getTime()) && !Number.isNaN(arr.getTime())) {
      if (now < dep) return 'En attente';
      if (now >= dep && now <= arr) return 'En Vol';
      if (now > arr) return 'Effectué';
    }
    return 'En attente';
  }, []);

  const fetchFlights = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoadingFlights(true);
      let response = await fetch(`${API_BASE_URL}/flights/fast`, { signal });
      if (response.status === 404) response = await fetch(`${API_BASE_URL}/flights?weather=0`, { signal });
      if (!response.ok) throw new Error('Impossible de récupérer la liste des vols.');
      const data = await response.json();
      setFlights(Array.isArray(data) ? data.map((flight: Flight) => ({ ...flight, weatherPending: flight.weatherPending ?? flight.weatherSeverity == null })) : []);
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') addToast('error', error.message || 'Erreur réseau');
    } finally { setLoadingFlights(false); }
  }, [addToast]);

  const fetchFleet = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoadingFleet(true);
      const response = await fetch(`${API_BASE_URL}/fleet/aircrafts`, { signal });
      if (!response.ok) throw new Error('Impossible de récupérer la flotte.');
      const data = await response.json();
      setFleet(Array.isArray(data) ? data : []);
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') console.error('Erreur flotte :', error.message);
    } finally { setLoadingFleet(false); }
  }, []);

  const refreshWeatherSnapshot = useCallback(async (signal?: AbortSignal, silent = true) => {
    setIsWeatherRefreshing(true);
    if (!silent) setWeatherSyncError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/flights`, { signal });
      if (!response.ok) throw new Error(`Météo indisponible (HTTP ${response.status}).`);
      const data = await response.json();
      if (!Array.isArray(data)) return;
      const enrichedMap = new Map<string, Flight>(data.map((flight: Flight) => [flight.id, flight]));
      setFlights(current => current.map(flight => {
        const enriched = enrichedMap.get(flight.id);
        return enriched ? { ...flight, ...enriched, weatherPending: false } : flight;
      }));
      setWeatherLastUpdatedAt(new Date());
      setWeatherSyncError(null);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      if (!silent) setWeatherSyncError(error instanceof Error ? error.message : 'Météo indisponible.');
    } finally { setIsWeatherRefreshing(false); }
  }, []);

  const refreshWeatherAlerts = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${API_BASE_URL}/flights/weather-alerts?horizonHours=24`, { signal });
      if (!response.ok) throw new Error(`Alertes météo indisponibles (HTTP ${response.status}).`);
      const payload: WeatherAlertsResponse = await response.json();
      const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
      if (alerts.length > 0) {
        const alertMap = new Map(alerts.map(alert => [alert.flightId, alert]));
        setFlights(current => current.map(flight => {
          const alert = alertMap.get(flight.id);
          if (!alert) return flight;
          const ai = alert.weatherAI;
          return { ...flight, weatherPending: false, weatherAI: ai, weatherSeverity: ai.score ?? flight.weatherSeverity, weatherRiskLevel: ai.riskLevel ?? flight.weatherRiskLevel, weatherRiskLabel: ai.riskLabel ?? flight.weatherRiskLabel, weatherConfidence: ai.confidence ?? flight.weatherConfidence, weatherRecommendedAction: ai.recommendedAction ?? flight.weatherRecommendedAction, weatherRecommendedActionLabel: ai.recommendedActionLabel ?? flight.weatherRecommendedActionLabel, weatherUpdatedAt: ai.evaluatedAt ?? flight.weatherUpdatedAt };
        }));
      }
      if (payload.generatedAt) {
        const generatedAt = new Date(payload.generatedAt);
        if (!Number.isNaN(generatedAt.getTime())) setWeatherLastUpdatedAt(generatedAt);
      }
      setWeatherSyncError(null);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setWeatherSyncError('Les vols restent disponibles, mais la météo temps réel n’est pas à jour.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialize = async () => {
      await Promise.all([fetchFlights(controller.signal), fetchFleet(controller.signal)]);
      if (!controller.signal.aborted) void refreshWeatherSnapshot(controller.signal, true);
    };
    void initialize();
    return () => controller.abort();
  }, [fetchFlights, fetchFleet, refreshWeatherSnapshot]);

  useEffect(() => {
    const controller = new AbortController();
    const tick = () => { if (document.visibilityState !== 'visible') return; void refreshWeatherAlerts(controller.signal); };
    const intervalId = window.setInterval(tick, 60000);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => { controller.abort(); window.clearInterval(intervalId); document.removeEventListener('visibilitychange', onVisibilityChange); };
  }, [refreshWeatherAlerts]);

  const openEditModal = (flight: Flight) => { setEditingFlight(flight); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setEditingFlight(null); };

  const handleFormSubmit = async (formData: FlightFormData) => {
    try {
      setIsSubmitting(true);
      const isEdition = Boolean(editingFlight);
      const url = isEdition ? `${API_BASE_URL}/flights/${editingFlight!.id}` : `${API_BASE_URL}/flights`;
      const response = await fetch(url, {
        method: isEdition ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroVol: formData.numeroVol, aeroportDepart: formData.aeroportDepart, aeroportEscale: formData.aeroportEscale, dureeEscale: formData.dureeEscale, aeroportArrivee: formData.aeroportArrivee, heureDepart: formData.heureDepart, heureArrivee: formData.heureArrivee, avionId: formData.avionId || null, legs: formData.legs, status: isEdition ? formData.status || editingFlight!.status : formData.status || 'Planifié' }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Erreur serveur HTTP ${response.status}`);
      }
      await fetchFlights();
      void refreshWeatherSnapshot(undefined, true);
      closeModal();
      addToast('success', isEdition ? 'Vol mis à jour avec succès.' : 'Nouveau vol planifié avec succès.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      addToast('error', `Erreur d'enregistrement : ${message}`);
      throw error;
    } finally { setIsSubmitting(false); }
  };

  const confirmDeleteFlight = async () => {
    if (!deletingFlight) return;
    try {
      setIsDeleting(true);
      const response = await fetch(`${API_BASE_URL}/flights/${deletingFlight.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Erreur lors de la suppression sur le serveur.');
      setFlights(previous => previous.filter(flight => flight.id !== deletingFlight.id));
      addToast('success', `Le vol ${deletingFlight.flightNumber} a été supprimé.`);
      setDeletingFlight(null);
      setDeleteConfirmed(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      addToast('error', `Échec de la suppression : ${message}`);
    } finally { setIsDeleting(false); }
  };

  const formatDateRange = (departureStr: string, arrivalStr: string) => {
    const depDate = new Date(departureStr);
    const arrDate = new Date(arrivalStr);
    if (Number.isNaN(depDate.getTime()) || Number.isNaN(arrDate.getTime())) return <span className="text-xs italic text-slate-400">Dates non renseignées</span>;
    const formatDate = (date: Date) => `${date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    return (
      <div className="min-w-40">
        <div className="flex items-center gap-2">
          <div>
            <span className="block text-[10px] font-medium text-slate-400">Départ</span>
            <span className="whitespace-nowrap font-mono text-xs font-medium text-slate-700">{formatDate(depDate)}</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          <div>
            <span className="block text-[10px] font-medium text-slate-400">Arrivée</span>
            <span className="whitespace-nowrap font-mono text-xs font-medium text-slate-700">{formatDate(arrDate)}</span>
          </div>
        </div>
      </div>
    );
  };

  const mapStatusToModalFormat = (status?: FlightStatus): FlightFormData['status'] => {
    if (!status) return undefined;
    switch (status) {
      case 'Scheduled': case 'En attente': return 'Planifié';
      case 'On-Time': case 'Ponctuel': return 'Effectué';
      case 'In-Flight': return 'En Vol';
      case 'Delayed': return 'Retardé';
      case 'Cancelled': return 'Annulé';
      default: return status as FlightFormData['status'];
    }
  };

  const filteredFlights = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return flights.filter(flight => {
      const stops = normalizeStops(flight);
      const fullRoute = [flight.origin, ...stops, flight.destination].join('-').toLowerCase();
      const matchesSearch = !term || flight.flightNumber.toLowerCase().includes(term) || flight.origin.toLowerCase().includes(term) || flight.destination.toLowerCase().includes(term) || fullRoute.includes(term) || stops.some(stop => stop.toLowerCase().includes(term)) || flight.aircraftModel?.toLowerCase().includes(term);
      const matchesStatus = selectedStatusFilter === 'ALL' || getCalculatedStatus(flight) === selectedStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [flights, searchTerm, selectedStatusFilter, getCalculatedStatus]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, selectedStatusFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredFlights.length / pageSize));
  const paginatedFlights = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFlights.slice(start, start + pageSize);
  }, [filteredFlights, currentPage, pageSize]);

  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const stats = useMemo(() => {
    const statuses = flights.map(getCalculatedStatus);
    return {
      total: flights.length,
      inFlight: statuses.filter(status => status === 'En Vol').length,
      delayed: statuses.filter(status => status === 'Retardé').length,
      pending: statuses.filter(status => status === 'En attente').length,
    };
  }, [flights, getCalculatedStatus]);

  return (
    <div className="relative mx-auto max-w-375 space-y-6 pb-8 bg-slate-50/50 p-4 sm:p-6 min-h-screen">
      {/* TOASTS */}
      <div className="pointer-events-none fixed bottom-3 left-3 right-3 z-70 flex flex-col gap-2 sm:bottom-5 sm:left-auto sm:right-5 sm:w-full sm:max-w-md">
        {toasts.map(toast => (
          <div key={toast.id} className={`pointer-events-auto flex items-start justify-between gap-3 rounded-xl border bg-white p-4 shadow-lg ${toast.type === 'success' ? 'border-emerald-200' : toast.type === 'error' ? 'border-rose-200' : 'border-sky-200'}`}>
            <div className="flex min-w-0 items-start gap-3">
              <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-600' : toast.type === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600'}`}>
                {toast.type === 'success' && <CheckCircle2 className="h-3.5 w-3.5" />}
                {toast.type === 'error' && <XCircle className="h-3.5 w-3.5" />}
                {toast.type === 'info' && <AlertCircle className="h-3.5 w-3.5" />}
              </div>
              <p className="text-sm font-medium text-slate-700">{toast.message}</p>
            </div>
            <button type="button" onClick={() => removeToast(toast.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>

      {/* HEADER (Boutons d'action uniquement) */}
      <header className="flex flex-wrap items-center justify-end gap-3">
        <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${isWeatherRefreshing ? 'border-sky-200 bg-sky-50 text-sky-700' : weatherSyncError ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600'}`}>
          {isWeatherRefreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : weatherSyncError ? <AlertTriangle className="h-3.5 w-3.5" /> : <CloudRain className="h-3.5 w-3.5" />}
          Météo {weatherLastUpdatedAt ? `· ${weatherLastUpdatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '· en attente'}
        </div>
        <button type="button" onClick={() => void refreshWeatherSnapshot(undefined, false)} disabled={isWeatherRefreshing} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${isWeatherRefreshing ? 'animate-spin' : ''}`} /> Actualiser
        </button>
        <button type="button" onClick={() => { setEditingFlight(null); setIsModalOpen(true); }} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> Planifier un vol
        </button>
      </header>

      {/* KPI */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total rotations" value={stats.total} hint="Flotte active" icon={<Plane className="h-5 w-5" />} />
        <KpiCard label="En vol" value={stats.inFlight} hint="Maintenant" icon={<Globe className="h-5 w-5" />} />
        <KpiCard label="En attente" value={stats.pending} hint="À venir" icon={<Clock className="h-5 w-5" />} />
        <KpiCard label="Retardés" value={stats.delayed} hint="À surveiller" icon={<AlertCircle className="h-5 w-5" />} variant={stats.delayed > 0 ? 'warning' : 'default'} />
      </section>

      {/* TABLEAU / CARTES */}
      <section className={`${SURFACE} overflow-hidden`}>
        
        {/* SEARCH + FILTRES INTÉGRÉS */}
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[320px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Rechercher un vol, appareil..."
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                className={`h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 ${FOCUS_RING}`}
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:overflow-visible lg:pb-0">
              <span className="hidden items-center gap-1.5 text-xs font-medium text-slate-500 sm:inline-flex">
                <Filter className="h-3.5 w-3.5" />
                Filtrer :
              </span>
              {STATUS_FILTERS.map(filter => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setSelectedStatusFilter(filter.id)}
                  className={`h-8 shrink-0 rounded-full px-4 text-xs font-medium transition ${
                    selectedStatusFilter === filter.id
                      ? 'bg-emerald-600 text-white shadow-sm shadow-slate-900/20'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* EN-TÊTE DU TABLEAU */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-slate-900">
              Routes actives
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {filteredFlights.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className={`h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 ${FOCUS_RING}`}
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>
                  {size} lignes
                </option>
              ))}
            </select>
          </div>
        </header>

        {loadingFlights ? (
          <div className="space-y-2 p-5">{[1, 2, 3, 4, 5].map(item => <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-50" />)}</div>
        ) : filteredFlights.length === 0 ? (
          <div className="flex min-h-75 flex-col items-center justify-center p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400"><Plane className="h-5 w-5" /></div>
            <p className="mt-4 text-sm font-medium text-slate-900">Aucune rotation trouvée</p>
            <p className="mt-1 text-sm text-slate-500">Ajustez votre recherche ou réinitialisez les filtres.</p>
            {(searchTerm || selectedStatusFilter !== 'ALL') && (
              <button type="button" onClick={() => { setSearchTerm(''); setSelectedStatusFilter('ALL'); }} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><X className="h-3.5 w-3.5" />Réinitialiser</button>
            )}
          </div>
        ) : (
          <>
            {/* MOBILE */}
            <div className="space-y-3 bg-slate-50/50 p-4 sm:hidden">
              {paginatedFlights.map(flight => <MobileFlightCard key={flight.id} flight={flight} computedStatus={getCalculatedStatus(flight)} onEdit={openEditModal} onDelete={setDeletingFlight} />)}
            </div>

            {/* DESKTOP */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-250 border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">N° Vol</th>
                    <th className="px-4 py-3">Appareil</th>
                    <th className="px-4 py-3">Itinéraire</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Météo</th>
                    <th className="px-4 py-3">Chronologie</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedFlights.map(flight => {
                    const computedStatus = getCalculatedStatus(flight);
                    const isInFlight = computedStatus === 'En Vol';
                    const weather = getWeatherVisual(flight);
                    const weatherScore = flight.weatherAI?.score ?? flight.weatherSeverity;
                    const normalized = normalizeSeverity(weatherScore);
                    const severityPct = normalized == null ? 0 : Math.round(normalized * 100);

                    return (
                      <tr key={flight.id} className="group transition hover:bg-slate-50/50">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isInFlight ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
                              <Plane className={`h-4 w-4 ${isInFlight ? 'rotate-45' : ''}`} />
                            </div>
                            <span className="font-mono text-sm font-bold text-slate-900">{flight.flightNumber}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${flight.aircraft === 'NON ASSIGNÉ' || !flight.aircraft ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
                            {flight.aircraftModel || flight.aircraft || 'Non assigné'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <RouteBadge origin={flight.origin} destination={flight.destination} stops={normalizeStops(flight)} departure={flight.departure} arrival={flight.arrival} />
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[computedStatus].badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[computedStatus].dot} ${isInFlight ? 'animate-pulse' : ''}`} />
                            {computedStatus}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="min-w-35">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${weather.badge}`}>{weather.icon}{weather.label}</span>
                              <span className="font-mono text-[11px] font-medium text-slate-500">{formatWeatherPercent(weatherScore)}</span>
                            </div>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                              <div className={`h-full rounded-full transition-all ${weather.bar}`} style={{ width: `${severityPct}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {formatDateRange(flight.departure, flight.arrival)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => openEditModal(flight)} title="Modifier" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => { setDeleteConfirmed(false); setDeletingFlight(flight); }} title="Supprimer" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row">
                <p className="text-xs font-medium text-slate-500">
                  Affichage <span className="font-semibold text-slate-700">{(currentPage - 1) * pageSize + 1}</span> à <span className="font-semibold text-slate-700">{Math.min(currentPage * pageSize, filteredFlights.length)}</span> sur <span className="font-semibold text-slate-700">{filteredFlights.length}</span> vols
                </p>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40">
                    <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Précédent
                  </button>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).filter(page => {
                      if (totalPages <= 5) return true;
                      if (page === 1 || page === totalPages) return true;
                      return Math.abs(page - currentPage) <= 1;
                    }).map((page, index, array) => {
                      const previousPage = array[index - 1];
                      const showEllipsis = previousPage != null && page - previousPage > 1;
                      return (
                        <React.Fragment key={page}>
                          {showEllipsis && <span className="px-1 text-xs text-slate-400">…</span>}
                          <button type="button" onClick={() => setCurrentPage(page)} className={`h-8 min-w-8 rounded-md px-2 text-xs font-medium transition ${page === currentPage ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40">
                    Suivant <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* MODALE SUPPRESSION */}
      {deletingFlight && (
        <div className="fixed inset-0 z-80 flex items-end justify-center bg-slate-950/40 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full rounded-t-2xl border border-slate-100 bg-white p-6 shadow-xl sm:max-w-md sm:rounded-2xl" role="dialog" aria-modal="true">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900">Supprimer le vol <span className="font-mono">{deletingFlight.flightNumber}</span></h3>
                <p className="mt-1 text-sm text-slate-500">Cette action est définitive et retirera la rotation du planning.</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-2 font-mono text-sm font-semibold text-slate-800">
                <span>{deletingFlight.origin}</span><ArrowRight className="h-3.5 w-3.5 text-slate-400" /><span>{deletingFlight.destination}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatMobileDate(deletingFlight.departure)}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatMobileTime(deletingFlight.departure)} → {formatMobileTime(deletingFlight.arrival)}</span>
              </div>
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-rose-100 bg-rose-50/50 p-3 hover:bg-rose-50">
              <input type="checkbox" checked={deleteConfirmed} onChange={e => setDeleteConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500" />
              <span className="text-sm text-rose-800">Je confirme la suppression définitive de cette rotation.</span>
            </label>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" disabled={isDeleting} onClick={() => { setDeletingFlight(null); setDeleteConfirmed(false); }} className="h-10 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Annuler</button>
              <button type="button" disabled={isDeleting || !deleteConfirmed} onClick={confirmDeleteFlight} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isDeleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <FlightAddModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={handleFormSubmit}
        fleetAircrafts={fleet}
        isLoadingFleet={loadingFleet}
        initialData={editingFlight ? { numeroVol: editingFlight.flightNumber, aeroportDepart: editingFlight.origin, aeroportArrivee: editingFlight.destination, aeroportEscale: normalizeStops(editingFlight)[0] || undefined, dureeEscale: editingFlight.stopoverDurationMinutes ?? undefined, heureDepart: editingFlight.departure?.slice(0, 16) || '', heureArrivee: editingFlight.arrival?.slice(0, 16) || '', avionId: editingFlight.aircraft !== 'NON ASSIGNÉ' ? editingFlight.aircraft : '', status: mapStatusToModalFormat(editingFlight.status) } : undefined}
      />

      {isSubmitting && (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="text-sm font-medium text-slate-800">Synchronisation en cours...</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// KPI CARD
// ═══════════════════════════════════════════════════════════════
const KpiCard: React.FC<{ label: string; value: number; hint: string; icon: React.ReactNode; variant?: 'default' | 'warning'; }> = ({ label, value, hint, icon, variant = 'default' }) => {
  const isWarning = variant === 'warning';
  return (
    <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isWarning ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${isWarning ? 'text-amber-600' : 'text-slate-900'}`}>{value}</span>
        <span className="text-xs font-medium text-slate-400">{hint}</span>
      </div>
    </article>
  );
};

export default FlightsPlanning;