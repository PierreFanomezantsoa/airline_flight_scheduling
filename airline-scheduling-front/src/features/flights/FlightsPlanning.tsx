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
  X
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

export type NormalizedStatus = 'En attente' | 'Ponctuel' | 'Retardé' | 'En Vol' | 'Annulé';

interface Flight {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  status: FlightStatus;
  aircraft: string;
  aircraftModel: string;
  weatherSeverity: number;
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

const API_BASE_URL = 'http://localhost:5000';

export const FlightsPlanning: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [fleet, setFleet] = useState<AircraftData[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState<Flight | null>(null);
  const [loadingFlights, setLoadingFlights] = useState(true);
  const [loadingFleet, setLoadingFleet] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // État Modal de confirmation de suppression
  const [deletingFlight, setDeletingFlight] = useState<Flight | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Système de Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Filtres
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  // --- GESTION DES TOASTS ---
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

  // --- CALCUL DYNAMIQUE ET TRADUCTION DU STATUT ---
  const getCalculatedStatus = useCallback((flight: Flight): NormalizedStatus => {
    const rawStatus = flight.status;
    
    // 1. Statuts explicites prioritaires
    if (['Cancelled', 'Annulé'].includes(rawStatus)) return 'Annulé';
    if (['Delayed', 'Retardé'].includes(rawStatus)) return 'Retardé';

    // 2. Logique temporelle si dates valides
    const now = new Date();
    const depDate = new Date(flight.departure);
    const arrDate = new Date(flight.arrival);

    if (!isNaN(depDate.getTime()) && !isNaN(arrDate.getTime())) {
      if (now < depDate) return 'En attente';
      if (now >= depDate && now <= arrDate) return 'En Vol';
      if (now > arrDate) return 'Ponctuel';
    }

    // 3. Fallback standard
    const mapFallback: Record<string, NormalizedStatus> = {
      'Scheduled': 'En attente',
      'Planifié': 'En attente',
      'En attente': 'En attente',
      'On-Time': 'Ponctuel',
      'Ponctuel': 'Ponctuel',
      'Effectué': 'Ponctuel',
      'In-Flight': 'En Vol',
      'En Vol': 'En Vol'
    };

    return mapFallback[rawStatus] || 'En attente';
  }, []);

  // --- STYLE BADGES ---
  const getStatusBadge = (status: NormalizedStatus) => {
    const styles: Record<NormalizedStatus, string> = {
      'En attente': 'bg-sky-50 text-sky-700 border-sky-200/80',
      'Ponctuel': 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      'Retardé': 'bg-amber-50 text-amber-700 border-amber-200/80',
      'En Vol': 'bg-purple-50 text-purple-700 border-purple-200/80',
      'Annulé': 'bg-rose-50 text-rose-700 border-rose-200/80 line-through',
    };
    return styles[status] || 'bg-slate-50 text-slate-700 border-slate-200';
  };

  // --- REQUÊTES SERVEUR ---
  const fetchFlights = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoadingFlights(true);
      const res = await fetch(`${API_BASE_URL}/flights`, { signal });
      if (!res.ok) throw new Error('Impossible de récupérer la liste des vols.');
      const data = await res.json();
      setFlights(data);
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

  useEffect(() => {
    const controller = new AbortController();
    fetchFlights(controller.signal);
    fetchFleet(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchFlights, fetchFleet]);

  // --- SOUMISSION DE FORMULAIRE ---
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
          aeroportArrivee: formData.aeroportArrivee,
          heureDepart: formData.heureDepart,
          heureArrivee: formData.heureArrivee,
          avionId: formData.avionId || null,
          status: isEdition ? (formData.status || editingFlight.status) : 'Planifié'
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Erreur serveur HTTP ${res.status}`);
      }

      await fetchFlights();
      closeModal();
      addToast('success', isEdition ? 'Vol mis à jour avec succès.' : 'Nouveau vol planifié avec succès.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      addToast('error', `Erreur d'enregistrement : ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- SUPPRESSION DE VOL ---
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

  // --- FORMATAGE DE LA CHRONOLOGIE ---
  const formatDateRange = (departureStr: string, arrivalStr: string) => {
    const depDate = new Date(departureStr);
    const arrDate = new Date(arrivalStr);
    
    if (isNaN(depDate.getTime()) || isNaN(arrDate.getTime())) {
      return <span className="text-slate-400 italic">Dates non renseignées</span>;
    }

    return (
      <div className="inline-flex items-center gap-2 font-mono text-xs bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg text-slate-700">
        <div className="flex items-center gap-1">
          <span className="text-slate-400 font-sans text-[11px]">
            {depDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
          </span>
          <span className="font-bold text-slate-900">
            {depDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
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

  // Mapping de FlightStatus vers le statut attendu par le Modal
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

  // --- FILTRES & KPIS MEMOÏSÉS ---
  const filteredFlights = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return flights.filter(flight => {
      const matchesSearch = 
        !term ||
        flight.flightNumber.toLowerCase().includes(term) ||
        flight.origin.toLowerCase().includes(term) ||
        flight.destination.toLowerCase().includes(term) ||
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
    };
  }, [flights, getCalculatedStatus]);

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-8 relative">
      
      {/* TOASTS NOTIFICATIONS */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between p-4 rounded-xl border shadow-lg transition-all transform animate-in slide-in-from-bottom-5 duration-200 ${
              toast.type === 'success'
                ? 'bg-slate-900 text-white border-emerald-500/30'
                : toast.type === 'error'
                ? 'bg-rose-900 text-white border-rose-500/30'
                : 'bg-slate-800 text-white border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              {toast.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />}
              {toast.type === 'error' && <XCircle className="h-5 w-5 text-rose-400 shrink-0" />}
              {toast.type === 'info' && <AlertCircle className="h-5 w-5 text-sky-400 shrink-0" />}
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
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/60">
              <CalendarDays className="h-5 w-5" />
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase">
              Ordonnancement &amp; Régulation des Vols
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Gérez vos rotations aériennes, assignations de flotte et contraintes horaires en temps réel.
          </p>
        </div>

        <button
          onClick={() => { setEditingFlight(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-xs font-bold text-white uppercase tracking-wider px-5 py-3 shadow-sm transition-all self-stretch sm:self-auto justify-center cursor-pointer"
        >
          <Plus className="h-4 w-4 text-emerald-400" /> Planifier une Rotation
        </button>
      </div>

      {/* KPIS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Rotations</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{stats.total}</p>
          </div>
          <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
            <Plane className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">En Vol</p>
            <p className="text-2xl font-black text-purple-700 mt-0.5">{stats.inFlight}</p>
          </div>
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
            <Globe className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">En Attente</p>
            <p className="text-2xl font-black text-sky-700 mt-0.5">{stats.pending}</p>
          </div>
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Retardés</p>
            <p className="text-2xl font-black text-amber-700 mt-0.5">{stats.delayed}</p>
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <AlertCircle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* BARRE DE RECHERCHE ET FILTRES */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher vol, appareil, escale..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
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
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* TABLEAU DES VOLS */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-xs">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-slate-500">
            <Globe className="h-4 w-4 text-slate-400" /> Routes Actives &amp; État Opérationnel
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
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
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
                  <th className="py-3.5 px-4">Itinéraire</th>
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
                  const severityPct = Math.min(Math.max((flight.weatherSeverity || 0) * 100, 0), 100);

                  return (
                    <tr 
                      key={flight.id} 
                      className="hover:bg-slate-50/80 transition-colors duration-150"
                    >
                      {/* Numéro de Vol */}
                      <td className="py-4 px-6 font-mono font-black text-slate-900 text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg shrink-0 border ${
                            isInFlight 
                              ? 'bg-purple-50 text-purple-700 border-purple-200' 
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

                      {/* Itinéraire */}
                      <td className="py-4 px-4 font-mono font-bold text-slate-900">
                        <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-lg">
                          <span>{flight.origin}</span>
                          <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{flight.destination}</span>
                        </div>
                      </td>

                      {/* Statut (Dynamique / Traduit) */}
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${getStatusBadge(computedStatus)}`}>
                          {isInFlight && <span className="h-1.5 w-1.5 rounded-full bg-purple-600 animate-ping" />}
                          {computedStatus}
                        </span>
                      </td>

                      {/* Météo */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <div className="w-14 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60 shrink-0">
                            <div 
                              className={`h-full transition-all duration-300 ${
                                severityPct >= 80 ? 'bg-rose-500' :
                                severityPct >= 40 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${severityPct}%` }}
                            />
                          </div>
                          <span className={`font-mono font-bold text-[11px] ${
                            severityPct >= 80 ? 'text-rose-700' : 
                            severityPct >= 40 ? 'text-amber-700' : 'text-emerald-700'
                          }`}>
                            {severityPct.toFixed(0)}%
                          </span>
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
                            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition border border-transparent hover:border-slate-200/80 cursor-pointer"
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
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Synchronisation réseau en cours...</span>
          </div>
        </div>
      )}

    </div>
  );
};