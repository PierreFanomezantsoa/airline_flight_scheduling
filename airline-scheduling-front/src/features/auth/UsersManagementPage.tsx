// src/features/auth/UsersManagementPage.tsx

import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  RefreshCw,
  Search,
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
type TabView = 'users' | 'requests';

interface RejectModalState {
  open: boolean;
  user: PublicUser | null;
  reason: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

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
      return 'bg-emerald-100 text-emerald-700';
    case 'REJECTED':
      return 'bg-rose-100 text-rose-700';
    case 'PENDING':
    default:
      return 'bg-amber-100 text-amber-700';
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
  }).format(date);
}

function formatDateTime(value?: string | Date | null): string {
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
  const [activeTab, setActiveTab] = useState<TabView>('users');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
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
      if (activeTab === 'requests' && user.accountStatus !== 'PENDING') {
        return false;
      }

      if (statusFilter !== 'ALL' && user.accountStatus !== statusFilter) {
        return false;
      }
      if (!query) return true;
      return `${user.nom} ${user.email} ${user.role}`
        .toLowerCase()
        .includes(query);
    });
  }, [users, search, statusFilter, activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, activeTab, pageSize]);

  // ===========================================================================
  // PAGINATION
  // ===========================================================================

  const totalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / pageSize),
  );

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

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

  const rangeStart =
    filteredUsers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, filteredUsers.length);

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-350 space-y-6">

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* HEADER — uniquement le bouton Actualiser (titre retiré)         */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <header className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loading}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </header>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* KPI CARDS                                                      */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Utilisateurs"
            value={stats.total}
            hint="Tous les comptes"
            icon={<Users className="h-4 w-4" />}
          />
          <KpiCard
            label="En attente"
            value={stats.pending}
            hint="À examiner"
            icon={<Clock3 className="h-4 w-4" />}
            variant={stats.pending > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Validés"
            value={stats.approved}
            hint="Accès autorisé"
            icon={<UserCheck className="h-4 w-4" />}
          />
          <KpiCard
            label="Refusés"
            value={stats.rejected}
            hint="Accès refusé"
            icon={<UserX className="h-4 w-4" />}
          />
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TABS                                                           */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="flex items-center gap-6 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`relative pb-3 text-sm font-medium transition ${
              activeTab === 'users'
                ? 'text-emerald-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Tous les utilisateurs
            {activeTab === 'users' && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-600" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`relative pb-3 text-sm font-medium transition ${
              activeTab === 'requests'
                ? 'text-emerald-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Demandes en attente
            {activeTab === 'requests' && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-600" />
            )}
            {stats.pending > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
                {stats.pending}
              </span>
            )}
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* MESSAGES                                                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="rounded p-0.5"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{success}</span>
            <button
              type="button"
              onClick={() => setSuccess('')}
              className="rounded p-0.5"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SEARCH + FILTRE (Export CSV retiré)                            */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-[320px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nom, e-mail ou rôle..."
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as FilterStatus)
                    }
                    className="h-10 rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  >
                    <option value="ALL">Tous les statuts</option>
                    <option value="PENDING">En attente</option>
                    <option value="APPROVED">Validés</option>
                    <option value="REJECTED">Refusés</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* TABLEAU */}
          {loading ? (
            <div className="flex min-h-65 flex-col items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Spinner />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-600">
                Chargement des utilisateurs...
              </p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex min-h-65 flex-col items-center justify-center px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                <UserRound className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-900">
                Aucun utilisateur trouvé
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Aucun compte ne correspond aux critères sélectionnés.
              </p>
            </div>
          ) : (
            <>
              {/* MOBILE : CARDS */}
              <div className="space-y-3 bg-slate-50/60 p-4 md:hidden">
                {paginatedUsers.map((user) => (
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

              {/* DESKTOP : TABLE */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-275 border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <TableHeader>Utilisateur</TableHeader>
                      <TableHeader>Rôle</TableHeader>
                      <TableHeader>Statut</TableHeader>
                      <TableHeader>Création</TableHeader>
                      <TableHeader>Décision</TableHeader>
                      <TableHeader align="right">Actions</TableHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.map((user) => {
                      const isCurrentAction = actionLoadingId === user.id;
                      return (
                        <tr
                          key={user.id}
                          className="border-b border-slate-100 transition hover:bg-slate-50/60 last:border-0"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                                {getInitials(user.nom)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {user.nom}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-slate-500">
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                              {ROLE_LABELS[user.role] ?? user.role}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClasses(
                                user.accountStatus,
                              )}`}
                            >
                              {getStatusIcon(user.accountStatus)}
                              {ACCOUNT_STATUS_LABELS[user.accountStatus]}
                            </span>
                          </td>

                          <td className="px-4 py-4 text-xs text-slate-600">
                            {formatDate(user.creeA ?? user.createdAt)}
                          </td>

                          <td className="px-4 py-4">
                            {user.accountStatus === 'APPROVED' ? (
                              <div className="text-xs">
                                <p className="font-medium text-emerald-700">
                                  Validé
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                  {formatDateTime(user.approvedAt)}
                                </p>
                              </div>
                            ) : user.accountStatus === 'REJECTED' ? (
                              <div className="max-w-48 text-xs">
                                <p className="font-medium text-rose-700">
                                  Refusé
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                  {formatDateTime(user.rejectedAt)}
                                </p>
                                {user.rejectionReason && (
                                  <p
                                    className="mt-1 line-clamp-2 text-[10px] text-slate-400"
                                    title={user.rejectionReason}
                                  >
                                    {user.rejectionReason}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                                <Clock3 className="h-3.5 w-3.5" />
                                Décision requise
                              </div>
                            )}
                          </td>

                          <td className="px-5 py-4">
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

              {/* PAGINATION — traduction française */}
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Afficher</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                  <span>
                    sur {filteredUsers.length} résultat
                    {filteredUsers.length > 1 ? 's' : ''} · {rangeStart}–
                    {rangeEnd}
                  </span>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPage((p) => Math.max(1, p - 1))
                      }
                      disabled={currentPage === 1}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
                      aria-label="Précédent"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        if (totalPages <= 5) return true;
                        if (page === 1 || page === totalPages) return true;
                        return Math.abs(page - currentPage) <= 1;
                      })
                      .map((page, index, array) => {
                        const previousPage = array[index - 1];
                        const showEllipsis =
                          previousPage != null && page - previousPage > 1;
                        return (
                          <span key={page} className="flex items-center">
                            {showEllipsis && (
                              <span className="px-1 text-xs text-slate-400">
                                …
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setCurrentPage(page)}
                              className={`h-8 min-w-8 rounded-md px-2 text-xs font-medium transition ${
                                page === currentPage
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {page}
                            </button>
                          </span>
                        );
                      })}

                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
                      aria-label="Suivant"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
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
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <UserX className="h-5 w-5" />
                </div>
                <div>
                  <h2
                    id="reject-user-title"
                    className="text-base font-semibold text-slate-900"
                  >
                    Refuser le compte
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
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

            <div className="p-5">
              <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <p className="text-xs leading-5 text-slate-600">
                  Le compte restera bloqué jusqu'à une nouvelle décision de
                  l'administrateur.
                </p>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="rejection-reason"
                    className="text-xs font-medium text-slate-600"
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
                  className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeRejectModal}
                  disabled={actionLoadingId !== null}
                  className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleReject()}
                  disabled={actionLoadingId !== null}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {actionLoadingId ? (
                    <Spinner />
                  ) : (
                    <UserX className="h-4 w-4" />
                  )}
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
// USER ACTIONS
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
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50';
  const widthClass = fullWidth ? 'flex-1' : '';

  if (user.accountStatus === 'PENDING') {
    return (
      <>
        <button
          type="button"
          disabled={isCurrentAction}
          onClick={onApprove}
          className={`${baseButton} ${widthClass} bg-emerald-600 text-white hover:bg-emerald-700`}
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
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">
            {getInitials(user.nom)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {user.nom}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {user.email}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(
            user.accountStatus,
          )}`}
        >
          {getStatusIcon(user.accountStatus)}
          {ACCOUNT_STATUS_LABELS[user.accountStatus]}
        </span>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Rôle</span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Création</span>
          <span className="text-xs font-medium text-slate-700">
            {formatDate(user.creeA ?? user.createdAt)}
          </span>
        </div>

        {user.accountStatus === 'PENDING' && (
          <div className="flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            <Clock3 className="h-3.5 w-3.5" />
            Décision requise
          </div>
        )}
      </div>

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
      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

// =============================================================================
// KPI CARD
// =============================================================================

interface KpiCardProps {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  variant?: 'default' | 'warning';
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  variant = 'default',
}: KpiCardProps) {
  const isWarning = variant === 'warning';

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            isWarning
              ? 'bg-amber-50 text-amber-600'
              : 'bg-slate-50 text-slate-500'
          }`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span
          className={`text-3xl font-bold tabular-nums tracking-tight ${
            isWarning ? 'text-amber-600' : 'text-slate-900'
          }`}
        >
          {value}
        </span>
        <span className="text-xs font-medium text-slate-400">{hint}</span>
      </div>
    </article>
  );
}

export default UsersManagementPage;