// src/features/auth/UsersManagementPage.tsx

import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Inbox,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  approveUserAccount,
  deleteUserAccount,
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
const REASON_MAX_LENGTH = 500;

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

const STATUS_STYLES: Record<AccountStatus, { badge: string; dot: string }> = {
  APPROVED: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', dot: 'bg-emerald-500' },
  REJECTED: { badge: 'bg-rose-50 text-rose-700 ring-rose-600/15', dot: 'bg-rose-500' },
  PENDING: { badge: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
};

function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// =============================================================================
// PETITS COMPOSANTS
// =============================================================================

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20" />
      <path fill="currentColor" className="opacity-80" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function UserAvatar({ user, size = 'md' }: { user: PublicUser; size?: 'md' | 'lg' }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-600 ring-1 ring-slate-200 ${
        size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs'
      }`}
    >
      {getInitials(user.userName)}
    </div>
  );
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {ACCOUNT_STATUS_LABELS[status]}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function Banner({
  tone,
  children,
  onClose,
}: {
  tone: 'error' | 'success';
  children: ReactNode;
  onClose: () => void;
}) {
  const isError = tone === 'error';
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${
        isError ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isError ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1">{children}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer le message"
        className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition ${
          isError ? 'hover:bg-rose-100' : 'hover:bg-emerald-100'
        }`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
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
  const [deleteTarget, setDeleteTarget] = useState<PublicUser | null>(null);

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
      setError(getErrorMessage(apiError, 'Impossible de charger les utilisateurs.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Les messages de succès disparaissent seuls après quelques secondes
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(''), 4000);
    return () => window.clearTimeout(timer);
  }, [success]);

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
      if (activeTab === 'requests' && user.accountStatus !== 'PENDING') return false;
      if (statusFilter !== 'ALL' && user.accountStatus !== statusFilter) return false;
      if (!query) return true;
      return `${user.userName} ${user.email} ${user.role} ${ROLE_LABELS[user.role] ?? ''}`
        .toLowerCase()
        .includes(query);
    });
  }, [users, search, statusFilter, activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, activeTab, pageSize]);

  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'ALL';

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
  };

  const selectTab = (tab: TabView) => {
    setActiveTab(tab);
    if (tab === 'requests') setStatusFilter('ALL');
  };

  const selectKpi = (status: FilterStatus) => {
    setActiveTab('users');
    setStatusFilter((current) => (current === status ? 'ALL' : status));
  };

  // ===========================================================================
  // PAGINATION
  // ===========================================================================

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  const runAction = async (
    user: PublicUser,
    action: () => Promise<unknown>,
    successMessage: string,
    errorMessage: string,
  ): Promise<boolean> => {
    setActionLoadingId(user.refUser);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(successMessage);
      await loadUsers();
      return true;
    } catch (apiError: unknown) {
      setError(getErrorMessage(apiError, errorMessage));
      return false;
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApprove = (user: PublicUser) =>
    runAction(
      user,
      () => approveUserAccount(user.refUser),
      `Le compte de ${user.userName} a été validé.`,
      'Impossible de valider le compte.',
    );

  const handleSetPending = (user: PublicUser) =>
    runAction(
      user,
      () => setUserAccountPending(user.refUser),
      `Le compte de ${user.userName} a été remis en attente.`,
      'Impossible de remettre le compte en attente.',
    );

  // --- Refus -----------------------------------------------------------------

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
    const ok = await runAction(
      user,
      () => rejectUserAccount(user.refUser, rejectModal.reason.trim()),
      `Le compte de ${user.userName} a été refusé.`,
      'Impossible de refuser le compte.',
    );
    if (ok) setRejectModal({ open: false, user: null, reason: '' });
  };

  // --- Suppression -----------------------------------------------------------

  const closeDeleteModal = () => {
    if (actionLoadingId) return;
    setDeleteTarget(null);
  };

  const handleDelete = async () => {
    const user = deleteTarget;
    if (!user) return;
    const ok = await runAction(
      user,
      () => deleteUserAccount(user.refUser),
      `Le compte de ${user.userName} a été supprimé.`,
      'Impossible de supprimer le compte.',
    );
    if (ok) setDeleteTarget(null);
  };

  // Échap ferme les fenêtres
  useEffect(() => {
    if (!rejectModal.open && !deleteTarget) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || actionLoadingId) return;
      setRejectModal({ open: false, user: null, reason: '' });
      setDeleteTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rejectModal.open, deleteTarget, actionLoadingId]);

  // ===========================================================================
  // RENDER
  // ===========================================================================

  const rangeStart = filteredUsers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, filteredUsers.length);

  const actionProps = (user: PublicUser) => ({
    user,
    isCurrentAction: actionLoadingId === user.refUser,
    isBusy: actionLoadingId !== null,
    onApprove: () => void handleApprove(user),
    onReject: () => openRejectModal(user),
    onSetPending: () => void handleSetPending(user),
    onDelete: () => setDeleteTarget(user),
  });

  return (
    <div className="mx-auto max-w-350 space-y-5">
      {/* ═══════════════════════════════════════════════════════════════════
          KPI (cliquables : filtrent le tableau)
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <KpiCard
          label="Utilisateurs"
          value={stats.total}
          hint="Tous les comptes"
          icon={<Users className="h-[18px] w-[18px]" />}
          tone="slate"
          loading={loading}
          active={activeTab === 'users' && statusFilter === 'ALL'}
          onClick={() => selectKpi('ALL')}
        />
        <KpiCard
          label="En attente"
          value={stats.pending}
          hint="À examiner"
          icon={<Clock3 className="h-[18px] w-[18px]" />}
          tone="amber"
          highlight={stats.pending > 0}
          loading={loading}
          active={statusFilter === 'PENDING'}
          onClick={() => selectKpi('PENDING')}
        />
        <KpiCard
          label="Validés"
          value={stats.approved}
          hint="Accès autorisé"
          icon={<UserCheck className="h-[18px] w-[18px]" />}
          tone="emerald"
          loading={loading}
          active={statusFilter === 'APPROVED'}
          onClick={() => selectKpi('APPROVED')}
        />
        <KpiCard
          label="Refusés"
          value={stats.rejected}
          hint="Accès refusé"
          icon={<UserX className="h-[18px] w-[18px]" />}
          tone="rose"
          loading={loading}
          active={statusFilter === 'REJECTED'}
          onClick={() => selectKpi('REJECTED')}
        />
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          MESSAGES
      ═══════════════════════════════════════════════════════════════════ */}
      {error && (
        <Banner tone="error" onClose={() => setError('')}>
          {error}
        </Banner>
      )}
      {success && (
        <Banner tone="success" onClose={() => setSuccess('')}>
          {success}
        </Banner>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          CARTE PRINCIPALE
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
        {/* Onglets + actualiser */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 pt-4 sm:px-5">
          <div role="tablist" aria-label="Vue" className="flex gap-1">
            <TabButton active={activeTab === 'users'} onClick={() => selectTab('users')}>
              Tous les utilisateurs
              <CountPill active={activeTab === 'users'}>{stats.total}</CountPill>
            </TabButton>
            <TabButton active={activeTab === 'requests'} onClick={() => selectTab('requests')}>
              Demandes en attente
              {stats.pending > 0 && <CountPill tone="amber">{stats.pending}</CountPill>}
            </TabButton>
          </div>

          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loading}
            className="mb-3 inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>

        {/* Recherche + filtre */}
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un name, e-mail ou rôle…"
              aria-label="Rechercher un user"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            />
          </div>

          {activeTab === 'users' && (
            <div className="relative">
              <Filter className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
                aria-label="Filtrer par status"
                className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 sm:w-auto"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="PENDING">En attente</option>
                <option value="APPROVED">Validés</option>
                <option value="REJECTED">Refusés</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 self-start rounded-xl px-3 text-[13px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 sm:self-auto"
            >
              <X className="h-3.5 w-3.5" />
              Réinitialiser
            </button>
          )}

          {!loading && (
            <p className="text-xs font-medium text-slate-500 sm:ml-auto">
              {filteredUsers.length} résultat{filteredUsers.length > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Contenu */}
        {loading ? (
          <LoadingRows />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            isRequests={activeTab === 'requests'}
            hasFilters={hasActiveFilters}
            onReset={resetFilters}
          />
        ) : (
          <>
            {/* MOBILE : CARTES */}
            <div className="space-y-3 bg-slate-50/60 p-3 md:hidden">
              {paginatedUsers.map((user) => (
                <UserMobileCard key={user.refUser} {...actionProps(user)} />
              ))}
            </div>

            {/* DESKTOP : TABLEAU */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-250 border-collapse">
                <thead>
                  <tr className="bg-slate-50/70">
                    <TableHeader className="pl-5">Utilisateur</TableHeader>
                    <TableHeader>Rôle</TableHeader>
                    <TableHeader>Statut</TableHeader>
                    <TableHeader>Création</TableHeader>
                    <TableHeader>Décision</TableHeader>
                    <TableHeader align="right" className="pr-5">
                      Actions
                    </TableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedUsers.map((user) => (
                    <tr
                      key={user.refUser}
                      className={`group transition-colors hover:bg-slate-50/70 ${
                        actionLoadingId === user.refUser ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="py-3 pl-5 pr-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar user={user} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{user.userName}</p>
                            <p className="truncate text-xs text-slate-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={user.accountStatus} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-slate-600">
                        {formatDate(user.createdAt ?? user.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <DecisionCell user={user} />
                      </td>
                      <td className="py-3 pl-4 pr-5">
                        <div className="flex justify-end gap-1.5">
                          <UserActions {...actionProps(user)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:px-5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Lignes par page</span>
                <div className="relative">
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    aria-label="Nombre de lignes par page"
                    className="h-8 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-7 text-xs font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-emerald-500"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                </div>
                <span className="text-slate-400">·</span>
                <span className="tabular-nums">
                  {rangeStart}–{rangeEnd} sur {filteredUsers.length}
                </span>
              </div>

              {totalPages > 1 && (
                <nav className="flex items-center gap-1" aria-label="Pagination">
                  <PageButton
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    ariaLabel="Page précédente"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </PageButton>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((page) => {
                      if (totalPages <= 5) return true;
                      if (page === 1 || page === totalPages) return true;
                      return Math.abs(page - currentPage) <= 1;
                    })
                    .map((page, index, array) => {
                      const previousPage = array[index - 1];
                      const showEllipsis = previousPage != null && page - previousPage > 1;
                      return (
                        <span key={page} className="flex items-center gap-1">
                          {showEllipsis && <span className="px-1 text-xs text-slate-400">…</span>}
                          <PageButton
                            onClick={() => setCurrentPage(page)}
                            active={page === currentPage}
                            ariaLabel={`Page ${page}`}
                          >
                            {page}
                          </PageButton>
                        </span>
                      );
                    })}

                  <PageButton
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    ariaLabel="Page suivante"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </PageButton>
                </nav>
              )}
            </div>
          </>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL REFUS
      ═══════════════════════════════════════════════════════════════════ */}
      {rejectModal.open && rejectModal.user && (
        <ModalShell labelledBy="reject-user-title" onClose={closeRejectModal}>
          <div className="px-6 pb-5 pt-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
                <UserX className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="reject-user-title" className="text-base font-bold text-slate-900">
                  Refuser l'accès
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Le compte restera bloqué jusqu'à une nouvelle décision d'un administrateur.
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
              <UserAvatar user={rejectModal.user} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{rejectModal.user.userName}</p>
                <p className="truncate text-xs text-slate-500">{rejectModal.user.email}</p>
              </div>
              <RoleBadge role={rejectModal.user.role} />
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <label htmlFor="rejection-reason" className="text-[13px] font-semibold text-slate-700">
                  Motif du refus <span className="font-normal text-slate-400">(facultatif)</span>
                </label>
                <span className="text-[11px] tabular-nums text-slate-400">
                  {rejectModal.reason.length}/{REASON_MAX_LENGTH}
                </span>
              </div>
              <textarea
                id="rejection-reason"
                value={rejectModal.reason}
                onChange={(e) => setRejectModal((current) => ({ ...current, reason: e.target.value }))}
                placeholder="Ex. rôle non justifié, adresse e-mail externe…"
                rows={4}
                maxLength={REASON_MAX_LENGTH}
                autoFocus
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
            </div>
          </div>

          <ModalFooter>
            <button
              type="button"
              onClick={closeRejectModal}
              disabled={actionLoadingId !== null}
              className={SECONDARY_BUTTON}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void handleReject()}
              disabled={actionLoadingId !== null}
              className={DANGER_BUTTON}
            >
              {actionLoadingId ? <Spinner /> : <UserX className="h-4 w-4" />}
              Refuser le compte
            </button>
          </ModalFooter>
        </ModalShell>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL SUPPRESSION (remplace window.confirm)
      ═══════════════════════════════════════════════════════════════════ */}
      {deleteTarget && (
        <ModalShell labelledBy="delete-user-title" onClose={closeDeleteModal}>
          <div className="px-6 pb-5 pt-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2 id="delete-user-title" className="mt-4 text-base font-bold text-slate-900">
              Supprimer ce compte ?
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-500">
              Le compte de <span className="font-semibold text-slate-700">{deleteTarget.userName}</span> sera
              supprimé définitivement. Cette action est irréversible.
            </p>
          </div>

          <ModalFooter>
            <button
              type="button"
              onClick={closeDeleteModal}
              disabled={actionLoadingId !== null}
              className={SECONDARY_BUTTON}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={actionLoadingId !== null}
              className={DANGER_BUTTON}
            >
              {actionLoadingId ? <Spinner /> : <Trash2 className="h-4 w-4" />}
              Supprimer
            </button>
          </ModalFooter>
        </ModalShell>
      )}
    </div>
  );
}

// =============================================================================
// STYLES PARTAGÉS
// =============================================================================

const SECONDARY_BUTTON =
  'inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none';

const DANGER_BUTTON =
  'inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-linear-to-br from-rose-500 to-rose-600 px-4 text-sm font-semibold text-white shadow-md shadow-rose-600/25 transition hover:from-rose-600 hover:to-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none';

// =============================================================================
// MODAL
// =============================================================================

function ModalShell({
  labelledBy,
  onClose,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:justify-end">
      {children}
    </div>
  );
}

// =============================================================================
// DÉCISION
// =============================================================================

function DecisionCell({ user }: { user: PublicUser }) {
  if (user.accountStatus === 'APPROVED') {
    return (
      <div className="text-xs">
        <p className="font-semibold text-slate-700">Validé le</p>
        <p className="mt-0.5 whitespace-nowrap text-slate-500">{formatDateTime(user.approvedAt)}</p>
      </div>
    );
  }

  if (user.accountStatus === 'REJECTED') {
    return (
      <div className="max-w-52 text-xs">
        <p className="font-semibold text-slate-700">Refusé le</p>
        <p className="mt-0.5 whitespace-nowrap text-slate-500">{formatDateTime(user.rejectedAt)}</p>
        {user.rejectionReason && (
          <p
            className="mt-1 line-clamp-2 rounded-md bg-slate-50 px-2 py-1 text-[11px] italic text-slate-500"
            title={user.rejectionReason}
          >
            « {user.rejectionReason} »
          </p>
        )}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      Décision requise
    </span>
  );
}

// =============================================================================
// USER ACTIONS
// =============================================================================

interface UserActionsProps {
  user: PublicUser;
  isCurrentAction: boolean;
  isBusy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onSetPending: () => void;
  onDelete: () => void;
  fullWidth?: boolean;
}

function UserActions({
  user,
  isCurrentAction,
  isBusy,
  onApprove,
  onReject,
  onSetPending,
  onDelete,
  fullWidth = false,
}: UserActionsProps) {
  const base =
    'inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50';
  const grow = fullWidth ? 'flex-1' : '';

  const deleteButton = (
    <button
      type="button"
      disabled={isBusy}
      onClick={onDelete}
      aria-label={`Supprimer le compte de ${user.userName}`}
      title="Supprimer le compte"
      className={`${base} w-9 shrink-0 px-0 border border-rose-200 bg-white text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-rose-500/30`}
    >
      <Trash2 className="h-[18px] w-[18px]" />
    </button>
  );

  if (user.accountStatus === 'PENDING') {
    return (
      <>
        <button
          type="button"
          disabled={isBusy}
          onClick={onApprove}
          className={`${base} ${grow} bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 focus-visible:ring-emerald-500/40`}
        >
          {isCurrentAction ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          Valider
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onReject}
          className={`${base} ${grow} border border-slate-200 bg-white text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-rose-500/30`}
        >
          <UserX className="h-3.5 w-3.5" />
          Refuser
        </button>
        {deleteButton}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={isBusy}
        onClick={onSetPending}
        title="Remettre le compte en attente de décision"
        className={`${base} ${grow} border border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 focus-visible:ring-amber-500/30`}
      >
        {isCurrentAction ? <Spinner className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
        Remettre en attente
      </button>
      {deleteButton}
    </>
  );
}

// =============================================================================
// MOBILE CARD
// =============================================================================

function UserMobileCard(props: UserActionsProps) {
  const { user } = props;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar user={user} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{user.userName}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
        </div>
        <StatusBadge status={user.accountStatus} />
      </div>

      <dl className="grid grid-cols-2 gap-3 px-4 pb-4">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Rôle</dt>
          <dd className="mt-1">
            <RoleBadge role={user.role} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Création</dt>
          <dd className="mt-1.5 text-[13px] font-medium text-slate-700">
            {formatDate(user.createdAt ?? user.createdAt)}
          </dd>
        </div>
        {user.accountStatus !== 'PENDING' && (
          <div className="col-span-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Décision</dt>
            <dd className="mt-1">
              <DecisionCell user={user} />
            </dd>
          </div>
        )}
      </dl>

      <div className="flex gap-2 border-t border-slate-100 bg-slate-50/60 p-3">
        <UserActions {...props} fullWidth />
      </div>
    </article>
  );
}

// =============================================================================
// ONGLETS
// =============================================================================

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative inline-flex cursor-pointer items-center gap-2 px-3 pb-3 pt-1 text-[13px] font-semibold transition focus:outline-none focus-visible:text-emerald-700 ${
        active ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
      <span
        className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition ${
          active ? 'bg-emerald-600' : 'bg-transparent'
        }`}
        aria-hidden="true"
      />
    </button>
  );
}

function CountPill({
  children,
  active = false,
  tone = 'slate',
}: {
  children: ReactNode;
  active?: boolean;
  tone?: 'slate' | 'amber';
}) {
  const classes =
    tone === 'amber'
      ? 'bg-amber-100 text-amber-700'
      : active
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-slate-100 text-slate-500';
  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${classes}`}
    >
      {children}
    </span>
  );
}

// =============================================================================
// PAGINATION
// =============================================================================

function PageButton({
  children,
  onClick,
  disabled = false,
  active = false,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      className={`flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-lg px-2 text-xs font-semibold tabular-nums transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25'
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

// =============================================================================
// ÉTATS : CHARGEMENT / VIDE
// =============================================================================

function LoadingRows() {
  return (
    <div className="divide-y divide-slate-100" aria-busy="true" aria-label="Chargement des utilisateurs">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-4 px-5 py-4">
          <div className="h-9 w-9 shrink-0 rounded-full bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-40 rounded-full bg-slate-100" />
            <div className="h-2.5 w-56 max-w-full rounded-full bg-slate-100" />
          </div>
          <div className="hidden h-6 w-24 rounded-lg bg-slate-100 md:block" />
          <div className="hidden h-6 w-20 rounded-full bg-slate-100 md:block" />
          <div className="hidden h-8 w-28 rounded-lg bg-slate-100 lg:block" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  isRequests,
  hasFilters,
  onReset,
}: {
  isRequests: boolean;
  hasFilters: boolean;
  onReset: () => void;
}) {
  const title = hasFilters
    ? 'Aucun résultat'
    : isRequests
      ? 'Aucune demande en attente'
      : 'Aucun user';
  const text = hasFilters
    ? 'Aucun compte ne correspond à votre recherche ou au filtre choisi.'
    : isRequests
      ? 'Toutes les demandes ont été traitées.'
      : "Aucun compte n'a encore été créé.";

  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-4 py-10 text-center">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
          isRequests && !hasFilters ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
        }`}
      >
        {isRequests && !hasFilters ? <CheckCircle2 className="h-6 w-6" /> : <Inbox className="h-6 w-6" />}
      </div>
      <p className="mt-4 text-sm font-bold text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="mt-4 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <X className="h-3.5 w-3.5" />
          Réinitialiser les filtres
        </button>
      )}
    </div>
  );
}

// =============================================================================
// TABLE HEADER
// =============================================================================

function TableHeader({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`border-b border-slate-100 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  );
}

// =============================================================================
// KPI CARD
// =============================================================================

const KPI_TONES = {
  slate: { icon: 'bg-slate-100 text-slate-600', ring: 'ring-slate-400/30', value: 'text-slate-900' },
  amber: { icon: 'bg-amber-50 text-amber-600', ring: 'ring-amber-400/40', value: 'text-amber-600' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-500/40', value: 'text-slate-900' },
  rose: { icon: 'bg-rose-50 text-rose-600', ring: 'ring-rose-400/40', value: 'text-slate-900' },
} as const;

interface KpiCardProps {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  tone: keyof typeof KPI_TONES;
  highlight?: boolean;
  loading?: boolean;
  active?: boolean;
  onClick: () => void;
}

function KpiCard({ label, value, hint, icon, tone, highlight = false, loading = false, active = false, onClick }: KpiCardProps) {
  const style = KPI_TONES[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-sm shadow-slate-900/[0.03] transition-all hover:-translate-y-px hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 sm:p-5 ${
        active ? `border-transparent ring-2 ${style.ring}` : 'border-slate-200/80 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-slate-600">{label}</span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.icon}`}>{icon}</span>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="h-8 w-12 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <span
            className={`text-[28px] font-bold leading-none tabular-nums tracking-tight ${
              highlight ? style.value : 'text-slate-900'
            }`}
          >
            {value}
          </span>
        )}
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      </div>
    </button>
  );
}

export default UsersManagementPage;