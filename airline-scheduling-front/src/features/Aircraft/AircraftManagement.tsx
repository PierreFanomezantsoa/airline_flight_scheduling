// features/Aircraft/AircraftManagement.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  ChangeEvent,
  FormEvent,
  ReactNode,
} from 'react';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  History,
  Info,
  LoaderCircle,
  Pencil,
  Plane,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';

import {
  ApiError,
  authFetch,
} from '../Api/apiService';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const SURFACE = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const FOCUS_RING =
  'outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10';
const LABEL_UPPER =
  'text-[10px] font-semibold uppercase tracking-wider text-slate-500';

// =============================================================================
// STATUT AVION
// =============================================================================

export const AircraftStatus = {
  ACTIVE: 'Active',
  MAINTENANCE: 'Maintenance',
  OUT_OF_SERVICE: 'Out of Service',
  RETIRED: 'Retired',
} as const;

export type AircraftStatus =
  (typeof AircraftStatus)[keyof typeof AircraftStatus];

// =============================================================================
// TYPES
// =============================================================================

export interface AircraftType {
  id: string;
  nomModele: string;
  fabricant?: string;
  capaciteMax?: number;
  vitesseCroisiere?: number;
  autonomieMax?: number;
  consommationCarburant?: number;
  intervalleMaintenanceHeures?: number;
}

export interface Aircraft {
  id: string;
  immatriculation: string;
  modele: string;
  capacite: number;
  heuresDeVolTotales: number;
  limiteHeuresMaintenance: number;
  heuresDepuisDerniereMaintenance: number;
  dateDerniereMaintenance: string | null;
  statut: AircraftStatus;
  baseAttache: string | null;
  typeId: string | null;
  type?: AircraftType | null;
  creeA?: string;
  misAJourA?: string;
}

interface FleetStatistics {
  totalAvions: number;
  avionsActifs: number;
  avionsEnMaintenance: number;
  avionsHorsService: number;
  avionsRetires: number;
  heuresDeVolTotales: number;
  moyenneHeuresDeVol: number;
  capaciteMoyenne: number;
}

interface AircraftFormData {
  immatriculation: string;
  modele: string;
  capacite: number;
  heuresDeVolTotales: number;
  limiteHeuresMaintenance: number;
  statut: AircraftStatus;
  baseAttache: string;
  typeId: string;
}

type Notice =
  | { kind: 'success' | 'error'; message: string }
  | null;

// =============================================================================
// FORMULAIRE VIDE
// =============================================================================

const EMPTY_FORM: AircraftFormData = {
  immatriculation: '',
  modele: '',
  capacite: 100,
  heuresDeVolTotales: 0,
  limiteHeuresMaintenance: 500,
  statut: AircraftStatus.ACTIVE,
  baseAttache: '',
  typeId: '',
};

// =============================================================================
// OPTIONS STATUT
// =============================================================================

const STATUS_OPTIONS: Array<{
  value: AircraftStatus;
  label: string;
}> = [
  { value: AircraftStatus.ACTIVE, label: 'Actif' },
  { value: AircraftStatus.MAINTENANCE, label: 'Maintenance' },
  { value: AircraftStatus.OUT_OF_SERVICE, label: 'Hors service' },
  { value: AircraftStatus.RETIRED, label: 'Retiré' },
];

// =============================================================================
// STYLE INPUT
// =============================================================================

const inputClass = `h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:bg-white ${FOCUS_RING}`;

// =============================================================================
// LECTURE ERREUR BACKEND
// =============================================================================

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload: unknown = await response.json();

    if (payload && typeof payload === 'object') {
      const data = payload as {
        message?: string | string[];
        error?: string;
      };

      if (Array.isArray(data.message)) {
        const message = data.message
          .filter((item): item is string => typeof item === 'string')
          .join(' ')
          .trim();
        if (message) return message;
      }

      if (typeof data.message === 'string' && data.message.trim()) {
        return data.message.trim();
      }

      if (typeof data.error === 'string' && data.error.trim()) {
        return data.error.trim();
      }
    }
  } catch {
    // Réponse vide ou non JSON.
  }

  return `${fallback} (HTTP ${response.status})`;
}

// =============================================================================
// MESSAGE D'ERREUR
// =============================================================================

function getErrorMessage(
  error: unknown,
  fallback = 'Une erreur est survenue.',
): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return (
        'Impossible de communiquer avec le serveur. ' +
        'Vérifiez que le backend est démarré et que la configuration CORS est correcte.'
      );
    }
    if (error.status === 401) {
      return 'Votre session est invalide ou a expiré. Veuillez vous reconnecter.';
    }
    if (error.status === 403) {
      return "Vous n'avez pas les autorisations nécessaires pour accéder à cette fonctionnalité.";
    }
    return error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

// =============================================================================
// REQUÊTE JSON
// =============================================================================

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await authFetch(path, options);

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    const message = await readErrorMessage(
      response,
      'Une erreur serveur est survenue.',
    );
    throw new ApiError(message, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error('Le serveur a retourné une réponse JSON invalide.');
  }
}

// =============================================================================
// SYNCHRONISATION MAINTENANCES TERMINÉES
// =============================================================================

async function syncExpiredMaintenances(signal?: AbortSignal): Promise<void> {
  try {
    const response = await authFetch('/maintenance/sync-expired', {
      method: 'PATCH',
      signal,
    });

    if (!response.ok) {
      const message = await readErrorMessage(
        response,
        'Synchronisation automatique des maintenances impossible.',
      );
      console.warn('[AircraftManagement] Maintenance sync :', message);
    }
  } catch (error: unknown) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.warn(
      '[AircraftManagement] Synchronisation maintenance ignorée :',
      error,
    );
  }
}

