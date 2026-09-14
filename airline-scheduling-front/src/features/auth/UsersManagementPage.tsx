// src/features/auth/UsersManagementPage.tsx

import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserRound,
  UserX,
  Users,
  X,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { ReactNode } from 'react';

import {
  approveUserAccount,
  getUsers,
  rejectUserAccount,
  setUserAccountPending,
  type AccountStatus,
  type PublicUser,
} from '../Api/apiService';

// =============================================================================
// TYPES
// =============================================================================

type FilterStatus = 'ALL' | AccountStatus;

interface RejectModalState {
  open: boolean;
  user: PublicUser | null;
  reason: string;
}

interface StatCardProps {
  label: string;
  value: number;
  description: string;
  icon: ReactNode;
  tone?: 'default' | 'warning' | 'success' | 'danger';
}

// =============================================================================
// LABELS
// =============================================================================

const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  PENDING: 'En attente',
  APPROVED: 'Validé',
  REJECTED: 'Refusé',
};

const ROLE_LABELS: Record<string, string> = {
  Admin: 'Administrateur',
  Planificateur: 'Planificateur',
  Regulator: 'Régulateur OCC',
  Crew_Member: "Membre d'équipage",
  Maintenance_Engineer: 'Maintenance',
  Product_Owner: 'Product Owner',
};

// =============================================================================
// HELPERS
// =============================================================================

function getStatusClasses(status: AccountStatus): string {
  switch (status) {
    case 'APPROVED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'REJECTED':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'PENDING':
    default:
      return 'border-amber-200 bg-amber-50 text-amber-700';
  }
}

function getStatusIcon(status: AccountStatus): ReactNode {
  switch (status) {
    case 'APPROVED':
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case 'REJECTED':
      return <UserX className="h-3.5 w-3.5" />;
    case 'PENDING':
    default:
      return <Clock3 className="h-3.5 w-3.5" />;
  }
}

function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

// =============================================================================
// SPINNER
// =============================================================================

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-20"
      />
      <path
        fill="currentColor"
        className="opacity-80"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// =============================================================================
// PAGE
// =============================================================================

