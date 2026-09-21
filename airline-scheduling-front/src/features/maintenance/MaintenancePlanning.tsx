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
  Timer,
  CalendarPlus,
  Flag,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Activity,
  ArrowUpRight,
} from 'lucide-react';

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

const SURFACE = 'rounded-xl border border-slate-200 bg-white';

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 transition outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

const BTN_PRIMARY =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';

const BTN_SECONDARY =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

const BTN_GHOST =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-100';

const LABEL = 'text-xs font-medium text-slate-500';

const BADGE =
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium';

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
  className: string;
  dot: string;
}

const getStatusVisual = (slot: MaintenanceSlot): StatusVisual => {
  if (isPendingReview(slot)) {
    return {
      label: 'Décision requise',
      className: 'bg-amber-50 text-amber-700',
      dot: 'bg-amber-500',
    };
  }
  if (slot.status === 'Cancelled') {
    return {
      label: 'Annulé',
      className: 'bg-slate-100 text-slate-600',
      dot: 'bg-slate-400',
    };
  }
  if (slot.status === 'Completed') {
    return {
      label: 'Terminé',
      className: 'bg-emerald-50 text-emerald-700',
      dot: 'bg-emerald-500',
    };
  }

  const now = new Date();
  const startDateObj = new Date(slot.startTime);
  const endDateObj = new Date(slot.endTime);

  if (slot.maintenanceType === 'Aircraft On Ground') {
    return {
      label: 'AOG',
      className: 'bg-rose-50 text-rose-700',
      dot: 'bg-rose-500',
    };
  }
  if (now < startDateObj) {
    return {
      label: 'Planifié',
      className: 'bg-sky-50 text-sky-700',
      dot: 'bg-sky-500',
    };
  }
  if (now > endDateObj) {
    return {
      label: 'Terminé',
      className: 'bg-emerald-50 text-emerald-700',
      dot: 'bg-emerald-500',
    };
  }
  return {
    label: 'En atelier',
    className: 'bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  };
};

const getTypeVisual = (type: MaintenanceType): string => {
  if (type === 'Aircraft On Ground') return 'bg-rose-50 text-rose-700';
  if (type === 'Type C') return 'bg-violet-50 text-violet-700';
  return 'bg-slate-100 text-slate-700';
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

type TabKey = 'active' | 'pending' | 'history';

const ITEMS_PER_PAGE = 8;

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

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [page, setPage] = useState(1);

  const toastTimerRef = useRef<{ [key: number]: number }>({});

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
  // CHARGEMENT
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

  // Polling 30s
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
          /* silencieux */
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
    () => aircrafts.filter((a) => !isRetiredAircraft(a)),
    [aircrafts],
  );

  const otherAircrafts = useMemo(
    () => selectableAircrafts.filter((a) => !isMaintenanceAircraft(a)),
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
        )
          return false;
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
          if (slot.status === 'Cancelled' || slot.status === 'Completed')
            return false;
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
    let aog = 0;
    for (const slot of slots) {
      const start = new Date(slot.startTime).getTime();
      const end = new Date(slot.endTime).getTime();
      if (isPendingReview(slot)) continue;
      if (slot.maintenanceType === 'Aircraft On Ground' && end >= now) aog += 1;
      if (slot.status === 'Cancelled') continue;
      if (now < start) planned += 1;
      else if (now <= end) active += 1;
    }
    return { planned, active, aog };
  }, [slots]);

  const filteredSlots = useMemo(() => {
    let result = [...slots];

    if (activeTab === 'pending') {
      result = result.filter(isPendingReview);
    } else if (activeTab === 'history') {
      result = result.filter(
        (s) => s.status === 'Completed' || s.status === 'Cancelled',
      );
    } else {
      result = result.filter(
        (s) =>
          !isPendingReview(s) &&
          s.status !== 'Completed' &&
          s.status !== 'Cancelled',
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((s) => {
        const reg = getAircraftRegistration(
          s.aircraft as AircraftLike | undefined,
        ).toLowerCase();
        const model = getAircraftModel(
          s.aircraft as AircraftLike | undefined,
        ).toLowerCase();
        const type = s.maintenanceType.toLowerCase();
        const desc = (s.description || '').toLowerCase();
        return (
          reg.includes(q) ||
          model.includes(q) ||
          type.includes(q) ||
          desc.includes(q)
        );
      });
    }

    result.sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );

    return result;
  }, [slots, activeTab, searchQuery]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredSlots.length / ITEMS_PER_PAGE),
  );

  const paginatedSlots = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredSlots.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSlots, page]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery]);

  // ═══════════════════════════════════════════════════════════════
  // HANDLERS
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
    setFormOpen(true);
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
      setFormOpen(false);
      await loadData();
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const payload = error.response?.data as
          | {
              code?: string;
              message?: string | string[];
            }
          | undefined;
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
            /* ignore */
          }
          return;
        }
      }
      showToast(getAxiosErrorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

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
  // LOADING
  // ═══════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[420px] w-full max-w-[1600px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          <p className="text-sm text-slate-500">Chargement du planning...</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDU
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-1 pb-10">
      {/* TOASTS */}
      <div className="pointer-events-none fixed right-5 top-5 z-70 flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3.5 shadow-sm ${
              toast.type === 'success'
                ? 'border-emerald-200'
                : 'border-rose-200'
            }`}
          >
            <div
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                toast.type === 'success'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-rose-50 text-rose-600'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
            </div>
            <p className="flex-1 text-xs leading-5 text-slate-700">
              {toast.message}
            </p>
            <button
              type="button"
              onClick={() =>
                setToasts((c) => c.filter((i) => i.id !== toast.id))
              }
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* ACTIONS RAPIDES (header supprimé, actions conservées) */}
      <div className="flex items-center justify-end gap-2">
        <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 sm:inline-flex">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Sync 30s
        </span>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={fleetRefreshing}
          className={BTN_SECONDARY}
        >
          <RefreshCw
            className={`h-4 w-4 ${fleetRefreshing ? 'animate-spin' : ''}`}
          />
          Actualiser
        </button>
      </div>

      {/* KPI */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<Wrench className="h-4 w-4" />}
          label="Appareils en maintenance"
          value={maintenanceAircrafts.length}
          hint="Flotte technique"
        />
        <KpiCard
          icon={<Activity className="h-4 w-4" />}
          label="En atelier"
          value={maintenanceSummary.active}
          hint="Créneaux en cours"
        />
        <KpiCard
          icon={<Calendar className="h-4 w-4" />}
          label="Planifiés"
          value={maintenanceSummary.planned}
          hint="À venir"
        />
        <KpiCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Urgences AOG"
          value={maintenanceSummary.aog}
          hint="Priorité maximale"
        />
      </section>

      {/* ALERTE — décisions requises */}
      {pendingReviewSlots.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Timer className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-900">
                  {pendingReviewSlots.length} décision
                  {pendingReviewSlots.length > 1 ? 's' : ''} requise
                  {pendingReviewSlots.length > 1 ? 's' : ''}
                </p>
                <p className="mt-0.5 text-xs text-amber-700/80">
                  Sans action dans les 12 h, l'appareil est remis en service
                  automatiquement.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-xs font-medium text-amber-800 transition hover:bg-amber-50"
            >
              Voir les décisions
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* CARTE PRINCIPALE UNIFIÉE                              */}
      {/* ═══════════════════════════════════════════════════════ */}

      <section className={SURFACE}>
        {/* ─────────── APPAREILS NÉCESSITANT UNE INTERVENTION ─────────── */}
        <div className="border-b border-slate-200 p-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Appareils nécessitant une intervention
                </h2>
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
                  {maintenanceAircrafts.length}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Liste alimentée automatiquement par le statut technique de la
                flotte.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void refreshFleet()}
              disabled={fleetRefreshing}
              className={BTN_GHOST}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  fleetRefreshing ? 'animate-spin' : ''
                }`}
              />
              Synchroniser
            </button>
          </div>

          <div className="mt-4">
            {maintenanceAircrafts.length === 0 ? (
              <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-4 text-center">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <p className="text-xs text-slate-500">
                    Aucun appareil signalé en maintenance
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sortedMaintenanceAircrafts.map((aircraft) => (
                  <AircraftRow
                    key={aircraft.id}
                    aircraft={aircraft}
                    hasSlot={activeSlotAircraftIds.has(aircraft.id)}
                    onPlan={() => selectAircraftForPlanning(aircraft)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─────────── TABS ─────────── */}
        <div className="flex items-center gap-1 border-b border-slate-200 px-4 sm:px-6">
          <TabButton
            active={activeTab === 'active'}
            onClick={() => setActiveTab('active')}
            label="Planning actif"
            count={filteredSlots.length}
          />
          <TabButton
            active={activeTab === 'pending'}
            onClick={() => setActiveTab('pending')}
            label="Décisions"
            count={pendingReviewSlots.length}
            accent={pendingReviewSlots.length > 0}
          />
          <TabButton
            active={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            label="Historique"
          />
        </div>

        {/* ─────────── TOOLBAR ─────────── */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un appareil..."
              className={`${INPUT} h-10 pl-9`}
            />
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className={BTN_SECONDARY}>
              <Filter className="h-4 w-4" />
              Filtrer
            </button>
            <button
              type="button"
              onClick={() => {
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
                setFormOpen(true);
              }}
              className={BTN_PRIMARY}
            >
              <Plus className="h-4 w-4" />
              Nouveau blocage
            </button>
          </div>
        </div>

        {/* ─────────── TABLE ─────────── */}
        {filteredSlots.length === 0 ? (
          <EmptyState
            title={
              activeTab === 'history'
                ? 'Aucun historique'
                : activeTab === 'pending'
                  ? 'Aucune décision en attente'
                  : 'Aucun créneau actif'
            }
            description={
              searchQuery
                ? 'Aucun résultat ne correspond à votre recherche.'
                : 'Utilisez le bouton "Nouveau blocage" pour créer la première immobilisation.'
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Appareil
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Type
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Période
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Durée
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Statut
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {paginatedSlots.map((slot) => (
                    <SlotTableRow
                      key={slot.id}
                      slot={slot}
                      onDelete={openDeleteModal}
                      onExtend={handleExtend}
                      onClose={handleCloseSlot}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* ─────────── PAGINATION ─────────── */}
            <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Affichage</span>
                <span className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2 font-medium text-slate-700">
                  {ITEMS_PER_PAGE}
                </span>
                <span>
                  sur{' '}
                  <strong className="font-medium text-slate-700">
                    {filteredSlots.length}
                  </strong>{' '}
                  résultat{filteredSlots.length > 1 ? 's' : ''}
                </span>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const p = i + 1;
                    const active = p === page;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium transition ${
                          active
                            ? 'bg-emerald-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODALE FORMULAIRE                                      */}
      {/* ═══════════════════════════════════════════════════════ */}

      {formOpen && (
        <div className="fixed inset-0 z-70 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <button
            type="button"
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setFormOpen(false)}
            aria-label="Fermer"
          />

          <div
            className="relative z-10 my-8 w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Nouveau blocage technique
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Réservation d'un créneau d'immobilisation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleScheduleMaintenance}
              className="space-y-4 p-5"
            >
              <div>
                <label className={LABEL}>Appareil</label>
                <select
                  value={selectedAircraftId}
                  onChange={(e) => setSelectedAircraftId(e.target.value)}
                  required
                  className={`${INPUT} mt-1.5 h-10`}
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
              </div>

              <div>
                <label className={LABEL}>Type d'intervention</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(
                    [
                      { v: 'Type A', label: 'Type A', sub: 'Légère' },
                      { v: 'Type C', label: 'Type C', sub: 'Lourde' },
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
                        className={`rounded-lg border p-2.5 text-left transition ${
                          active
                            ? isAog
                              ? 'border-rose-500 bg-rose-50 ring-1 ring-rose-200'
                              : 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <p
                          className={`text-xs font-medium ${
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Début</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className={`${INPUT} mt-1.5 h-10`}
                  />
                </div>
                <div>
                  <label className={LABEL}>Durée</label>
                  <div className="relative mt-1.5">
                    <input
                      type="number"
                      min={1}
                      value={durationDays}
                      onChange={(e) =>
                        setDurationDays(
                          Math.max(1, Number(e.target.value) || 1),
                        )
                      }
                      required
                      className={`${INPUT} h-10 pr-14`}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-400">
                      jours
                    </span>
                  </div>
                </div>
              </div>

              {requestedMaintenanceConflict && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                    <p className="text-[11px] leading-5 text-rose-700">
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
              )}

              <div>
                <label className={LABEL}>Travaux prévus</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Ex. inspection cellule, contrôle moteur, remplacement de pièces..."
                  className={`${INPUT} mt-1.5 resize-none py-2.5 leading-5`}
                />
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className={BTN_SECONDARY}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    selectableAircrafts.length === 0 ||
                    Boolean(requestedMaintenanceConflict)
                  }
                  className={BTN_PRIMARY}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Vérification...
                    </>
                  ) : (
                    <>
                      <Calendar className="h-4 w-4" />
                      Planifier
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODALE SUPPRESSION                                     */}
      {/* ═══════════════════════════════════════════════════════ */}

      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-80 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={closeDeleteModal}
            aria-label="Fermer"
          />

          <div
            className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <Trash2 className="h-4 w-4" />
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
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-4">
                <p className="text-xs leading-5 text-rose-800">
                  Confirmez-vous l'annulation du créneau de maintenance de
                  l'appareil{' '}
                  <span className="font-mono font-semibold">
                    {deleteModal.aircraftRegistration}
                  </span>
                  ?
                </p>
              </div>

              {deleteModal.daysCount > 3 && (
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
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
                  className={BTN_SECONDARY}
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDelete()}
                  disabled={deleteModal.daysCount > 3 && !deleteConfirmed}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Confirmer
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

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600">
          {icon}
        </span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
  accent = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative -mb-px flex items-center gap-2 border-b-2 px-3 py-3.5 text-sm font-medium transition ${
        active
          ? 'border-emerald-600 text-emerald-700'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
      {typeof count === 'number' && count > 0 && (
        <span
          className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
            accent
              ? 'bg-amber-100 text-amber-700'
              : active
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-600'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function SlotTableRow({
  slot,
  onDelete,
  onExtend,
  onClose,
}: {
  slot: MaintenanceSlot;
  onDelete: (slot: MaintenanceSlot) => void;
  onExtend: (slotId: string, days: number) => Promise<void> | void;
  onClose: (slotId: string) => Promise<void> | void;
}) {
  const statusInfo = getStatusVisual(slot);
  const daysCount = calculateDurationInDays(slot.startTime, slot.endTime);
  const targetAircraft = slot.aircraft as AircraftLike | undefined;
  const registration = getAircraftRegistration(targetAircraft);
  const model = getAircraftModel(targetAircraft);
  const isOrphan = !slot.aircraft;
  const isPending = isPendingReview(slot);

  const [extending, setExtending] = useState(false);
  const [closing, setClosing] = useState(false);

  const handleExtend = async () => {
    setExtending(true);
    try {
      await onExtend(slot.id, 1);
    } finally {
      setExtending(false);
    }
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      await onClose(slot.id);
    } finally {
      setClosing(false);
    }
  };

  return (
    <tr className="group border-b border-slate-100 transition-colors hover:bg-slate-50/60">
      <td className="px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
            <Plane className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p
              className={`truncate font-mono text-xs font-semibold ${
                isOrphan ? 'text-slate-400 line-through' : 'text-slate-900'
              }`}
            >
              {registration}
            </p>
            <p className="truncate text-[11px] text-slate-400">{model}</p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3.5">
        <span className={`${BADGE} ${getTypeVisual(slot.maintenanceType)}`}>
          {slot.maintenanceType === 'Aircraft On Ground'
            ? 'AOG'
            : slot.maintenanceType}
        </span>
      </td>

      <td className="px-4 py-3.5">
        <p className="text-xs text-slate-700">
          {new Date(slot.startTime).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
          })}
          <span className="mx-1 text-slate-300">→</span>
          {new Date(slot.endTime).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
          })}
        </p>
        <p className="text-[11px] text-slate-400">
          {new Date(slot.startTime).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </td>

      <td className="px-4 py-3.5">
        <span className="text-xs text-slate-700">
          {daysCount} {daysCount > 1 ? 'jours' : 'jour'}
        </span>
      </td>

      <td className="px-4 py-3.5">
        <span className={`${BADGE} ${statusInfo.className}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
          {statusInfo.label}
        </span>
      </td>

      <td className="px-4 py-3.5">
        <div className="flex items-center justify-end gap-1">
          {isPending && (
            <>
              <button
                type="button"
                onClick={() => void handleExtend()}
                disabled={extending}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                title="Prolonger de 1 jour"
              >
                {extending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CalendarPlus className="h-3 w-3" />
                )}
                +1j
              </button>
              <button
                type="button"
                onClick={() => void handleClose()}
                disabled={closing}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-[11px] font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {closing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Flag className="h-3 w-3" />
                )}
                Clôturer
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onDelete(slot)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            title="Annuler ce créneau"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AircraftRow({
  aircraft,
  hasSlot,
  onPlan,
}: {
  aircraft: AircraftLike;
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
      bar: 'bg-rose-500',
      track: 'bg-rose-100',
      text: 'text-rose-700',
      badge: 'bg-rose-50 text-rose-700',
      badgeLabel: 'Critique',
    },
    warning: {
      bar: 'bg-amber-500',
      track: 'bg-amber-100',
      text: 'text-amber-700',
      badge: 'bg-amber-50 text-amber-700',
      badgeLabel: 'À surveiller',
    },
    normal: {
      bar: 'bg-emerald-500',
      track: 'bg-emerald-100',
      text: 'text-emerald-700',
      badge: 'bg-emerald-50 text-emerald-700',
      badgeLabel: 'Normal',
    },
  }[tier];

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
            <Plane className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-semibold text-slate-900">
              {getAircraftRegistration(aircraft)}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {getAircraftModel(aircraft)}
            </p>
          </div>
        </div>
        <span className={`${BADGE} ${palette.badge}`}>
          {palette.badgeLabel}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-500">
            Potentiel utilisé
          </span>
          <span
            className={`text-xs font-semibold tabular-nums ${palette.text}`}
          >
            {ratio}%
          </span>
        </div>
        <div
          className={`mt-2 h-1.5 overflow-hidden rounded-full ${palette.track}`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${palette.bar}`}
            style={{ width: `${ratio}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
          <span>{formatNumber(used)} h utilisées</span>
          <span>Limite {formatNumber(limit)} h</span>
        </div>
      </div>

      <div className="mt-4">
        {hasSlot ? (
          <div className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Immobilisation programmée
          </div>
        ) : (
          <button
            type="button"
            onClick={onPlan}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Planifier
          </button>
        )}
      </div>
    </article>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-56 items-center justify-center p-8 text-center">
      <div>
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Wrench className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-700">{title}</p>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      </div>
    </div>
  );
}

export default MaintenancePlanning;