// =============================================================================
// FORMAT NOMBRE
// =============================================================================

function formatNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

// =============================================================================
// FORMAT DATE
// =============================================================================

function formatDate(value?: string | null): string {
  if (!value) return 'Jamais';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

// =============================================================================
// RATIO MAINTENANCE
// =============================================================================

function maintenanceRatio(aircraft: Aircraft): number {
  const current = Number(aircraft.heuresDepuisDerniereMaintenance);
  const limit = Number(aircraft.limiteHeuresMaintenance);
  if (!Number.isFinite(current) || !Number.isFinite(limit) || limit <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((current / limit) * 100)));
}

// =============================================================================
// COMPOSANTS ANNEXES
// =============================================================================

function Field({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className={`mb-1.5 block ${LABEL_UPPER}`}>
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      {children}
      {hint && (
        <p className="mt-1 text-[10px] font-medium text-slate-400">{hint}</p>
      )}
    </label>
  );
}

function StatusBadge({
  className,
  icon,
  label,
}: {
  className: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

type StatVariant =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

function StatCard({
  label,
  value,
  hint,
  icon,
  variant = 'neutral',
}: {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  variant?: StatVariant;
}) {
  const styles: Record<
    StatVariant,
    { ring: string; icon: string; value: string; accent: string | null }
  > = {
    neutral: {
      ring: 'border-slate-200 bg-white',
      icon: 'bg-slate-100 text-slate-600',
      value: 'text-slate-900',
      accent: null,
    },
    primary: {
      ring: 'border-emerald-200 bg-emerald-50/40',
      icon: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20',
      value: 'text-emerald-900',
      accent: 'bg-emerald-600',
    },
    success: {
      ring: 'border-emerald-200 bg-white',
      icon: 'bg-emerald-100 text-emerald-700',
      value: 'text-emerald-800',
      accent: null,
    },
    info: {
      ring: 'border-sky-200 bg-white',
      icon: 'bg-sky-100 text-sky-700',
      value: 'text-sky-800',
      accent: null,
    },
    warning: {
      ring: 'border-amber-200 bg-amber-50/40',
      icon: 'bg-amber-100 text-amber-700',
      value: 'text-amber-800',
      accent: 'bg-amber-500',
    },
    danger: {
      ring: 'border-rose-200 bg-rose-50/40',
      icon: 'bg-rose-100 text-rose-700',
      value: 'text-rose-800',
      accent: 'bg-rose-500',
    },
  };

  const s = styles[variant];

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${s.ring}`}
    >
      {s.accent && (
        <span
          className={`absolute inset-x-0 top-0 h-0.5 ${s.accent}`}
          aria-hidden
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={LABEL_UPPER}>{label}</span>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${s.value}`}>
            {formatNumber(value, 0)}
          </p>
          <p className="mt-1 text-[10px] font-medium text-slate-400">{hint}</p>
        </div>
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.icon}`}
        >
          {icon}
        </div>
      </div>
    </article>
  );
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className={LABEL_UPPER}>{label}</span>
      <p className="mt-1 font-mono text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function AlertBanner({
  type,
  text,
  onClose,
}: {
  type: 'success' | 'error' | 'info';
  text: string;
  onClose: () => void;
}) {
  const config = {
    success: {
      ring: 'border-emerald-200 bg-emerald-50/60',
      icon: 'bg-emerald-100 text-emerald-700',
      title: 'text-emerald-800',
      body: 'text-emerald-700',
      Icon: CheckCircle2,
      label: 'Opération réussie',
    },
    error: {
      ring: 'border-rose-200 bg-rose-50/60',
      icon: 'bg-rose-100 text-rose-700',
      title: 'text-rose-800',
      body: 'text-rose-700',
      Icon: AlertCircle,
      label: 'Erreur',
    },
    info: {
      ring: 'border-sky-200 bg-sky-50/60',
      icon: 'bg-sky-100 text-sky-700',
      title: 'text-sky-800',
      body: 'text-sky-700',
      Icon: Info,
      label: 'Information',
    },
  }[type];

  const { Icon } = config;

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-sm ${config.ring}`}
      role="alert"
    >
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.icon}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${config.title}`}>
          {config.label}
        </p>
        <p className={`mt-0.5 text-xs leading-5 ${config.body}`}>{text}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition ${
          type === 'success'
            ? 'text-emerald-600 hover:bg-emerald-100'
            : type === 'error'
              ? 'text-rose-500 hover:bg-rose-100'
              : 'text-sky-600 hover:bg-sky-100'
        }`}
        aria-label="Fermer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// =============================================================================
// COMPONENT PRINCIPAL
// =============================================================================

