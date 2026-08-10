import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie 
} from 'recharts';
import { 
  Plane, Cpu, RefreshCw, AlertTriangle, CheckCircle2, Calendar, 
  BarChart3, Layers, Search, ShieldCheck, Zap, X, Filter
} from 'lucide-react';

// Configuration dynamique de l'URL de l'API
// Remplacer la constante API_BASE_URL par :
const API_BASE_URL = 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.REACT_APP_API_BASE_URL) ||
  'http://localhost:5000';

export type FlightStatus = 'Planifié' | 'En Vol' | 'Retardé' | 'Annulé' | 'Effectué';

export interface Flight {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  status: FlightStatus;
  aircraft?: string;
  aircraftModel?: string;
  weatherSeverity?: number;
}

export interface AnalyticsMetrics {
  totalFlights: number;
  otpRate: number;
  onTimeCount: number;
  delayedCount: number;
  inFlightCount: number;
  cancelledCount: number;
  completedCount: number;
}

interface StatusConfigItem {
  bg: string;
  border: string;
  text: string;
  bar: string;
  badgeBg: string;
  dot: string;
}

const STATUS_CONFIG: Record<FlightStatus, StatusConfigItem> = {
  'Planifié': { 
    bg: 'bg-blue-50/90 hover:bg-blue-100/90', 
    border: 'border-blue-300', 
    text: 'text-blue-900', 
    bar: '#2563eb',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500'
  },
  'En Vol': { 
    bg: 'bg-amber-50/90 hover:bg-amber-100/90', 
    border: 'border-amber-300', 
    text: 'text-amber-900', 
    bar: '#d97706',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500 animate-pulse'
  },
  'Retardé': { 
    bg: 'bg-orange-50/90 hover:bg-orange-100/90', 
    border: 'border-orange-300', 
    text: 'text-orange-900', 
    bar: '#ea580c',
    badgeBg: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500'
  },
  'Annulé': { 
    bg: 'bg-rose-50/90 hover:bg-rose-100/90', 
    border: 'border-rose-300', 
    text: 'text-rose-900', 
    bar: '#dc2626',
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500'
  },
  'Effectué': { 
    bg: 'bg-emerald-50/90 hover:bg-emerald-100/90', 
    border: 'border-emerald-300', 
    text: 'text-emerald-900', 
    bar: '#10b981',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500'
  }
};

const DEFAULT_STATUS_CONFIG: StatusConfigItem = STATUS_CONFIG['Planifié'];

// Helper pour parser les dates en toute sécurité
const safeDate = (dateStr?: string): Date | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

// Formateur de date/heure localisé
const formatDateTime = (dateStr?: string) => {
  const d = safeDate(dateStr);
  if (!d) return '--:--';
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};

