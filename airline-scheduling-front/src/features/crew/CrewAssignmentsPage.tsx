import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Info,
  Mail,
  Pencil,
  Plane,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import {
  authFetch,
  getCrewMembers,
  type PublicUser,
} from '../Api/apiService';

/* ============================================================================
 * ENDPOINTS
 * ========================================================================== */

const CREW_ASSIGNMENTS_ENDPOINT = '/crew-assignments';
const FLIGHTS_ENDPOINT = '/flights';

/* ============================================================================
 * DESIGN TOKENS
 * ========================================================================== */

const SURFACE = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const FOCUS_RING =
  'outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10';
const LABEL_UPPER =
  'text-[10px] font-semibold uppercase tracking-wider text-slate-500';

/* ============================================================================
 * TYPES
 * ========================================================================== */

type CrewRole =
  | 'Captain'
  | 'First Officer'
  | 'Purser'
  | 'Cabin Crew'
  | 'Other';

type FlightStatus =
  | 'Scheduled'
  | 'Delayed'
  | 'Cancelled'
  | 'In-Flight'
  | 'Effectué'
  | 'Planifié'
  | 'Retardé'
  | 'Annulé'
  | 'En Vol'
  | string;

interface Flight {
  id: string;
  numeroVol?: string;
  aeroportDepart?: string;
  aeroportArrivee?: string;
  heureDepart?: string;
  heureArrivee?: string;
  statut?: FlightStatus;
  avionId?: string | null;
}

interface CrewAssignment {
  id: string;
  volId?: string;
  vol?: Flight;
  utilisateurId?: string;
  utilisateur?: PublicUser;
  fonction?: CrewRole;
  heuresReposAvant?: number | null;
}

interface CrewForm {
  volId: string;
  utilisateurId: string;
  fonction: CrewRole;
}

interface MessageState {
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ApiPayload<T> {
  data?: T;
  message?: unknown;
  error?: unknown;
  code?: string;
}

/* ============================================================================
 * ROLES
 * ========================================================================== */

const CREW_ROLES: CrewRole[] = [
  'Captain',
  'First Officer',
  'Purser',
  'Cabin Crew',
  'Other',
];

const ROLE_LABELS: Record<CrewRole, string> = {
  Captain: 'Commandant de bord',
  'First Officer': 'Copilote',
  Purser: 'Chef de cabine',
  'Cabin Crew': 'Personnel de cabine',
  Other: 'Autre',
};

const ROLE_STYLES: Record<CrewRole, string> = {
  Captain: 'border-rose-200 bg-rose-50 text-rose-700',
  'First Officer': 'border-amber-200 bg-amber-50 text-amber-700',
  Purser: 'border-violet-200 bg-violet-50 text-violet-700',
  'Cabin Crew': 'border-sky-200 bg-sky-50 text-sky-700',
  Other: 'border-slate-200 bg-slate-50 text-slate-600',
};

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function normalizeArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const data = (payload as ApiPayload<T[]>).data;
    if (Array.isArray(data)) return data;
  }
  return [];
}

function formatRole(role?: string | null): string {
  if (!role) return 'Non défini';
  return ROLE_LABELS[role as CrewRole] ?? role;
}

