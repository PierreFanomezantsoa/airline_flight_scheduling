import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Plane, Filter, Clock, BarChart3, X, Cpu, Activity, 
  Plus, AlertCircle, RefreshCw, Sun, CloudRain, CloudLightning, 
  CheckCircle2, ArrowRight, ShieldAlert, Sparkles, AlertTriangle 
} from 'lucide-react';
import { FlightAddModal } from './FlightAddModal';

const API_BASE_URL = 'http://localhost:5000';
const UNASSIGNED_AIRCRAFT = 'NON ASSIGNÉ';

type FlightStatus = 'Scheduled' | 'Delayed' | 'Cancelled' | 'In-Flight' | 'Effectué';

interface Flight {
  id: string;
  flightNumber: string;
  aircraft: string;
  aircraftModel: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  status: FlightStatus;
  weatherSeverity: number;
}

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

interface AircraftData {
  id: string;
  model: string;
}

export interface FlightFormData {
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart: string;
  heureArrivee: string;
  avionId?: string;
}

export const DashboardGantt: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [filterDelayed, setFilterDelayed] = useState<boolean>(false);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [fleetAircrafts, setFleetAircrafts] = useState<AircraftData[]>([]);
  const [isLoadingFleet, setIsLoadingFleet] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);

  // Formatage propre des dates
  const formatDateTime = useCallback((dateString: string) => {
    if (!dateString) return '--/-- --:--';
    if (/^\d{2}:\d{2}$/.test(dateString)) return dateString;

    const parsedDate = new Date(dateString);
    if (isNaN(parsedDate.getTime())) return dateString;

    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsedDate);
  }, []);

  // Fermeture des modales avec la touche Échap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedFlight(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Chargement des données
  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setIsLoadingFleet(true);
      setGlobalError(null);

      const [resFlights, resAnalytics, aircraftsData] = await Promise.all([
        fetch(`${API_BASE_URL}/flights`, { signal }).then((res) => {
          if (!res.ok) throw new Error(`Erreur API Vols : statut ${res.status}`);
          return res.json();
        }),
        fetch(`${API_BASE_URL}/flights/analytics`, { signal }).then((res) => (res.ok ? res.json() : null)),
        fetch(`${API_BASE_URL}/fleet/aircrafts`, { signal }).then((res) => (res.ok ? res.json() : [])),
      ]);

      const flightsList = Array.isArray(resFlights) ? resFlights : [];
      setFlights(flightsList);

      if (resAnalytics) {
        setAnalytics({
          ...resAnalytics,
          metrics: {
            ...resAnalytics.metrics,
            effectueCount: resAnalytics.metrics.effectueCount ?? 
              flightsList.filter((f: Flight) => f.status === 'Effectué').length
          }
        });
      }
      setFleetAircrafts(Array.isArray(aircraftsData) ? aircraftsData : []);
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return;
      console.error("Erreur d'appel API :", e);
      setGlobalError((e as Error).message || "Impossible de se connecter au serveur central.");
      setFlights([]);
    } finally {
      setLoading(false);
      setIsLoadingFleet(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  // Déclencheur IA
  const triggerPredictionIA = async () => {
    setLoading(true);
    setGlobalError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/flights/optimize`, { method: 'POST' });
      if (response.ok) {
        await loadData();
      } else {
        const errData = await response.json();
        setGlobalError(errData.message || "Le moteur IA a rencontré une anomalie.");
      }
    } catch (e) {
      console.error("Erreur optimisation IA:", e);
      setGlobalError("Erreur réseau lors de la communication avec le moteur d'optimisation.");
    } finally {
      setLoading(false);
    }
  };

  // Création de vol
  const handleCreateFlightSubmit = async (formData: FlightFormData) => {
    try {
      setGlobalError(null);
      const response = await fetch(`${API_BASE_URL}/flights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          heureDepart: new Date(formData.heureDepart).toISOString(),
          heureArrivee: new Date(formData.heureArrivee).toISOString(),
          avionId: formData.avionId || undefined,
        }),
      });

      if (response.ok) {
        setIsAddModalOpen(false);
        await loadData();
      } else {
        const errorData = await response.json();
        setGlobalError(errorData.message || 'Impossible de créer le vol.');
      }
    } catch (error) {
      console.error("Erreur lors de la création du vol", error);
      setGlobalError("Erreur réseau lors de la création du vol.");
    }
  };

  const filteredFlights = useMemo(() => {
    return filterDelayed ? flights.filter((f) => f.status === 'Delayed') : flights;
  }, [flights, filterDelayed]);

  const ganttRows = useMemo(() => {
    return Array.from(new Set(filteredFlights.map((f) => f.aircraft)));
  }, [filteredFlights]);

  const weatherConfig = useMemo(() => ({
    critical: {
      icon: <CloudLightning className="h-3.5 w-3.5 text-rose-500 animate-pulse" />,
      text: "Critique",
      bg: "bg-rose-50 text-rose-700 border-rose-100"
    },
    unstable: {
      icon: <CloudRain className="h-3.5 w-3.5 text-amber-500" />,
      text: "Instable",
      bg: "bg-amber-50 text-amber-700 border-amber-100"
    },
    favorable: {
      icon: <Sun className="h-3.5 w-3.5 text-emerald-500" />,
      text: "Favorable",
      bg: "bg-emerald-50 text-emerald-700 border-emerald-100"
    }
  }), []);

  const getWeatherIndicator = useCallback((severity: number) => {
    const sev = severity ?? 0.1;
    if (sev >= 0.7) return weatherConfig.critical;
    if (sev >= 0.4) return weatherConfig.unstable;
    return weatherConfig.favorable;
  }, [weatherConfig]);

  const statusStylesConfig = useMemo(() => ({
    Delayed: { 
      bg: 'bg-white border-slate-200 border-l-4 border-l-amber-500 hover:border-slate-300 hover:shadow-lg hover:shadow-amber-500/5', 
      accent: 'bg-amber-500', 
      badge: 'bg-amber-50 text-amber-800 border-amber-200', 
      label: 'Retardé' 
    },
    Cancelled: { 
      bg: 'bg-white border-slate-200 border-l-4 border-l-rose-500 hover:border-slate-300 hover:shadow-lg hover:shadow-rose-500/5', 
      accent: 'bg-rose-500', 
      badge: 'bg-rose-50 text-rose-800 border-rose-200', 
      label: 'Annulé' 
    },
    'In-Flight': { 
      bg: 'bg-white border-slate-200 border-l-4 border-l-blue-500 hover:border-slate-300 hover:shadow-lg hover:shadow-blue-500/5', 
      accent: 'bg-blue-500', 
      badge: 'bg-blue-50 text-blue-800 border-blue-200', 
      label: 'En Vol' 
    },
    Scheduled: { 
      bg: 'bg-white border-slate-200 border-l-4 border-l-emerald-500 hover:border-slate-300 hover:shadow-lg hover:shadow-emerald-500/5', 
      accent: 'bg-emerald-500', 
      badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', 
      label: 'Ponctuel' 
    },
    Effectué: { 
      bg: 'bg-white border-slate-200 border-l-4 border-l-slate-400 hover:border-slate-300 hover:shadow-md opacity-85 hover:opacity-100', 
      accent: 'bg-slate-400', 
      badge: 'bg-slate-100 text-slate-700 border-slate-200', 
      label: 'Effectué' 
    },
  }), []);

  const getStatusStyles = useCallback((status: FlightStatus) => {
    return statusStylesConfig[status] || statusStylesConfig.Scheduled;
  }, [statusStylesConfig]);

  const kpiItems = useMemo(() => {
    if (!analytics) return [];
    return [
      { label: 'Ponctuels', count: analytics.metrics.onTimeCount, color: 'bg-emerald-500', badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200/50' },
      { label: 'Effectués', count: analytics.metrics.effectueCount, color: 'bg-slate-400', badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200/60' },
      { label: 'Retardés', count: analytics.metrics.delayedCount, color: 'bg-amber-500 animate-pulse', badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200/50' },
      { label: 'En Vol', count: analytics.metrics.inFlightCount, color: 'bg-blue-500', badgeStyle: 'bg-blue-50 text-blue-700 border-blue-200/50' },
      { label: 'Annulations de Vol', count: analytics.metrics.cancelledCount, color: 'bg-rose-500', badgeStyle: 'bg-rose-50 text-rose-700 border-rose-200/50' },
    ];
  }, [analytics]);

  return (
    <div className="bg-slate-50 p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto antialiased min-h-screen text-slate-800">
      
      {/* Dynamic Error Alert */}
      {globalError && (
        <div className="flex items-start gap-4 bg-rose-50 border border-rose-200 text-rose-950 px-5 py-4 rounded-2xl text-xs font-semibold shadow-sm transition-all">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="text-sm font-black uppercase tracking-wider">Erreur Système</strong>
            <p className="text-[11px] text-rose-700 font-medium mt-1">{globalError}</p>
          </div>
          <button 
            onClick={() => setGlobalError(null)} 
            aria-label="Fermer le message d'erreur"
            className="text-rose-400 hover:text-rose-700 transition p-1 rounded-lg hover:bg-rose-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header Panel */}
      <div className="flex flex-col gap-6 bg-white rounded-2xl border border-slate-200 p-6 md:flex-row md:items-center md:justify-between shadow-xs">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-white shadow-md shadow-slate-900/10">
            <Plane className="h-5.5 w-5.5 rotate-45 stroke-2" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-950 uppercase tracking-wider">Centre d'Opérations</h1>
            <p className="text-[11px] font-bold text-slate-500 mt-0.5 flex items-center gap-1.5 uppercase tracking-wide">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Synchronisé avec le moteur IA d'optimisation des vols
            </p>
          </div>
        </div>

        {/* Top bar controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all"
          >
            <Plus className="h-4.5 w-4.5" />
            <span>Nouveau Vol</span>
          </button>

          <button
            onClick={triggerPredictionIA}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-teal-900 hover:bg-slate-800 disabled:opacity-60 px-4 py-2.5 text-xs font-bold text-white transition-all shadow-sm"
          >
            <Cpu className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Calcul Engine...' : 'Optimisation IA'}</span>
          </button>

          <button
            onClick={() => setFilterDelayed(!filterDelayed)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-all ${
              filterDelayed 
                ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-sm' 
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Alerte Retards</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        
        {/* Left Side: Analytics Overview */}
        <aside className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5 shadow-xs">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4.5 w-4.5 text-emerald-500 animate-pulse" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-950">Statistiques Live</h2>
            </div>
            <button 
              onClick={() => loadData()} 
              disabled={loading} 
              aria-label="Rafraîchir les données"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {analytics && (
            <div className="space-y-6">
              {/* Progress KPI bar */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-slate-600" /> Taux OTP (Global)
                  </span>
                  <span className="text-sm font-mono font-black text-slate-900">{analytics.metrics.otpRate}%</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-slate-900 h-full transition-all duration-500" style={{ width: `${analytics.metrics.otpRate}%` }}></div>
                </div>
              </div>

              {/* Vertical KPI List */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Répartition de la Flotte</p>
                <div className="space-y-2">
                  {kpiItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-slate-50/30 hover:bg-slate-100/50 transition-all">
                      <div className="flex items-center gap-2.5">
                        <span className={`h-2 w-2 rounded-full ${item.color}`}></span>
                        <span className="text-xs font-bold text-slate-700">{item.label}</span>
                      </div>
                      <span className={`text-xs font-mono font-black border px-2.5 py-0.5 rounded-lg ${item.badgeStyle}`}>
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Right Side: Timeline Rotations */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <div className="min-w-[950px] divide-y divide-slate-100">
              
              {/* Table Header */}
              <div className="grid grid-cols-12 bg-slate-50/70 border-b border-slate-200 px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                <div className="col-span-3 border-r border-slate-200">Aéronef</div>
                <div className="col-span-9 pl-6">Rotations Horaires Planifiées</div>
              </div>

              {ganttRows.length === 0 ? (
                <div className="p-20 text-center text-xs font-semibold text-slate-400 italic flex flex-col items-center justify-center gap-2.5">
                  <AlertCircle className="h-6 w-6 text-slate-300" />
                  <span>Aucune rotation planifiée correspondant aux filtres.</span>
                </div>
              ) : (
                ganttRows.map((aircraft) => {
                  const aircraftFlights = filteredFlights.filter((f) => f.aircraft === aircraft);
                  const immatriculation = fleetAircrafts.find((a) => a.id === aircraft)?.model 
                    || flights.find((f) => f.aircraft === aircraft)?.aircraftModel 
                    || 'Cellule Inconnue';

                  const isUnassigned = aircraft === UNASSIGNED_AIRCRAFT;

                  return (
                    <div key={aircraft} className="grid grid-cols-12 items-stretch hover:bg-slate-50/20 transition-all duration-150">
                      {/* Aircraft info */}
                      <div className={`col-span-3 flex flex-col justify-center border-r border-slate-200 px-6 py-5 ${isUnassigned ? 'bg-rose-50/20' : 'bg-white'}`}>
                        {isUnassigned ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 px-2.5 py-1 rounded-lg w-fit flex items-center gap-1 uppercase tracking-wider">
                              <ShieldAlert className="h-3.5 w-3.5" /> Vol non assigné
                            </span>
                            <span className="text-[9px] text-rose-600 font-bold uppercase tracking-wide">Action Requise</span>
                          </div>
                        ) : (
                          <>
                            <span className="text-xs font-black text-slate-950 font-mono tracking-wider bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg w-fit uppercase">
                              {immatriculation}
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono font-bold mt-2 uppercase tracking-wide">
                              REF: {aircraft.substring(0, 8)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Flights List */}
                      <div className="col-span-9 flex flex-row flex-wrap items-center gap-4 px-6 py-5 bg-white">
                        {aircraftFlights.map((flight) => {
                          const styles = getStatusStyles(flight.status);
                          const weather = getWeatherIndicator(flight.weatherSeverity);
                          return (
                            <div
                              key={flight.id}
                              onClick={() => setSelectedFlight(flight)}
                              className={`group relative flex h-[130px] w-[285px] flex-col justify-between rounded-xl border p-4 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${styles.bg}`}
                            >
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-black tracking-wider text-slate-950 flex items-center gap-1.5">
                                    {flight.status === 'Effectué' && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                                    {flight.flightNumber}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <div className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-black ${weather.bg}`}>
                                      {weather.icon}
                                      <span>{flight.weatherSeverity ?? 0.1}</span>
                                    </div>
                                    <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${styles.badge}`}>
                                      {styles.label}
                                    </span>
                                  </div>
                                </div>
                                
                                <div className="mt-3 flex items-center gap-2 text-[11px] font-black text-slate-950">
                                  <span className="bg-slate-100 px-2 py-0.5 rounded-md font-mono">{flight.origin}</span>
                                  <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                                  <span className="bg-slate-100 px-2 py-0.5 rounded-md font-mono">{flight.destination}</span>
                                </div>
                              </div>

                              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-500 border-t border-slate-100 pt-2 font-mono">
                                <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">
                                  {formatDateTime(flight.departure)} - {formatDateTime(flight.arrival)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <FlightAddModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleCreateFlightSubmit}
        fleetAircrafts={fleetAircrafts}
        isLoadingFleet={isLoadingFleet}
      />

      {/* Modal d'Inspection Détaillée */}
      {selectedFlight && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm transition-all">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-200">
              <span className="text-[10px] font-black text-slate-950 uppercase tracking-wider">Fiche d'Inspection Vol</span>
              <button 
                onClick={() => setSelectedFlight(null)} 
                aria-label="Fermer la modal"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/50 hover:text-slate-600 transition"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs">
              {/* Aircraft & Status Panel */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 border border-slate-200/80 rounded-xl">
                <div>
                  <span className="text-slate-400 block font-bold uppercase text-[9px] tracking-wide mb-1">Aéronef Connecté</span>
                  <span className="font-mono font-black text-slate-950 text-xs">
                    {selectedFlight.aircraft === UNASSIGNED_AIRCRAFT ? 'SANS CELLULE' : selectedFlight.aircraftModel}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold uppercase text-[9px] tracking-wide mb-1">Statut Courant</span>
                  <span className={`inline-block border px-2 py-0.5 rounded-md font-bold uppercase text-[9px] ${getStatusStyles(selectedFlight.status).badge}`}>
                    {getStatusStyles(selectedFlight.status).label}
                  </span>
                </div>
              </div>

              {/* Weather Recommendation Box */}
              <div className="p-3.5 border border-slate-200 bg-slate-50/50 rounded-xl space-y-2.5">
                <span className="text-slate-400 block font-bold uppercase text-[9px] tracking-wider">Conditions Météo au Départ ({selectedFlight.origin})</span>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {getWeatherIndicator(selectedFlight.weatherSeverity).icon}
                    <span className="font-mono font-black text-slate-950">Indice : {selectedFlight.weatherSeverity ?? 0.1} / 1.0</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border ${getWeatherIndicator(selectedFlight.weatherSeverity).bg}`}>
                    {getWeatherIndicator(selectedFlight.weatherSeverity).text}
                  </span>
                </div>
                <p className="text-[10px] text-slate-600 font-bold leading-relaxed pt-2 border-t border-slate-200 flex gap-1.5 items-start">
                  {(selectedFlight.weatherSeverity ?? 0.1) >= 0.7 ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                      <span>Alerte critique. Fortes perturbations météo détectées. L'IA préconise un décalage horaire immédiat.</span>
                    </>
                  ) : (selectedFlight.weatherSeverity ?? 0.1) >= 0.4 ? (
                    <>
                      <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                      <span>Risque modéré de perturbations climatiques. Monitoring recommandé.</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Excellentes conditions. Vol nominal sans contrainte climatique.</span>
                    </>
                  )}
                </p>
              </div>

              {/* Ticket Route Design */}
              <div className="flex items-center justify-between border border-slate-200 bg-white p-4 rounded-xl text-center relative overflow-hidden">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-4 bg-slate-50 border-r border-slate-200 rounded-r-full"></div>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-4 bg-slate-50 border-l border-slate-200 rounded-l-full"></div>
                
                <div className="flex-1 px-2">
                  <span className="text-2xl font-mono font-black text-slate-950">{selectedFlight.origin}</span>
                  <span className="text-[9px] font-mono font-bold text-slate-400 block mt-1 uppercase tracking-wide">Départ : {formatDateTime(selectedFlight.departure)}</span>
                </div>
                <div className="text-slate-300 select-none shrink-0 px-2 flex flex-col items-center">
                  <span className="text-[10px] font-black text-slate-400 tracking-widest">{selectedFlight.flightNumber}</span>
                  <div className="w-16 border-t-2 border-dashed border-slate-200 my-1"></div>
                  <Plane className="h-3.5 w-3.5 rotate-90 text-slate-300" />
                </div>
                <div className="flex-1 px-2">
                  <span className="text-2xl font-mono font-black text-slate-950">{selectedFlight.destination}</span>
                  <span className="text-[9px] font-mono font-bold text-slate-400 block mt-1 uppercase tracking-wide">Arrivée : {formatDateTime(selectedFlight.arrival)}</span>
                </div>
              </div>
            </div>
            
            <div className="p-5 pt-0">
              <button 
                onClick={() => setSelectedFlight(null)} 
                className="w-full bg-slate-950 hover:bg-slate-900 py-3 text-white font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all"
              >
                Fermer la Fiche
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};