const formatTimeOnly = (dateStr?: string) => {
  const d = safeDate(dateStr);
  if (!d) return '--:--';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

export const FlightSchedulerDashboard: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('TOUS');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  // Chargement des données
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [flightsRes, analyticsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/flights`),
        fetch(`${API_BASE_URL}/flights/analytics`)
      ]);

      if (!flightsRes.ok || !analyticsRes.ok) {
        throw new Error("Impossible de récupérer les données du serveur.");
      }

      const flightsData = await flightsRes.json();
      const analyticsData = await analyticsRes.json();

      setFlights(Array.isArray(flightsData) ? flightsData : []);
      setAnalytics(analyticsData.metrics || null);
      setLastUpdatedAt(new Date());
    } catch (err: any) {
      setMessage({ 
        text: err.message || "Erreur lors du chargement des données", 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Exécution de l'optimisation
  const handleRunOptimization = async () => {
    setOptimizing(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/flights/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (response.ok) {
        setMessage({ text: result.message || "Ordonnancement réussi !", type: 'success' });
        await fetchData();
      } else {
        throw new Error(result.message || "Échec de l'optimisation");
      }
    } catch (err: any) {
      setMessage({ text: err.message || "Erreur de communication avec le serveur", type: 'error' });
    } finally {
      setOptimizing(false);
    }
  };

  // Filtrage combiné (recherche + statut)
  const filteredFlights = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return flights.filter(flight => {
      const matchesSearch = !term || 
        flight.flightNumber.toLowerCase().includes(term) ||
        flight.origin.toLowerCase().includes(term) ||
        flight.destination.toLowerCase().includes(term) ||
        (flight.aircraftModel || flight.aircraft || '').toLowerCase().includes(term);
      
      const matchesStatus = selectedStatus === 'TOUS' || flight.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [flights, searchTerm, selectedStatus]);

  // Calcul des données pour le Diagramme de Gantt
  const ganttData = useMemo(() => {
    const defaultResult = {
      aircrafts: [] as [string, Flight[]][],
      minTime: 0,
      maxTime: 0,
      totalDuration: 1,
      hourTicks: [] as number[]
    };

    if (!filteredFlights.length) return defaultResult;

    const validFlights = filteredFlights.filter(f => {
      const dep = safeDate(f.departure);
      const arr = safeDate(f.arrival);
      return dep && arr && arr.getTime() > dep.getTime();
    });

    if (!validFlights.length) return defaultResult;

    const times = validFlights.flatMap(f => [
      new Date(f.departure).getTime(),
      new Date(f.arrival).getTime()
    ]);

    const rawMin = Math.min(...times);
    const rawMax = Math.max(...times);

    const minDate = new Date(rawMin);
    minDate.setHours(0, 0, 0, 0);
    const minTime = minDate.getTime();

    const maxDate = new Date(rawMax);
    maxDate.setHours(23, 59, 59, 999);
    const maxTime = maxDate.getTime();

    const totalDuration = Math.max(1, maxTime - minTime);
    const durationDays = totalDuration / (24 * 3600 * 1000);

    let stepHours = 6;
    if (durationDays > 5) stepHours = 12;
    else if (durationDays > 2) stepHours = 6;
    else stepHours = 3;

    const stepMs = stepHours * 3600 * 1000;

    const groupedByAircraft = validFlights.reduce((acc: Record<string, Flight[]>, flight) => {
      const key = flight.aircraftModel || flight.aircraft || 'Non Assigné';
      if (!acc[key]) acc[key] = [];
      acc[key].push(flight);
      return acc;
    }, {});

    const hourTicks: number[] = [];
    for (let t = minTime; t <= maxTime; t += stepMs) {
      hourTicks.push(t);
    }

    return {
      aircrafts: Object.entries(groupedByAircraft),
      minTime,
      maxTime,
      totalDuration,
      hourTicks
    };
  }, [filteredFlights]);

  // Données Donut Chart
  const pieChartData = useMemo(() => {
    if (!analytics) return [];
    return [
      { name: 'Planifiés', value: analytics.onTimeCount || 0, color: STATUS_CONFIG['Planifié'].bar },
      { name: 'En Vol', value: analytics.inFlightCount || 0, color: STATUS_CONFIG['En Vol'].bar },
      { name: 'Retardés', value: analytics.delayedCount || 0, color: STATUS_CONFIG['Retardé'].bar },
      { name: 'Annulés', value: analytics.cancelledCount || 0, color: STATUS_CONFIG['Annulé'].bar },
      { name: 'Effectués', value: analytics.completedCount || 0, color: STATUS_CONFIG['Effectué'].bar },
    ].filter(item => item.value > 0);
  }, [analytics]);

  // Données Bar Chart (Répartition horaire)
  const barChartData = useMemo(() => {
    const hourlyData: Record<string, number> = {};
    
    filteredFlights.forEach(flight => {
      const depDate = safeDate(flight.departure);
      if (!depDate) return;
      const hourKey = `${depDate.getHours().toString().padStart(2, '0')}h`;
      hourlyData[hourKey] = (hourlyData[hourKey] || 0) + 1;
    });

    return Object.keys(hourlyData)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map(hour => ({ hour, vols: hourlyData[hour] }));
  }, [filteredFlights]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-800 font-sans antialiased sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-5">

        {/* EN-TÊTE OCC */}
        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-md shadow-emerald-950/15">
                <Plane className="h-5 w-5 rotate-45" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-lg font-black tracking-tight text-slate-950 sm:text-xl">
                    Airline Operations Control
                  </h1>
                </div>

                <p className="mt-1 text-[11px] font-semibold text-slate-500 sm:text-xs">
                  Supervision temps réel, ponctualité, perturbations et optimisation des rotations
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button
                onClick={fetchData}
                disabled={loading || optimizing}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                title="Actualiser les données"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Actualiser</span>
              </button>

              <button
                onClick={handleRunOptimization}
                disabled={optimizing}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black text-white transition-all shadow-sm ${
                  optimizing
                    ? 'cursor-not-allowed border-emerald-400 bg-emerald-400 opacity-80'
                    : 'cursor-pointer border-emerald-700 bg-emerald-700 hover:border-emerald-800 hover:bg-emerald-800'
                }`}
              >
                <Cpu className={`h-4 w-4 ${optimizing ? 'animate-spin' : ''}`} />
                {optimizing ? 'Optimisation...' : 'Optimiser'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <span>{analytics?.totalFlights || flights.length} vols dans le planning</span>
            {lastUpdatedAt && (
              <>
                <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
                <span>
                  Dernière synchronisation {lastUpdatedAt.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </span>
              </>
            )}
          </div>
        </header>

        {/* NOTIFICATIONS */}
        {message && (
          <div
            className={`flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm transition-all sm:p-5 ${
              message.type === 'success'
                ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                : 'bg-rose-50/90 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-3 text-xs sm:text-sm font-medium">
              {message.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
            <button 
              onClick={() => setMessage(null)} 
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* INDICATEURS CLÉS (METRICS) */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Total des Vols</span>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <Calendar className="w-4 h-4 text-slate-500" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-slate-900">{analytics?.totalFlights || 0}</span>
              <span className="text-xs font-medium text-slate-400">Programmés</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Taux OTP</span>
              <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-emerald-700">{analytics?.otpRate ?? 100}%</span>
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                Cible: 95%
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Retardés / Annulés</span>
              <div className="p-2 bg-amber-50 rounded-lg border border-amber-100">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-amber-600">
                {(analytics?.delayedCount || 0) + (analytics?.cancelledCount || 0)}
              </span>
              <span className="text-xs font-medium text-slate-400">
                {analytics?.delayedCount || 0} ret. / {analytics?.cancelledCount || 0} ann.
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">En Vol</span>
              <div className="p-2 bg-blue-50 rounded-lg border border-blue-100">
                <Zap className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-blue-600">{analytics?.inFlightCount || 0}</span>
              <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
                En transit
              </span>
            </div>
          </div>
        </div>

        {/* FILTRES ET RECHERCHE */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] xl:items-end">
            <div>
              <label className="mb-2 block text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
                Recherche opérationnelle
              </label>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Vol, itinéraire, appareil..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-xs font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:bg-white focus:ring-4 focus:ring-emerald-100/70"
                />

                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Effacer la recherche"
                    className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
                <Filter className="h-3.5 w-3.5" />
                Statut du vol
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {['TOUS', 'Planifié', 'En Vol', 'Retardé', 'Effectué', 'Annulé'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(status)}
                    className={`h-10 min-w-0 rounded-xl border px-2 text-[9px] font-black uppercase tracking-wide transition sm:text-[10px] ${
                      selectedStatus === status
                        ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-800'
                    }`}
                  >
                    <span className="block truncate">
                      {status === 'TOUS' ? 'Tous' : status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* DIAGRAMME DE GANTT OPTIMISÉ */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-700" />
                Rotation Flotte & Ordonnancement
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Diagramme temporel interactif avec suivi des créneaux
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Planifié</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> En Vol</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Effectué</span>
            </div>
          </div>

          {ganttData.aircrafts.length === 0 ? (
            <div className="m-1 flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-xs font-semibold text-slate-400">
              Aucun vol ne correspond aux critères sélectionnés.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/20">
              <div className="min-w-[1400px] pb-4">
                
                {/* EN-TÊTE CHRONOLOGIQUE */}
                <div className="flex border-b border-slate-200 bg-white/95 sticky top-0 z-30 py-2.5 shadow-xs">
                  <div className="w-52 shrink-0 font-bold text-slate-600 text-[11px] uppercase tracking-wider pl-4 flex items-center sticky left-0 bg-white border-r border-slate-200 z-40">
                    Appareil / Flotte
                  </div>
                  <div className="relative flex-1 h-8">
                    {ganttData.hourTicks?.map((tickTime) => {
                      const leftPercent = ((tickTime - ganttData.minTime) / ganttData.totalDuration) * 100;
                      const dateObj = new Date(tickTime);
                      const hoursStr = `${dateObj.getHours().toString().padStart(2, '0')}h00`;
                      const dayStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;

                      return (
                        <div
                          key={tickTime}
                          className="absolute transform -translate-x-1/2 flex flex-col items-center border-l border-slate-200/80 pl-1 h-full justify-between"
                          style={{ left: `${leftPercent}%` }}
                        >
                          <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                            {hoursStr}
                          </span>
                          <span className="text-[9px] font-semibold text-slate-400 font-mono">
                            {dayStr}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* RANGÉES PAR APPAREIL */}
                <div className="divide-y divide-slate-100">
                  {ganttData.aircrafts.map(([aircraftModel, aircraftFlights]) => (
                    <div key={aircraftModel} className="flex items-center hover:bg-slate-50/80 transition group">
                      
                      {/* Colonne appareil fixe (Sticky) */}
                      <div className="w-52 shrink-0 flex items-center gap-2.5 px-4 py-3 sticky left-0 bg-white border-r border-slate-200 z-20 group-hover:bg-slate-50">
                        <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 shrink-0">
                          <Plane className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-slate-800 truncate" title={aircraftModel}>
                          {aircraftModel}
                        </span>
                      </div>

                      {/* Zone de timeline des vols */}
                      <div className="relative flex-1 h-16 bg-white/40 my-1 mx-2 rounded-lg">
                        {/* Grille verticale d'arrière-plan */}
                        {ganttData.hourTicks?.map((tickTime) => {
                          const leftPercent = ((tickTime - ganttData.minTime) / ganttData.totalDuration) * 100;
                          return (
                            <div
                              key={`grid-${tickTime}`}
                              className="absolute top-0 bottom-0 border-l border-slate-100"
                              style={{ left: `${leftPercent}%` }}
                            />
                          );
                        })}

                        {/* Barres de vols */}
                        {aircraftFlights.map((flight) => {
                          const depDate = safeDate(flight.departure);
                          const arrDate = safeDate(flight.arrival);
                          if (!depDate || !arrDate) return null;

                          const depTime = depDate.getTime();
                          const arrTime = arrDate.getTime();

                          const left = Math.max(0, ((depTime - ganttData.minTime) / ganttData.totalDuration) * 100);
                          const widthCalculated = Math.max(0.5, ((arrTime - depTime) / ganttData.totalDuration) * 100);
                          const config = STATUS_CONFIG[flight.status] || DEFAULT_STATUS_CONFIG;

                          return (
                            <div
                              key={flight.id}
                              className={`absolute top-2 bottom-2 rounded-xl px-3 py-1.5 flex items-center justify-between border shadow-xs transition-all duration-150 hover:z-30 hover:scale-[1.01] hover:shadow-md cursor-pointer ${config.bg} ${config.border}`}
                              style={{ 
                                left: `${left}%`, 
                                width: `${widthCalculated}%`,
                                minWidth: '120px'
                              }}
                              title={`Vol ${flight.flightNumber}\nItinéraire: ${flight.origin} ➔ ${flight.destination}\nDépart: ${formatTimeOnly(flight.departure)}\nArrivée: ${formatTimeOnly(flight.arrival)}`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${config.dot}`} />
                                <span className={`font-extrabold text-xs tracking-tight truncate ${config.text}`}>
                                  {flight.flightNumber}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 pl-2 text-[10px] font-bold text-slate-600 bg-white/80 px-1.5 py-0.5 rounded border border-slate-200/50 shrink-0">
                                <span>{flight.origin}</span>
                                <span className="text-slate-400">➔</span>
                                <span>{flight.destination}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                    </div>
                  ))}
                </div>

              </div>
            </div>
          )}
        </div>

        {/* SECTION GRAPHIQUES */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 flex flex-col justify-between">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Répartition par Statut</h3>
            <div className="h-60 w-full relative">
              {pieChartData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: '#ffffff', 
                          borderColor: '#e2e8f0', 
                          borderRadius: '12px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                          fontSize: '12px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-slate-800">{analytics?.totalFlights || 0}</span>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Vols</span>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Aucune donnée disponible
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 flex flex-col justify-between">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Départs par Tranche Horaire</h3>
            <div className="h-60 w-full">
              {barChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="hour" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ 
                        backgroundColor: '#ffffff', 
                        borderColor: '#e2e8f0', 
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                        fontSize: '12px'
                      }}
                    />
                    <Bar dataKey="vols" fill="#047857" radius={[6, 6, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Aucun départ enregistré
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TABLEAU COMPLET */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 p-4 sm:p-5">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-700" />
              Registre Officiel des Vols
            </h3>
            <span className="text-xs font-semibold text-slate-400">
              {filteredFlights.length} vol(s) trouvé(s)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4">Vol</th>
                  <th className="py-3 px-4">Itinéraire</th>
                  <th className="py-3 px-4">Départ</th>
                  <th className="py-3 px-4">Arrivée</th>
                  <th className="py-3 px-4">Appareil</th>
                  <th className="py-3 px-4 text-right">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFlights.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                      Aucun vol trouvé
                    </td>
                  </tr>
                ) : (
                  filteredFlights.map((flight) => {
                    const badgeConfig = STATUS_CONFIG[flight.status] || DEFAULT_STATUS_CONFIG;
                    return (
                      <tr key={flight.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 px-4 font-bold text-slate-900">{flight.flightNumber}</td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700">
                          {flight.origin} ➔ {flight.destination}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {formatDateTime(flight.departure)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {formatDateTime(flight.arrival)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {flight.aircraftModel || flight.aircraft || 'Non Assigné'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${badgeConfig.badgeBg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badgeConfig.dot}`} />
                            {flight.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FlightSchedulerDashboard;