import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import axios from 'axios';

import {
  Wrench,
  Plus,
  Calendar,
  Clock,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  X,
  Plane,
  RefreshCw,
  Gauge,
  Timer,
  CalendarPlus,
  Flag,
} from 'lucide-react';

import { fleetService } from '../fleet/fleetService';
import type { Aircraft } from '../fleet/fleetService';

import { maintenanceService } from './maintenanceService';
import type { MaintenanceSlot } from './maintenanceService';

type MaintenanceType =
  | 'Type A'
  | 'Type C'
  | 'Aircraft On Ground';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface DeleteModalState {
  isOpen: boolean;
  slotId: string | null;
  aircraftRegistration: string | null;
  daysCount: number;
}

type AircraftLike = Aircraft & {
  immatriculation?: string;
  modele?: string;
  statut?: string;
  baseAttache?: string | null;
  heuresDeVolTotales?: number;
  heuresDepuisDerniereMaintenance?: number;
  limiteHeuresMaintenance?: number;
  dateDerniereMaintenance?: string | null;
  type?: {
    nomModele?: string;
    fabricant?: string;
  } | null;
};

// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════

const SURFACE = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const FOCUS_RING =
  'focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100/70 outline-none transition';
const LABEL =
  'text-[10px] font-semibold uppercase tracking-wider text-slate-500';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const getAircraftRegistration = (aircraft?: AircraftLike | null): string =>
  aircraft?.registration || aircraft?.immatriculation || 'Appareil inconnu';

const getAircraftModel = (aircraft?: AircraftLike | null): string =>
  aircraft?.model ||
  aircraft?.modele ||
  aircraft?.type?.nomModele ||
  'Modèle inconnu';

const getAircraftStatus = (aircraft?: AircraftLike | null): string =>
  (aircraft?.status || aircraft?.statut || '').trim().toLowerCase();

const isMaintenanceAircraft = (aircraft: AircraftLike): boolean => {
  const status = getAircraftStatus(aircraft);
  return status === 'maintenance' || status.includes('mainten');
};

const isRetiredAircraft = (aircraft: AircraftLike): boolean => {
  const status = getAircraftStatus(aircraft);
  return status === 'retired' || status.includes('retir');
};