export function AircraftManagement() {
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [types, setTypes] = useState<AircraftType[]>([]);
  const [statistics, setStatistics] = useState<FleetStatistics | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionAircraftId, setActionAircraftId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AircraftStatus | 'ALL'>(
    'ALL',
  );

  const [notice, setNotice] = useState<Notice>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAircraft, setEditingAircraft] = useState<Aircraft | null>(null);
  const [formData, setFormData] = useState<AircraftFormData>(EMPTY_FORM);

  const [hoursAircraft, setHoursAircraft] = useState<Aircraft | null>(null);
  const [flightHours, setFlightHours] = useState('');

  const [maintenanceAircraft, setMaintenanceAircraft] =
    useState<Aircraft | null>(null);

  const loadingRequestRef = useRef(false);

  /* ========================================================================
   * LOAD DATA
   * ====================================================================== */

  const loadData = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (loadingRequestRef.current) return;
      loadingRequestRef.current = true;

      if (!silent) {
        setLoading(true);
        setNotice(null);
      }

      try {
        await syncExpiredMaintenances(signal);
        if (signal?.aborted) return;

        const [aircraftResult, typeResult, statisticsResult] =
          await Promise.allSettled([
            requestJson<Aircraft[]>('/fleet/aircrafts', { signal }),
            requestJson<AircraftType[]>('/fleet/types', { signal }),
            requestJson<FleetStatistics>('/fleet/aircrafts/statistics', {
              signal,
            }),
          ]);

        if (signal?.aborted) return;

        if (aircraftResult.status === 'rejected') {
          throw aircraftResult.reason;
        }

        setAircrafts(
          Array.isArray(aircraftResult.value) ? aircraftResult.value : [],
        );

        if (typeResult.status === 'fulfilled') {
          setTypes(Array.isArray(typeResult.value) ? typeResult.value : []);
        } else {
          console.warn(
            '[AircraftManagement] Types indisponibles :',
            typeResult.reason,
          );
          if (!silent) setTypes([]);
        }

        if (statisticsResult.status === 'fulfilled') {
          setStatistics(statisticsResult.value);
        } else {
          console.warn(
            '[AircraftManagement] Statistiques indisponibles :',
            statisticsResult.reason,
          );
          if (!silent) setStatistics(null);
        }
      } catch (error: unknown) {
        if (signal?.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        const message = getErrorMessage(
          error,
          'Impossible de charger la flotte.',
        );

        const authenticationError =
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403);

        if (!silent || authenticationError) {
          setNotice({ kind: 'error', message });
        }

        console.error('[AircraftManagement] Erreur chargement :', error);
      } finally {
        loadingRequestRef.current = false;
        if (!silent) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal, false);
    return () => {
      controller.abort();
    };
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData(undefined, true);
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [loadData]);

  /* ========================================================================
   * DERIVED
   * ====================================================================== */

  const selectedType = useMemo(
    () => types.find(item => item.id === formData.typeId) ?? null,
    [types, formData.typeId],
  );

  const filteredAircrafts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return aircrafts.filter(aircraft => {
      if (statusFilter !== 'ALL' && aircraft.statut !== statusFilter) {
        return false;
      }
      if (!query) return true;

      return [
        aircraft.immatriculation,
        aircraft.modele,
        aircraft.baseAttache ?? '',
        aircraft.type?.nomModele ?? '',
        aircraft.type?.fabricant ?? '',
      ].some(value => value.toLowerCase().includes(query));
    });
  }, [aircrafts, searchTerm, statusFilter]);

  /* ========================================================================
   * MODAL ACTIONS
   * ====================================================================== */

  const openCreate = () => {
    setEditingAircraft(null);
    setFormData({ ...EMPTY_FORM });
    setNotice(null);
    setIsModalOpen(true);
  };

  const openEdit = (aircraft: Aircraft) => {
    setEditingAircraft(aircraft);
    setFormData({
      immatriculation: aircraft.immatriculation,
      modele: aircraft.modele,
      capacite: aircraft.capacite,
      heuresDeVolTotales: aircraft.heuresDeVolTotales,
      limiteHeuresMaintenance: aircraft.limiteHeuresMaintenance,
      statut: aircraft.statut,
      baseAttache: aircraft.baseAttache ?? '',
      typeId: aircraft.typeId ?? '',
    });
    setNotice(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setIsModalOpen(false);
    setEditingAircraft(null);
    setFormData({ ...EMPTY_FORM });
  };

  /* ========================================================================
   * CHANGE FORM
   * ====================================================================== */

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;

    setFormData(current => {
      if (name === 'typeId') {
        const selected = types.find(item => item.id === value);
        if (!selected) return { ...current, typeId: '' };

        const capacity =
          typeof selected.capaciteMax === 'number' && selected.capaciteMax > 0
            ? Math.min(Math.max(1, current.capacite), selected.capaciteMax)
            : current.capacite;

        const maintenanceLimit =
          typeof selected.intervalleMaintenanceHeures === 'number' &&
          selected.intervalleMaintenanceHeures > 0
            ? selected.intervalleMaintenanceHeures
            : current.limiteHeuresMaintenance;

        return {
          ...current,
          typeId: selected.id,
          modele: selected.nomModele,
          capacite: capacity,
          limiteHeuresMaintenance: maintenanceLimit,
        };
      }

      if (name === 'immatriculation' || name === 'baseAttache') {
        return { ...current, [name]: value.toUpperCase() };
      }

      if (
        name === 'capacite' ||
        name === 'heuresDeVolTotales' ||
        name === 'limiteHeuresMaintenance'
      ) {
        return { ...current, [name]: value === '' ? 0 : Number(value) };
      }

      return { ...current, [name]: value };
    });
  };

  /* ========================================================================
   * VALIDATION FORM
   * ====================================================================== */

  const validateForm = (): string | null => {
    if (!formData.immatriculation.trim()) {
      return "L'immatriculation est obligatoire.";
    }
    if (!formData.modele.trim()) {
      return 'Le modèle est obligatoire.';
    }
    if (!Number.isInteger(formData.capacite) || formData.capacite <= 0) {
      return 'La capacité doit être un entier strictement positif.';
    }
    if (
      !Number.isFinite(formData.limiteHeuresMaintenance) ||
      formData.limiteHeuresMaintenance <= 0
    ) {
      return 'La limite de maintenance doit être strictement positive.';
    }
    if (
      !Number.isFinite(formData.heuresDeVolTotales) ||
      formData.heuresDeVolTotales < 0
    ) {
      return 'Les heures de vol totales ne peuvent pas être négatives.';
    }
    if (
      formData.baseAttache &&
      formData.baseAttache.trim().length !== 3
    ) {
      return "La base d'attache doit être un code IATA de 3 caractères.";
    }
    if (
      selectedType?.capaciteMax &&
      formData.capacite > selectedType.capaciteMax
    ) {
      return `La capacité ne peut pas dépasser ${selectedType.capaciteMax} sièges pour ${selectedType.nomModele}.`;
    }
    return null;
  };

  /* ========================================================================
   * SUBMIT
   * ====================================================================== */

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const validationError = validateForm();
    if (validationError) {
      setNotice({ kind: 'error', message: validationError });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    const commonPayload = {
      immatriculation: formData.immatriculation.trim().toUpperCase(),
      modele: formData.modele.trim(),
      capacite: formData.capacite,
      heuresDeVolTotales: formData.heuresDeVolTotales,
      limiteHeuresMaintenance: formData.limiteHeuresMaintenance,
      statut: formData.statut,
      baseAttache: formData.baseAttache.trim().toUpperCase() || undefined,
    };

    try {
      if (editingAircraft) {
        await requestJson<Aircraft>(
          `/fleet/aircrafts/${editingAircraft.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              ...commonPayload,
              typeId: formData.typeId || null,
            }),
          },
        );
        setNotice({
          kind: 'success',
          message: `L'avion ${commonPayload.immatriculation} a été mis à jour.`,
        });
      } else {
        await requestJson<Aircraft>('/fleet/aircrafts', {
          method: 'POST',
          body: JSON.stringify({
            ...commonPayload,
            typeId: formData.typeId || undefined,
          }),
        });
        setNotice({
          kind: 'success',
          message: `L'avion ${commonPayload.immatriculation} a été créé.`,
        });
      }

      setIsModalOpen(false);
      setEditingAircraft(null);
      await loadData(undefined, true);
    } catch (error: unknown) {
      setNotice({
        kind: 'error',
        message: getErrorMessage(
          error,
          "Impossible d'enregistrer l'avion.",
        ),
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ========================================================================
   * RETIRER AVION
   * ====================================================================== */

  const retireAircraft = async (aircraft: Aircraft) => {
    if (aircraft.statut === AircraftStatus.RETIRED) return;

    const confirmed = window.confirm(
      `Retirer l'avion ${aircraft.immatriculation} de la flotte ?\n\nLe backend ne supprime pas la ligne : le statut deviendra "Retired".`,
    );
    if (!confirmed) return;

    setActionAircraftId(aircraft.id);
    setNotice(null);

    try {
      await requestJson<{ retired: true; id: string }>(
        `/fleet/aircrafts/${aircraft.id}`,
        { method: 'DELETE' },
      );

      setNotice({
        kind: 'success',
        message: `L'avion ${aircraft.immatriculation} a été retiré de la flotte.`,
      });

      await loadData(undefined, true);
    } catch (error: unknown) {
      setNotice({
        kind: 'error',
        message: getErrorMessage(error, "Impossible de retirer l'avion."),
      });
    } finally {
      setActionAircraftId(null);
    }
  };

  /* ========================================================================
   * MAINTENANCE RESET
   * ====================================================================== */

  const openMaintenanceResetModal = (aircraft: Aircraft) => {
    if (aircraft.statut === AircraftStatus.RETIRED) return;
    setMaintenanceAircraft(aircraft);
    setNotice(null);
  };

  const closeMaintenanceResetModal = () => {
    if (
      maintenanceAircraft &&
      actionAircraftId === maintenanceAircraft.id
    ) {
      return;
    }
    setMaintenanceAircraft(null);
  };

  const resetMaintenance = async () => {
    if (!maintenanceAircraft) return;
    const aircraft = maintenanceAircraft;

    setActionAircraftId(aircraft.id);
    setNotice(null);

    try {
      await requestJson<Aircraft>(
        `/fleet/aircrafts/${aircraft.id}/maintenance/reset`,
        { method: 'PATCH' },
      );

      setMaintenanceAircraft(null);
      setNotice({
        kind: 'success',
        message: `Maintenance de ${aircraft.immatriculation} réinitialisée avec succès.`,
      });

      await loadData(undefined, true);
    } catch (error: unknown) {
      setNotice({
        kind: 'error',
        message: getErrorMessage(
          error,
          'Impossible de réinitialiser la maintenance.',
        ),
      });
    } finally {
      setActionAircraftId(null);
    }
  };

  /* ========================================================================
   * AJOUT HEURES VOL
   * ====================================================================== */

  const submitFlightHours = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hoursAircraft || submitting) return;

    const hours = Number(flightHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      setNotice({
        kind: 'error',
        message: 'Les heures volées doivent être strictement positives.',
      });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      await requestJson<Aircraft>(
        `/fleet/aircrafts/${hoursAircraft.id}/flight-hours`,
        {
          method: 'PATCH',
          body: JSON.stringify({ heuresVolees: hours }),
        },
      );

      const registration = hoursAircraft.immatriculation;
      setHoursAircraft(null);
      setFlightHours('');
      setNotice({
        kind: 'success',
        message: `${formatNumber(hours)} h ajoutée(s) à ${registration}.`,
      });

      await loadData(undefined, true);
    } catch (error: unknown) {
      setNotice({
        kind: 'error',
        message: getErrorMessage(
          error,
          "Impossible d'ajouter les heures de vol.",
        ),
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ========================================================================
   * RENDER STATUS BADGE
   * ====================================================================== */

  const renderStatusBadge = (status: AircraftStatus) => {
    switch (status) {
      case AircraftStatus.ACTIVE:
        return (
          <StatusBadge
            className="border-emerald-200 bg-emerald-50 text-emerald-700"
            icon={<CheckCircle2 className="h-3 w-3" />}
            label="Actif"
          />
        );
      case AircraftStatus.MAINTENANCE:
        return (
          <StatusBadge
            className="border-amber-200 bg-amber-50 text-amber-700"
            icon={<Wrench className="h-3 w-3" />}
            label="Maintenance"
          />
        );
      case AircraftStatus.OUT_OF_SERVICE:
        return (
          <StatusBadge
            className="border-rose-200 bg-rose-50 text-rose-700"
            icon={<AlertTriangle className="h-3 w-3" />}
            label="Hors service"
          />
        );
      case AircraftStatus.RETIRED:
      default:
        return (
          <StatusBadge
            className="border-slate-200 bg-slate-100 text-slate-600"
            icon={<History className="h-3 w-3" />}
            label="Retiré"
          />
        );
    }
  };

  /* ========================================================================
   * RENDER
   * ====================================================================== */

  return (
    <div className="min-h-screen bg-slate-50 p-3 text-slate-800 antialiased sm:p-4 lg:p-5">
      <div className="mx-auto max-w-[1500px] space-y-4">
        {/* ═══════════════ HEADER ═══════════════ */}
        <header className={`${SURFACE} p-4 sm:p-5`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20">
                <Plane className="h-5 w-5 rotate-45" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-slate-950 sm:text-xl">
                    Flotte d'aéronefs
                  </h1>
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    OPS
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                  Aéronefs physiques, maintenance et heures de vol
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={() => void loadData()}
                disabled={loading}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 ${FOCUS_RING}`}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                />
                Actualiser
              </button>
              <button
                type="button"
                onClick={openCreate}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 ${FOCUS_RING}`}
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter un avion
              </button>
            </div>
          </div>
        </header>

        {/* ═══════════════ NOTICE ═══════════════ */}
        {notice && (
          <AlertBanner
            type={notice.kind}
            text={notice.message}
            onClose={() => setNotice(null)}
          />
        )}

        {/* ═══════════════ KPI ═══════════════ */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Total flotte"
            value={statistics?.totalAvions ?? aircrafts.length}
            hint="Aéronefs enregistrés"
            icon={<Plane className="h-4 w-4" />}
            variant="primary"
          />
          <StatCard
            label="Actifs"
            value={
              statistics?.avionsActifs ??
              aircrafts.filter(a => a.statut === AircraftStatus.ACTIVE).length
            }
            hint="Opérationnels"
            icon={<CheckCircle2 className="h-4 w-4" />}
            variant="success"
          />
          <StatCard
            label="Maintenance"
            value={
              statistics?.avionsEnMaintenance ??
              aircrafts.filter(a => a.statut === AircraftStatus.MAINTENANCE)
                .length
            }
            hint="Immobilisés"
            icon={<Wrench className="h-4 w-4" />}
            variant="warning"
          />
          <StatCard
            label="Hors service"
            value={
              statistics?.avionsHorsService ??
              aircrafts.filter(a => a.statut === AircraftStatus.OUT_OF_SERVICE)
                .length
            }
            hint="Action requise"
            icon={<AlertTriangle className="h-4 w-4" />}
            variant="danger"
          />
          <StatCard
            label="Retirés"
            value={
              statistics?.avionsRetires ??
              aircrafts.filter(a => a.statut === AircraftStatus.RETIRED).length
            }
            hint="Hors flotte"
            icon={<History className="h-4 w-4" />}
            variant="neutral"
          />
        </section>

        {/* ═══════════════ FILTRES ═══════════════ */}
        <section className={`${SURFACE} p-3 sm:p-4`}>
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_240px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Immatriculation, modèle, fabricant ou base..."
                className={`h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:bg-white ${FOCUS_RING}`}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={e =>
                setStatusFilter(e.target.value as AircraftStatus | 'ALL')
              }
              className={`h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 focus:bg-white ${FOCUS_RING}`}
            >
              <option value="ALL">Tous les statuts</option>
              {STATUS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="flex items-center justify-end">
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-slate-600">
                {filteredAircrafts.length} appareil
                {filteredAircrafts.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </section>

        {/* ═══════════════ TABLE ═══════════════ */}
        <section className={`${SURFACE} overflow-hidden`}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <Plane className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Registre des aéronefs
                </h2>
                <p className="text-[10px] text-slate-500">
                  Immobilisations, maintenance et potentiel utilisé
                </p>
              </div>
            </div>

            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
              {filteredAircrafts.length} appareil
              {filteredAircrafts.length > 1 ? 's' : ''}
            </span>
          </header>

          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Chargement de la flotte...
              </span>
            </div>
          ) : filteredAircrafts.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-300">
                <Plane className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700">
                Aucun avion trouvé
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Ajustez la recherche ou les filtres.
              </p>
            </div>
          ) : (
            <>
              {/* ═══════════ MOBILE / TABLETTE : CARTES COMPACTES ═══════════ */}
              <div className="space-y-2.5 bg-slate-50/40 p-3 lg:hidden">
                {filteredAircrafts.map(aircraft => {
                  const ratio = maintenanceRatio(aircraft);
                  const busy = actionAircraftId === aircraft.id;
                  const isRetired = aircraft.statut === AircraftStatus.RETIRED;

                  return (
                    <article
                      key={aircraft.id}
                      className={`overflow-hidden rounded-xl border bg-white shadow-sm transition ${
                        isRetired
                          ? 'border-slate-200 opacity-80'
                          : 'border-slate-200 hover:shadow-md'
                      }`}
                    >
                      {/* Header card : immat + statut */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <Plane className="h-4 w-4 rotate-45" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-mono text-sm font-bold text-slate-900">
                              {aircraft.immatriculation}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-slate-500">
                              {aircraft.type?.nomModele ?? aircraft.modele}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {renderStatusBadge(aircraft.statut)}
                        </div>
                      </div>

                      {/* Body : infos clés en grille */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3.5 py-3">
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                            Base
                          </p>
                          {aircraft.baseAttache ? (
                            <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-700">
                              {aircraft.baseAttache}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[11px] text-slate-300">
                              —
                            </p>
                          )}
                        </div>

                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                            Capacité
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-700">
                            {aircraft.capacite}{' '}
                            <span className="text-[9px] font-medium text-slate-400">
                              sièges
                            </span>
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                            Heures totales
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-700">
                            {formatNumber(aircraft.heuresDeVolTotales)}{' '}
                            <span className="text-[9px] font-medium text-slate-400">
                              h
                            </span>
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                            Dernière maint.
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] font-semibold text-slate-600">
                            {formatDate(aircraft.dateDerniereMaintenance)}
                          </p>
                        </div>
                      </div>

                      {/* Barre maintenance */}
                      <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                            Maintenance
                          </span>
                          <span
                            className={`font-mono text-[11px] font-bold ${
                              ratio >= 90
                                ? 'text-rose-600'
                                : ratio >= 75
                                  ? 'text-amber-600'
                                  : 'text-emerald-700'
                            }`}
                          >
                            {ratio}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                          <div
                            className={`h-full rounded-full transition-all ${
                              ratio >= 90
                                ? 'bg-rose-500'
                                : ratio >= 75
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                            }`}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="font-mono text-[10px] text-slate-500">
                            {formatNumber(
                              aircraft.heuresDepuisDerniereMaintenance,
                            )}{' '}
                            h
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            / {formatNumber(aircraft.limiteHeuresMaintenance)} h
                          </span>
                        </div>
                      </div>

                      {/* Actions : 4 boutons inline */}
                      <div className="grid grid-cols-4 gap-1.5 border-t border-slate-100 bg-slate-50/60 p-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setHoursAircraft(aircraft);
                            setFlightHours('');
                            setNotice(null);
                          }}
                          disabled={busy || isRetired}
                          title="Ajouter des heures de vol"
                          aria-label="Ajouter des heures de vol"
                          className={`inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-35 ${FOCUS_RING}`}
                        >
                          <Gauge className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Heures</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openMaintenanceResetModal(aircraft)
                          }
                          disabled={busy || isRetired}
                          title="Réinitialiser la maintenance"
                          aria-label="Réinitialiser la maintenance"
                          className={`inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-slate-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-35 ${FOCUS_RING}`}
                        >
                          <RotateCcw
                            className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`}
                          />
                          <span className="hidden sm:inline">Reset</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openEdit(aircraft)}
                          disabled={busy}
                          title="Modifier"
                          aria-label="Modifier"
                          className={`inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-35 ${FOCUS_RING}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Modifier</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void retireAircraft(aircraft)}
                          disabled={busy || isRetired}
                          title={
                            isRetired
                              ? 'Avion déjà retiré'
                              : "Retirer l'avion"
                          }
                          aria-label="Retirer l'avion"
                          className={`inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-35 ${FOCUS_RING}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Retirer</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* ═══════════ DESKTOP : TABLEAU COMPLET ═══════════ */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1100px] text-left">
                  <thead className="border-b border-slate-200 bg-slate-50/70">
                    <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3">Immatriculation</th>
                      <th className="px-4 py-3">Type / modèle</th>
                      <th className="px-4 py-3">Capacité</th>
                      <th className="px-4 py-3">Base</th>
                      <th className="px-4 py-3">Heures totales</th>
                      <th className="px-4 py-3">Maintenance</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredAircrafts.map(aircraft => {
                      const ratio = maintenanceRatio(aircraft);
                      const busy = actionAircraftId === aircraft.id;
                      const isRetired =
                        aircraft.statut === AircraftStatus.RETIRED;

                      return (
                        <tr
                          key={aircraft.id}
                          className="transition hover:bg-emerald-50/30"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                                <Plane className="h-4 w-4 rotate-45" />
                              </div>
                              <div>
                                <p className="font-mono text-sm font-bold text-slate-900">
                                  {aircraft.immatriculation}
                                </p>
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                  Dernière maint. :{' '}
                                  {formatDate(aircraft.dateDerniereMaintenance)}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            <p className="text-xs font-semibold text-slate-700">
                              {aircraft.type?.nomModele ?? aircraft.modele}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-400">
                              {aircraft.type?.fabricant ?? aircraft.modele}
                            </p>
                          </td>

                          <td className="px-4 py-3.5">
                            <span className="font-mono text-xs font-semibold text-slate-600">
                              {aircraft.capacite}{' '}
                              <span className="text-[10px] font-medium text-slate-400">
                                sièges
                              </span>
                            </span>
                          </td>

                          <td className="px-4 py-3.5">
                            {aircraft.baseAttache ? (
                              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                                {aircraft.baseAttache}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <span className="font-mono text-xs font-semibold text-slate-700">
                              {formatNumber(aircraft.heuresDeVolTotales)}{' '}
                              <span className="text-[10px] font-medium text-slate-400">
                                h
                              </span>
                            </span>
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="min-w-[160px]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-bold text-slate-700">
                                  {formatNumber(
                                    aircraft.heuresDepuisDerniereMaintenance,
                                  )}{' '}
                                  <span className="text-[10px] font-medium text-slate-400">
                                    /{' '}
                                    {formatNumber(
                                      aircraft.limiteHeuresMaintenance,
                                    )}{' '}
                                    h
                                  </span>
                                </span>
                                <span
                                  className={`font-mono text-[11px] font-bold ${
                                    ratio >= 90
                                      ? 'text-rose-600'
                                      : ratio >= 75
                                        ? 'text-amber-600'
                                        : 'text-emerald-700'
                                  }`}
                                >
                                  {ratio}%
                                </span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    ratio >= 90
                                      ? 'bg-rose-500'
                                      : ratio >= 75
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${ratio}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            {renderStatusBadge(aircraft.statut)}
                          </td>

                          <td className="px-5 py-3.5">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setHoursAircraft(aircraft);
                                  setFlightHours('');
                                  setNotice(null);
                                }}
                                disabled={busy || isRetired}
                                title="Ajouter des heures de vol"
                                className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-35 ${FOCUS_RING}`}
                              >
                                <Gauge className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  openMaintenanceResetModal(aircraft)
                                }
                                disabled={busy || isRetired}
                                title="Réinitialiser la maintenance"
                                className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-35 ${FOCUS_RING}`}
                              >
                                <RotateCcw
                                  className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`}
                                />
                              </button>

                              <button
                                type="button"
                                onClick={() => openEdit(aircraft)}
                                disabled={busy}
                                title="Modifier"
                                className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-35 ${FOCUS_RING}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => void retireAircraft(aircraft)}
                                disabled={busy || isRetired}
                                title={
                                  isRetired
                                    ? 'Avion déjà retiré'
                                    : "Retirer l'avion"
                                }
                                className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-35 ${FOCUS_RING}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* ═══════════════ STATS BAS ═══════════════ */}
        {statistics && (
          <section className={`${SURFACE} p-4 sm:p-5`}>
            <header className="mb-3 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <Gauge className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Statistiques globales de flotte
                </h3>
                <p className="text-[10px] text-slate-500">
                  Indicateurs agrégés
                </p>
              </div>
            </header>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <InfoMetric
                  label="Heures flotte"
                  value={`${formatNumber(statistics.heuresDeVolTotales)} h`}
                />
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <InfoMetric
                  label="Moyenne / avion"
                  value={`${formatNumber(statistics.moyenneHeuresDeVol)} h`}
                />
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <InfoMetric
                  label="Capacité moyenne"
                  value={`${formatNumber(statistics.capaciteMoyenne, 0)} sièges`}
                />
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ═══════════════ MODAL CREATE / EDIT ═══════════════ */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={event => {
            if (event.currentTarget === event.target && !submitting) {
              closeModal();
            }
          }}
        >
          <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

            {/* HEADER */}
            <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 pb-3.5 pt-4">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    editingAircraft
                      ? 'bg-sky-50 text-sky-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {editingAircraft ? (
                    <Pencil className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-950">
                    {editingAircraft
                      ? `Modifier ${editingAircraft.immatriculation}`
                      : 'Ajouter un avion'}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Champs alignés sur le backend Fleet
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* FORM */}
            <form
              onSubmit={handleSubmit}
              className="flex-1 space-y-5 overflow-y-auto p-5"
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Immatriculation" required>
                  <input
                    name="immatriculation"
                    value={formData.immatriculation}
                    onChange={handleChange}
                    maxLength={20}
                    required
                    placeholder="5R-MDA"
                    className={`${inputClass} uppercase`}
                  />
                </Field>

                <Field label="Type d'avion">
                  <select
                    name="typeId"
                    value={formData.typeId}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="">— Aucun type —</option>
                    {types.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.nomModele}
                        {type.fabricant ? ` — ${type.fabricant}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedType && (
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      Max. {selectedType.capaciteMax ?? '—'} sièges
                      {selectedType.intervalleMaintenanceHeures
                        ? ` · Maintenance ${formatNumber(selectedType.intervalleMaintenanceHeures)} h`
                        : ''}
                    </p>
                  )}
                </Field>

                <Field
                  label="Modèle"
                  required
                  hint={
                    selectedType
                      ? 'Synchronisé avec le type choisi.'
                      : undefined
                  }
                >
                  <input
                    name="modele"
                    value={formData.modele}
                    onChange={handleChange}
                    maxLength={100}
                    required
                    readOnly={Boolean(selectedType)}
                    placeholder="ATR 72-600"
                    className={`${inputClass} ${
                      selectedType
                        ? 'cursor-not-allowed bg-slate-100 text-slate-500'
                        : ''
                    }`}
                  />
                </Field>

                <Field label="Capacité" required>
                  <input
                    type="number"
                    name="capacite"
                    min={1}
                    max={selectedType?.capaciteMax}
                    step={1}
                    value={formData.capacite}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  />
                </Field>

                <Field label="Limite maintenance (h)" required>
                  <input
                    type="number"
                    name="limiteHeuresMaintenance"
                    min={0.1}
                    step={0.1}
                    value={formData.limiteHeuresMaintenance}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  />
                </Field>

                <Field label="Heures de vol totales">
                  <input
                    type="number"
                    name="heuresDeVolTotales"
                    min={0}
                    step={0.1}
                    value={formData.heuresDeVolTotales}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </Field>

                <Field label="Statut" required>
                  <select
                    name="statut"
                    value={formData.statut}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Base d'attache IATA">
                  <input
                    name="baseAttache"
                    value={formData.baseAttache}
                    onChange={handleChange}
                    maxLength={3}
                    placeholder="TNR"
                    className={`${inputClass} uppercase`}
                  />
                </Field>
              </div>

              {editingAircraft && (
                <div className="flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <p className="text-[11px] leading-4 text-sky-800">
                    Le compteur « heures depuis dernière maintenance » et la
                    date de maintenance ne sont pas modifiés ici.
                  </p>
                </div>
              )}
            </form>

            {/* FOOTER */}
            <footer className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className={`h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 sm:min-w-[110px] ${FOCUS_RING}`}
              >
                Annuler
              </button>

              <button
                type="submit"
                disabled={submitting}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[140px] ${FOCUS_RING}`}
              >
                {submitting ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : editingAircraft ? (
                  <Pencil className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {editingAircraft ? 'Enregistrer' : "Créer l'avion"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL MAINTENANCE ═══════════════ */}
      {maintenanceAircraft && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="maintenance-reset-title"
          onMouseDown={event => {
            if (
              event.currentTarget === event.target &&
              actionAircraftId !== maintenanceAircraft.id
            ) {
              closeMaintenanceResetModal();
            }
          }}
        >
          <div className="w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

            {/* HEADER */}
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <RotateCcw className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="maintenance-reset-title"
                    className="text-base font-bold text-slate-950"
                  >
                    Réinitialiser la maintenance
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {maintenanceAircraft.immatriculation} ·{' '}
                    {maintenanceAircraft.type?.nomModele ??
                      maintenanceAircraft.modele}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeMaintenanceResetModal}
                disabled={actionAircraftId === maintenanceAircraft.id}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* BODY */}
            <div className="space-y-3 p-5">
              {/* Warning */}
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="text-xs font-semibold text-amber-900">
                    Confirmer la fin de maintenance ?
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-amber-700">
                    Le compteur, la date de maintenance et le statut seront
                    recalculés automatiquement.
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <span className={LABEL_UPPER}>Compteur actuel</span>
                  <p className="mt-1 font-mono text-base font-bold text-slate-800">
                    {formatNumber(
                      maintenanceAircraft.heuresDepuisDerniereMaintenance,
                    )}{' '}
                    h
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <span className={LABEL_UPPER}>Limite</span>
                  <p className="mt-1 font-mono text-base font-bold text-slate-800">
                    {formatNumber(maintenanceAircraft.limiteHeuresMaintenance)}{' '}
                    h
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <span className={LABEL_UPPER}>Potentiel utilisé</span>
                  <p className="mt-1 font-mono text-base font-bold text-slate-800">
                    {maintenanceRatio(maintenanceAircraft)} %
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <span className={LABEL_UPPER}>Dernière maint.</span>
                  <p className="mt-1 text-xs font-semibold text-slate-800">
                    {formatDate(maintenanceAircraft.dateDerniereMaintenance)}
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <p className="text-[11px] leading-4 text-sky-800">
                  Après confirmation, les données seront rechargées
                  automatiquement pour refléter les changements.
                </p>
              </div>
            </div>

            {/* FOOTER */}
            <footer className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={closeMaintenanceResetModal}
                disabled={actionAircraftId === maintenanceAircraft.id}
                className={`h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 sm:min-w-[110px] ${FOCUS_RING}`}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void resetMaintenance()}
                disabled={actionAircraftId === maintenanceAircraft.id}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[160px] ${FOCUS_RING}`}
              >
                {actionAircraftId === maintenanceAircraft.id ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    Traitement...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Confirmer
                  </>
                )}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL HEURES VOL ═══════════════ */}
      {hoursAircraft && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={event => {
            if (event.currentTarget === event.target && !submitting) {
              setHoursAircraft(null);
            }
          }}
        >
          <div className="w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

            <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                  <Gauge className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-950">
                    Ajouter des heures
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {hoursAircraft.immatriculation} · {hoursAircraft.modele}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setHoursAircraft(null)}
                disabled={submitting}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form onSubmit={submitFlightHours} className="space-y-4 p-5">
              <Field label="Heures volées" required>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  autoFocus
                  value={flightHours}
                  onChange={event => setFlightHours(event.target.value)}
                  placeholder="Ex. 2.5"
                  className={inputClass}
                />
              </Field>

              <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <p className="text-[11px] leading-4 text-slate-600">
                  Cette action augmente les heures totales et le compteur
                  depuis maintenance. Le backend bascule automatiquement
                  l'avion en maintenance si la limite est atteinte.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 sm:flex sm:justify-end">
                <button
                  type="button"
                  onClick={() => setHoursAircraft(null)}
                  disabled={submitting}
                  className={`h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 sm:min-w-[100px] ${FOCUS_RING}`}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[120px] ${FOCUS_RING}`}
                >
                  {submitting ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Ajouter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AircraftManagement;