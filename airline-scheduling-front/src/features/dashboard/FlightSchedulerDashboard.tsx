import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie 
} from 'recharts';
import { 
  Plane, Cpu, RefreshCw, AlertTriangle, CheckCircle2, Clock, Calendar, 
  BarChart3, Layers, Search, Filter, ShieldCheck, Zap
} from 'lucide-react';

interface Flight {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  status: 'Planifié' | 'En Vol' | 'Retardé' | 'Annulé' | 'Effectué';
  aircraft: string;
  aircraftModel: string;
  weatherSeverity: number;
}

interface AnalyticsMetrics {
  totalFlights: number;
  otpRate: number;
  onTimeCount: number;
  delayedCount: number;
  inFlightCount: number;
  cancelledCount: number;
  completedCount: number;
}

const API_BASE_URL = 'http://localhost:5000';

const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; bar: string; badgeBg: string; dot: string }> = {
  Planifié: { 
    bg: 'bg-blue-50/90 hover:bg-blue-100', 
    border: 'border-blue-300', 
    text: 'text-blue-900', 
    bar: '#2563eb',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500'
  },
  'En Vol': { 
    bg: 'bg-amber-50/90 hover:bg-amber-100', 
    border: 'border-amber-300', 
    text: 'text-amber-900', 
    bar: '#d97706',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500 animate-pulse'
  },
  Retardé: { 
    bg: 'bg-orange-50/90 hover:bg-orange-100', 
    border: 'border-orange-300', 
    text: 'text-orange-900', 
    bar: '#ea580c',
    badgeBg: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500'
  },
  Annulé: { 
    bg: 'bg-rose-50/90 hover:bg-rose-100', 
    border: 'border-rose-300', 
    text: 'text-rose-900', 
    bar: '#dc2626',
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500'
  },
  'Effectué': { 
    bg: 'bg-emerald-50/90 hover:bg-emerald-100', 
    border: 'border-emerald-300', 
    text: 'text-emerald-900', 
    bar: '#10b981',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500'
  }
};

export const FlightSchedulerDashboard: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('TOUS');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [flightsRes, analyticsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/flights`),
        fetch(`${API_BASE_URL}/flights/analytics`)
      ]);

      const flightsData = await flightsRes.json();
      const analyticsData = await analyticsRes.json();

      setFlights(flightsData);
      setAnalytics(analyticsData.metrics || null);
    } catch (err) {
      setMessage({ text: "Erreur lors du chargement des données", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
      setMessage({ text: err.message || "Erreur de communication", type: 'error' });
    } finally {
      setOptimizing(false);
    }
  };

  const filteredFlights = useMemo(() => {
    return flights.filter(flight => {
      const matchesSearch = 
        flight.flightNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        flight.origin.toLowerCase().includes(searchTerm.toLowerCase()) ||
        flight.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (flight.aircraftModel || flight.aircraft || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = selectedStatus === 'TOUS' || flight.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [flights, searchTerm, selectedStatus]);

  const ganttData = useMemo(() => {
    const defaultResult = {
      aircrafts: [] as [string, Flight[]][],
      minTime: 0,
      maxTime: 0,
      totalDuration: 1,
      hourTicks: [] as number[]
    };

    if (!filteredFlights.length) return defaultResult;

    const validFlights = filteredFlights.filter(f => f.departure && f.arrival);
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

  const pieChartData = analytics ? [
    { name: 'Planifiés', value: analytics.onTimeCount, color: STATUS_CONFIG.Planifié.bar },
    { name: 'En Vol', value: analytics.inFlightCount, color: STATUS_CONFIG['En Vol'].bar },
    { name: 'Retardés', value: analytics.delayedCount, color: STATUS_CONFIG.Retardé.bar },
    { name: 'Annulés', value: analytics.cancelledCount, color: STATUS_CONFIG.Annulé.bar },
    { name: 'Effectués', value: analytics.completedCount, color: STATUS_CONFIG['Effectué'].bar },
  ].filter(item => item.value > 0) : [];

  const hourlyData = filteredFlights.reduce((acc: Record<string, number>, flight) => {
    if (!flight.departure) return acc;
    const hour = new Date(flight.departure).getHours();
    const key = `${hour.toString().padStart(2, '0')}h`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const barChartData = Object.keys(hourlyData)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map(hour => ({ hour, vols: hourlyData[hour] }));

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 p-4 sm:p-6 lg:p-8 font-sans antialiased">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* EN-TÊTE */}
        <header className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-500/20">
              <Plane className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Opérations SkyFlow</h1>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Planification intelligente & suivi d'ordonnancement de la flotte
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <button
              onClick={fetchData}
              disabled={loading || optimizing}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition border border-slate-200 shadow-2xs hover:text-slate-900 disabled:opacity-50"
              title="Actualiser les données"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleRunOptimization}
              disabled={optimizing}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-all shadow-sm ${
                optimizing
                  ? 'bg-emerald-400 cursor-not-allowed opacity-80'
                  : 'bg-emerald-600 hover:bg-emerald-500 hover:shadow-md hover:shadow-emerald-500/20 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-emerald-500/30'
              }`}
            >
              <Cpu className={`w-4 h-4 ${optimizing ? 'animate-spin' : ''}`} />
              {optimizing ? 'Optimisation...' : 'Lancer l\'Optimisation'}
            </button>
          </div>
        </header>

        {/* NOTIFICATIONS */}
        {message && (
          <div
            className={`p-4 rounded-xl flex items-center justify-between gap-3 border shadow-2xs transition-all ${
              message.type === 'success'
                ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                : 'bg-rose-50/90 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-3 text-xs sm:text-sm font-medium">
              {message.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
            <button 
              onClick={() => setMessage(null)} 
              className="text-xs text-slate-400 hover:text-slate-600 font-semibold uppercase"
            >
              Fermer
            </button>
          </div>
        )}

        {/* INDICATEURS CLES (METRICS) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs flex flex-col justify-between">
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

          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Taux OTP</span>
              <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-emerald-600">{analytics?.otpRate || 100}%</span>
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                Cible: 95%
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs flex flex-col justify-between">
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

          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs flex flex-col justify-between">
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
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par vol, itinéraire..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50/80 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end overflow-x-auto pb-1 sm:pb-0">
            {['TOUS', 'Planifié', 'En Vol', 'Retardé', 'Effectué', 'Annulé'].map((status) => (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                  selectedStatus === status
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                }`}
              >
                {status === 'TOUS' ? 'Tous' : status}
              </button>
            ))}
          </div>
        </div>

        {/* --- DIAGRAMME DE GANTT OPTIMISÉ --- */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                Rotation Flotte & Ordonnancement
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Diagramme temporel avec défilement fluide et barres lisibles
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Planifié</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> En Vol</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Effectué</span>
            </div>
          </div>

          {ganttData.aircrafts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs sm:text-sm bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              Aucun vol ne correspond aux critères.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200/80 rounded-xl bg-slate-50/20">
              <div className="min-w-[2200px] pb-4">
                
                {/* EN-TÊTE CHRONOLOGIQUE */}
                <div className="flex border-b border-slate-200 bg-white/95 sticky top-0 z-30 py-2.5 shadow-2xs">
                  <div className="w-48 shrink-0 font-bold text-slate-600 text-[11px] uppercase tracking-wider pl-4 flex items-center sticky left-0 bg-white border-r border-slate-200 z-40">
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
                          <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/60">
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

                {/* RANGEES PAR APPAREIL */}
                <div className="divide-y divide-slate-100">
                  {ganttData.aircrafts.map(([aircraftModel, aircraftFlights]) => (
                    <div key={aircraftModel} className="flex items-center hover:bg-slate-50/80 transition group">
                      
                      {/* Colonne appareil fixe (Sticky) */}
                      <div className="w-48 shrink-0 flex items-center gap-2.5 px-4 py-3 sticky left-0 bg-white border-r border-slate-200 z-20 group-hover:bg-slate-50">
                        <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100 shrink-0">
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
                          const depTime = new Date(flight.departure).getTime();
                          const arrTime = new Date(flight.arrival).getTime();

                          const left = Math.max(0, ((depTime - ganttData.minTime) / ganttData.totalDuration) * 100);
                          const widthCalculated = ((arrTime - depTime) / ganttData.totalDuration) * 100;
                          const config = STATUS_CONFIG[flight.status] || STATUS_CONFIG.Planifié;

                          return (
                            <div
                              key={flight.id}
                              className={`absolute top-2 bottom-2 rounded-xl px-3 py-1.5 flex items-center justify-between border shadow-2xs transition-all duration-150 hover:z-30 hover:scale-[1.02] hover:shadow-md cursor-pointer ${config.bg} ${config.border}`}
                              style={{ 
                                left: `${left}%`, 
                                width: `${widthCalculated}%`,
                                minWidth: '150px'
                              }}
                              title={`Vol ${flight.flightNumber}\nItinéraire: ${flight.origin} ➔ ${flight.destination}\nDépart: ${new Date(flight.departure).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}\nArrivée: ${new Date(flight.arrival).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`}
                            >
                              {/* Groupe N° de vol + Puce d'état */}
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${config.dot}`} />
                                <span className={`font-extrabold text-xs tracking-tight truncate ${config.text}`}>
                                  {flight.flightNumber}
                                </span>
                              </div>

                              {/* Itinéraire */}
                              <div className="flex items-center gap-1 pl-2 text-[10px] font-bold text-slate-600 bg-white/70 px-1.5 py-0.5 rounded border border-slate-200/50 shrink-0">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs flex flex-col justify-between">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Répartition par Statut</h3>
            <div className="h-60 w-full relative">
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
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs flex flex-col justify-between">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Départs par Tranche Horaire</h3>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="hour" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
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
                  <Bar dataKey="vols" fill="#10b981" radius={[6, 6, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* TABLEAU COMPLET */}
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-slate-200/80 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              Registre Officiel des Vols
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-600">
              <thead className="bg-slate-50/80 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200 font-bold">
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
                {filteredFlights.map((flight) => {
                  const badgeConfig = STATUS_CONFIG[flight.status] || STATUS_CONFIG.Planifié;
                  return (
                    <tr key={flight.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900">{flight.flightNumber}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700">
                        {flight.origin} ➔ {flight.destination}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {new Date(flight.departure).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {new Date(flight.arrival).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {flight.aircraftModel || flight.aircraft || 'Non Assigné'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${badgeConfig.badgeBg}`}>
                          {flight.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FlightSchedulerDashboard;