const formatRemainingTime = (ms: number): string => {
  if (ms <= 0) return 'Expiré';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  if (minutes > 0) return `${minutes}min ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
};

const isPendingReview = (slot: MaintenanceSlot): boolean =>
  slot.status === 'Pending Review';

interface StatusVisual {
  label: string;
  badge: string;
  iconWrap: string;
  icon: React.ReactNode;
}

const getStatusVisual = (slot: MaintenanceSlot): StatusVisual => {
  if (isPendingReview(slot)) {
    return {
      label: 'Décision requise',
      badge: 'border-amber-300 bg-amber-50 text-amber-800',
      iconWrap: 'bg-amber-100 text-amber-700 border border-amber-200',
      icon: <Timer className="h-5 w-5 animate-pulse" />,
    };
  }

  if (slot.status === 'Cancelled') {
    return {
      label: 'Annulé',
      badge: 'border-slate-200 bg-slate-50 text-slate-500',
      iconWrap: 'bg-slate-100 text-slate-500 border border-slate-200',
      icon: <X className="h-5 w-5" />,
    };
  }

  if (slot.status === 'Completed') {
    return {
      label: 'Terminé',
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      iconWrap: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
      icon: <CheckCircle2 className="h-5 w-5" />,
    };
  }

  const now = new Date();
  const startDateObj = new Date(slot.startTime);
  const endDateObj = new Date(slot.endTime);

  if (slot.maintenanceType === 'Aircraft On Ground') {
    return {
      label: 'Urgence AOG',
      badge: 'border-rose-200 bg-rose-50 text-rose-700',
      iconWrap: 'bg-rose-50 text-rose-600 border border-rose-100',
      icon: <ShieldAlert className="h-5 w-5" />,
    };
  }

  if (now < startDateObj) {
    return {
      label: 'Planifié',
      badge: 'border-sky-200 bg-sky-50 text-sky-700',
      iconWrap: 'bg-sky-50 text-sky-600 border border-sky-100',
      icon: <Calendar className="h-5 w-5" />,
    };
  }

  if (now > endDateObj) {
    return {
      label: 'Terminé',
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      iconWrap: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
      icon: <CheckCircle2 className="h-5 w-5" />,
    };
  }

  return {
    label: 'En atelier',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    iconWrap: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    icon: <Wrench className="h-5 w-5 animate-pulse" />,
  };
};

const calculateDurationInDays = (start: string, end: string): number => {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return 1;
  }
  return Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));
};

const buildMaintenanceInterval = (
  dateValue: string,
  durationDays: number,
): { start: Date; end: Date } | null => {
  if (!dateValue || durationDays <= 0) return null;
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return null;
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const nextDay = new Date(year, month - 1, day + durationDays, 0, 0, 0, 0);
  const end = new Date(nextDay.getTime() - 1);
  return { start, end };
};

const intervalsOverlap = (
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean => startA < endB && endA > startB;

const formatNumber = (value?: number, digits = 1): string =>
  new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? Number(value) : 0);

const maintenanceRatio = (aircraft: AircraftLike): number => {
  const used = Number(aircraft.heuresDepuisDerniereMaintenance ?? 0);
  const limit = Number(aircraft.limiteHeuresMaintenance ?? 0);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
};

const syncExpiredMaintenances = async (): Promise<void> => {
  const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001';
  const token =
    localStorage.getItem('userToken') ||
    sessionStorage.getItem('userToken') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token');
  await axios.patch(`${API_URL}/maintenance/sync-expired`, undefined, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
};

const getAxiosErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string | string[]; error?: string }
      | undefined;
    if (Array.isArray(data?.message)) return data.message.join(' ');
    if (typeof data?.message === 'string' && data.message.trim()) {
      return data.message;
    }
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
    if (error.response?.status === 409) {
      return "Cet appareil possède déjà un créneau de maintenance qui chevauche la période demandée.";
    }
    return error.message || 'Erreur de communication avec le serveur.';
  }
  if (error instanceof Error) return error.message;
  return 'Une erreur inattendue est survenue.';
};

// ═══════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════

export const MaintenancePlanning: React.FC = () => {
  const [slots, setSlots] = useState<MaintenanceSlot[]>([]);
  const [aircrafts, setAircrafts] = useState<AircraftLike[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fleetRefreshing, setFleetRefreshing] = useState(false);

  const [selectedAircraftId, setSelectedAircraftId] = useState<string>('');
  const [maintenanceType, setMaintenanceType] =
    useState<MaintenanceType>('Type A');
  const [startDate, setStartDate] = useState<string>('');
  const [durationDays, setDurationDays] = useState<number>(1);
  const [description, setDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [toasts, setToasts] = useState<ToastState[]>([]);

  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    isOpen: false,
    slotId: null,
    aircraftRegistration: null,
    daysCount: 0,
  });
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  const toastTimerRef = useRef<{ [key: number]: number }>({});
  const formRef = useRef<HTMLDivElement | null>(null);

  // ═══════════════════════════════════════════════════════════════
  // TOASTS
  // ═══════════════════════════════════════════════════════════════

  const showToast = useCallback(
    (message: string, type: 'success' | 'error') => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, type }]);
      toastTimerRef.current[id] = window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        delete toastTimerRef.current[id];
      }, 4500);
    },
    [],
  );

  useEffect(() => {
    return () => {
      Object.values(toastTimerRef.current).forEach(window.clearTimeout);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // CHARGEMENT DES DONNÉES
  // ═══════════════════════════════════════════════════════════════

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [fetchedSlots, fetchedAircrafts] = await Promise.all([
        maintenanceService.findAll(),
        fleetService.getAircrafts(),
      ]);
      setSlots(fetchedSlots);

      const fleet = fetchedAircrafts as AircraftLike[];
      setAircrafts(fleet);

      setSelectedAircraftId((current) => {
        if (
          current &&
          fleet.some(
            (aircraft) =>
              aircraft.id === current && !isRetiredAircraft(aircraft),
          )
        ) {
          return current;
        }
        const maintenanceAircraft = fleet.find(isMaintenanceAircraft);
        const availableAircraft = fleet.find(
          (aircraft) => !isRetiredAircraft(aircraft),
        );
        return maintenanceAircraft?.id || availableAircraft?.id || '';
      });
    } catch (error: unknown) {
      showToast(
        getAxiosErrorMessage(error) ||
          'Erreur lors du chargement des données de maintenance.',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const refreshFleet = useCallback(async () => {
    try {
      setFleetRefreshing(true);
      const data = await fleetService.getAircrafts();
      setAircrafts(data as AircraftLike[]);
    } catch (error: unknown) {
      showToast(getAxiosErrorMessage(error), 'error');
    } finally {
      setFleetRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ═══════════════════════════════════════════════════════════════
  // POLLING 30 s
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          await syncExpiredMaintenances();
          const [refreshedSlots, refreshedAircrafts] = await Promise.all([
            maintenanceService.findAll(),
            fleetService.getAircrafts(),
          ]);
          setSlots(refreshedSlots);
          setAircrafts(refreshedAircrafts as AircraftLike[]);
        } catch {
          // Synchronisation silencieuse de fond.
        }
      })();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // DONNÉES DÉRIVÉES
  // ═══════════════════════════════════════════════════════════════

  const maintenanceAircrafts = useMemo(
    () => aircrafts.filter(isMaintenanceAircraft),
    [aircrafts],
  );

  /**
   * ⭐ Tri : les appareils critiques d'abord, puis warning, puis normaux.
   * À l'intérieur d'une catégorie, tri par ratio décroissant.
   */
  const sortedMaintenanceAircrafts = useMemo(() => {
    const priority = (ac: AircraftLike) => {
      const r = maintenanceRatio(ac);
      if (r >= 90) return 0;
      if (r >= 75) return 1;
      return 2;
    };
    return [...maintenanceAircrafts].sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      return maintenanceRatio(b) - maintenanceRatio(a);
    });
  }, [maintenanceAircrafts]);

  const selectableAircrafts = useMemo(
    () => aircrafts.filter((aircraft) => !isRetiredAircraft(aircraft)),
    [aircrafts],
  );

  const otherAircrafts = useMemo(
    () =>
      selectableAircrafts.filter(
        (aircraft) => !isMaintenanceAircraft(aircraft),
      ),
    [selectableAircrafts],
  );

  const pendingReviewSlots = useMemo(
    () => slots.filter(isPendingReview),
    [slots],
  );

  const requestedMaintenanceConflict = useMemo(() => {
    const interval = buildMaintenanceInterval(startDate, durationDays);
    if (!interval || !selectedAircraftId) return null;
    return (
      slots.find((slot) => {
        if (slot.aircraftId !== selectedAircraftId) return false;
        const existingStart = new Date(slot.startTime);
        const existingEnd = new Date(slot.endTime);
        if (
          Number.isNaN(existingStart.getTime()) ||
          Number.isNaN(existingEnd.getTime())
        ) {
          return false;
        }
        return intervalsOverlap(
          interval.start,
          interval.end,
          existingStart,
          existingEnd,
        );
      }) ?? null
    );
  }, [slots, selectedAircraftId, startDate, durationDays]);

  const activeSlotAircraftIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      slots
        .filter((slot) => {
          if (isPendingReview(slot)) return true;
          if (slot.status === 'Cancelled' || slot.status === 'Completed') {
            return false;
          }
          return new Date(slot.endTime).getTime() >= now;
        })
        .map((slot) => slot.aircraftId),
    );
  }, [slots]);

  const selectedAircraft = useMemo(
    () =>
      aircrafts.find((aircraft) => aircraft.id === selectedAircraftId) ?? null,
    [aircrafts, selectedAircraftId],
  );

  const maintenanceSummary = useMemo(() => {
    const now = Date.now();
    let planned = 0;
    let active = 0;
    let completed = 0;
    let aog = 0;
    let pendingReview = 0;
    for (const slot of slots) {
      const start = new Date(slot.startTime).getTime();
      const end = new Date(slot.endTime).getTime();
      if (isPendingReview(slot)) pendingReview += 1;
      if (slot.maintenanceType === 'Aircraft On Ground' && end >= now) {
        aog += 1;
      }
      if (slot.status === 'Cancelled') continue;
      if (now < start) planned += 1;
      else if (now <= end) active += 1;
      else completed += 1;
    }
    return { planned, active, completed, aog, pendingReview };
  }, [slots]);

  const groupedSlots = useMemo(() => {
    const now = Date.now();
    const pending: MaintenanceSlot[] = [];
    const aog: MaintenanceSlot[] = [];
    const active: MaintenanceSlot[] = [];
    const planned: MaintenanceSlot[] = [];
    const archived: MaintenanceSlot[] = [];

    for (const slot of slots) {
      if (isPendingReview(slot)) {
        pending.push(slot);
        continue;
      }
      if (slot.status === 'Completed' || slot.status === 'Cancelled') {
        archived.push(slot);
        continue;
      }
      const start = new Date(slot.startTime).getTime();
      const end = new Date(slot.endTime).getTime();
      if (slot.maintenanceType === 'Aircraft On Ground') {
        aog.push(slot);
      } else if (now < start) {
        planned.push(slot);
      } else if (now <= end) {
        active.push(slot);
      } else {
        archived.push(slot);
      }
    }
    return { pending, aog, active, planned, archived };
  }, [slots]);

  // ═══════════════════════════════════════════════════════════════
  // SÉLECTION & FORMULAIRE
  // ═══════════════════════════════════════════════════════════════

  const selectAircraftForPlanning = (aircraft: AircraftLike) => {
    setSelectedAircraftId(aircraft.id);
    if (!startDate) {
      const today = new Date();
      setStartDate(
        [
          today.getFullYear(),
          String(today.getMonth() + 1).padStart(2, '0'),
          String(today.getDate()).padStart(2, '0'),
        ].join('-'),
      );
    }
    if (!description) {
      setDescription(`Maintenance de ${getAircraftRegistration(aircraft)}`);
    }
    formRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleScheduleMaintenance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAircraftId || !startDate || durationDays <= 0) {
      showToast(
        'Veuillez sélectionner un appareil, une date et une durée valides.',
        'error',
      );
      return;
    }
    const interval = buildMaintenanceInterval(startDate, durationDays);
    if (!interval) {
      showToast('La période de maintenance est invalide.', 'error');
      return;
    }
    if (requestedMaintenanceConflict) {
      showToast(
        `Conflit : cet appareil possède déjà une maintenance du ${new Date(
          requestedMaintenanceConflict.startTime,
        ).toLocaleString('fr-FR')} au ${new Date(
          requestedMaintenanceConflict.endTime,
        ).toLocaleString('fr-FR')}.`,
        'error',
      );
      return;
    }

    try {
      setSubmitting(true);
      const availability = await maintenanceService.checkAvailability(
        selectedAircraftId,
        interval.start.toISOString(),
        interval.end.toISOString(),
      );

      if (!availability.available) {
        if (availability.maintenanceConflict) {
          const conflict = availability.maintenanceConflict;
          showToast(
            `Impossible de planifier : une maintenance existe déjà du ${new Date(
              conflict.startTime,
            ).toLocaleString('fr-FR')} au ${new Date(
              conflict.endTime,
            ).toLocaleString('fr-FR')}.`,
            'error',
          );
          return;
        }
        if (availability.flightConflict) {
          const conflict = availability.flightConflict;
          showToast(
            `Impossible de planifier : le vol ${conflict.numeroVol} occupe déjà cet avion du ${new Date(
              conflict.heureDepart,
            ).toLocaleString('fr-FR')} au ${new Date(
              conflict.heureArrivee,
            ).toLocaleString('fr-FR')}.`,
            'error',
          );
          return;
        }
        showToast(
          "Impossible de planifier : l'appareil n'est pas disponible sur cette période.",
          'error',
        );
        return;
      }

      await maintenanceService.create({
        aircraftId: selectedAircraftId,
        maintenanceType,
        startTime: interval.start.toISOString(),
        endTime: interval.end.toISOString(),
        description: description.trim() || undefined,
      });

      showToast('Blocage technique planifié avec succès.', 'success');
      setStartDate('');
      setDurationDays(1);
      setDescription('');
      await loadData();
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const payload = error.response?.data as
          | {
              code?: string;
              message?: string | string[];
              conflict?: unknown;
              conflictingMaintenanceId?: string;
              conflictingFlightId?: string;
            }
          | undefined;

        console.error('[MaintenancePlanning] API error', { status, payload });

        if (status === 409) {
          const backendCode = payload?.code;
          const message = Array.isArray(payload?.message)
            ? payload.message.join(' ')
            : payload?.message || getAxiosErrorMessage(error);
          showToast(
            backendCode ? `[${backendCode}] ${message}` : message,
            'error',
          );
          try {
            const freshSlots = await maintenanceService.findAll();
            setSlots(freshSlots);
          } catch {
            // Erreur principale déjà affichée.
          }
          return;
        }
      }
      showToast(getAxiosErrorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // ACTIONS PENDING_REVIEW
  // ═══════════════════════════════════════════════════════════════

  const handleExtend = useCallback(
    async (slotId: string, additionalDays: number) => {
      try {
        await maintenanceService.extend(slotId, additionalDays);
        showToast(
          `Maintenance prolongée de ${additionalDays} jour${
            additionalDays > 1 ? 's' : ''
          }.`,
          'success',
        );
        await loadData();
      } catch (error: unknown) {
        showToast(getAxiosErrorMessage(error), 'error');
      }
    },
    [loadData, showToast],
  );

  const handleCloseSlot = useCallback(
    async (slotId: string) => {
      try {
        await maintenanceService.close(slotId);
        showToast(
          'Maintenance clôturée, appareil remis en service.',
          'success',
        );
        await loadData();
      } catch (error: unknown) {
        showToast(getAxiosErrorMessage(error), 'error');
      }
    },
    [loadData, showToast],
  );

  // ═══════════════════════════════════════════════════════════════
  // SUPPRESSION
  // ═══════════════════════════════════════════════════════════════

  const openDeleteModal = (slot: MaintenanceSlot) => {
    const targetAircraft = slot.aircraft as AircraftLike | undefined;
    setDeleteConfirmed(false);
    setDeleteModal({
      isOpen: true,
      slotId: slot.id,
      aircraftRegistration: getAircraftRegistration(targetAircraft),
      daysCount: calculateDurationInDays(slot.startTime, slot.endTime),
    });
  };

  const closeDeleteModal = () => {
    setDeleteConfirmed(false);
    setDeleteModal({
      isOpen: false,
      slotId: null,
      aircraftRegistration: null,
      daysCount: 0,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.slotId) return;
    if (deleteModal.daysCount > 3 && !deleteConfirmed) return;
    try {
      await maintenanceService.remove(deleteModal.slotId);
      showToast('Blocage technique annulé avec succès.', 'success');
      closeDeleteModal();
      await loadData();
    } catch (error: unknown) {
      showToast(getAxiosErrorMessage(error), 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDU — LOADING
  // ═══════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div
        className={`mx-auto flex min-h-105 w-full max-w-[1600px] items-center justify-center ${SURFACE}`}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Chargement de la maintenance
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Synchronisation de la flotte et des créneaux techniques...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDU — PRINCIPAL
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-8">
      {/* ═══════════════ TOASTS ═══════════════ */}
      <div className="pointer-events-none fixed right-5 top-5 z-70 flex w-[calc(100%-2.5rem)] max-w-md flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-xl shadow-slate-950/10 ${
              toast.type === 'success'
                ? 'border-emerald-200'
                : 'border-rose-200'
            }`}
          >
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                toast.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-600'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  toast.type === 'success'
                    ? 'text-emerald-700'
                    : 'text-rose-600'
                }`}
              >
                {toast.type === 'success'
                  ? 'Opération réussie'
                  : 'Action impossible'}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-700">
                {toast.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setToasts((current) =>
                  current.filter((item) => item.id !== toast.id),
                )
              }
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* ═══════════════ HEADER ═══════════════ */}
      <header className={`${SURFACE} overflow-hidden`}>
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                Planification maintenance
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                Créneaux hangar · Conflits vols · Décisions automatiques
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Sync 30s
            </span>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={fleetRefreshing}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 ${FOCUS_RING}`}
            >
              <RefreshCw
                className={`h-4 w-4 ${fleetRefreshing ? 'animate-spin' : ''}`}
              />
              Actualiser
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════ KPI ═══════════════ */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="En maintenance"
          value={maintenanceAircrafts.length}
          hint="Flotte"
          variant="amber"
          icon={<Wrench className="h-4 w-4" />}
        />
        <KpiCard
          label="En atelier"
          value={maintenanceSummary.active}
          hint="Maintenant"
          variant="emerald"
          icon={<Gauge className="h-4 w-4" />}
        />
        <KpiCard
          label="Planifiés"
          value={maintenanceSummary.planned}
          hint="À venir"
          variant="sky"
          icon={<Calendar className="h-4 w-4" />}
        />
        <KpiCard
          label="Urgences AOG"
          value={maintenanceSummary.aog}
          hint="Priorité"
          variant="rose"
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <KpiCard
          label="Décisions"
          value={pendingReviewSlots.length}
          hint="Fenêtre 12h"
          variant={pendingReviewSlots.length > 0 ? 'warning' : 'neutral'}
          icon={
            pendingReviewSlots.length > 0 ? (
              <Timer className="h-4 w-4 animate-pulse" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )
          }
        />
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DÉCISIONS EN ATTENTE (PENDING_REVIEW)                      */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {pendingReviewSlots.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-amber-300 bg-linear-to-br from-amber-50 to-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-amber-200/70 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm shadow-amber-500/30">
                <Timer className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white">
                  {pendingReviewSlots.length}
                </span>
              </div>
              <div>
                <h2 className="text-sm font-bold text-amber-900">
                  Décisions requises
                </h2>
                <p className="text-xs text-amber-700/80">
                  Sans action dans les 12 h, l'appareil est remis en service
                  automatiquement.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-4 sm:p-5">
            {pendingReviewSlots.map((slot) => (
              <PendingReviewCard
                key={slot.id}
                slot={slot}
                onExtend={(days) => handleExtend(slot.id, days)}
                onClose={() => handleCloseSlot(slot.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* APPAREILS NÉCESSITANT UNE INTERVENTION                     */}
      {/* ═══════════════════════════════════════════════════════════ */}

      <section className={SURFACE}>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <Plane className="h-4 w-4" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">
                Appareils nécessitant une intervention
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                {maintenanceAircrafts.length}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Cette liste est alimentée automatiquement par le statut technique
              de la flotte.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refreshFleet()}
            disabled={fleetRefreshing}
            className={`inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 ${FOCUS_RING}`}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                fleetRefreshing ? 'animate-spin' : ''
              }`}
            />
            Synchroniser
          </button>
        </div>

        <div className="p-4 sm:p-5">
          {maintenanceAircrafts.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              tone="emerald"
              title="Aucun appareil signalé en maintenance"
              description="La flotte ne présente actuellement aucun appareil nécessitant un traitement."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sortedMaintenanceAircrafts.map((aircraft) => (
                <MaintenanceAircraftCard
                  key={aircraft.id}
                  aircraft={aircraft}
                  isSelected={aircraft.id === selectedAircraftId}
                  hasSlot={activeSlotAircraftIds.has(aircraft.id)}
                  onPlan={() => selectAircraftForPlanning(aircraft)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* FORM + PLANNING                                            */}
      {/* ═══════════════════════════════════════════════════════════ */}

      <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* FORM */}
        <div
          ref={formRef}
          className={`${SURFACE} h-fit xl:sticky xl:top-4`}
        >
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <Plus className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Nouveau blocage technique
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Réservation d'un créneau d'immobilisation
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleScheduleMaintenance} className="space-y-5 p-5">
            {/* Appareil */}
            <FieldGroup icon={<Plane className="h-3.5 w-3.5" />} label="Appareil">
              <select
                value={selectedAircraftId}
                onChange={(event) => setSelectedAircraftId(event.target.value)}
                required
                className={`h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 focus:bg-white ${FOCUS_RING}`}
              >
                {maintenanceAircrafts.length > 0 && (
                  <optgroup label="Maintenance requise">
                    {maintenanceAircrafts.map((aircraft) => (
                      <option key={aircraft.id} value={aircraft.id}>
                        {getAircraftRegistration(aircraft)} —{' '}
                        {getAircraftModel(aircraft)}
                      </option>
                    ))}
                  </optgroup>
                )}

                {otherAircrafts.length > 0 && (
                  <optgroup label="Autres appareils">
                    {otherAircrafts.map((aircraft) => (
                      <option key={aircraft.id} value={aircraft.id}>
                        {getAircraftRegistration(aircraft)} —{' '}
                        {getAircraftModel(aircraft)}
                      </option>
                    ))}
                  </optgroup>
                )}

                {selectableAircrafts.length === 0 && (
                  <option value="">Aucun appareil disponible</option>
                )}
              </select>

              {selectedAircraft && (
                <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                  <Plane className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-slate-700">
                      {getAircraftRegistration(selectedAircraft)} ·{' '}
                      {getAircraftModel(selectedAircraft)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Statut :{' '}
                      {getAircraftStatus(selectedAircraft) || 'non renseigné'}
                    </p>
                  </div>
                </div>
              )}
            </FieldGroup>

            {/* Intervention */}
            <FieldGroup
              icon={<Wrench className="h-3.5 w-3.5" />}
              label="Intervention"
            >
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      v: 'Type A',
                      label: 'Type A',
                      sub: 'Inspection légère',
                    },
                    {
                      v: 'Type C',
                      label: 'Type C',
                      sub: 'Inspection lourde',
                    },
                    {
                      v: 'Aircraft On Ground',
                      label: 'AOG',
                      sub: 'Urgence',
                    },
                  ] as const
                ).map((opt) => {
                  const active = maintenanceType === opt.v;
                  const isAog = opt.v === 'Aircraft On Ground';
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setMaintenanceType(opt.v)}
                      className={`rounded-xl border p-2.5 text-left transition ${FOCUS_RING} ${
                        active
                          ? isAog
                            ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-100'
                            : 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <p
                        className={`text-xs font-semibold ${
                          active
                            ? isAog
                              ? 'text-rose-800'
                              : 'text-emerald-800'
                            : 'text-slate-700'
                        }`}
                      >
                        {opt.label}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {opt.sub}
                      </p>
                    </button>
                  );
                })}
              </div>
            </FieldGroup>

            {/* Période */}
            <FieldGroup
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Période"
            >
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={`mb-1.5 block ${LABEL}`}>Début</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    required
                    className={`h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 ${FOCUS_RING}`}
                  />
                </div>
                <div>
                  <label className={`mb-1.5 block ${LABEL}`}>Durée</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      value={durationDays}
                      onChange={(event) =>
                        setDurationDays(
                          Math.max(1, Number(event.target.value) || 1),
                        )
                      }
                      required
                      className={`h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pr-12 text-xs font-semibold text-slate-700 ${FOCUS_RING}`}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase text-slate-400">
                      jours
                    </span>
                  </div>
                </div>
              </div>
            </FieldGroup>

            {requestedMaintenanceConflict && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <div>
                    <p className="text-[11px] font-semibold text-rose-800">
                      Créneau indisponible
                    </p>
                    <p className="mt-1 text-[10px] leading-5 text-rose-700">
                      Un autre créneau existe déjà du{' '}
                      {new Date(
                        requestedMaintenanceConflict.startTime,
                      ).toLocaleString('fr-FR')}{' '}
                      au{' '}
                      {new Date(
                        requestedMaintenanceConflict.endTime,
                      ).toLocaleString('fr-FR')}
                      .
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            <FieldGroup
              icon={<Wrench className="h-3.5 w-3.5" />}
              label="Travaux prévus"
            >
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Ex. inspection cellule, contrôle moteur, remplacement de pièces..."
                className={`w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5 text-slate-700 placeholder:text-slate-300 ${FOCUS_RING}`}
              />
            </FieldGroup>

            <button
              type="submit"
              disabled={
                submitting ||
                selectableAircrafts.length === 0 ||
                Boolean(requestedMaintenanceConflict)
              }
              className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition ${
                requestedMaintenanceConflict
                  ? 'cursor-not-allowed bg-rose-400'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              } disabled:opacity-60`}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Vérification et création...
                </>
              ) : requestedMaintenanceConflict ? (
                <>
                  <AlertCircle className="h-4 w-4" />
                  Période en conflit
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4" />
                  Planifier la maintenance
                </>
              )}
            </button>

            <p className="text-center text-[10px] leading-4 text-slate-400">
              La disponibilité est vérifiée côté serveur avant la création du
              créneau.
            </p>
          </form>
        </div>

        {/* PLANNING */}
        <div className={`${SURFACE} overflow-hidden`}>
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Wrench className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-slate-900">
                  Planning des interventions
                </h2>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Créneaux hangar, immobilisations et interventions techniques.
              </p>
            </div>

            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-500">
              {slots.length} intervention(s)
            </span>
          </div>

          <div className="p-4 sm:p-5">
            {slots.length === 0 ? (
              <EmptyState
                icon={<Wrench className="h-5 w-5" />}
                tone="slate"
                title="Aucun créneau de maintenance"
                description="Utilisez le formulaire pour créer la première immobilisation."
              />
            ) : (
              <div className="space-y-6">
                {groupedSlots.aog.length > 0 && (
                  <SlotGroup
                    title="Urgences AOG"
                    count={groupedSlots.aog.length}
                    tone="rose"
                  >
                    {groupedSlots.aog.map((slot) => (
                      <SlotRow
                        key={slot.id}
                        slot={slot}
                        onDelete={openDeleteModal}
                      />
                    ))}
                  </SlotGroup>
                )}

                {groupedSlots.active.length > 0 && (
                  <SlotGroup
                    title="En atelier"
                    count={groupedSlots.active.length}
                    tone="emerald"
                  >
                    {groupedSlots.active.map((slot) => (
                      <SlotRow
                        key={slot.id}
                        slot={slot}
                        onDelete={openDeleteModal}
                      />
                    ))}
                  </SlotGroup>
                )}

                {groupedSlots.planned.length > 0 && (
                  <SlotGroup
                    title="Planifiés"
                    count={groupedSlots.planned.length}
                    tone="sky"
                  >
                    {groupedSlots.planned.map((slot) => (
                      <SlotRow
                        key={slot.id}
                        slot={slot}
                        onDelete={openDeleteModal}
                      />
                    ))}
                  </SlotGroup>
                )}

                {groupedSlots.archived.length > 0 && (
                  <details className="group">
                    <summary className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-200 text-slate-600">
                        <Clock className="h-3.5 w-3.5" />
                      </span>
                      Historique
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {groupedSlots.archived.length}
                      </span>
                      <span className="ml-auto text-[10px] text-slate-400 transition group-open:rotate-180">
                        ▾
                      </span>
                    </summary>
                    <div className="mt-3 space-y-3">
                      {groupedSlots.archived.map((slot) => (
                        <SlotRow
                          key={slot.id}
                          slot={slot}
                          onDelete={openDeleteModal}
                          muted
                        />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════ MODALE SUPPRESSION ═══════════════ */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-80 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={closeDeleteModal}
            aria-label="Fermer"
          />

          <div
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl shadow-slate-950/20"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Annuler le créneau
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Cette action libérera l'immobilisation planifiée.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-4">
                <p className="text-xs leading-5 text-rose-800">
                  Confirmez-vous l'annulation du créneau de maintenance de
                  l'appareil{' '}
                  <span className="font-mono font-bold">
                    {deleteModal.aircraftRegistration}
                  </span>
                  ?
                </p>
              </div>

              {deleteModal.daysCount > 3 && (
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/50 p-3 transition hover:bg-rose-50">
                  <input
                    type="checkbox"
                    checked={deleteConfirmed}
                    onChange={(e) => setDeleteConfirmed(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span className="text-xs leading-5 text-rose-800">
                    Je confirme annuler une immobilisation de{' '}
                    <strong>{deleteModal.daysCount} jours</strong>.
                  </span>
                </label>
              )}

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  className={`rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 ${FOCUS_RING}`}
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDelete()}
                  disabled={deleteModal.daysCount > 3 && !deleteConfirmed}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Confirmer l'annulation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS
// ═══════════════════════════════════════════════════════════════

function FieldGroup({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
          {icon}
        </span>
        <span className="text-xs font-semibold text-slate-700">{label}</span>
      </div>
      {children}
    </div>
  );
}

type KpiVariant =
  | 'neutral'
  | 'amber'
  | 'emerald'
  | 'sky'
  | 'rose'
  | 'warning';

function KpiCard({
  label,
  value,
  hint,
  icon,
  variant = 'neutral',
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  variant?: KpiVariant;
}) {
  const styles: Record<
    KpiVariant,
    { ring: string; icon: string; value: string }
  > = {
    neutral: {
      ring: 'border-slate-200 bg-white',
      icon: 'bg-slate-100 text-slate-600',
      value: 'text-slate-900',
    },
    amber: {
      ring: 'border-amber-200 bg-amber-50/50',
      icon: 'bg-amber-100 text-amber-700',
      value: 'text-amber-900',
    },
    emerald: {
      ring: 'border-emerald-200 bg-emerald-50/50',
      icon: 'bg-emerald-100 text-emerald-700',
      value: 'text-emerald-900',
    },
    sky: {
      ring: 'border-sky-200 bg-sky-50/50',
      icon: 'bg-sky-100 text-sky-700',
      value: 'text-sky-900',
    },
    rose: {
      ring: 'border-rose-200 bg-rose-50/50',
      icon: 'bg-rose-100 text-rose-700',
      value: 'text-rose-900',
    },
    warning: {
      ring: 'border-amber-300 bg-amber-50',
      icon: 'bg-amber-200 text-amber-800',
      value: 'text-amber-800',
    },
  };

  const s = styles[variant];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm transition ${s.ring}`}>
      <div className="flex items-center justify-between">
        <span className={LABEL}>{label}</span>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.icon}`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`text-2xl font-bold tabular-nums ${s.value}`}>
          {value}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {hint}
        </span>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  tone,
  title,
  description,
}: {
  icon: React.ReactNode;
  tone: 'emerald' | 'slate';
  title: string;
  description: string;
}) {
  const tones = {
    emerald: {
      wrap: 'border-emerald-200 bg-emerald-50/40',
      icon: 'bg-white text-emerald-700 shadow-sm',
      title: 'text-emerald-800',
      desc: 'text-emerald-700/70',
    },
    slate: {
      wrap: 'border-slate-200 bg-slate-50/50',
      icon: 'border border-slate-200 bg-white text-slate-400 shadow-sm',
      title: 'text-slate-700',
      desc: 'text-slate-400',
    },
  } as const;

  const t = tones[tone];

  return (
    <div
      className={`flex min-h-36 items-center justify-center rounded-2xl border border-dashed p-6 text-center ${t.wrap}`}
    >
      <div>
        <div
          className={`mx-auto flex h-10 w-10 items-center justify-center rounded-2xl ${t.icon}`}
        >
          {icon}
        </div>
        <p className={`mt-3 text-sm font-semibold ${t.title}`}>{title}</p>
        <p className={`mt-1 text-xs ${t.desc}`}>{description}</p>
      </div>
    </div>
  );
}

function SlotGroup({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: 'rose' | 'emerald' | 'sky';
  children: React.ReactNode;
}) {
  const tones = {
    rose: 'text-rose-700 bg-rose-50 border-rose-200',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    sky: 'text-sky-700 bg-sky-50 border-sky-200',
  } as const;

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${tones[tone]}`}
        >
          {title}
          <span className="opacity-70">{count}</span>
        </span>
        <div className="h-px flex-1 bg-slate-100" />
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ⭐ CARTE APPAREIL EN MAINTENANCE (redesign)
// ═══════════════════════════════════════════════════════════════

