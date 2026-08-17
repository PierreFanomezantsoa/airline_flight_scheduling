import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  CalendarDays, 
  Plus, 
  Globe, 
  ArrowRight, 
  Trash2, 
  Edit2, 
  ShieldAlert, 
  Loader2, 
  Search, 
  Plane, 
  CheckCircle2, 
  AlertCircle,
  XCircle,
  Filter,
  X,
  Clock,
  MapPin,
  CloudRain,
  CloudLightning,
  Sun,
  RefreshCw,
  Cpu,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { FlightAddModal, type FlightFormData } from '../dashboard/FlightAddModal';

// --- TYPES & INTERFACES ---
export type FlightStatus = 
  | 'Scheduled' 
  | 'Delayed' 
  | 'In-Flight' 
  | 'Cancelled' 
  | 'On-Time' 
  | 'En attente'
  | 'Planifié' 
  | 'Retardé' 
  | 'En Vol' 
  | 'Annulé' 
  | 'Ponctuel'
  | 'Effectué';

export type NormalizedStatus = 'En attente' | 'Ponctuel' | 'Retardé' | 'En Vol' | 'Annulé' | 'Effectué';

type WeatherRiskLevel =
  | 'LOW'
  | 'MODERATE'
  | 'HIGH'
  | 'SEVERE'
  | 'EXTREME'
  | 'UNKNOWN'
  | 'SKIPPED';

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

  // Compatibilité backend : stopover peut être une chaîne CSV ou une liste.
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

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof globalThis !== 'undefined' &&
    (globalThis as any).process?.env?.REACT_APP_API_BASE_URL) ||
  'http://localhost:5000';

const normalizeStops = (flight: Flight): string[] => {
  if (Array.isArray(flight.stops)) {
    return flight.stops.filter(Boolean);
  }

  if (Array.isArray(flight.stopover)) {
    return flight.stopover
      .map((value) => String(value).trim().toUpperCase())
      .filter(Boolean);
  }

  if (typeof flight.stopover === 'string') {
    return flight.stopover
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
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

const getWeatherVisual = (flight: Flight) => {
  const ai = flight.weatherAI;
  const level = ai?.riskLevel ?? flight.weatherRiskLevel;

  if (flight.weatherPending && !ai) {
    return {
      label: 'Analyse...',
      icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />,
      badge: 'border-slate-200 bg-slate-50 text-slate-500',
      bar: 'bg-slate-300',
    };
  }

  if (ai?.dataAvailable === false || level === 'UNKNOWN') {
    return {
      label: 'Indisponible',
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      badge: 'border-slate-200 bg-slate-100 text-slate-600',
      bar: 'bg-slate-400',
    };
  }

  if (level === 'EXTREME') {
    return {
      label: ai?.riskLabel || 'Extrême',
      icon: <CloudLightning className="h-3.5 w-3.5" />,
      badge: 'border-rose-200 bg-rose-50 text-rose-700',
      bar: 'bg-rose-500',
    };
  }

  if (level === 'SEVERE' || level === 'HIGH') {
    return {
      label: ai?.riskLabel || 'Élevé',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      badge: 'border-orange-200 bg-orange-50 text-orange-700',
      bar: 'bg-orange-500',
    };
  }

  if (level === 'MODERATE') {
    return {
      label: ai?.riskLabel || 'Modéré',
      icon: <CloudRain className="h-3.5 w-3.5" />,
      badge: 'border-amber-200 bg-amber-50 text-amber-700',
      bar: 'bg-amber-500',
    };
  }

  if (level === 'LOW') {
    return {
      label: ai?.riskLabel || 'Faible',
      icon: <Sun className="h-3.5 w-3.5" />,
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      bar: 'bg-emerald-600',
    };
  }

  const severity = normalizeSeverity(flight.weatherSeverity);

  if (severity == null) {
    return {
      label: 'Non évalué',
      icon: <Cpu className="h-3.5 w-3.5" />,
      badge: 'border-slate-200 bg-slate-50 text-slate-500',
      bar: 'bg-slate-300',
    };
  }

  if (severity >= 0.92) {
    return {
      label: 'Extrême',
      icon: <CloudLightning className="h-3.5 w-3.5" />,
      badge: 'border-rose-200 bg-rose-50 text-rose-700',
      bar: 'bg-rose-500',
    };
  }

  if (severity >= 0.70) {
    return {
      label: 'Élevé',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      badge: 'border-orange-200 bg-orange-50 text-orange-700',
      bar: 'bg-orange-500',
    };
  }

  if (severity >= 0.45) {
    return {
      label: 'Modéré',
      icon: <CloudRain className="h-3.5 w-3.5" />,
      badge: 'border-amber-200 bg-amber-50 text-amber-700',
      bar: 'bg-amber-500',
    };
  }

  return {
    label: 'Faible',
    icon: <Sun className="h-3.5 w-3.5" />,
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    bar: 'bg-emerald-600',
  };
};

// --- HELPER DURÉE DE VOL ---
const calculateDuration = (departureStr: string, arrivalStr: string): string | null => {
  const dep = new Date(departureStr);
  const arr = new Date(arrivalStr);
  if (isNaN(dep.getTime()) || isNaN(arr.getTime())) return null;

  const diffMs = arr.getTime() - dep.getTime();
  if (diffMs <= 0) return null;

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

// --- COMPOSANT ITINÉRAIRE AVEC ESCALES ---
const RouteBadge: React.FC<{ 
  origin: string; 
  destination: string; 
  stops?: string[]; 
  departure: string; 
  arrival: string; 
}> = ({ origin, destination, stops = [], departure, arrival }) => {
  const duration = calculateDuration(departure, arrival);
  const hasStops = stops && stops.length > 0;

  return (
    <div className="flex flex-col gap-1.5 items-start">
      {/* Container de la route principale et escales */}
      <div className="inline-flex items-center gap-1.5 bg-slate-900 text-white font-mono font-black text-xs px-3 py-1.5 rounded-xl shadow-xs border border-slate-800 flex-wrap">
        {/* Origine */}
        <span className="tracking-widest text-emerald-400">{origin}</span>

        {/* Parcours avec escales */}
        {hasStops ? (
          stops.map((stop, index) => (
            <React.Fragment key={`${stop}-${index}`}>
              <ArrowRight className="h-3 w-3 text-slate-500 shrink-0" />
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                <MapPin className="h-2.5 w-2.5 text-amber-400" />
                {stop}
              </span>
            </React.Fragment>
          ))
        ) : null}

        <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />

        {/* Destination */}
        <span className="tracking-widest text-sky-400">{destination}</span>
      </div>

      {/* Informations complémentaires (Durée + Nombre d'escales) */}
      <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500 pl-1">
        {duration && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3 text-slate-400" />
            {duration}
          </span>
        )}
        {hasStops ? (
          <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/60">
            {stops.length} escale{stops.length > 1 ? 's' : ''} ({stops.join(', ')})
          </span>
        ) : (
          <span className="text-slate-400">Direct</span>
        )}
      </div>
    </div>
  );
};

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

  // Modal suppression
  const [deletingFlight, setDeletingFlight] = useState<Flight | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Filtres
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  // --- TOASTS ---
  const addToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => [...prev, { id, type, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // --- STATUT ---
  const getCalculatedStatus = useCallback((flight: Flight): NormalizedStatus => {
    const rawStatus = flight.status;

    // Le backend reste la source de vérité.
    if (['Cancelled', 'Annulé'].includes(rawStatus)) return 'Annulé';
    if (['Delayed', 'Retardé'].includes(rawStatus)) return 'Retardé';
    if (['In-Flight', 'En Vol'].includes(rawStatus)) return 'En Vol';
    if (rawStatus === 'Effectué') return 'Effectué';
    if (['On-Time', 'Ponctuel'].includes(rawStatus)) return 'Ponctuel';
    if (['Scheduled', 'Planifié', 'En attente'].includes(rawStatus)) return 'En attente';

    // Fallback temporel uniquement si le serveur renvoie un statut inconnu.
    const now = new Date();
    const depDate = new Date(flight.departure);
    const arrDate = new Date(flight.arrival);

    if (!isNaN(depDate.getTime()) && !isNaN(arrDate.getTime())) {
      if (now < depDate) return 'En attente';
      if (now >= depDate && now <= arrDate) return 'En Vol';
      if (now > arrDate) return 'Effectué';
    }

    return 'En attente';
  }, []);

  const getStatusBadge = (status: NormalizedStatus) => {
    const styles: Record<NormalizedStatus, string> = {
      'En attente': 'bg-sky-50 text-sky-700 border-sky-200/80',
      'Ponctuel': 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      'Retardé': 'bg-amber-50 text-amber-700 border-amber-200/80',
      'En Vol': 'bg-teal-50 text-teal-800 border-teal-200/80',
      'Annulé': 'bg-rose-50 text-rose-700 border-rose-200/80 line-through',
      'Effectué': 'bg-slate-100 text-slate-600 border-slate-200/80',
    };
    return styles[status] || 'bg-slate-50 text-slate-700 border-slate-200';
  };

  // --- REQUÊTES ---
  const fetchFlights = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoadingFlights(true);

      // Première peinture rapide : aucun appel météo.
      let res = await fetch(`${API_BASE_URL}/flights/fast`, { signal });

      // Compatibilité si l'ancien backend est encore actif.
      if (res.status === 404) {
        res = await fetch(`${API_BASE_URL}/flights?weather=0`, { signal });
      }

      if (!res.ok) {
        throw new Error('Impossible de récupérer la liste des vols.');
      }

      const data = await res.json();

      setFlights(
        Array.isArray(data)
          ? data.map((flight: Flight) => ({
              ...flight,
              weatherPending:
                flight.weatherPending ??
                flight.weatherSeverity == null,
            }))
          : [],
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        addToast('error', err.message || 'Erreur réseau');
      }
    } finally {
      setLoadingFlights(false);
    }
  }, [addToast]);

  const fetchFleet = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoadingFleet(true);
      const res = await fetch(`${API_BASE_URL}/fleet/aircrafts`, { signal });
      if (!res.ok) throw new Error('Impossible de récupérer la flotte.');
      const data = await res.json();
      setFleet(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error("Erreur flotte :", err.message);
      }
    } finally {
      setLoadingFleet(false);
    }
  }, []);

  const refreshWeatherSnapshot = useCallback(
    async (signal?: AbortSignal, silent = true) => {
      setIsWeatherRefreshing(true);

      if (!silent) {
        setWeatherSyncError(null);
      }

      try {
        const res = await fetch(`${API_BASE_URL}/flights`, { signal });

        if (!res.ok) {
          throw new Error(`Météo indisponible (HTTP ${res.status}).`);
        }

        const data = await res.json();

        if (!Array.isArray(data)) return;

        const enrichedMap = new Map<string, Flight>(
          data.map((flight: Flight) => [flight.id, flight]),
        );

        setFlights((current) =>
          current.map((flight) => {
            const enriched = enrichedMap.get(flight.id);
            return enriched
              ? { ...flight, ...enriched, weatherPending: false }
              : flight;
          }),
        );

        setWeatherLastUpdatedAt(new Date());
        setWeatherSyncError(null);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;

        console.error('Erreur météo complète :', err);

        if (!silent) {
          setWeatherSyncError(
            err instanceof Error
              ? err.message
              : 'Météo indisponible.',
          );
        }
      } finally {
        setIsWeatherRefreshing(false);
      }
    },
    [],
  );

  const refreshWeatherAlerts = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/flights/weather-alerts?horizonHours=24`,
        { signal },
      );

      if (!res.ok) {
        throw new Error(`Alertes météo indisponibles (HTTP ${res.status}).`);
      }

      const payload: WeatherAlertsResponse = await res.json();
      const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];

      if (alerts.length > 0) {
        const alertMap = new Map(
          alerts.map((alert) => [alert.flightId, alert]),
        );

        setFlights((current) =>
          current.map((flight) => {
            const alert = alertMap.get(flight.id);
            if (!alert) return flight;

            const ai = alert.weatherAI;

            return {
              ...flight,
              weatherPending: false,
              weatherAI: ai,
              weatherSeverity: ai.score ?? flight.weatherSeverity,
              weatherRiskLevel: ai.riskLevel ?? flight.weatherRiskLevel,
              weatherRiskLabel: ai.riskLabel ?? flight.weatherRiskLabel,
              weatherConfidence: ai.confidence ?? flight.weatherConfidence,
              weatherRecommendedAction:
                ai.recommendedAction ?? flight.weatherRecommendedAction,
              weatherRecommendedActionLabel:
                ai.recommendedActionLabel ??
                flight.weatherRecommendedActionLabel,
              weatherUpdatedAt:
                ai.evaluatedAt ?? flight.weatherUpdatedAt,
            };
          }),
        );
      }

      if (payload.generatedAt) {
        const generatedAt = new Date(payload.generatedAt);
        if (!Number.isNaN(generatedAt.getTime())) {
          setWeatherLastUpdatedAt(generatedAt);
        }
      }

      setWeatherSyncError(null);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;

      console.error('Erreur alertes météo :', err);
      setWeatherSyncError(
        'Les vols restent disponibles, mais la météo temps réel n’est pas à jour.',
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const initialize = async () => {
      await Promise.all([
        fetchFlights(controller.signal),
        fetchFleet(controller.signal),
      ]);

      if (!controller.signal.aborted) {
        void refreshWeatherSnapshot(controller.signal, true);
      }
    };

    initialize();

    return () => controller.abort();
  }, [fetchFlights, fetchFleet, refreshWeatherSnapshot]);

  useEffect(() => {
    const controller = new AbortController();

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshWeatherAlerts(controller.signal);
    };

    const intervalId = window.setInterval(tick, 60_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      );
    };
  }, [refreshWeatherAlerts]);

  // --- MUTATIONS ---
  const handleFormSubmit = async (formData: FlightFormData) => {
    try {
      setIsSubmitting(true);
      const isEdition = !!editingFlight;
      const url = isEdition ? `${API_BASE_URL}/flights/${editingFlight.id}` : `${API_BASE_URL}/flights`;
      const method = isEdition ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numeroVol: formData.numeroVol,
          aeroportDepart: formData.aeroportDepart,
          aeroportEscale: formData.aeroportEscale,
          dureeEscale: formData.dureeEscale,
          aeroportArrivee: formData.aeroportArrivee,
          heureDepart: formData.heureDepart,
          heureArrivee: formData.heureArrivee,
          avionId: formData.avionId || null,
          legs: formData.legs,
          status: isEdition
            ? (formData.status || editingFlight.status)
            : (formData.status || 'Planifié')
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Erreur serveur HTTP ${res.status}`);
      }

      await fetchFlights();
      void refreshWeatherSnapshot(undefined, true);
      closeModal();
      addToast(
        'success',
        isEdition
          ? 'Vol mis à jour avec succès.'
          : 'Nouveau vol planifié avec succès.',
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Erreur inconnue';

      addToast('error', `Erreur d'enregistrement : ${message}`);

      // Important : la modale peut personnaliser l'erreur
      // (numéro de vol dupliqué, conflit avion, etc.).
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteFlight = async () => {
    if (!deletingFlight) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`${API_BASE_URL}/flights/${deletingFlight.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Erreur lors de la suppression sur le serveur.");
      
      setFlights(prev => prev.filter(f => f.id !== deletingFlight.id));
      addToast('success', `Le vol ${deletingFlight.flightNumber} a été supprimé.`);
      setDeletingFlight(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      addToast('error', `Échec de la suppression : ${message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditModal = (flight: Flight) => {
    setEditingFlight(flight);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingFlight(null);
  };

  const formatDateRange = (departureStr: string, arrivalStr: string) => {
    const depDate = new Date(departureStr);
    const arrDate = new Date(arrivalStr);
    
    if (isNaN(depDate.getTime()) || isNaN(arrDate.getTime())) {
      return <span className="text-slate-400 italic">Dates non renseignées</span>;
    }

    return (
      <div className="inline-flex items-center gap-2 font-mono text-xs bg-teal-50/50 border border-teal-100 px-2.5 py-1 rounded-lg text-slate-700">
        <div className="flex items-center gap-1">
          <span className="text-slate-400 font-sans text-[11px]">
            {depDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
          </span>
          <span className="font-bold text-slate-900">
            {depDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <ArrowRight className="h-3 w-3 text-teal-500 shrink-0" />
        <div className="flex items-center gap-1">
          <span className="font-bold text-slate-900">
            {arrDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="text-slate-400 font-sans text-[11px]">
            {arrDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
          </span>
        </div>
      </div>
    );
  };

  const mapStatusToModalFormat = (status?: FlightStatus): FlightFormData['status'] => {
    if (!status) return undefined;
    switch (status) {
      case 'Scheduled':
      case 'En attente':
        return 'Planifié';
      case 'On-Time':
      case 'Ponctuel':
        return 'Effectué';
      case 'In-Flight':
        return 'En Vol';
      case 'Delayed':
        return 'Retardé';
      case 'Cancelled':
        return 'Annulé';
      default:
        return status as FlightFormData['status'];
    }
  };

  // --- FILTRES & KPIS (INCLUT RECHERCHE AVEC ESCALES) ---
  const filteredFlights = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return flights.filter(flight => {
      const normalizedStops = normalizeStops(flight);
      const fullRoute = [
        flight.origin,
        ...normalizedStops,
        flight.destination,
      ]
        .join('-')
        .toLowerCase();

      const stopsMatch = normalizedStops.some((stop) =>
        stop.toLowerCase().includes(term),
      );
      
      const matchesSearch = 
        !term ||
        flight.flightNumber.toLowerCase().includes(term) ||
        flight.origin.toLowerCase().includes(term) ||
        flight.destination.toLowerCase().includes(term) ||
        fullRoute.includes(term) ||
        stopsMatch ||
        flight.aircraftModel?.toLowerCase().includes(term);

      const computedStatus = getCalculatedStatus(flight);
      const matchesStatus = selectedStatusFilter === 'ALL' || computedStatus === selectedStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [flights, searchTerm, selectedStatusFilter, getCalculatedStatus]);

  const stats = useMemo(() => {
    const computedStatuses = flights.map(f => getCalculatedStatus(f));
    return {
      total: flights.length,
      inFlight: computedStatuses.filter(s => s === 'En Vol').length,
      delayed: computedStatuses.filter(s => s === 'Retardé').length,
      pending: computedStatuses.filter(s => s === 'En attente').length,
      onTime: computedStatuses.filter(s => s === 'Ponctuel').length,
      completed: computedStatuses.filter(s => s === 'Effectué').length,
    };
  }, [flights, getCalculatedStatus]);

  return (
    <div className="space-y-6 max-w-375 mx-auto pb-8 relative">
      
      {/* TOASTS */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between p-4 rounded-xl border shadow-lg transition-all transform animate-in slide-in-from-bottom-5 duration-200 ${
              toast.type === 'success'
                ? 'bg-emerald-950 text-white border-emerald-500/40'
                : toast.type === 'error'
                ? 'bg-rose-950 text-white border-rose-500/40'
                : 'bg-teal-950 text-white border-teal-500/40'
            }`}
          >
            <div className="flex items-center gap-3">
              {toast.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />}
              {toast.type === 'error' && <XCircle className="h-5 w-5 text-rose-400 shrink-0" />}
              {toast.type === 'info' && <AlertCircle className="h-5 w-5 text-teal-400 shrink-0" />}
              <p className="text-xs font-semibold">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer ml-3"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white border border-slate-200/80 p-5 sm:p-6 rounded-2xl gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl border border-teal-200/60">
              <CalendarDays className="h-5 w-5" />
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase">
              Ordonnancement et  Régulation des Vols
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Gérez vos rotations aériennes, assignations de flotte et contraintes horaires en temps réel.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              {isWeatherRefreshing ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : weatherSyncError ? (
                <AlertTriangle className="h-3 w-3 text-amber-600" />
              ) : (
                <CloudRain className="h-3 w-3 text-emerald-700" />
              )}

              météo{' '}
              {weatherLastUpdatedAt
                ? weatherLastUpdatedAt.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'en attente'}
            </span>

            {weatherSyncError && (
              <span className="text-amber-600">
                {weatherSyncError}
              </span>
            )}
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() =>
              void refreshWeatherSnapshot(undefined, false)
            }
            disabled={isWeatherRefreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                isWeatherRefreshing ? 'animate-spin' : ''
              }`}
            />
            Météo
          </button>

          <button
            onClick={() => {
              setEditingFlight(null);
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-emerald-700/20 transition-all hover:bg-emerald-800 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 text-emerald-200" />
            Planifier
          </button>
        </div>
      </div>

      {/* KPIS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Rotations</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{stats.total}</p>
          </div>
          <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl border border-teal-100">
            <Plane className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">En Vol</p>
            <p className="text-2xl font-black text-teal-800 mt-0.5">{stats.inFlight}</p>
          </div>
          <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl border border-teal-100">
            <Globe className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">En Attente</p>
            <p className="text-2xl font-black text-sky-700 mt-0.5">{stats.pending}</p>
          </div>
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl border border-sky-100">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Retardés</p>
            <p className="text-2xl font-black text-amber-700 mt-0.5">{stats.delayed}</p>
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
            <AlertCircle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* RECHERCHE ET FILTRES */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher vol, appareil, escale (ex: TNR-DIE-PAR)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <Filter className="h-3.5 w-3.5 text-slate-400 ml-1 mr-1 shrink-0" />
          {[
            { id: 'ALL', label: 'Tous' },
            { id: 'En attente', label: 'En attente' },
            { id: 'Ponctuel', label: 'Ponctuels' },
            { id: 'En Vol', label: 'En Vol' },
            { id: 'Retardé', label: 'Retardés' },
            { id: 'Annulé', label: 'Annulés' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedStatusFilter === f.id
                  ? 'bg-emerald-700 text-white shadow-xs shadow-emerald-700/20'
                  : 'bg-slate-50 text-slate-600 hover:bg-teal-50/50 hover:text-teal-900 border border-slate-200/60'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* TABLEAU */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-xs">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-slate-500">
            <Globe className="h-4 w-4 text-teal-600" /> Routes Actives et État Opérationnel
          </h3>
          <span className="text-xs font-bold text-slate-400">
            {filteredFlights.length} vol{filteredFlights.length > 1 ? 's' : ''} affiché{filteredFlights.length > 1 ? 's' : ''}
          </span>
        </div>

        {loadingFlights ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-12 w-full bg-slate-50/80 animate-pulse rounded-xl border border-slate-100" />
            ))}
          </div>
        ) : filteredFlights.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto text-teal-600">
              <Plane className="h-6 w-6" />
            </div>
            <p className="text-xs font-bold text-slate-500">Aucune rotation ne correspond à vos critères.</p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              Ajustez vos mots-clés de recherche ou vos filtres de statut pour afficher d'autres vols.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/60 bg-slate-50/80 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-6">N° Vol</th>
                  <th className="py-3.5 px-4">Appareil</th>
                  <th className="py-3.5 px-4">Itinéraire &amp; Escales</th>
                  <th className="py-3.5 px-4">Statut</th>
                  <th className="py-3.5 px-4">Météo</th>
                  <th className="py-3.5 px-4">Chronologie (UTC)</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredFlights.map((flight) => {
                  const computedStatus = getCalculatedStatus(flight);
                  const isInFlight = computedStatus === 'En Vol';
                  const weatherVisual = getWeatherVisual(flight);
                  const weatherScore =
                    flight.weatherAI?.score ??
                    flight.weatherSeverity;
                  const severityPct =
                    normalizeSeverity(weatherScore) == null
                      ? null
                      : Math.round(
                          normalizeSeverity(weatherScore)! * 100,
                        );

                  return (
                    <tr 
                      key={flight.id} 
                      className="hover:bg-teal-50/20 transition-colors duration-150"
                    >
                      {/* Numéro de Vol */}
                      <td className="py-4 px-6 font-mono font-black text-slate-900 text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg shrink-0 border ${
                            isInFlight 
                              ? 'bg-teal-50 text-teal-700 border-teal-200' 
                              : 'bg-slate-100 text-slate-600 border-slate-200/60'
                          }`}>
                            <Plane className={`h-3.5 w-3.5 ${isInFlight ? 'rotate-45' : ''}`} />
                          </div>
                          <span>{flight.flightNumber}</span>
                        </div>
                      </td>

                      {/* Appareil */}
                      <td className="py-4 px-4">
                        <span className="inline-block rounded-md bg-slate-100 border border-slate-200/80 px-2 py-1 text-[11px] font-extrabold text-slate-600 uppercase tracking-wide">
                          {flight.aircraftModel || flight.aircraft || "Non assigné"}
                        </span>
                      </td>

                      {/* Itinéraire avec Escales */}
                      <td className="py-4 px-4">
                        <RouteBadge 
                          origin={flight.origin} 
                          destination={flight.destination}
                          stops={normalizeStops(flight)}
                          departure={flight.departure}
                          arrival={flight.arrival}
                        />
                      </td>

                      {/* Statut */}
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${getStatusBadge(computedStatus)}`}>
                          {isInFlight && <span className="h-1.5 w-1.5 rounded-full bg-teal-600 animate-ping" />}
                          {computedStatus}
                        </span>
                      </td>

                      {/* Météo IA */}
                      <td className="py-4 px-4">
                        <div className="min-w-[155px] space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${weatherVisual.badge}`}
                            >
                              {weatherVisual.icon}
                              {weatherVisual.label}
                            </span>

                            <span className="font-mono text-[10px] font-black text-slate-600">
                              {formatWeatherPercent(weatherScore)}
                            </span>
                          </div>

                          <div className="h-1.5 w-full overflow-hidden rounded-full border border-slate-200/60 bg-slate-100">
                            <div
                              className={`h-full transition-all duration-300 ${weatherVisual.bar}`}
                              style={{
                                width:
                                  severityPct == null
                                    ? '0%'
                                    : `${severityPct}%`,
                              }}
                            />
                          </div>

                          {flight.weatherAI?.recommendedAction &&
                            !['NORMAL', 'NONE'].includes(
                              flight.weatherAI.recommendedAction,
                            ) && (
                              <div className="flex items-start gap-1 text-[9px] font-bold leading-4 text-slate-500">
                                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-emerald-700" />
                                <span>
                                  {flight.weatherAI
                                    .recommendedActionLabel ||
                                    'Surveillance renforcée'}
                                </span>
                              </div>
                            )}
                        </div>
                      </td>

                      {/* Chronologie (UTC) */}
                      <td className="py-4 px-4">
                        {formatDateRange(flight.departure, flight.arrival)}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            onClick={() => openEditModal(flight)} 
                            className="rounded-xl p-2 text-slate-400 hover:bg-teal-50 hover:text-teal-700 transition border border-transparent hover:border-teal-200/80 cursor-pointer"
                            title="Modifier la programmation"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => setDeletingFlight(flight)} 
                            className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition border border-transparent hover:border-rose-200/60 cursor-pointer"
                            title="Supprimer la rotation"
                          >
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
        )}
      </div>

      {/* MODAL SUPPRESSION */}
      {deletingFlight && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-200/60 shrink-0">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                  Suppression du vol {deletingFlight.flightNumber}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Êtes-vous sûr de vouloir supprimer définitivement ce vol ({deletingFlight.origin} ➔ {deletingFlight.destination}) ? Cette action est irréversible.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingFlight(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteFlight}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-[0.98] transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Suppression...
                  </>
                ) : (
                  'Confirmer la suppression'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT / ADD */}
      <FlightAddModal 
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={handleFormSubmit}
        fleetAircrafts={fleet}
        isLoadingFleet={loadingFleet}
        initialData={editingFlight ? {
          numeroVol: editingFlight.flightNumber,
          aeroportDepart: editingFlight.origin,
          aeroportArrivee: editingFlight.destination,
          aeroportEscale:
            normalizeStops(editingFlight)[0] || undefined,
          dureeEscale:
            editingFlight.stopoverDurationMinutes ?? undefined,
          heureDepart: editingFlight.departure?.slice(0, 16) || '', 
          heureArrivee: editingFlight.arrival?.slice(0, 16) || '',
          avionId: (editingFlight.aircraft !== 'NON ASSIGNÉ' ? editingFlight.aircraft : '') || '',
          status: mapStatusToModalFormat(editingFlight.status)
        } : undefined}
      />

      {/* OVERLAY SYNCHRO */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white p-5 rounded-2xl shadow-xl flex items-center gap-3.5 border border-slate-200">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-700" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Synchronisation réseau en cours...</span>
          </div>
        </div>
      )}

    </div>
  );
};