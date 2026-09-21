// FleetManagement.tsx

import { useCallback, useEffect, useState } from 'react';
import {
  Plane,
  Plus,
  CheckCircle2,
  Wrench,
  AlertTriangle,
  ShieldAlert,
  Trash2,
  RefreshCw,
  Loader,
  AlertCircle,
  X,
} from 'lucide-react';

import { fleetService } from './fleetService';
import type {
  Aircraft,
  CreateAircraftDto,
  FleetStatistics as FleetStatsType,
} from './fleetService';
import { FleetStatistics } from './FleetStatistics';

/* ============================================================================
 * CONSTANTES
 * ========================================================================== */

const AIRCRAFT_STATUSES = {
  Active: {
    label: 'En Service',
    icon: CheckCircle2,
    color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  },
  Maintenance: {
    label: 'En Maintenance',
    icon: Wrench,
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  'Out of Service': {
    label: 'Hors Service',
    icon: AlertTriangle,
    color: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  },
  Retired: {
    label: 'Retiré',
    icon: ShieldAlert,
    color: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
  },
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

const CRITICAL_THRESHOLD_HOURS = 500;

/* ============================================================================
 * TYPES
 * ========================================================================== */

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

/* ============================================================================
 * HELPERS
 * ========================================================================== */

/**
 * Extrait un message d'erreur lisible d'une erreur Axios ou autre.
 * Gère les variantes { message, error, response.data.message }.
 */
function extractErrorMessage(error: unknown, fallback: string): string {
  // Axios — accès sécurisé à response.data.message
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosLike = error as {
      response?: { data?: { message?: unknown; error?: unknown } };
      message?: string;
    };

    const data = axiosLike.response?.data;
    if (data) {
      if (Array.isArray(data.message)) {
        return (data.message as string[]).join(', ');
      }
      if (typeof data.message === 'string' && data.message.trim()) {
        return data.message;
      }
      if (typeof data.error === 'string' && data.error.trim()) {
        return data.error;
      }
    }
  }

  if (error instanceof Error) {
    if (error.message.includes('Failed to fetch')) {
      return 'Impossible de contacter le serveur. Vérifiez votre connexion.';
    }
    return error.message || fallback;
  }

  return fallback;
}

/* ============================================================================
 * COMPOSANT
 * ========================================================================== */

export const FleetManagement: React.FC = () => {
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [stats, setStats] = useState<FleetStatsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<CreateAircraftDto>(DEFAULT_FORM_STATE);

  /* Toasts + Modal */
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: null,
    aircraftId: null,
    aircraftRegistration: null,
  });

  /* -------------------------------------------------------------------------
   * TOASTS
   * ----------------------------------------------------------------------- */

  const showToast = useCallback(
    (message: string, type: 'success' | 'error') => {
      // ID unique (evite les collisions si 2 toasts en même ms)
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  /* -------------------------------------------------------------------------
   * CHARGEMENT DES DONNÉES
   * ----------------------------------------------------------------------- */

  const fetchFleetData = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      const [aircraftsData, statsData] = await Promise.all([
        fleetService.getAircrafts(),
        fleetService.getFleetStatistics(),
      ]);
      setAircrafts(aircraftsData);
      setStats(statsData);
    } catch (err: unknown) {
      showToast(
        extractErrorMessage(err, 'Erreur lors du chargement de la flotte'),
        'error',
      );
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchFleetData();
  }, [fetchFleetData]);

  /* -------------------------------------------------------------------------
   * SUBMIT — AJOUT D'UN AVION
   * ----------------------------------------------------------------------- */

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
    } catch (err: unknown) {
      showToast(
        extractErrorMessage(err, "Erreur lors de l'ajout de l'aéronef"),
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  };

  /* -------------------------------------------------------------------------
   * MODAL DE CONFIRMATION
   * ----------------------------------------------------------------------- */

  const openConfirmationModal = (
    type: 'delete' | 'reset',
    aircraft: Aircraft,
  ) => {
    setModal({
      isOpen: true,
      type,
      aircraftId: aircraft.id,
      aircraftRegistration: aircraft.registration,
    });
  };

  const closeConfirmationModal = useCallback(() => {
    setModal({
      isOpen: false,
      type: null,
      aircraftId: null,
      aircraftRegistration: null,
    });
  }, []);

  const handleConfirmAction = async () => {
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
    } catch (err: unknown) {
      showToast(
        extractErrorMessage(err, 'Une erreur est survenue lors de l\'action'),
        'error',
      );
    } finally {
      closeConfirmationModal();
    }
  };

  /* -------------------------------------------------------------------------
   * ESCAPE + BODY LOCK QUAND MODAL OUVERTE
   * ----------------------------------------------------------------------- */

  useEffect(() => {
    if (!modal.isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeConfirmationModal();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modal.isOpen, closeConfirmationModal]);

  /* -------------------------------------------------------------------------
   * BADGE STATUT
   * ----------------------------------------------------------------------- */

  const getStatusBadge = (status: Aircraft['status']) => {
    const config = AIRCRAFT_STATUSES[status] || AIRCRAFT_STATUSES.Active;
    const Icon = config.icon;
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold whitespace-nowrap ${config.color}`}
      >
        <Icon className="h-3.5 w-3.5" /> {config.label}
      </span>
    );
  };

  /* -------------------------------------------------------------------------
   * LOADING INITIAL
   * ----------------------------------------------------------------------- */

  if (isLoading && aircrafts.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader className="mx-auto mb-2 h-8 w-8 animate-spin text-emerald-700" />
          <p className="text-sm font-medium text-slate-500">
            Chargement de la flotte aéronautique...
          </p>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------
   * RENDER
   * ----------------------------------------------------------------------- */

  return (
    <div className="relative mx-auto max-w-350 space-y-6 p-4 md:p-6">
      {/* ═══════════════════════ TOASTS ═══════════════════════ */}
      <div className="pointer-events-none fixed right-5 top-5 z-50 flex w-full max-w-md flex-col gap-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex transform items-start gap-3 rounded-2xl border p-4 shadow-xl transition-all duration-300 ${
              t.type === 'success'
                ? 'border-emerald-100 bg-white text-emerald-900 shadow-emerald-100/40'
                : 'border-rose-100 bg-white text-rose-900 shadow-rose-100/40'
            }`}
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            )}
            <p className="flex-1 pr-2 text-sm font-semibold">{t.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="text-slate-400 transition hover:text-slate-600"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* ═══════════════════════ STATISTIQUES ═══════════════════════ */}
      <FleetStatistics stats={stats} isLoading={isLoading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ─────────── FORMULAIRE D'IMMATRICULATION ─────────── */}
        <div className="h-fit rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-5 flex items-center gap-2.5 text-base font-bold text-slate-900">
            <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-700">
              <Plus className="h-4 w-4" />
            </div>
            Immatriculer un Appareil
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Immatriculation
              </label>
              <input
                type="text"
                placeholder="ex: 5R-MFT"
                value={form.registration}
                onChange={(e) =>
                  setForm({ ...form, registration: e.target.value.toUpperCase() })
                }
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-mono text-sm placeholder:text-slate-300 transition focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-50"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Modèle
                </label>
                <select
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition focus:border-emerald-700 focus:outline-none"
                >
                  <option value="Boeing 737-800">Boeing 737-800</option>
                  <option value="Airbus A320">Airbus A320</option>
                  <option value="Boeing 787-8">Boeing 787-8</option>
                  <option value="ATR 72-600">ATR 72-600</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Sièges
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={(e) =>
                    setForm({ ...form, capacity: parseInt(e.target.value) || 0 })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition focus:border-emerald-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Heures de Vol
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.totalFlightHours}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      totalFlightHours: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition focus:border-emerald-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Butoir (h)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.maintenanceHoursLimit}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maintenanceHoursLimit: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition focus:border-emerald-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Base d'attache
                </label>
                <select
                  value={form.homeBase || ''}
                  onChange={(e) =>
                    setForm({ ...form, homeBase: e.target.value || undefined })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition focus:border-emerald-700 focus:outline-none"
                >
                  <option value="TNR">TNR (Ivato)</option>
                  <option value="CDG">CDG (Paris)</option>
                  <option value="ORY">ORY (Orly)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Statut Initial
                </label>
                <select
                  value={form.status || 'Active'}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as Aircraft['status'],
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition focus:border-emerald-700 focus:outline-none"
                >
                  <option value="Active">En Service</option>
                  <option value="Maintenance">En Maintenance</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-700/15 transition duration-150 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isSaving ? 'Immatriculation...' : "Ajouter l'appareil"}
            </button>
          </form>
        </div>

        {/* ─────────── LISTE DU REGISTRE TECHNIQUE ─────────── */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="flex items-center gap-2.5 text-base font-bold text-slate-900">
              <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-700">
                <Plane className="h-4 w-4" />
              </div>
              Registre Technique Actif ({aircrafts.length})
            </h3>
            <button
              type="button"
              onClick={() => void fetchFleetData()}
              disabled={isLoading}
              className="rounded-xl border border-slate-100 p-2 transition hover:bg-slate-50 disabled:opacity-50"
              title="Rafraîchir les données"
            >
              <RefreshCw
                className={`h-4 w-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          <div className="custom-scrollbar max-h-170 space-y-3 overflow-y-auto pr-1">
            {aircrafts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
                <Plane className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-400">
                  Aucun aéronef enregistré dans la flotte.
                </p>
              </div>
            ) : (
              aircrafts.map((aircraft) => {
                const hoursBeforeMaintenance =
                  aircraft.maintenanceHoursLimit - aircraft.totalFlightHours;
                const isMaintenanceCritical =
                  hoursBeforeMaintenance <= CRITICAL_THRESHOLD_HOURS &&
                  aircraft.status === 'Active';

                return (
                  <div
                    key={aircraft.id}
                    className={`rounded-xl border p-4 transition duration-150 hover:border-slate-300 ${
                      isMaintenanceCritical
                        ? 'border-amber-200 bg-amber-50/10'
                        : 'border-slate-100 bg-white'
                    }`}
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div className="flex flex-1 items-start gap-3.5">
                        <div className="shrink-0 rounded-xl bg-slate-900 p-2.5 text-emerald-400 shadow-sm">
                          <Plane className="h-5 w-5" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-base font-black tracking-wide text-slate-900">
                              {aircraft.registration}
                            </span>
                            {getStatusBadge(aircraft.status)}
                          </div>
                          <p className="text-xs font-medium text-slate-500">
                            {aircraft.model} •{' '}
                            <span className="font-semibold text-slate-600">
                              {aircraft.capacity} PAX
                            </span>{' '}
                            • Base :{' '}
                            <span className="font-semibold text-slate-600">
                              {aircraft.homeBase || 'N/A'}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-5 border-t border-slate-100 pt-3 sm:justify-end sm:border-t-0 sm:pt-0">
                        <div className="text-left sm:text-right">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Heures totales
                          </span>
                          <span className="mt-0.5 block font-mono text-sm font-bold text-slate-700">
                            {(aircraft.totalFlightHours || 0).toLocaleString()} h
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Butoir restant
                          </span>
                          <span
                            className={`mt-0.5 block font-mono text-sm font-bold ${
                              isMaintenanceCritical
                                ? 'animate-pulse font-black text-rose-600'
                                : hoursBeforeMaintenance <= 0
                                  ? 'text-rose-600'
                                  : 'text-slate-600'
                            }`}
                          >
                            {(hoursBeforeMaintenance || 0).toLocaleString()} h
                          </span>
                        </div>

                        <div className="flex gap-1 pl-2">
                          {aircraft.status === 'Maintenance' && (
                            <button
                              type="button"
                              onClick={() =>
                                openConfirmationModal('reset', aircraft)
                              }
                              className="rounded-lg border border-transparent p-2 text-emerald-600 transition hover:border-emerald-100 hover:bg-emerald-50"
                              title="Libérer et réinitialiser le compteur de maintenance"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              openConfirmationModal('delete', aircraft)
                            }
                            className="rounded-lg border border-transparent p-2 text-slate-400 transition hover:border-rose-100 hover:bg-rose-50 hover:text-rose-600"
                            title="Supprimer l'aéronef de la flotte"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {isMaintenanceCritical && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
                        <span>
                          Alerte d'ordonnancement : Seuil critique atteint (
                          {hoursBeforeMaintenance}h). Maintenance obligatoire
                          imminente.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════ MODAL DE CONFIRMATION ═══════════════════════ */}
      {modal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={closeConfirmationModal}
            aria-hidden
          />

          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div
                className={`shrink-0 rounded-xl p-3 ${
                  modal.type === 'delete'
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-amber-50 text-amber-600'
                }`}
              >
                {modal.type === 'delete' ? (
                  <Trash2 className="h-6 w-6" />
                ) : (
                  <RefreshCw className="h-6 w-6" />
                )}
              </div>

              <div className="flex-1 space-y-1.5">
                <h4 className="text-base font-bold text-slate-900">
                  {modal.type === 'delete'
                    ? "Supprimer l'appareil"
                    : 'Réinitialiser la maintenance'}
                </h4>
                <p className="text-sm leading-relaxed text-slate-500">
                  {modal.type === 'delete' ? (
                    <>
                      Êtes-vous sûr de vouloir retirer définitivement l'aéronef{' '}
                      <span className="font-mono font-bold text-slate-800">
                        {modal.aircraftRegistration}
                      </span>{' '}
                      du registre technique opérationnel ? Cette action est
                      irréversible.
                    </>
                  ) : (
                    <>
                      Voulez-vous confirmer la fin des travaux et réinitialiser
                      le compteur butoir de l'appareil{' '}
                      <span className="font-mono font-bold text-slate-800">
                        {modal.aircraftRegistration}
                      </span>{' '}
                      ?
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirmationModal}
                className="rounded-xl border border-transparent px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 transition hover:border-slate-200 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmAction()}
                className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-md transition ${
                  modal.type === 'delete'
                    ? 'bg-rose-600 shadow-rose-600/10 hover:bg-rose-500'
                    : 'bg-emerald-600 shadow-emerald-600/10 hover:bg-emerald-500'
                }`}
              >
                {modal.type === 'delete'
                  ? 'Confirmer la suppression'
                  : 'Confirmer le reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};