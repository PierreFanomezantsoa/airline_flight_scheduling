import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Wrench, Plus, Calendar, Clock, Trash2, Loader2, AlertCircle, CheckCircle2, ShieldAlert, X } from 'lucide-react';

import { fleetService } from '../fleet/fleetService'; 
import type { Aircraft } from '../fleet/fleetService'; 

import { maintenanceService } from './maintenanceService';
import type { MaintenanceSlot } from './maintenanceService';

type MaintenanceType = 'Type A' | 'Type C' | 'Aircraft On Ground';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ModalState {
  isOpen: boolean;
  slotId: string | null;
  aircraftRegistration: string | null;
}

const getStatus = (start: string, end: string, type: string) => {
  const now = new Date();
  const startDateObj = new Date(start);
  const endDateObj = new Date(end);

  if (type === 'Aircraft On Ground') {
    return { 
      label: 'Urgence AOG', 
      css: 'bg-rose-50 text-rose-700 border-rose-100', 
      iconColor: 'bg-rose-50 text-rose-600 border border-rose-100/50',
      icon: <ShieldAlert className="h-5 w-5" />
    };
  }

  if (now < startDateObj) {
    return { 
      label: 'Planifié', 
      css: 'bg-amber-50 text-amber-700 border-amber-100', 
      iconColor: 'bg-amber-50 text-amber-600 border border-amber-100/50',
      icon: <Calendar className="h-5 w-5" />
    };
  }
  if (now > endDateObj) {
    return { 
      label: 'Terminé', 
      css: 'bg-emerald-50 text-emerald-700 border-emerald-100', 
      iconColor: 'bg-emerald-50 text-emerald-600 border border-emerald-100/50',
      icon: <CheckCircle2 className="h-5 w-5" />
    };
  }
  return { 
    label: 'En Atelier', 
    css: 'bg-emerald-50 text-emerald-900 border-emerald-100/60', 
    iconColor: 'bg-emerald-50/60 text-emerald-800 border border-emerald-100/50',
    icon: <Wrench className="h-5 w-5 animate-pulse" />
  };
};

const calculateDurationInDays = (start: string, end: string): number => {
  const diffTime = Math.abs(new Date(end).getTime() - new Date(start).getTime());
  return Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));
};

export const MaintenancePlanning: React.FC = () => {
  const [slots, setSlots] = useState<MaintenanceSlot[]>([]);
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [selectedAircraftId, setSelectedAircraftId] = useState<string>('');
  const [maintenanceType, setMaintenanceType] = useState<MaintenanceType>('Type A');
  const [startDate, setStartDate] = useState<string>('');
  const [durationDays, setDurationDays] = useState<number>(1);
  const [description, setDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    slotId: null,
    aircraftRegistration: null,
  });

  // Type ajusté à `number` pour le navigateur (Browser-safe timer type)
  const toastTimerRef = useRef<{ [key: number]: number }>({});

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    
    toastTimerRef.current[id] = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete toastTimerRef.current[id];
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(toastTimerRef.current).forEach(window.clearTimeout);
    };
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [fetchedSlots, fetchedAircrafts] = await Promise.all([
        maintenanceService.findAll(),
        fleetService.getAircrafts(),
      ]);
      setSlots(fetchedSlots);
      setAircrafts(fetchedAircrafts);

      if (fetchedAircrafts.length > 0 && !selectedAircraftId) {
        setSelectedAircraftId(fetchedAircrafts[0].id);
      }
    } catch (error) {
      showToast("Erreur lors du chargement des données de maintenance", "error");
    } finally {
      setLoading(false);
    }
  }, [selectedAircraftId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleScheduleMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAircraftId || !startDate || durationDays <= 0) return;

    try {
      setSubmitting(true);
      
      const [year, month, day] = startDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day + Number(durationDays), 23, 59, 59);

      await maintenanceService.create({
        aircraftId: selectedAircraftId,
        maintenanceType,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        description: description.trim() || undefined
      });

      showToast("Blocage technique planifié avec succès", "success");
      setStartDate('');
      setDurationDays(1);
      setDescription('');
      await loadData();
    } catch (error) {
      showToast("Erreur lors de la planification du blocage", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteModal = (slot: MaintenanceSlot) => {
    const targetAircraft = slot.aircraft;
    const reg = targetAircraft?.registration || "Appareil inconnu";
    setModal({
      isOpen: true,
      slotId: slot.id,
      aircraftRegistration: reg
    });
  };

  const closeDeleteModal = () => {
    setModal({ isOpen: false, slotId: null, aircraftRegistration: null });
  };

  const handleConfirmDelete = async () => {
    if (!modal.slotId) return;
    try {
      await maintenanceService.remove(modal.slotId);
      setSlots((prev) => prev.filter((slot) => slot.id !== modal.slotId));
      showToast("Blocage technique annulé avec succès", "success");
    } catch (error) {
      showToast("Erreur lors de la suppression du blocage", "error");
    } finally {
      closeDeleteModal();
    }
  };

  if (loading) {
    return (
      <div className="flex h-56 w-full flex-col items-center justify-center gap-3 text-sm text-slate-500 font-semibold bg-white rounded-2xl border border-slate-100 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-700" />
        <span>Chargement des plannings de maintenance...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 p-1 sm:p-0 relative">
      {/* Toast Notification Container */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-xl transition-all duration-300 transform translate-y-0 ${
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

      {/* Formulaire de réservation */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6 shadow-sm h-fit">
        <h3 className="flex items-center gap-2.5 text-base sm:text-lg font-black text-slate-900 mb-5 tracking-tight">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
            <Plus className="h-4 w-4 stroke-[2.5]" />
          </div>
          Planifier un blocage technique
        </h3>
        
        <form onSubmit={handleScheduleMaintenance} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Sélectionner l'appareil</label>
            <select 
              value={selectedAircraftId}
              onChange={(e) => setSelectedAircraftId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm font-semibold text-slate-800 transition focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700"
            >
              {aircrafts.map((ac) => (
                <option key={ac.id} value={ac.id}>
                  {ac.registration} — {ac.model}
                </option>
              ))}
              {aircrafts.length === 0 && <option value="">Aucun avion disponible</option>}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Type d'intervention</label>
            <select 
              value={maintenanceType}
              onChange={(e) => setMaintenanceType(e.target.value as MaintenanceType)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm font-semibold text-slate-800 transition focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700"
            >
              <option value="Type A">Type A (Vérification en ligne légère)</option>
              <option value="Type C">Type C (Inspection structurelle lourde)</option>
              <option value="Aircraft On Ground">Aircraft On Ground (Urgence AOG)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Date de début</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 transition focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700" 
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Durée (jours)</label>
              <input 
                type="number" 
                min={1} 
                value={durationDays}
                onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value)))}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 transition focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700" 
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Description / Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Raison du blocage, détails travaux..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 transition focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700 resize-none"
            />
          </div>

          <button 
            type="submit" 
            disabled={submitting || aircrafts.length === 0}
            className="w-full mt-2 rounded-xl bg-emerald-700 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 active:transform active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4 text-emerald-200" />
            )}
            Bloquer l'appareil (Gantt Lock)
          </button>
        </form>
      </div>

      {/* Liste des chantiers */}
      <div className="lg:col-span-2 rounded-2xl border border-slate-100 bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="flex items-center gap-2.5 text-base sm:text-lg font-black text-slate-900 mb-5 tracking-tight">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Wrench className="h-4 w-4" />
          </div>
          Planning des Chantiers Hangars
        </h3>

        <div className="space-y-3.5">
          {slots.map((slot) => {
            const statusInfo = getStatus(slot.startTime, slot.endTime, slot.maintenanceType);
            const daysCount = calculateDurationInDays(slot.startTime, slot.endTime);
            
            const isOrphan = !slot.aircraft;
            const targetAircraft = slot.aircraft;
            const reg = targetAircraft?.registration || "Appareil inconnu";
            const model = targetAircraft?.model || "Spécifications indisponibles";

            return (
              <div key={slot.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-slate-100/70 bg-slate-50/30 p-4 hover:bg-slate-50 hover:border-slate-200/60 transition duration-200 gap-4 group">
                
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className={`rounded-xl p-3 shrink-0 ${statusInfo.iconColor}`}>
                    {statusInfo.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-mono font-black text-base tracking-tight ${isOrphan ? 'text-slate-400 italic line-through' : 'text-slate-900'}`}>
                        {reg}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg tracking-wide uppercase border ${statusInfo.css}`}>
                        {statusInfo.label}
                      </span>
                      {isOrphan && (
                        <span className="flex items-center gap-1 text-[9px] font-semibold bg-rose-50 text-rose-600 px-2 py-0.5 rounded-lg border border-rose-100">
                          <AlertCircle className="h-2.5 w-2.5" /> Donnée orpheline
                        </span>
                      )}
                    </div>
                    
                    <p className="text-xs text-slate-600 mt-1.5 font-semibold leading-relaxed">
                      {slot.maintenanceType === 'Aircraft On Ground' ? 'AOG (Dépannage d’urgence)' : `${slot.maintenanceType}`} — <span className="text-slate-400 font-medium font-mono">{model}</span>
                    </p>
                    
                    {slot.description && (
                      <p className="text-xs text-slate-400 font-normal mt-1 border-l-2 border-slate-200 pl-2 max-w-md truncate" title={slot.description}>
                        {slot.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-5 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 sm:border-none">
                  <div className="text-left sm:text-right text-xs">
                    <span className="text-slate-400 font-bold flex items-center gap-1.5 sm:justify-end">
                      <Calendar className="h-3.5 w-3.5 text-slate-300" /> Début
                    </span>
                    <span className="font-mono font-bold text-slate-700 block mt-1.5 bg-white border border-slate-200/60 px-2.5 py-1 rounded-lg shadow-sm">
                      {new Date(slot.startTime).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  
                  <div className="text-right text-xs">
                    <span className="text-slate-400 font-bold flex items-center gap-1.5 justify-end">
                      <Clock className="h-3.5 w-3.5 text-slate-300" /> Immobilisation
                    </span>
                    <span className="font-bold text-slate-800 block mt-1.5 bg-white border border-slate-200/60 px-2.5 py-1 rounded-lg shadow-sm whitespace-nowrap">
                      {daysCount} {daysCount > 1 ? 'jours' : 'jour'}
                    </span>
                  </div>

                  <button 
                    type="button"
                    onClick={() => openDeleteModal(slot)}
                    className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition opacity-100 sm:opacity-0 group-hover:opacity-100 border border-transparent hover:border-rose-100"
                    title="Supprimer ce blocage"
                  >
                    <Trash2 className="h-4 w-4 stroke-[2]" />
                  </button>
                </div>

              </div>
            );
          })}

          {slots.length === 0 && (
            <div className="text-center py-12 text-xs text-slate-400 font-bold bg-slate-50/40 rounded-xl border border-dashed border-slate-200/70 flex flex-col items-center justify-center gap-2">
              <Wrench className="h-5 w-5 text-slate-300" />
              Aucun blocage technique actuellement planifié en hangar.
            </div>
          )}
        </div>
      </div>

      {/* Modal de Confirmation */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            onClick={closeDeleteModal}
          />
          
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 z-10">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl shrink-0 bg-rose-50 text-rose-600">
                <Trash2 className="h-6 w-6" />
              </div>
              
              <div className="space-y-1.5 flex-1">
                <h4 className="text-base font-bold text-slate-900">
                  Annuler le blocage technique
                </h4>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Êtes-vous sûr de vouloir supprimer ou libérer ce créneau de maintenance pour l'appareil <span className="font-mono font-bold text-slate-800">{modal.aircraftRegistration}</span> ? L'appareil sera immédiatement remis à disposition sur le Gantt.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-50 rounded-xl transition border border-transparent hover:border-slate-200"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-md shadow-rose-600/10 transition"
              >
                Confirmer l'annulation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};