function MaintenanceAircraftCard({
  aircraft,
  isSelected,
  hasSlot,
  onPlan,
}: {
  aircraft: AircraftLike;
  isSelected: boolean;
  hasSlot: boolean;
  onPlan: () => void;
}) {
  const ratio = maintenanceRatio(aircraft);
  const used = Number(aircraft.heuresDepuisDerniereMaintenance ?? 0);
  const limit = Number(aircraft.limiteHeuresMaintenance ?? 0);

  const tier: 'critical' | 'warning' | 'normal' =
    ratio >= 90 ? 'critical' : ratio >= 75 ? 'warning' : 'normal';

  const palette = {
    critical: {
      card: 'border-rose-200 bg-rose-50/40',
      accent: 'bg-rose-500',
      iconWrap: 'bg-rose-100 text-rose-700',
      ratioText: 'text-rose-700',
      bar: 'bg-rose-500',
      tag: 'border-rose-200 bg-rose-100 text-rose-700',
      tagLabel: 'Critique',
      action: 'bg-rose-600 hover:bg-rose-700',
    },
    warning: {
      card: 'border-amber-200 bg-amber-50/40',
      accent: 'bg-amber-500',
      iconWrap: 'bg-amber-100 text-amber-700',
      ratioText: 'text-amber-700',
      bar: 'bg-amber-500',
      tag: 'border-amber-200 bg-amber-100 text-amber-700',
      tagLabel: 'À surveiller',
      action: 'bg-amber-600 hover:bg-amber-700',
    },
    normal: {
      card: 'border-slate-200 bg-white',
      accent: 'bg-emerald-500',
      iconWrap: 'bg-emerald-50 text-emerald-700',
      ratioText: 'text-emerald-700',
      bar: 'bg-emerald-500',
      tag: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      tagLabel: 'Normal',
      action: 'bg-emerald-600 hover:bg-emerald-700',
    },
  }[tier];

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition ${palette.card} ${
        isSelected
          ? 'ring-2 ring-emerald-400/60 ring-offset-1'
          : 'hover:shadow-md'
      }`}
    >
      {/* Bande d'accent gauche */}
      <span
        className={`absolute inset-y-0 left-0 w-1 ${palette.accent}`}
        aria-hidden
      />

      {/* Header : identité + tag tier */}
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${palette.iconWrap}`}
          >
            <Plane className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-bold tracking-wide text-slate-900">
              {getAircraftRegistration(aircraft)}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {getAircraftModel(aircraft)}
            </p>
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${palette.tag}`}
        >
          {palette.tagLabel}
        </span>
      </div>

      {/* Barre de potentiel */}
      <div className="mt-4 pl-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Potentiel utilisé
          </span>
          <span
            className={`font-mono text-xs font-bold tabular-nums ${palette.ratioText}`}
          >
            {ratio}%
          </span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/70">
          <div
            className={`h-full rounded-full transition-all duration-500 ${palette.bar}`}
            style={{ width: `${ratio}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-[10px]">
          <span className="text-slate-500">
            {formatNumber(used)} h utilisées
          </span>
          <span className="text-slate-400">
            Limite {formatNumber(limit)} h
          </span>
        </div>
      </div>

      {/* Action */}
      <div className="mt-4 pl-2">
        {hasSlot ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Immobilisation déjà programmée
          </div>
        ) : (
          <button
            type="button"
            onClick={onPlan}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[11px] font-semibold text-white shadow-sm transition ${palette.action} ${FOCUS_RING}`}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Planifier cette maintenance
          </button>
        )}
      </div>
    </article>
  );
}

function SlotRow({
  slot,
  onDelete,
  muted = false,
}: {
  slot: MaintenanceSlot;
  onDelete: (slot: MaintenanceSlot) => void;
  muted?: boolean;
}) {
  const statusInfo = getStatusVisual(slot);
  const daysCount = calculateDurationInDays(slot.startTime, slot.endTime);
  const targetAircraft = slot.aircraft as AircraftLike | undefined;
  const registration = getAircraftRegistration(targetAircraft);
  const model = getAircraftModel(targetAircraft);
  const isOrphan = !slot.aircraft;
  const isPending = isPendingReview(slot);

  return (
    <article
      className={`group rounded-xl border p-3.5 transition hover:shadow-sm ${
        muted
          ? 'border-slate-100 bg-slate-50/40 opacity-80'
          : isPending
            ? 'border-amber-300 bg-amber-50/40'
            : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${statusInfo.iconWrap}`}
          >
            {statusInfo.icon}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`font-mono text-sm font-bold tracking-wide ${
                  isOrphan ? 'text-slate-400 line-through' : 'text-slate-900'
                }`}
              >
                {registration}
              </span>

              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusInfo.badge}`}
              >
                {statusInfo.label}
              </span>

              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {slot.maintenanceType}
              </span>

              {isOrphan && (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                  Appareil introuvable
                </span>
              )}
            </div>

            <p className="mt-1 truncate text-xs text-slate-500">{model}</p>

            {slot.description && (
              <p
                className="mt-1.5 max-w-xl truncate border-l-2 border-slate-200 pl-2.5 text-[10px] leading-5 text-slate-400"
                title={slot.description}
              >
                {slot.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 lg:flex-nowrap lg:border-0 lg:pt-0">
          <div className="min-w-28 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              <Calendar className="h-3 w-3" />
              Début
            </span>
            <strong className="mt-0.5 block text-[11px] font-semibold text-slate-700">
              {new Date(slot.startTime).toLocaleDateString('fr-FR')}
            </strong>
          </div>

          <div className="min-w-24 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              <Clock className="h-3 w-3" />
              Durée
            </span>
            <strong className="mt-0.5 block text-[11px] font-semibold text-slate-700">
              {daysCount} {daysCount > 1 ? 'jours' : 'jour'}
            </strong>
          </div>

          <button
            type="button"
            onClick={() => onDelete(slot)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 ${FOCUS_RING}`}
            title="Annuler ce créneau"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function PendingReviewCard({
  slot,
  onExtend,
  onClose,
}: {
  slot: MaintenanceSlot;
  onExtend: (days: number) => void | Promise<void>;
  onClose: () => void | Promise<void>;
}) {
  const [additionalDays, setAdditionalDays] = useState(1);
  const [extending, setExtending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (!slot.autoCloseAt) return;
    const tick = () => {
      const target = new Date(slot.autoCloseAt!).getTime();
      setRemainingMs(Math.max(0, target - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [slot.autoCloseAt]);

  const aircraft = slot.aircraft as AircraftLike | undefined;
  const registration = getAircraftRegistration(aircraft);
  const model = getAircraftModel(aircraft);

  const urgency = remainingMs > 0 && remainingMs < 3_600_000;

  const handleExtend = async () => {
    setExtending(true);
    try {
      await onExtend(additionalDays);
    } finally {
      setExtending(false);
    }
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      await onClose();
    } finally {
      setClosing(false);
    }
  };

  return (
    <article
      className={`grid gap-4 rounded-xl border bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto_auto] lg:items-center ${
        urgency ? 'border-rose-300 ring-2 ring-rose-100' : 'border-amber-200'
      }`}
    >
      {/* Identité */}
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            urgency
              ? 'bg-rose-100 text-rose-700'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          <Plane className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-slate-900">
              {registration}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              {slot.maintenanceType}
            </span>
            {slot.extensionCount > 0 && (
              <span className="text-[10px] font-medium text-slate-400">
                +{slot.extensionCount} prolongation
                {slot.extensionCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">{model}</p>
          <p className="mt-1 text-[11px] font-medium text-slate-600">
            Fin prévue :{' '}
            {new Date(slot.endTime).toLocaleString('fr-FR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </p>
        </div>
      </div>

      {/* Deadline */}
      <div
        className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 lg:min-w-42.5 ${
          urgency
            ? 'border-rose-200 bg-rose-50'
            : 'border-amber-200 bg-amber-50'
        }`}
      >
        <Timer
          className={`h-4 w-4 shrink-0 ${
            urgency ? 'animate-pulse text-rose-600' : 'text-amber-600'
          }`}
        />
        <div>
          <p
            className={`text-[9px] font-semibold uppercase tracking-wide ${
              urgency ? 'text-rose-600' : 'text-amber-700'
            }`}
          >
            {urgency ? 'Expire bientôt' : 'Auto-clôture'}
          </p>
          <p
            className={`font-mono text-sm font-bold tabular-nums ${
              urgency ? 'text-rose-700' : 'text-amber-800'
            }`}
          >
            {formatRemainingTime(remainingMs)}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <div className="flex h-10 items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
          <input
            type="number"
            min={1}
            max={90}
            value={additionalDays}
            onChange={(e) =>
              setAdditionalDays(Math.max(1, Number(e.target.value) || 1))
            }
            disabled={extending || closing}
            className="h-full w-12 border-0 bg-transparent px-2 text-center text-xs font-semibold text-slate-700 outline-none disabled:opacity-50"
          />
          <span className="border-l border-slate-200 px-2 text-[10px] font-semibold uppercase text-slate-400">
            j
          </span>
          <button
            type="button"
            onClick={() => void handleExtend()}
            disabled={extending || closing}
            title="Prolonger la maintenance"
            className="flex h-full items-center gap-1.5 border-l border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-amber-50 hover:text-amber-800 disabled:opacity-50"
          >
            {extending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CalendarPlus className="h-3.5 w-3.5" />
            )}
            Prolonger
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleClose()}
          disabled={extending || closing}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {closing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Flag className="h-3.5 w-3.5" />
          )}
          Clôturer
        </button>
      </div>
    </article>
  );
}

export default MaintenancePlanning;