export function UsersManagementPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [rejectModal, setRejectModal] = useState<RejectModalState>({
    open: false,
    user: null,
    reason: '',
  });

  // ===========================================================================
  // CHARGEMENT
  // ===========================================================================

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getUsers();
      setUsers(Array.isArray(response) ? response : []);
    } catch (apiError: unknown) {
      setError(
        apiError instanceof Error
          ? apiError.message
          : 'Impossible de charger les utilisateurs.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // ===========================================================================
  // STATISTIQUES
  // ===========================================================================

  const stats = useMemo(
    () => ({
      total: users.length,
      pending: users.filter((u) => u.accountStatus === 'PENDING').length,
      approved: users.filter((u) => u.accountStatus === 'APPROVED').length,
      rejected: users.filter((u) => u.accountStatus === 'REJECTED').length,
    }),
    [users],
  );

  // ===========================================================================
  // FILTRAGE
  // ===========================================================================

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter !== 'ALL' && user.accountStatus !== statusFilter) {
        return false;
      }
      if (!query) return true;
      return `${user.nom} ${user.email} ${user.role}`
        .toLowerCase()
        .includes(query);
    });
  }, [users, search, statusFilter]);

  // ===========================================================================
  // APPROUVER
  // ===========================================================================

  const handleApprove = async (user: PublicUser) => {
    setActionLoadingId(user.id);
    setError('');
    setSuccess('');
    try {
      await approveUserAccount(user.id);
      setSuccess(`Le compte de ${user.nom} a été validé.`);
      await loadUsers();
    } catch (apiError: unknown) {
      setError(
        apiError instanceof Error
          ? apiError.message
          : 'Impossible de valider le compte.',
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  // ===========================================================================
  // REFUS MODAL
  // ===========================================================================

  const openRejectModal = (user: PublicUser) => {
    setRejectModal({ open: true, user, reason: '' });
  };

  const closeRejectModal = () => {
    if (actionLoadingId) return;
    setRejectModal({ open: false, user: null, reason: '' });
  };

  // ===========================================================================
  // REFUSER
  // ===========================================================================

  const handleReject = async () => {
    const user = rejectModal.user;
    if (!user) return;
    setActionLoadingId(user.id);
    setError('');
    setSuccess('');
    try {
      await rejectUserAccount(user.id, rejectModal.reason.trim());
      setSuccess(`Le compte de ${user.nom} a été refusé.`);
      setRejectModal({ open: false, user: null, reason: '' });
      await loadUsers();
    } catch (apiError: unknown) {
      setError(
        apiError instanceof Error
          ? apiError.message
          : 'Impossible de refuser le compte.',
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  // ===========================================================================
  // REMETTRE EN ATTENTE
  // ===========================================================================

  const handleSetPending = async (user: PublicUser) => {
    setActionLoadingId(user.id);
    setError('');
    setSuccess('');
    try {
      await setUserAccountPending(user.id);
      setSuccess(`Le compte de ${user.nom} a été remis en attente.`);
      await loadUsers();
    } catch (apiError: unknown) {
      setError(
        apiError instanceof Error
          ? apiError.message
          : 'Impossible de remettre le compte en attente.',
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <div className="min-h-full bg-slate-50 p-3 sm:p-4 lg:p-5">
      <div className="mx-auto max-w-6xl space-y-4">

        {/* HEADER */}
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Administration système
                </div>
                <h1 className="mt-0.5 text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">
                  Gestion des utilisateurs
                </h1>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                  Validation des comptes et gestion des accès à la plateforme.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadUsers()}
              disabled={loading}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
          </div>
        </section>

        {/* STATS */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          <StatCard
            label="Utilisateurs"
            value={stats.total}
            description="Tous les comptes"
            icon={<Users className="h-4 w-4" />}
            tone="default"
          />
          <StatCard
            label="En attente"
            value={stats.pending}
            description="À examiner"
            icon={<Clock3 className="h-4 w-4" />}
            tone={stats.pending > 0 ? 'warning' : 'default'}
          />
          <StatCard
            label="Validés"
            value={stats.approved}
            description="Accès autorisé"
            icon={<UserCheck className="h-4 w-4" />}
            tone="success"
          />
          <StatCard
            label="Refusés"
            value={stats.rejected}
            description="Accès refusé"
            icon={<UserX className="h-4 w-4" />}
            tone={stats.rejected > 0 ? 'danger' : 'default'}
          />
        </div>

        {/* MESSAGES */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-medium text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="rounded p-0.5"
              aria-label="Fermer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-medium text-emerald-700"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{success}</span>
            <button
              type="button"
              onClick={() => setSuccess('')}
              className="rounded p-0.5"
              aria-label="Fermer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* TABLE / CARDS CONTAINER                                          */}
        {/* ================================================================ */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          {/* TOOLBAR */}
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                Comptes utilisateurs
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {filteredUsers.length} résultat(s) sur {users.length}
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nom, e-mail ou rôle..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as FilterStatus)
                }
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 sm:w-auto sm:min-w-40"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="PENDING">En attente</option>
                <option value="APPROVED">Validés</option>
                <option value="REJECTED">Refusés</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Spinner />
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-600">
                Chargement des utilisateurs...
              </p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center px-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                <UserRound className="h-5 w-5" />
              </div>
              <p className="mt-3 text-xs font-bold text-slate-700">
                Aucun utilisateur trouvé
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Aucun compte ne correspond aux critères sélectionnés.
              </p>
            </div>
          ) : (
            <>
              {/* ========================================================= */}
              {/* MOBILE : CARDS                                            */}
              {/* ========================================================= */}
              <div className="space-y-3 bg-slate-50 p-3 md:hidden">
                {filteredUsers.map((user) => (
                  <UserMobileCard
                    key={user.id}
                    user={user}
                    isActionLoading={actionLoadingId === user.id}
                    onApprove={() => void handleApprove(user)}
                    onReject={() => openRejectModal(user)}
                    onSetPending={() => void handleSetPending(user)}
                  />
                ))}
              </div>

              {/* ========================================================= */}
              {/* DESKTOP : TABLE                                           */}
              {/* ========================================================= */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1100px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <TableHeader>Utilisateur</TableHeader>
                      <TableHeader>Rôle</TableHeader>
                      <TableHeader>Statut</TableHeader>
                      <TableHeader>Création</TableHeader>
                      <TableHeader>Décision</TableHeader>
                      <TableHeader align="right">Actions</TableHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const isCurrentAction = actionLoadingId === user.id;
                      return (
                        <tr
                          key={user.id}
                          className="border-t border-slate-100 transition hover:bg-slate-50/60"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                                {getInitials(user.nom)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-slate-800">
                                  {user.nom}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                              {ROLE_LABELS[user.role] ?? user.role}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${getStatusClasses(
                                user.accountStatus,
                              )}`}
                            >
                              {getStatusIcon(user.accountStatus)}
                              {ACCOUNT_STATUS_LABELS[user.accountStatus]}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-[11px] text-slate-500">
                            {formatDate(user.creeA ?? user.createdAt)}
                          </td>

                          <td className="px-4 py-3">
                            {user.accountStatus === 'APPROVED' ? (
                              <DecisionInfo
                                label="Validé"
                                date={user.approvedAt}
                                status="approved"
                              />
                            ) : user.accountStatus === 'REJECTED' ? (
                              <div className="max-w-48">
                                <DecisionInfo
                                  label="Refusé"
                                  date={user.rejectedAt}
                                  status="rejected"
                                />
                                {user.rejectionReason && (
                                  <p
                                    className="mt-0.5 max-w-44 truncate text-[10px] text-slate-400"
                                    title={user.rejectionReason}
                                  >
                                    {user.rejectionReason}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                                <Clock3 className="h-3.5 w-3.5" />
                                Décision requise
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              <UserActions
                                user={user}
                                isCurrentAction={isCurrentAction}
                                onApprove={() => void handleApprove(user)}
                                onReject={() => openRejectModal(user)}
                                onSetPending={() => void handleSetPending(user)}
                              />
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
      </div>

      {/* MODAL REFUS */}
      {rejectModal.open && rejectModal.user && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-user-title"
        >
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <UserX className="h-4 w-4" />
                </div>
                <div>
                  <h2
                    id="reject-user-title"
                    className="text-sm font-bold text-slate-900"
                  >
                    Refuser le compte
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {rejectModal.user.nom}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeRejectModal}
                disabled={actionLoadingId !== null}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4">
              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <p className="text-[11px] leading-5 text-slate-600">
                  Le compte restera bloqué jusqu'à une nouvelle décision de
                  l'administrateur.
                </p>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="rejection-reason"
                    className="text-[11px] font-bold uppercase tracking-wide text-slate-500"
                  >
                    Motif du refus
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {rejectModal.reason.length}/500
                  </span>
                </div>
                <textarea
                  id="rejection-reason"
                  value={rejectModal.reason}
                  onChange={(e) =>
                    setRejectModal((current) => ({
                      ...current,
                      reason: e.target.value,
                    }))
                  }
                  placeholder="Motif du refus..."
                  rows={4}
                  maxLength={500}
                  className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRejectModal}
                  disabled={actionLoadingId !== null}
                  className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleReject()}
                  disabled={actionLoadingId !== null}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                >
                  {actionLoadingId ? <Spinner /> : <UserX className="h-3.5 w-3.5" />}
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// USER ACTIONS (réutilisable desktop + mobile)
// =============================================================================

interface UserActionsProps {
  user: PublicUser;
  isCurrentAction: boolean;
  onApprove: () => void;
  onReject: () => void;
  onSetPending: () => void;
  fullWidth?: boolean;
}

function UserActions({
  user,
  isCurrentAction,
  onApprove,
  onReject,
  onSetPending,
  fullWidth = false,
}: UserActionsProps) {
  const baseButton =
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
  const widthClass = fullWidth ? 'flex-1' : '';

  if (user.accountStatus === 'PENDING') {
    return (
      <>
        <button
          type="button"
          disabled={isCurrentAction}
          onClick={onApprove}
          className={`${baseButton} ${widthClass} bg-emerald-700 text-white hover:bg-emerald-800`}
        >
          {isCurrentAction ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
          Valider
        </button>
        <button
          type="button"
          disabled={isCurrentAction}
          onClick={onReject}
          className={`${baseButton} ${widthClass} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
        >
          <UserX className="h-3.5 w-3.5" />
          Refuser
        </button>
      </>
    );
  }

  return (
    <button
      type="button"
      disabled={isCurrentAction}
      onClick={onSetPending}
      className={`${baseButton} ${widthClass} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
    >
      {isCurrentAction ? <Spinner /> : <Clock3 className="h-3.5 w-3.5" />}
      En attente
    </button>
  );
}

// =============================================================================
// MOBILE CARD
// =============================================================================

interface UserMobileCardProps {
  user: PublicUser;
  isActionLoading: boolean;
  onApprove: () => void;
  onReject: () => void;
  onSetPending: () => void;
}

function UserMobileCard({
  user,
  isActionLoading,
  onApprove,
  onReject,
  onSetPending,
}: UserMobileCardProps) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-extrabold text-slate-600">
            {getInitials(user.nom)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900">
              {user.nom}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              {user.email}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${getStatusClasses(
            user.accountStatus,
          )}`}
        >
          {getStatusIcon(user.accountStatus)}
          {ACCOUNT_STATUS_LABELS[user.accountStatus]}
        </span>
      </div>

      {/* BODY */}
      <div className="space-y-3 p-3.5">
        {/* ROLE */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Rôle
          </span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
        </div>

        {/* CREATED */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Création
          </span>
          <span className="text-[11px] font-medium text-slate-600">
            {formatDate(user.creeA ?? user.createdAt)}
          </span>
        </div>

        {/* DECISION */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          {user.accountStatus === 'APPROVED' ? (
            <DecisionInfo
              label="Validé"
              date={user.approvedAt}
              status="approved"
            />
          ) : user.accountStatus === 'REJECTED' ? (
            <div>
              <DecisionInfo
                label="Refusé"
                date={user.rejectedAt}
                status="rejected"
              />
              {user.rejectionReason && (
                <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">
                  {user.rejectionReason}
                </p>
              )}
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
              <Clock3 className="h-3.5 w-3.5" />
              Décision requise
            </div>
          )}
        </div>
      </div>

      {/* ACTIONS */}
      <div className="flex gap-2 border-t border-slate-100 bg-slate-50/60 p-3">
        <UserActions
          user={user}
          isCurrentAction={isActionLoading}
          onApprove={onApprove}
          onReject={onReject}
          onSetPending={onSetPending}
          fullWidth
        />
      </div>
    </article>
  );
}

// =============================================================================
// TABLE HEADER
// =============================================================================

function TableHeader({
  children,
  align = 'left',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

// =============================================================================
// DECISION INFO
// =============================================================================

function DecisionInfo({
  label,
  date,
  status,
}: {
  label: string;
  date?: string | null;
  status: 'approved' | 'rejected';
}) {
  return (
    <div className="text-[11px]">
      <p
        className={
          status === 'approved'
            ? 'font-semibold text-emerald-700'
            : 'font-semibold text-rose-700'
        }
      >
        {label}
      </p>
      <p className="mt-0.5 text-[10px] text-slate-400">{formatDate(date)}</p>
    </div>
  );
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({
  label,
  value,
  description,
  icon,
  tone = 'default',
}: StatCardProps) {
  const toneMap = {
    default: {
      wrap: 'border-slate-200',
      icon: 'bg-slate-100 text-slate-600',
      value: 'text-slate-800',
    },
    warning: {
      wrap: 'border-amber-200',
      icon: 'bg-amber-50 text-amber-600',
      value: 'text-amber-700',
    },
    success: {
      wrap: 'border-emerald-200',
      icon: 'bg-emerald-50 text-emerald-600',
      value: 'text-emerald-700',
    },
    danger: {
      wrap: 'border-rose-200',
      icon: 'bg-rose-50 text-rose-600',
      value: 'text-rose-700',
    },
  } as const;

  const styles = toneMap[tone];

  return (
    <div
      className={`rounded-xl border bg-white p-3.5 shadow-sm sm:p-4 ${styles.wrap}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:text-[11px]">
            {label}
          </p>
          <p
            className={`mt-1 text-xl font-extrabold tabular-nums sm:text-2xl ${styles.value}`}
          >
            {value}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">{description}</p>
        </div>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export default UsersManagementPage;