import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Plane,
  PlusCircle,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  ArrowUpDown,
  X
} from 'lucide-react';
import { flightsApi, type Flight, type OptimizationResult } from '../Api/flightsApi';

export const FlightOptimizationDashboard: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [optiResult, setOptiResult] = useState<OptimizationResult | null>(null);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // État du Modal de Suppression
  const [flightToDelete, setFlightToDelete] = useState<Flight | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Filtres et recherche dans le tableau
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Formulaire de création
  const [newFlight, setNewFlight] = useState({
    numeroVol: '',
    aeroportDepart: '',
    aeroportArrivee: '',
    heureDepart: '',
    heureArrivee: '',
    avionId: '',
  });

  const loadFlights = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await flightsApi.getAll();
      setFlights(data);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des vols.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlights();
  }, []);

  const handleOptimize = async () => {
    try {
      setOptimizing(true);
      setError(null);
      const result = await flightsApi.runOptimization();
      setOptiResult(result);
      await loadFlights();
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'exécution de l'optimisation.");
    } finally {
      setOptimizing(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      await flightsApi.create(newFlight);
      setNewFlight({
        numeroVol: '',
        aeroportDepart: '',
        aeroportArrivee: '',
        heureDepart: '',
        heureArrivee: '',
        avionId: '',
      });
      setShowAddForm(false);
      await loadFlights();
    } catch (err: any) {
      setError(err.message || "Erreur lors de la création du vol.");
    }
  };

  // Confirmation et exécution de la suppression
  const confirmDelete = async () => {
    if (!flightToDelete) return;
    try {
      setIsDeleting(true);
      await flightsApi.delete(flightToDelete.id);
      setFlightToDelete(null);
      await loadFlights();
    } catch (err: any) {
      setError(err.message || "Erreur lors de la suppression.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Calcul de la durée estimée du vol
  const calculateDuration = (start: string, end: string) => {
    const d1 = new Date(start).getTime();
    const d2 = new Date(end).getTime();
    if (isNaN(d1) || isNaN(d2)) return null;
    const diffMs = d2 - d1;
    if (diffMs <= 0) return null;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins.toString().padStart(2, '0')}m`;
  };

  // Rendu badge de statut personnalisé
  const renderStatusBadge = (statut?: string) => {
    const s = statut?.toUpperCase() || 'PROGRAMME';
    switch (s) {
      case 'EN_VOL':
      case 'IN_FLIGHT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> En vol
          </span>
        );
      case 'TERMINE':
      case 'LANDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Atterri
          </span>
        );
      case 'ANNULE':
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" /> Annulé
          </span>
        );
      case 'RETARDE':
      case 'DELAYED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Retardé
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-500" /> Programmé
          </span>
        );
    }
  };

  // Filtrage dynamique des vols
  const filteredFlights = useMemo(() => {
    return flights
      .filter((flight) => {
        const matchSearch =
          flight.numeroVol.toLowerCase().includes(searchTerm.toLowerCase()) ||
          flight.aeroportDepart.toLowerCase().includes(searchTerm.toLowerCase()) ||
          flight.aeroportArrivee.toLowerCase().includes(searchTerm.toLowerCase());

        if (statusFilter === 'ALL') return matchSearch;
        if (statusFilter === 'UNASSIGNED') return matchSearch && !flight.avion;
        if (statusFilter === 'ASSIGNED') return matchSearch && !!flight.avion;
        return matchSearch && (flight.statut?.toUpperCase() === statusFilter);
      })
      .sort((a, b) => {
        const timeA = new Date(a.heureDepart).getTime();
        const timeB = new Date(b.heureDepart).getTime();
        return sortAsc ? timeA - timeB : timeB - timeA;
      });
  }, [flights, searchTerm, statusFilter, sortAsc]);

  const assignedFlightsCount = flights.filter((f) => !!f.avion).length;
  const unassignedFlightsCount = flights.length - assignedFlightsCount;

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 text-slate-900 font-sans">
      {/* HEADER & BOUTONS D'ACTION */}
      <div className="relative overflow-hidden rounded-2xl bg-white p-6 sm:p-8 text-slate-900 shadow-xs border border-slate-200/80">
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-700 text-[11px] font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Module Algorithmique IA</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 m-0 leading-tight">
              Optimisation Automatique des Vols
            </h1>

            <p className="text-slate-500 text-sm font-medium leading-relaxed m-0">
              Résolution en temps réel des chevauchements d'appareils et réaffectation dynamique de la flotte.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all cursor-pointer select-none"
            >
              <PlusCircle className="w-4 h-4 text-slate-500" />
              <span>{showAddForm ? 'Fermer le formulaire' : 'Nouveau Vol'}</span>
              {showAddForm ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
            </button>

            <button
              onClick={handleOptimize}
              disabled={optimizing}
              className={`inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold shadow-sm transition-all duration-200 cursor-pointer border select-none ${
                optimizing
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600/20 hover:shadow-emerald-600/20 active:scale-98'
              }`}
            >
              {optimizing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                  <span>Optimisation en cours...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Lancer l'optimisation</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* METRICS RAPIDES */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="bg-slate-50/70 border border-slate-200/60 hover:border-slate-300 rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Vols</span>
              <Layers className="w-4 h-4 text-slate-400" />
            </div>
            <span className="text-2xl font-black text-slate-900 block">{flights.length}</span>
          </div>

          <div className="bg-emerald-50/40 border border-emerald-100 hover:border-emerald-200 rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Appareils Assignés</span>
              <Plane className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-2xl font-black text-emerald-700 block">{assignedFlightsCount}</span>
          </div>

          <div className="bg-amber-50/40 border border-amber-100 hover:border-amber-200 rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between text-amber-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Non Assignés</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <span className="text-2xl font-black text-amber-600 block">{unassignedFlightsCount}</span>
          </div>

          <div className="bg-slate-50/70 border border-slate-200/60 hover:border-slate-300 rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Dernier Run</span>
              <Clock className="w-4 h-4 text-slate-400" />
            </div>
            <span className="text-sm font-bold text-slate-700 mt-2 block truncate">
              {optiResult ? new Date(optiResult.timestamp).toLocaleTimeString() : 'Aucun run'}
            </span>
          </div>
        </div>
      </div>

      {/* FORMULAIRE DE CRÉATION DE VOL */}
      {showAddForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4 animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 m-0">
              <PlusCircle className="w-5 h-5 text-emerald-600" />
              Programmer un nouveau vol
            </h3>
            <span className="text-xs text-slate-400">Renseignez les informations de ligne</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">N° de Vol</label>
              <input
                type="text"
                required
                placeholder="ex: AF-1420"
                value={newFlight.numeroVol}
                onChange={(e) => setNewFlight({ ...newFlight, numeroVol: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Départ (IATA)</label>
              <input
                type="text"
                required
                placeholder="ex: CDG"
                value={newFlight.aeroportDepart}
                onChange={(e) => setNewFlight({ ...newFlight, aeroportDepart: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Arrivée (IATA)</label>
              <input
                type="text"
                required
                placeholder="ex: JFK"
                value={newFlight.aeroportArrivee}
                onChange={(e) => setNewFlight({ ...newFlight, aeroportArrivee: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Heure de Départ</label>
              <input
                type="datetime-local"
                required
                value={newFlight.heureDepart}
                onChange={(e) => setNewFlight({ ...newFlight, heureDepart: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Heure d'Arrivée</label>
              <input
                type="datetime-local"
                required
                value={newFlight.heureArrivee}
                onChange={(e) => setNewFlight({ ...newFlight, heureArrivee: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Appareil ID (Optionnel)</label>
              <input
                type="text"
                placeholder="ex: A320-01"
                value={newFlight.avionId}
                onChange={(e) => setNewFlight({ ...newFlight, avionId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer shadow-xs"
            >
              Enregistrer le Vol
            </button>
          </div>
        </form>
      )}

      {/* ERREUR */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 animate-in fade-in duration-200">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <strong className="font-bold">Erreur du service :</strong> {error}
          </div>
        </div>
      )}

      {/* RÉSULTAT OPTIMISATION */}
      {optiResult && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-900 m-0">Rapport de Résolution des Conflits</h3>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              Exécuté à {new Date(optiResult.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-800 font-semibold text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Conflits résolus : <strong>{optiResult.resolvedConflicts}</strong>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 font-semibold text-xs">
              <XCircle className="w-4 h-4 text-rose-600" />
              Non résolus : <strong>{optiResult.unresolvedConflicts}</strong>
            </div>
          </div>
        </div>
      )}

      {/* BARRE DE RECHERCHE ET FILTRES */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900 m-0">Plan de Vol Réseau</h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
              {filteredFlights.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Recherche */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par N° ou IATA..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            {/* Filtre statut */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl px-2 py-1">
              <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none border-none cursor-pointer pr-1"
              >
                <option value="ALL">Tous les status</option>
                <option value="UNASSIGNED">Non assignés</option>
                <option value="ASSIGNED">Assignés</option>
                <option value="EN_VOL">En vol</option>
                <option value="PROGRAMME">Programmé</option>
                <option value="RETARDE">Retardé</option>
              </select>
            </div>

            {/* Recharger */}
            <button
              onClick={loadFlights}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700 p-2 rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* TABLEAU ENRICHI */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-600" />
            <p className="text-sm font-medium m-0">Chargement des vols en cours...</p>
          </div>
        ) : filteredFlights.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Plane className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
            <p className="text-sm font-semibold text-slate-600 m-0">Aucun vol ne correspond aux critères</p>
            <p className="text-xs text-slate-400 m-0">Essayez de modifier votre recherche ou vos filtres.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
                  <th className="py-3.5 px-4">Vol</th>
                  <th className="py-3.5 px-4">Ligne & Trajet</th>
                  <th 
                    className="py-3.5 px-4 cursor-pointer hover:text-slate-600 transition-colors"
                    onClick={() => setSortAsc(!sortAsc)}
                  >
                    <div className="flex items-center gap-1">
                      <span>Horaires</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4">Durée</th>
                  <th className="py-3.5 px-4">Appareil Assigné</th>
                  <th className="py-3.5 px-9">Statut</th>
                  <th className="py-3.5 px-7 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredFlights.map((flight) => {
                  const duration = calculateDuration(flight.heureDepart, flight.heureArrivee);

                  return (
                    <tr 
                      key={flight.id} 
                      className={`hover:bg-slate-50/70 transition-colors ${
                        !flight.avion ? 'bg-amber-50/10' : ''
                      }`}
                    >
                      {/* N° Vol */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 font-mono text-xs text-slate-800 border border-slate-200/70">
                          <Plane className="w-3 h-3 text-slate-500" />
                          {flight.numeroVol}
                        </span>
                      </td>

                      {/* Ligne & Trajet */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 font-bold text-slate-800 font-mono text-xs">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {flight.aeroportDepart}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {flight.aeroportArrivee}
                          </span>
                        </div>
                      </td>

                      {/* Horaires */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs space-y-1 text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>
                              Départ :{' '}
                              <strong className="text-slate-800 font-semibold">
                                {new Date(flight.heureDepart).toLocaleString([], {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            <span>
                              Arrivée :{' '}
                              {new Date(flight.heureArrivee).toLocaleString([], {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Durée */}
                      <td className="py-3.5 px-4">
                        {duration ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {duration}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>

                      {/* Appareil Assigné */}
                      <td className="py-3.5 px-4">
                        {flight.avion ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-xs font-bold font-mono">
                            <Plane className="w-3 h-3 text-emerald-600" />
                            {flight.avion.immatriculation || flight.avion.id}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md font-semibold">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Non assigné
                          </span>
                        )}
                      </td>

                      {/* Statut */}
                      <td className="py-3.5 px-4">{renderStatusBadge(flight.statut)}</td>

                      {/* Actions */}
                      <td className="py-2.5 px-8 text-right">
                        <button
                          onClick={() => setFlightToDelete(flight)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 text-xs font-semibold transition-all cursor-pointer text-slate-500"
                          title="Supprimer le vol"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE SUPPRESSION PERSONNALISÉ */}
      {flightToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative animate-in zoom-in-95 duration-150">
            {/* Bouton fermer en haut à droite */}
            <button
              onClick={() => !isDeleting && setFlightToDelete(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              disabled={isDeleting}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1 pr-4">
                <h3 className="text-lg font-bold text-slate-900 m-0">Supprimer le vol</h3>
                <p className="text-xs text-slate-500 m-0">
                  Êtes-vous sûr de vouloir retirer ce vol du programme ? Cette action est irréversible.
                </p>
              </div>
            </div>

            {/* Récapitulatif du vol sélectionné */}
            <div className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800">
                <Plane className="w-3.5 h-3.5 text-slate-500" />
                <span>{flightToDelete.numeroVol}</span>
              </div>
              <div className="text-xs font-semibold text-slate-600 font-mono">
                {flightToDelete.aeroportDepart} ➔ {flightToDelete.aeroportArrivee}
              </div>
            </div>

            {/* Actions du Modal */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setFlightToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Suppression...</span>
                  </>
                ) : (
                  <span>Confirmer la suppression</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};