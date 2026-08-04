// FleetManagement.tsx
import React, { useState, useEffect } from 'react';
import { Plane, Plus, CheckCircle2, Wrench, AlertTriangle, ShieldAlert, Trash2, RefreshCw, Loader, AlertCircle, X } from 'lucide-react';
import { fleetService } from './fleetService';
import type { Aircraft, CreateAircraftDto, FleetStatistics as FleetStatsType } from './fleetService';
import { FleetStatistics } from './FleetStatistics';

const AIRCRAFT_STATUSES = {
  'Active': { label: 'En Service', icon: CheckCircle2, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  'Maintenance': { label: 'En Maintenance', icon: Wrench, color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  'Out of Service': { label: 'Hors Service', icon: AlertTriangle, color: 'bg-rose-500/10 text-rose-600 border-rose-500/20' },
  'Retired': { label: 'Retiré', icon: ShieldAlert, color: 'bg-slate-500/10 text-slate-600 border-slate-500/20' },
} as const;

const DEFAULT_FORM_STATE: CreateAircraftDto = {
  registration: '',
  model: 'Boeing 737-800',
  capacity: 189,
  maintenanceHoursLimit: 5000,
  totalFlightHours: 0,
  status: 'Active',
  homeBase: 'TNR',
};

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ModalState {
  isOpen: boolean;
  type: 'delete' | 'reset' | null;
  aircraftId: string | null;
  aircraftRegistration: string | null;
}

export const FleetManagement: React.FC = () => {
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [stats, setStats] = useState<FleetStatsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<CreateAircraftDto>(DEFAULT_FORM_STATE);

  // Gestion des Toasts et des Modals
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: null,
    aircraftId: null,
    aircraftRegistration: null
  });

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const fetchFleetData = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const [aircraftsData, statsData] = await Promise.all([
        fleetService.getAircrafts(),
        fleetService.getFleetStatistics(),
      ]);
      setAircrafts(aircraftsData);
      setStats(statsData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement de la flotte';
      showToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFleetData();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!form.registration?.trim()) {
      showToast("L'immatriculation est requise", 'error');
      return;
    }

    try {
      setIsSaving(true);
      await fleetService.createAircraft(form);
      showToast('Aéronef ajouté avec succès', 'success');
      setForm(DEFAULT_FORM_STATE);
      await fetchFleetData();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || "Erreur lors de l'ajout de l'aéronef";
      showToast(Array.isArray(msg) ? msg.join(', ') : msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const openConfirmationModal = (type: 'delete' | 'reset', aircraft: Aircraft) => {
    setModal({
      isOpen: true,
      type,
      aircraftId: aircraft.id,
      aircraftRegistration: aircraft.registration
    });
  };

  const closeConfirmationModal = () => {
    setModal({ isOpen: false, type: null, aircraftId: null, aircraftRegistration: null });
  };

  const handleConfirmAction = async (): Promise<void> => {
    if (!modal.aircraftId || !modal.type) return;

    try {
      if (modal.type === 'delete') {
        await fleetService.deleteAircraft(modal.aircraftId);
        showToast('Aéronef supprimé avec succès', 'success');
      } else if (modal.type === 'reset') {
        await fleetService.resetMaintenanceCounter(modal.aircraftId);
        showToast('Compteur de maintenance réinitialisé avec succès', 'success');
      }
      await fetchFleetData();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Une erreur est survenue lors de l\'action', 'error');
    } finally {
      closeConfirmationModal();
    }
  };

  const getStatusBadge = (status: Aircraft['status']) => {
    const config = AIRCRAFT_STATUSES[status] || AIRCRAFT_STATUSES['Active'];
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold border whitespace-nowrap ${config.color}`}>
        <Icon className="h-3.5 w-3.5" /> {config.label}
      </span>
    );
  };

  if (isLoading && aircrafts.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-emerald-700 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">Chargement de la flotte aéronautique...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-350 mx-auto relative">
      
      {/* --- RECIPIENT DES TOASTS --- */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-xl transition-all duration-300 transform translate-y-0 animate-fadeIn ${
              t.type === 'success' 
                ? 'border-emerald-100 bg-white text-emerald-900 shadow-emerald-100/40' 
                : 'border-rose-100 bg-white text-rose-900 shadow-rose-100/40'
            }`}
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
            )}
            <p className="text-sm font-semibold flex-1 pr-2">{t.message}</p>
            <button 
              onClick={() => setToasts((prev) => prev.filter((toast) => toast.id !== t.id))}
              className="text-slate-400 hover:text-slate-600 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* --- COMPOSANT STATISTIQUES --- */}
      <FleetStatistics stats={stats} isLoading={isLoading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Formulaire d'Immatriculation */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm h-fit">
          <h3 className="flex items-center gap-2.5 text-base font-bold text-slate-900 mb-5">
            <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
              <Plus className="h-4 w-4" />
            </div>
            Immatriculer un Appareil
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Immatriculation</label>
              <input
                type="text"
                placeholder="ex: 5R-MFT"
                value={form.registration}
                onChange={(e) => setForm({ ...form, registration: e.target.value.toUpperCase() })}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-emerald-700 focus:ring-4 focus:ring-emerald-50 focus:outline-none font-mono placeholder:text-slate-300 transition"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Modèle</label>
                <select
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none font-medium text-slate-700 transition"
                >
                  <option value="Boeing 737-800">Boeing 737-800</option>
                  <option value="Airbus A320">Airbus A320</option>
                  <option value="Boeing 787-8">Boeing 787-8</option>
                  <option value="ATR 72-600">ATR 72-600</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Sièges</label>
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none font-semibold text-slate-700 transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Heures de Vol</label>
                <input
                  type="number"
                  min="0"
                  value={form.totalFlightHours}
                  onChange={(e) => setForm({ ...form, totalFlightHours: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Butoir (h)</label>
                <input
                  type="number"
                  min="1"
                  value={form.maintenanceHoursLimit}
                  onChange={(e) => setForm({ ...form, maintenanceHoursLimit: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Base d'attache</label>
                <select
                  value={form.homeBase || ''}
                  onChange={(e) => setForm({ ...form, homeBase: e.target.value || undefined })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none font-medium text-slate-700 transition"
                >
                  <option value="TNR">TNR (Ivato)</option>
                  <option value="CDG">CDG (Paris)</option>
                  <option value="ORY">ORY (Orly)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Statut Initial</label>
                <select
                  value={form.status || 'Active'}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Aircraft['status'] })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none font-semibold text-slate-700 transition"
                >
                  <option value="Active">En Service</option>
                  <option value="Maintenance">En Maintenance</option>
                </select>
              </div>
            </div>

            {/* Bouton mis à jour en bg-emerald-700 */}
            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-xl bg-emerald-700 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-700/15 hover:bg-emerald-800 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {isSaving ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isSaving ? 'Immatriculation...' : "Ajouter l'appareil"}
            </button>
          </form>
        </div>

        {/* Liste du Registre Technique */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="flex items-center gap-2.5 text-base font-bold text-slate-900">
              <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
                <Plane className="h-4 w-4" />
              </div>
              Registre Technique Actif ({aircrafts.length})
            </h3>
            <button
              onClick={() => fetchFleetData()}
              disabled={isLoading}
              className="rounded-xl p-2 hover:bg-slate-50 border border-slate-100 transition disabled:opacity-50"
              title="Rafraîchir les données"
              type="button"
            >
              <RefreshCw className={`h-4 w-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-3 max-h-170 overflow-y-auto pr-1 custom-scrollbar">
            {aircrafts.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
                <Plane className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-400 text-sm font-medium">Aucun aéronef enregistré dans la flotte.</p>
              </div>
            ) : (
              aircrafts.map((aircraft) => {
                const hoursBeforeMaintenance = aircraft.maintenanceHoursLimit - aircraft.totalFlightHours;
                const isMaintenanceCritical = hoursBeforeMaintenance <= 500 && aircraft.status === 'Active';

                return (
                  <div
                    key={aircraft.id}
                    className={`rounded-xl border p-4 transition duration-150 hover:border-slate-300 ${
                      isMaintenanceCritical ? 'border-amber-200 bg-amber-50/10' : 'border-slate-100 bg-white'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5 flex-1">
                        <div className="rounded-xl bg-slate-900 p-2.5 text-emerald-400 shrink-0 shadow-sm">
                          <Plane className="h-5 w-5" />
                        </div>
                        <div className="space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-black text-slate-900 text-base tracking-wide">
                              {aircraft.registration}
                            </span>
                            {getStatusBadge(aircraft.status)}
                          </div>
                          <p className="text-xs text-slate-500 font-medium">
                            {aircraft.model} • <span className="font-semibold text-slate-600">{aircraft.capacity} PAX</span> • Base : <span className="font-semibold text-slate-600">{aircraft.homeBase || 'N/A'}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-5 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Heures totales</span>
                          <span className="font-mono font-bold text-slate-700 block text-sm mt-0.5">
                            {(aircraft.totalFlightHours || 0).toLocaleString()} h
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Butoir restant</span>
                          <span
                            className={`font-mono font-bold block text-sm mt-0.5 ${
                              isMaintenanceCritical ? 'text-rose-600 font-black animate-pulse' : hoursBeforeMaintenance <= 0 ? 'text-rose-600' : 'text-slate-600'
                            }`}
                          >
                            {(hoursBeforeMaintenance || 0).toLocaleString()} h
                          </span>
                        </div>

                        <div className="flex gap-1 pl-2">
                          {aircraft.status === 'Maintenance' && (
                            <button
                              onClick={() => openConfirmationModal('reset', aircraft)}
                              className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 transition border border-transparent hover:border-emerald-100"
                              title="Libérer et réinitialiser le compteur de maintenance"
                              type="button"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openConfirmationModal('delete', aircraft)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition border border-transparent hover:border-rose-100"
                            title="Supprimer l'aéronef de la flotte"
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {isMaintenanceCritical && (
                      <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200/50 rounded-xl px-3 py-2">
                        <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
                        <span>Alerte d'ordonnancement : Seuil critique atteint ({hoursBeforeMaintenance}h). Maintenance obligatoire imminente.</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* --- MODAL DE CONFIRMATION UNIQUE ET DYNAMIQUE --- */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fadeIn" 
            onClick={closeConfirmationModal}
          />
          
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-scaleIn z-10">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl shrink-0 ${
                modal.type === 'delete' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
              }`}>
                {modal.type === 'delete' ? <Trash2 className="h-6 w-6" /> : <RefreshCw className="h-6 w-6" />}
              </div>
              
              <div className="space-y-1.5 flex-1">
                <h4 className="text-base font-bold text-slate-900">
                  {modal.type === 'delete' ? 'Supprimer l\'appareil' : 'Réinitialiser la maintenance'}
                </h4>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {modal.type === 'delete' ? (
                    <>Êtes-vous sûr de vouloir retirer définitivement l'aéronef <span className="font-mono font-bold text-slate-800">{modal.aircraftRegistration}</span> du registre technique opérationnel ? Cette action est irréversible.</>
                  ) : (
                    <>Voulez-vous confirmer la fin des travaux et réinitialiser le compteur butoir de l'appareil <span className="font-mono font-bold text-slate-800">{modal.aircraftRegistration}</span> ?</>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirmationModal}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-50 rounded-xl transition border border-transparent hover:border-slate-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider text-white rounded-xl shadow-md transition ${
                  modal.type === 'delete' 
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/10' 
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/10'
                }`}
              >
                {modal.type === 'delete' ? 'Confirmer la suppression' : 'Confirmer le reset'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};