function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value?: string | null): string {
  const date = safeDate(value);
  if (!date) return '--';
  return date.toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function normalizeStatus(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isAssignableFlight(flight: Flight): boolean {
  const status = normalizeStatus(flight.statut);
  return ['scheduled', 'planifie', 'delayed', 'retarde'].includes(status);
}

function getAssignmentFlightId(assignment: CrewAssignment): string {
  return assignment.volId || assignment.vol?.id || '';
}

function getAssignmentUserId(assignment: CrewAssignment): string {
  return assignment.utilisateurId || assignment.utilisateur?.id || '';
}

function getFlightStatusStyle(status?: string): string {
  const normalized = normalizeStatus(status);

  if (['delayed', 'retarde'].includes(normalized)) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (['cancelled', 'annule'].includes(normalized)) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (normalized === 'effectue') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['in-flight', 'en vol'].includes(normalized)) {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

async function getErrorPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;

  const data = payload as {
    code?: string;
    message?:
      | string
      | string[]
      | { code?: string; message?: string };
    error?: string;
  };

  if (Array.isArray(data.message)) return data.message.join(' | ');

  if (data.code === 'CREW_OVERLAP') {
    return typeof data.message === 'string'
      ? data.message
      : 'Ce membre est déjà affecté à un autre vol pendant cette période.';
  }

  if (data.code === 'CREW_REST') {
    return typeof data.message === 'string'
      ? data.message
      : 'Le temps minimal de repos équipage n’est pas respecté.';
  }

  if (typeof data.message === 'object' && data.message !== null) {
    if (data.message.code === 'CREW_OVERLAP') {
      return (
        data.message.message ||
        'Ce membre est déjà affecté à un autre vol pendant cette période.'
      );
    }
    if (data.message.code === 'CREW_REST') {
      return (
        data.message.message ||
        'Le temps minimal de repos équipage n’est pas respecté.'
      );
    }
    return data.message.message || fallback;
  }

  if (typeof data.message === 'string') return data.message;
  if (data.error) return String(data.error);
  return fallback;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await authFetch(path, options);

  if (!response.ok) {
    const payload = await getErrorPayload(response);
    throw new Error(
      extractApiError(payload, `Erreur serveur HTTP ${response.status}`),
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/* ============================================================================
 * SOUS-COMPOSANTS
 * ========================================================================== */

type MetricVariant =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'info'
  | 'warning';

function MetricCard({
  label,
  value,
  icon,
  subtitle,
  variant = 'neutral',
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  variant?: MetricVariant;
}) {
  const styles: Record<
    MetricVariant,
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
  };

  const s = styles[variant];

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border p-3.5 shadow-sm transition hover:shadow-md sm:p-4 ${s.ring}`}
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
          <p
            className={`mt-2 text-2xl font-bold tabular-nums sm:text-3xl ${s.value}`}
          >
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-[10px] font-medium text-slate-400">
              {subtitle}
            </p>
          )}
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
      Icon: AlertTriangle,
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

function RoleBadge({
  role,
  size = 'md',
}: {
  role?: CrewRole | string | null;
  size?: 'sm' | 'md';
}) {
  if (!role) {
    return (
      <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
        Non défini
      </span>
    );
  }

  const style =
    ROLE_STYLES[role as CrewRole] ??
    'border-slate-200 bg-slate-50 text-slate-600';

  const sizeClass =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-[9px]'
      : 'px-2 py-0.5 text-[10px]';

  return (
    <span
      className={`inline-flex items-center rounded-md border font-semibold ${style} ${sizeClass}`}
    >
      {formatRole(role)}
    </span>
  );
}

/* ============================================================================
 * COMPOSANT PRINCIPAL
 * ========================================================================== */

export const CrewAssignmentsPage: React.FC = () => {
  /* ========================================================================
   * STATES
   * ====================================================================== */

  const [assignments, setAssignments] = useState<CrewAssignment[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assignmentToDelete, setAssignmentToDelete] =
    useState<CrewAssignment | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFlightId, setSelectedFlightId] = useState('TOUS');
  const [selectedUserId, setSelectedUserId] = useState('TOUS');
  const [message, setMessage] = useState<MessageState | null>(null);
  const [form, setForm] = useState<CrewForm>({
    volId: '',
    utilisateurId: '',
    fonction: 'Other',
  });

  /* ========================================================================
   * LOAD MEMBERS
   * ====================================================================== */

  const loadCrewMembers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const result = await getCrewMembers();
      const members = normalizeArray<PublicUser>(result);
      const filtered = members.filter(
        user =>
          user.role === 'Crew_Member' &&
          user.actif !== false &&
          user.accountStatus === 'APPROVED',
      );
      setUsers(filtered);
      if (filtered.length === 0) {
        setMessage({
          type: 'info',
          text: 'Aucun membre d’équipage actif et approuvé n’est actuellement disponible.',
        });
      }
    } catch (error: unknown) {
      setUsers([]);
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Impossible de charger les membres d’équipage.',
      });
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  /* ========================================================================
   * LOAD DATA
   * ====================================================================== */

  const loadData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setMessage(null);
    }

    try {
      const [assignmentsResult, flightsResult] = await Promise.allSettled([
        requestJson<unknown>(CREW_ASSIGNMENTS_ENDPOINT),
        requestJson<unknown>(FLIGHTS_ENDPOINT),
      ]);

      if (assignmentsResult.status === 'rejected') {
        throw assignmentsResult.reason;
      }

      setAssignments(normalizeArray<CrewAssignment>(assignmentsResult.value));

      if (flightsResult.status === 'fulfilled') {
        setFlights(normalizeArray<Flight>(flightsResult.value));
      } else {
        setFlights([]);
      }
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Impossible de charger les affectations équipage.',
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadData(), loadCrewMembers()]);
  }, [loadData, loadCrewMembers]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadData(true);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  /* ========================================================================
   * MODAL BODY LOCK + ESCAPE
   * ====================================================================== */

  useEffect(() => {
    const hasOpenModal = modalOpen || Boolean(assignmentToDelete);
    if (!hasOpenModal) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (saving || deletingId) return;

      if (assignmentToDelete) {
        setAssignmentToDelete(null);
        return;
      }

      setModalOpen(false);
      setEditingId(null);
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [modalOpen, assignmentToDelete, saving, deletingId]);

  /* ========================================================================
   * DERIVED
   * ====================================================================== */

  const assignableFlights = useMemo(() => {
    const currentFlightId = editingId ? form.volId : null;
    return flights.filter(
      flight =>
        isAssignableFlight(flight) || flight.id === currentFlightId,
    );
  }, [flights, editingId, form.volId]);

  const filteredAssignments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return assignments.filter(assignment => {
      const flight = assignment.vol;
      const user = assignment.utilisateur;
      const flightId = getAssignmentFlightId(assignment);
      const userId = getAssignmentUserId(assignment);

      const text = [
        flight?.numeroVol,
        flight?.aeroportDepart,
        flight?.aeroportArrivee,
        user?.nom,
        user?.email,
        assignment.fonction,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return (
        (!term || text.includes(term)) &&
        (selectedFlightId === 'TOUS' || flightId === selectedFlightId) &&
        (selectedUserId === 'TOUS' || userId === selectedUserId)
      );
    });
  }, [assignments, searchTerm, selectedFlightId, selectedUserId]);

  const uniqueCrewCount = useMemo(
    () =>
      new Set(assignments.map(getAssignmentUserId).filter(Boolean)).size,
    [assignments],
  );

  const assignedFlightCount = useMemo(
    () =>
      new Set(assignments.map(getAssignmentFlightId).filter(Boolean)).size,
    [assignments],
  );

  const withRestInfo = useMemo(
    () =>
      assignments.filter(
        item =>
          item.heuresReposAvant !== null &&
          item.heuresReposAvant !== undefined,
      ).length,
    [assignments],
  );

  const selectedFlight = useMemo(
    () =>
      flights.find(flight => flight.id === form.volId) ?? null,
    [flights, form.volId],
  );

  const modalUsers = useMemo(() => {
    if (!editingId) return users;

    const assignment = assignments.find(item => item.id === editingId);
    const currentUser = assignment?.utilisateur;

    if (!currentUser || users.some(user => user.id === currentUser.id)) {
      return users;
    }

    return [currentUser, ...users];
  }, [users, assignments, editingId]);

  const activeFilterCount =
    (searchTerm.trim() ? 1 : 0) +
    (selectedFlightId !== 'TOUS' ? 1 : 0) +
    (selectedUserId !== 'TOUS' ? 1 : 0);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedFlightId('TOUS');
    setSelectedUserId('TOUS');
  };

  /* ========================================================================
   * MODAL
   * ====================================================================== */

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ volId: '', utilisateurId: '', fonction: 'Other' });
    setMessage(null);
    void loadCrewMembers();
    setModalOpen(true);
  };

  const openEditModal = (assignment: CrewAssignment) => {
    setEditingId(assignment.id);
    setForm({
      volId: getAssignmentFlightId(assignment),
      utilisateurId: getAssignmentUserId(assignment),
      fonction: assignment.fonction ?? 'Other',
    });
    setMessage(null);
    void loadCrewMembers();
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
  };

  /* ========================================================================
   * SAVE
   * ====================================================================== */

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (!form.volId || !form.utilisateurId || !form.fonction) {
      setMessage({
        type: 'error',
        text: 'Veuillez sélectionner un vol, un membre d’équipage et sa fonction.',
      });
      return;
    }

    if (
      selectedFlight &&
      !isAssignableFlight(selectedFlight) &&
      !editingId
    ) {
      setMessage({
        type: 'error',
        text: 'Ce vol ne peut plus recevoir une nouvelle affectation équipage.',
      });
      return;
    }

    const selectedUser = modalUsers.find(user => user.id === form.utilisateurId);
    if (!selectedUser) {
      setMessage({
        type: 'error',
        text: 'Le membre d’équipage sélectionné est introuvable.',
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const isEdit = Boolean(editingId);

      await requestJson<CrewAssignment>(
        isEdit
          ? `${CREW_ASSIGNMENTS_ENDPOINT}/${editingId}`
          : CREW_ASSIGNMENTS_ENDPOINT,
        {
          method: isEdit ? 'PATCH' : 'POST',
          body: JSON.stringify({
            volId: form.volId,
            utilisateurId: form.utilisateurId,
            fonction: form.fonction,
          }),
        },
      );

      setModalOpen(false);
      setEditingId(null);
      setMessage({
        type: 'success',
        text: isEdit
          ? 'Affectation équipage modifiée avec succès.'
          : 'Membre d’équipage affecté avec succès.',
      });

      await loadData(true);
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Impossible d’enregistrer l’affectation.',
      });
    } finally {
      setSaving(false);
    }
  };

  /* ========================================================================
   * DELETE
   * ====================================================================== */

  const handleDelete = (assignment: CrewAssignment) => {
    if (deletingId) return;
    setAssignmentToDelete(assignment);
  };

  const closeDeleteModal = () => {
    if (deletingId) return;
    setAssignmentToDelete(null);
  };

  const confirmDelete = async () => {
    if (!assignmentToDelete || deletingId) return;

    const assignment = assignmentToDelete;
    setDeletingId(assignment.id);
    setMessage(null);

    try {
      await requestJson(`${CREW_ASSIGNMENTS_ENDPOINT}/${assignment.id}`, {
        method: 'DELETE',
      });

      setAssignmentToDelete(null);
      setMessage({
        type: 'success',
        text: 'Affectation supprimée avec succès.',
      });

      await loadData(true);
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Impossible de supprimer cette affectation.',
      });
    } finally {
      setDeletingId(null);
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
                <Users className="h-5 w-5" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-slate-950 sm:text-xl">
                    Gestion des équipages
                  </h1>
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    OCC
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                  Affectations, fonctions à bord, chevauchements et suivi du repos
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={() => {
                  void loadData();
                  void loadCrewMembers();
                }}
                disabled={loading || loadingUsers}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 ${FOCUS_RING}`}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    loading || loadingUsers ? 'animate-spin' : ''
                  }`}
                />
                Actualiser
              </button>

              <button
                type="button"
                onClick={openCreateModal}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 ${FOCUS_RING}`}
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span className="sm:hidden">Affecter</span>
                <span className="hidden sm:inline">Nouvelle affectation</span>
              </button>
            </div>
          </div>
        </header>

        {/* ═══════════════ MESSAGE ═══════════════ */}
        {message && (
          <AlertBanner
            type={message.type}
            text={message.text}
            onClose={() => setMessage(null)}
          />
        )}

        {/* ═══════════════ KPI ═══════════════ */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Affectations"
            value={assignments.length}
            subtitle="Total enregistrées"
            icon={<Users className="h-4 w-4" />}
            variant="primary"
          />
          <MetricCard
            label="Membres"
            value={uniqueCrewCount}
            subtitle="Actuellement affectés"
            icon={<ShieldCheck className="h-4 w-4" />}
            variant="success"
          />
          <MetricCard
            label="Vols couverts"
            value={assignedFlightCount}
            subtitle="Avec équipage"
            icon={<Plane className="h-4 w-4" />}
            variant="info"
          />
          <MetricCard
            label="Repos renseignés"
            value={withRestInfo}
            subtitle="Traçabilité complète"
            icon={<Clock3 className="h-4 w-4" />}
            variant="warning"
          />
        </section>

        {/* ═══════════════ FILTRES ═══════════════ */}
        <section className={`${SURFACE} p-3 sm:p-4`}>
          <div className="grid gap-2.5 md:grid-cols-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Vol, membre ou fonction..."
                className={`h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:bg-white ${FOCUS_RING}`}
              />
            </div>

            <select
              value={selectedFlightId}
              onChange={event => setSelectedFlightId(event.target.value)}
              className={`h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 focus:bg-white ${FOCUS_RING}`}
            >
              <option value="TOUS">Tous les vols</option>
              {flights.map(flight => (
                <option key={flight.id} value={flight.id}>
                  {flight.numeroVol ?? flight.id} — {flight.aeroportDepart ?? '?'}{' '}
                  → {flight.aeroportArrivee ?? '?'}
                </option>
              ))}
            </select>

            <select
              value={selectedUserId}
              onChange={event => setSelectedUserId(event.target.value)}
              disabled={loadingUsers}
              className={`h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 focus:bg-white disabled:opacity-50 ${FOCUS_RING}`}
            >
              <option value="TOUS">
                {loadingUsers ? 'Chargement des membres...' : 'Tous les membres'}
              </option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.nom} — {user.email}
                </option>
              ))}
            </select>
          </div>

          {activeFilterCount > 0 && (
            <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5">
              <span className="text-[10px] font-medium text-slate-500">
                {filteredAssignments.length} résultat
                {filteredAssignments.length > 1 ? 's' : ''} · {activeFilterCount}{' '}
                filtre{activeFilterCount > 1 ? 's' : ''} actif
                {activeFilterCount > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <X className="h-3 w-3" />
                Réinitialiser
              </button>
            </div>
          )}
        </section>

        {/* ═══════════════ AFFECTATIONS ═══════════════ */}
        <section className={`${SURFACE} overflow-hidden`}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <Plane className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Affectations équipage
                </h2>
                <p className="text-[10px] text-slate-500">
                  Vol, membre, fonction et repos avant rotation
                </p>
              </div>
            </div>

            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
              {filteredAssignments.length} affectation
              {filteredAssignments.length > 1 ? 's' : ''}
            </span>
          </header>

          {/* MOBILE */}
          <div className="space-y-3 bg-slate-50/60 p-3 md:hidden">
            {loading ? (
              <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-slate-200 bg-white">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Chargement...
                </span>
              </div>
            ) : filteredAssignments.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-300">
                  <Users className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  Aucune affectation
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {activeFilterCount > 0
                    ? 'Ajustez vos filtres ou votre recherche.'
                    : 'Créez une nouvelle affectation pour commencer.'}
                </p>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <X className="h-3 w-3" />
                    Réinitialiser
                  </button>
                )}
              </div>
            ) : (
              filteredAssignments.map(assignment => {
                const flight = assignment.vol;
                const user = assignment.utilisateur;
                const initials = (user?.nom ?? 'U')
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .substring(0, 2)
                  .toUpperCase();

                return (
                  <article
                    key={assignment.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  >
                    {/* Header card */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                          <Plane className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-bold text-slate-900">
                            {flight?.numeroVol ?? getAssignmentFlightId(assignment)}
                          </p>
                          <p className="truncate font-mono text-[10px] text-slate-500">
                            {flight?.aeroportDepart ?? '--'} →{' '}
                            {flight?.aeroportArrivee ?? '--'}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${getFlightStatusStyle(
                          flight?.statut,
                        )}`}
                      >
                        {flight?.statut ?? 'Inconnu'}
                      </span>
                    </div>

                    {/* Body */}
                    <div className="space-y-2.5 p-3.5">
                      {/* Membre */}
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {user?.nom ?? 'Utilisateur'}
                            </p>
                            <RoleBadge role={assignment.fonction} size="sm" />
                          </div>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {user?.email ?? getAssignmentUserId(assignment)}
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                            Départ
                          </p>
                          <p className="mt-1 font-mono text-[11px] font-semibold text-slate-700">
                            {formatDateTime(flight?.heureDepart)}
                          </p>
                        </div>

                        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                            Repos avant
                          </p>
                          {assignment.heuresReposAvant === null ||
                          assignment.heuresReposAvant === undefined ? (
                            <p className="mt-1 text-[11px] font-medium text-slate-400">
                              Non calculé
                            </p>
                          ) : (
                            <p className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] font-bold text-emerald-700">
                              <Clock3 className="h-3 w-3" />
                              {assignment.heuresReposAvant.toFixed(1)} h
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/60 p-2.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(assignment)}
                        className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 ${FOCUS_RING}`}
                      >
                        <Pencil className="h-3 w-3" />
                        Modifier
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(assignment)}
                        className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 ${FOCUS_RING}`}
                      >
                        <Trash2 className="h-3 w-3" />
                        Supprimer
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* DESKTOP */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1100px] text-left">
              <thead className="border-b border-slate-200 bg-slate-50/70">
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Vol</th>
                  <th className="px-4 py-3">Itinéraire</th>
                  <th className="px-4 py-3">Membre</th>
                  <th className="px-4 py-3">Fonction</th>
                  <th className="px-4 py-3">Départ</th>
                  <th className="px-4 py-3">Repos avant</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center">
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Chargement des affectations...
                      </span>
                    </td>
                  </tr>
                ) : filteredAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-300">
                          <Users className="h-6 w-6" />
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-700">
                          Aucune affectation trouvée
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Ajustez les filtres ou créez une nouvelle affectation.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAssignments.map(assignment => {
                    const flight = assignment.vol;
                    const user = assignment.utilisateur;
                    const initials = (user?.nom ?? 'U')
                      .split(' ')
                      .map(n => n[0])
                      .join('')
                      .substring(0, 2)
                      .toUpperCase();

                    return (
                      <tr
                        key={assignment.id}
                        className="transition hover:bg-emerald-50/30"
                      >
                        {/* VOL */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                              <Plane className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-mono text-sm font-bold text-slate-900">
                                {flight?.numeroVol ??
                                  getAssignmentFlightId(assignment)}
                              </p>
                              <span
                                className={`mt-0.5 inline-flex rounded border px-1.5 py-0.5 text-[9px] font-semibold ${getFlightStatusStyle(
                                  flight?.statut,
                                )}`}
                              >
                                {flight?.statut ?? 'Inconnu'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* ROUTE */}
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {flight?.aeroportDepart ?? '--'}{' '}
                            <span className="text-slate-300">→</span>{' '}
                            {flight?.aeroportArrivee ?? '--'}
                          </span>
                        </td>

                        {/* MEMBRE */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">
                                {user?.nom ?? 'Utilisateur'}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                {user?.email ??
                                  getAssignmentUserId(assignment)}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* ROLE */}
                        <td className="px-4 py-3.5">
                          <RoleBadge role={assignment.fonction} />
                        </td>

                        {/* DATE */}
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs font-medium text-slate-600">
                            {formatDateTime(flight?.heureDepart)}
                          </span>
                        </td>

                        {/* REPOS */}
                        <td className="px-4 py-3.5">
                          {assignment.heuresReposAvant === null ||
                          assignment.heuresReposAvant === undefined ? (
                            <span className="text-[11px] font-medium text-slate-400">
                              Non calculé
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[11px] font-bold text-emerald-700">
                              <Clock3 className="h-3 w-3" />
                              {assignment.heuresReposAvant.toFixed(1)} h
                            </span>
                          )}
                        </td>

                        {/* ACTIONS */}
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(assignment)}
                              title="Modifier"
                              className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 ${FOCUS_RING}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(assignment)}
                              title="Supprimer"
                              className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 ${FOCUS_RING}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ═══════════════ MODAL CREATE / EDIT ═══════════════ */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={event => {
            if (event.currentTarget === event.target && !saving) {
              closeModal();
            }
          }}
        >
          <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-[620px] sm:rounded-2xl">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

            {/* HEADER */}
            <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 pb-3.5 pt-4">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    editingId
                      ? 'bg-sky-50 text-sky-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {editingId ? (
                    <Pencil className="h-4 w-4" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-950">
                    {editingId ? 'Modifier l’affectation' : 'Nouvelle affectation'}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Vol, membre et fonction à bord
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* FORM */}
            <form
              onSubmit={handleSubmit}
              className="flex-1 space-y-4 overflow-y-auto p-5"
            >
              {/* VOL */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Vol <span className="text-rose-500">*</span>
                </span>
                <select
                  required
                  value={form.volId}
                  onChange={event =>
                    setForm(current => ({ ...current, volId: event.target.value }))
                  }
                  className={`h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 ${FOCUS_RING}`}
                >
                  <option value="">Sélectionner un vol</option>
                  {assignableFlights.map(flight => (
                    <option key={flight.id} value={flight.id}>
                      {flight.numeroVol ?? flight.id} — {flight.aeroportDepart ?? '?'} →{' '}
                      {flight.aeroportArrivee ?? '?'}
                    </option>
                  ))}
                </select>
              </label>

              {/* MEMBER */}
              <label className="block">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Membre d’équipage <span className="text-rose-500">*</span>
                  </span>
                  {!loadingUsers && (
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {modalUsers.length} disponible
                      {modalUsers.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    required
                    value={form.utilisateurId}
                    disabled={loadingUsers || modalUsers.length === 0}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        utilisateurId: event.target.value,
                      }))
                    }
                    className={`h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold text-slate-700 disabled:bg-slate-50 disabled:opacity-60 ${FOCUS_RING}`}
                  >
                    <option value="">
                      {loadingUsers
                        ? 'Chargement...'
                        : modalUsers.length === 0
                          ? 'Aucun membre disponible'
                          : 'Sélectionner un membre'}
                    </option>
                    {modalUsers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.nom} — {user.email}
                      </option>
                    ))}
                  </select>
                </div>

                {!loadingUsers && modalUsers.length === 0 && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div>
                        <p className="text-xs font-semibold text-amber-900">
                          Aucun membre disponible
                        </p>
                        <p className="mt-0.5 text-[11px] leading-4 text-amber-700">
                          Vérifiez le rôle Crew_Member, le statut APPROVED et
                          l’activation du compte.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadCrewMembers()}
                      className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-50"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Recharger
                    </button>
                  </div>
                )}
              </label>

              {/* ROLE */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Fonction à bord <span className="text-rose-500">*</span>
                </span>
                <select
                  required
                  value={form.fonction}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      fonction: event.target.value as CrewRole,
                    }))
                  }
                  className={`h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 ${FOCUS_RING}`}
                >
                  {CREW_ROLES.map(role => (
                    <option key={role} value={role}>
                      {formatRole(role)}
                    </option>
                  ))}
                </select>
              </label>

              {/* INFO */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      Contrôles opérationnels automatiques
                    </p>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                      Les chevauchements et le repos minimal sont vérifiés avant
                      l’enregistrement.
                    </p>
                  </div>
                </div>
              </div>
            </form>

            {/* FOOTER */}
            <footer className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className={`h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 sm:min-w-[110px] ${FOCUS_RING}`}
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  saving || loadingUsers || modalUsers.length === 0
                }
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[140px] ${FOCUS_RING}`}
              >
                {saving ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving
                  ? 'Enregistrement...'
                  : editingId
                    ? 'Enregistrer'
                    : 'Affecter'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL SUPPRESSION ═══════════════ */}
      {assignmentToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-assignment-title"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={event => {
            if (event.currentTarget === event.target && !deletingId) {
              closeDeleteModal();
            }
          }}
        >
          <div className="w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-[480px] sm:rounded-2xl">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

            {/* HEADER */}
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="delete-assignment-title"
                    className="text-base font-bold text-slate-950"
                  >
                    Supprimer l’affectation
                  </h2>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                    Cette action est irréversible
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={Boolean(deletingId)}
                aria-label="Fermer"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* BODY */}
            <div className="p-5">
              {/* Summary card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                {/* Membre */}
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Membre
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                      {assignmentToDelete.utilisateur?.nom ?? 'Utilisateur'}
                    </p>
                  </div>
                  <RoleBadge role={assignmentToDelete.fonction} />
                </div>

                <div className="my-3 border-t border-slate-200" />

                {/* Vol */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Vol
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 font-mono text-sm font-bold text-slate-900">
                      <Plane className="h-3.5 w-3.5 text-emerald-700" />
                      {assignmentToDelete.vol?.numeroVol ??
                        getAssignmentFlightId(assignmentToDelete)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Itinéraire
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700">
                      <span>{assignmentToDelete.vol?.aeroportDepart ?? '--'}</span>
                      <ArrowRight className="h-3 w-3 text-slate-300" />
                      <span>{assignmentToDelete.vol?.aeroportArrivee ?? '--'}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 border-t border-slate-200 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Départ du vol
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700">
                    <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                    {formatDateTime(assignmentToDelete.vol?.heureDepart)}
                  </p>
                </div>
              </div>

              {/* Warning */}
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <p className="text-[11px] leading-4 text-rose-700">
                  L’affectation sera retirée du vol. Ni le membre d’équipage ni
                  le vol ne seront supprimés.
                </p>
              </div>
            </div>

            {/* FOOTER */}
            <footer className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={Boolean(deletingId)}
                className={`h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 sm:min-w-[110px] ${FOCUS_RING}`}
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={Boolean(deletingId)}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[140px] ${FOCUS_RING}`}
              >
                {deletingId ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {deletingId ? 'Suppression...' : 'Supprimer'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrewAssignmentsPage;