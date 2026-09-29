import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe2,
  LoaderCircle,
  MapPin,
  Pencil,
  Plane,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { ApiError, authFetch } from '../Api/apiService';

interface Airport {
  iata: string;
  name: string;
  timezone: string;
  city: string | null;
  country: string | null;
  active: boolean;
}

interface AirportForm {
  iata: string;
  name: string;
  timezone: string;
  city: string;
  country: string;
}

type Notice = { kind: 'success' | 'error'; message: string } | null;

interface ConfirmDialogState {
  isOpen: boolean;
  airport: Airport | null;
  isLoading: boolean;
  acknowledged: boolean;
}

const EMPTY_FORM: AirportForm = {
  iata: '',
  name: '',
  timezone: '',
  city: '',
  country: '',
};

const EMPTY_CONFIRM: ConfirmDialogState = {
  isOpen: false,
  airport: null,
  isLoading: false,
  acknowledged: false,
};

const PAGE_SIZE = 10;

const inputClass =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10';

async function requestAirport<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await authFetch(path, options);
  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    let message = 'La requête sur les aéroports a échoué.';
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const backendMessage = payload.message;
      if (Array.isArray(backendMessage)) message = backendMessage.join(', ');
      else if (typeof backendMessage === 'string') message = backendMessage;
    }
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Une erreur est survenue.';
}

export function AirportManagement() {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionIata, setActionIata] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAirport, setEditingAirport] = useState<Airport | null>(null);
  const [form, setForm] = useState<AirportForm>(EMPTY_FORM);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(EMPTY_CONFIRM);

  const loadAirports = useCallback(async () => {
    setLoading(true);
    try {
      setAirports(await requestAirport<Airport[]>('/airports'));
    } catch (error: unknown) {
      setNotice({ kind: 'error', message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAirports();
  }, [loadAirports]);

  const visibleAirports = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    return airports.filter((airport) => {
      const matchesSearch =
        !query ||
        [airport.iata, airport.name, airport.city, airport.country, airport.timezone]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase('fr').includes(query));

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && airport.active) ||
        (statusFilter === 'inactive' && !airport.active);

      return matchesSearch && matchesStatus;
    });
  }, [airports, search, statusFilter]);

  /* ═══════════════ PAGINATION ═══════════════ */

  const totalPages = Math.max(1, Math.ceil(visibleAirports.length / PAGE_SIZE));

  const paginatedAirports = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleAirports.slice(start, start + PAGE_SIZE);
  }, [visibleAirports, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const goToPreviousPage = () => {
    setCurrentPage((page) => Math.max(1, page - 1));
  };

  const goToNextPage = () => {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(totalPages, page)));
  };

  const firstIndex = visibleAirports.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastIndex = Math.min(currentPage * PAGE_SIZE, visibleAirports.length);

  /* ═══════════════ STATISTIQUES ═══════════════ */

  const activeCount = airports.filter((airport) => airport.active).length;
  const inactiveCount = airports.length - activeCount;
  const countryCount = useMemo(
    () => new Set(airports.map((a) => a.country).filter(Boolean)).size,
    [airports],
  );

  /* ═══════════════ ACTIONS ═══════════════ */

  const openCreateForm = () => {
    setEditingAirport(null);
    setForm(EMPTY_FORM);
    setNotice(null);
    setIsFormOpen(true);
  };

  const openEditForm = (airport: Airport) => {
    setEditingAirport(airport);
    setForm({
      iata: airport.iata,
      name: airport.name,
      timezone: airport.timezone,
      city: airport.city ?? '',
      country: airport.country ?? '',
    });
    setNotice(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    const payload = {
      name: form.name.trim(),
      timezone: form.timezone.trim(),
      city: form.city.trim() || null,
      country: form.country.trim() || null,
    };

    try {
      if (editingAirport) {
        await requestAirport<Airport>(`/airports/${editingAirport.iata}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await requestAirport<Airport>('/airports', {
          method: 'POST',
          body: JSON.stringify({ iata: form.iata.trim().toUpperCase(), ...payload }),
        });
      }

      setIsFormOpen(false);
      setNotice({
        kind: 'success',
        message: editingAirport ? 'Aéroport mis à jour.' : 'Aéroport créé.',
      });
      await loadAirports();
    } catch (error: unknown) {
      setNotice({ kind: 'error', message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const reactivateAirport = async (airport: Airport) => {
    setActionIata(airport.iata);
    setNotice(null);
    try {
      await requestAirport<Airport>(`/airports/${airport.iata}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: true }),
      });
      setNotice({ kind: 'success', message: 'Aéroport réactivé.' });
      await loadAirports();
    } catch (error: unknown) {
      setNotice({ kind: 'error', message: errorMessage(error) });
    } finally {
      setActionIata(null);
    }
  };

  const askDeleteAirport = (airport: Airport) => {
    setConfirmDialog({
      isOpen: true,
      airport,
      isLoading: false,
      acknowledged: false,
    });
  };

  const closeConfirmDialog = () => {
    if (confirmDialog.isLoading) return;
    setConfirmDialog(EMPTY_CONFIRM);
  };

  const confirmDelete = async () => {
    if (!confirmDialog.airport || !confirmDialog.acknowledged) return;

    setConfirmDialog((prev) => ({ ...prev, isLoading: true }));
    setActionIata(confirmDialog.airport.iata);
    setNotice(null);

    try {
      await requestAirport<Airport>(`/airports/${confirmDialog.airport.iata}`, {
        method: 'DELETE',
      });
      setNotice({ kind: 'success', message: 'Aéroport désactivé.' });
      setConfirmDialog(EMPTY_CONFIRM);
      await loadAirports();
    } catch (error: unknown) {
      setNotice({ kind: 'error', message: errorMessage(error) });
      setConfirmDialog((prev) => ({ ...prev, isLoading: false }));
    } finally {
      setActionIata(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-350">
        {/* ═══════════════ ACTIONS EN HAUT ═══════════════ */}
        <div className="mb-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void loadAirports()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>

          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-linear-to-br from-emerald-500 to-emerald-700 px-4 text-sm font-bold text-white shadow-md shadow-emerald-600/25 transition hover:from-emerald-600 hover:to-emerald-800 hover:shadow-lg"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Ajouter un aéroport</span>
            <span className="sm:hidden">Ajouter</span>
          </button>
        </div>

        {/* ═══════════════ CARTES MÉTRIQUES ═══════════════ */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <article className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] sm:px-5 sm:py-5">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:text-[11px]">
                Total
              </p>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 sm:h-9 sm:w-9">
                <Plane className="h-3.5 w-3.5 rotate-45 sm:h-4 sm:w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 sm:mt-3 sm:gap-2">
              <span className="text-2xl font-bold leading-none tabular-nums text-slate-900 sm:text-3xl">
                {airports.length}
              </span>
              <span className="text-[10px] font-medium text-slate-500 sm:text-xs">
                Aéroports
              </span>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] sm:px-5 sm:py-5">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:text-[11px]">
                Actifs
              </p>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 sm:h-9 sm:w-9">
                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 sm:mt-3 sm:gap-2">
              <span className="text-2xl font-bold leading-none tabular-nums text-emerald-700 sm:text-3xl">
                {activeCount}
              </span>
              <span className="text-[10px] font-medium text-slate-500 sm:text-xs">
                Actifs
              </span>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] sm:px-5 sm:py-5">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:text-[11px]">
                Inactifs
              </p>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500 sm:h-9 sm:w-9">
                <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 sm:mt-3 sm:gap-2">
              <span className="text-2xl font-bold leading-none tabular-nums text-slate-900 sm:text-3xl">
                {inactiveCount}
              </span>
              <span className="text-[10px] font-medium text-slate-500 sm:text-xs">
                Inactifs
              </span>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] sm:px-5 sm:py-5">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:text-[11px]">
                Pays
              </p>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 sm:h-9 sm:w-9">
                <Globe2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 sm:mt-3 sm:gap-2">
              <span className="text-2xl font-bold leading-none tabular-nums text-sky-700 sm:text-3xl">
                {countryCount}
              </span>
              <span className="text-[10px] font-medium text-slate-500 sm:text-xs">
                Pays
              </span>
            </div>
          </article>
        </section>

        {/* ═══════════════ CONTENEUR PRINCIPAL ═══════════════ */}
        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] sm:mt-6">
          {/* Barre de recherche + filtres */}
          <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un aéroport…"
                aria-label="Rechercher un aéroport"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:flex-initial">
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as 'all' | 'active' | 'inactive',
                    )
                  }
                  aria-label="Filtrer par statut"
                  className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-10 text-sm font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 sm:w-auto"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="active">Actifs</option>
                  <option value="inactive">Inactifs</option>
                </select>
                <ArrowUpDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>

              <span className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 text-sm font-bold text-slate-700">
                {visibleAirports.length}
                <span className="hidden font-medium text-slate-500 sm:inline">
                  {visibleAirports.length > 1 ? 'aéroports' : 'aéroport'}
                </span>
              </span>
            </div>
          </div>

          {notice && (
            <div
              role="status"
              className={`flex items-start gap-3 border-b px-4 py-3 text-sm ${
                notice.kind === 'error'
                  ? 'border-rose-100 bg-rose-50 text-rose-800'
                  : 'border-emerald-100 bg-emerald-50 text-emerald-800'
              }`}
            >
              {notice.kind === 'error' ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span className="font-medium">{notice.message}</span>
            </div>
          )}

          {/* ═══════════════ MOBILE : CARDS ═══════════════ */}
          <div className="space-y-2 bg-slate-50/40 p-3 md:hidden">
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
                <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
                <span className="mt-3 block text-sm font-medium text-slate-500">
                  Chargement des aéroports…
                </span>
              </div>
            ) : paginatedAirports.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <MapPin className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  {search || statusFilter !== 'all'
                    ? 'Aucun résultat pour ces filtres.'
                    : 'Aucun aéroport référencé.'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {search || statusFilter !== 'all'
                    ? 'Modifiez la recherche ou le filtre.'
                    : 'Ajoutez votre premier aéroport.'}
                </p>
              </div>
            ) : (
              paginatedAirports.map((airport) => (
                <article
                  key={airport.iata}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                >
                  {/* Bande de couleur statut */}
                  <span
                    className={`block h-1 ${
                      airport.active
                        ? 'bg-linear-to-r from-emerald-500 to-emerald-600'
                        : 'bg-linear-to-r from-slate-300 to-slate-400'
                    }`}
                  />

                  <div className="p-3">
                    {/* En-tête : code + statut */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                          <Plane className="h-3.5 w-3.5 rotate-45" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-base font-bold leading-none text-slate-900">
                            {airport.iata}
                          </p>
                          <p className="mt-1 truncate text-xs font-medium text-slate-500">
                            {airport.city && airport.country
                              ? `${airport.city}, ${airport.country}`
                              : airport.city ||
                                airport.country ||
                                '—'}
                          </p>
                        </div>
                      </div>

                      {airport.active ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Actif
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          Inactif
                        </span>
                      )}
                    </div>

                    {/* Nom de l'aéroport */}
                    <p className="mt-2.5 text-sm font-semibold leading-5 text-slate-800">
                      {airport.name}
                    </p>

                    {/* Fuseau horaire */}
                    <div className="mt-2 flex items-center gap-1.5">
                      <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                      <span className="font-mono text-[11px] font-semibold text-slate-600">
                        {airport.timezone}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => void reactivateAirport(airport)}
                        disabled={actionIata === airport.iata || airport.active}
                        title={`Réactiver ${airport.iata}`}
                        aria-label={`Réactiver ${airport.iata}`}
                        className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {actionIata === airport.iata && !airport.active ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        <span>Réactiver</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => askDeleteAirport(airport)}
                        disabled={actionIata === airport.iata || !airport.active}
                        title={`Désactiver ${airport.iata}`}
                        aria-label={`Désactiver ${airport.iata}`}
                        className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {actionIata === airport.iata && airport.active ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        <span>Désactiver</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditForm(airport)}
                        title={`Modifier ${airport.iata}`}
                        aria-label={`Modifier ${airport.iata}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          {/* ═══════════════ DESKTOP : TABLEAU ═══════════════ */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-225 border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3.5">Code IATA</th>
                  <th className="px-4 py-3.5">Nom de l'aéroport</th>
                  <th className="px-4 py-3.5">Ville / pays</th>
                  <th className="px-4 py-3.5">Fuseau horaire</th>
                  <th className="px-4 py-3.5">Statut</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-slate-500">
                      <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
                      <span className="mt-3 block text-sm font-medium">
                        Chargement des aéroports…
                      </span>
                    </td>
                  </tr>
                ) : paginatedAirports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                        <MapPin className="h-5 w-5" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-700">
                        {search || statusFilter !== 'all'
                          ? 'Aucun résultat pour ces filtres.'
                          : 'Aucun aéroport référencé.'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {search || statusFilter !== 'all'
                          ? 'Essayez de modifier la recherche ou le filtre.'
                          : 'Cliquez sur "Ajouter un aéroport" pour en ajouter un.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedAirports.map((airport) => (
                    <tr
                      key={airport.iata}
                      className="group transition hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                            <Plane className="h-4 w-4 rotate-45" />
                          </div>
                          <span className="font-mono text-sm font-bold text-slate-900">
                            {airport.iata}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <span className="block text-sm font-semibold text-slate-800">
                          {airport.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-medium text-slate-400">
                          {airport.country || '—'}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span className="block text-sm text-slate-700">
                          {airport.city || '—'}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-medium text-slate-400">
                          {airport.country || '—'}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-700">
                          <Clock className="h-3 w-3" />
                          {airport.timezone}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        {airport.active ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">
                            <XCircle className="h-3.5 w-3.5" />
                            Inactif
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void reactivateAirport(airport)}
                            disabled={actionIata === airport.iata || airport.active}
                            title={`Réactiver ${airport.iata}`}
                            aria-label={`Réactiver ${airport.iata}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {actionIata === airport.iata && !airport.active ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => askDeleteAirport(airport)}
                            disabled={actionIata === airport.iata || !airport.active}
                            title={`Désactiver ${airport.iata}`}
                            aria-label={`Désactiver ${airport.iata}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {actionIata === airport.iata && airport.active ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditForm(airport)}
                            title={`Modifier ${airport.iata}`}
                            aria-label={`Modifier ${airport.iata}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ═══════════════ PAGINATION ═══════════════ */}
          {!loading && visibleAirports.length > 0 && (
            <div className="flex flex-col items-center gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-between sm:px-5">
              <p className="text-center text-xs font-medium text-slate-500 sm:text-left">
                <span className="sm:hidden">
                  Page{' '}
                  <strong className="font-bold text-slate-700">{currentPage}</strong>{' '}
                  sur{' '}
                  <strong className="font-bold text-slate-700">{totalPages}</strong>{' '}
                  · {visibleAirports.length} aéroports
                </span>
                <span className="hidden sm:inline">
                  Affichage de{' '}
                  <strong className="font-bold text-slate-700">{firstIndex}</strong>{' '}
                  à{' '}
                  <strong className="font-bold text-slate-700">{lastIndex}</strong>{' '}
                  sur{' '}
                  <strong className="font-bold text-slate-700">
                    {visibleAirports.length}
                  </strong>{' '}
                  {visibleAirports.length > 1 ? 'aéroports' : 'aéroport'}
                </span>
              </p>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  title="Page précédente"
                  aria-label="Page précédente"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Précédent</span>
                </button>

                {totalPages > 1 && (
                  <div className="hidden items-center gap-1 sm:flex">
                    {(() => {
                      const pages: (number | '...')[] = [];
                      const maxVisible = 5;
                      let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                      let end = Math.min(totalPages, start + maxVisible - 1);
                      if (end - start + 1 < maxVisible) {
                        start = Math.max(1, end - maxVisible + 1);
                      }

                      if (start > 1) {
                        pages.push(1);
                        if (start > 2) pages.push('...');
                      }

                      for (let i = start; i <= end; i += 1) {
                        pages.push(i);
                      }

                      if (end < totalPages) {
                        if (end < totalPages - 1) pages.push('...');
                        pages.push(totalPages);
                      }

                      return pages.map((page, idx) =>
                        page === '...' ? (
                          <span
                            key={`ellipsis-${idx}`}
                            className="px-2 text-xs font-bold text-slate-400"
                          >
                            …
                          </span>
                        ) : (
                          <button
                            key={page}
                            type="button"
                            onClick={() => goToPage(page)}
                            aria-current={currentPage === page ? 'page' : undefined}
                            className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border text-xs font-bold transition ${
                              currentPage === page
                                ? 'border-emerald-700 bg-linear-to-br from-emerald-500 to-emerald-700 text-white shadow-sm shadow-emerald-600/25'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {page}
                          </button>
                        ),
                      );
                    })()}
                  </div>
                )}

                {totalPages > 1 && (
                  <span className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 sm:hidden">
                    {currentPage} / {totalPages}
                  </span>
                )}

                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  title="Page suivante"
                  aria-label="Page suivante"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="hidden sm:inline">Suivant</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ═══════════════ MODAL FORMULAIRE ═══════════════ */}
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="airport-form-title"
              className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-emerald-700 text-white shadow-sm shadow-emerald-600/25">
                    <Plane className="h-4 w-4 rotate-45" />
                  </div>
                  <div>
                    <h2
                      id="airport-form-title"
                      className="text-base font-bold text-slate-900"
                    >
                      {editingAirport
                        ? `Modifier ${editingAirport.iata}`
                        : 'Nouvel aéroport'}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Le code IATA ne peut pas être modifié après création.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  aria-label="Fermer"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
                {!editingAirport && (
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Code IATA
                    <input
                      required
                      minLength={3}
                      maxLength={3}
                      pattern="[A-Za-z]{3}"
                      value={form.iata}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          iata: event.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="CDG"
                      className={`${inputClass} mt-1.5 font-mono uppercase`}
                    />
                  </label>
                )}

                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Nom de l'aéroport
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Paris Charles de Gaulle"
                    className={`${inputClass} mt-1.5`}
                  />
                </label>

                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Fuseau horaire IANA
                  <input
                    required
                    minLength={3}
                    maxLength={80}
                    value={form.timezone}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, timezone: event.target.value }))
                    }
                    placeholder="Europe/Paris"
                    className={`${inputClass} mt-1.5 font-mono`}
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Ville{' '}
                    <span className="font-medium normal-case text-slate-400">
                      (facultatif)
                    </span>
                    <input
                      maxLength={80}
                      value={form.city}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, city: event.target.value }))
                      }
                      placeholder="Paris"
                      className={`${inputClass} mt-1.5`}
                    />
                  </label>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Pays{' '}
                    <span className="font-medium normal-case text-slate-400">
                      (facultatif)
                    </span>
                    <input
                      maxLength={80}
                      value={form.country}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, country: event.target.value }))
                      }
                      placeholder="France"
                      className={`${inputClass} mt-1.5`}
                    />
                  </label>
                </div>

                {notice?.kind === 'error' && (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-800"
                  >
                    {notice.message}
                  </p>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    disabled={saving}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-linear-to-br from-emerald-500 to-emerald-700 px-4 text-sm font-bold text-white shadow-md shadow-emerald-600/25 transition hover:from-emerald-600 hover:to-emerald-800 hover:shadow-lg disabled:opacity-50"
                  >
                    {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    {editingAirport ? 'Enregistrer' : "Créer l'aéroport"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {/* ═══════════════ MODAL CONFIRMATION ═══════════════ */}
        {confirmDialog.isOpen && confirmDialog.airport && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            onClick={closeConfirmDialog}
          >
            <section
              className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-6 pb-5 pt-6">
                <h2
                  id="confirm-dialog-title"
                  className="text-lg font-bold text-slate-900"
                >
                  Supprimer l'aéroport {confirmDialog.airport.iata}
                </h2>

                <p className="mt-1.5 text-sm leading-6 text-slate-500">
                  Cette action est définitive et retirera l'aéroport du référentiel.
                </p>

                <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                    <Plane className="h-4 w-4 rotate-45" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-bold text-slate-900">
                      {confirmDialog.airport.iata}
                    </div>
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-600">
                      {confirmDialog.airport.name}
                    </p>
                  </div>
                  <div className="text-right text-[11px] font-medium text-slate-400">
                    {confirmDialog.airport.timezone}
                  </div>
                </div>

                <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={confirmDialog.acknowledged}
                    onChange={(event) =>
                      setConfirmDialog((prev) => ({
                        ...prev,
                        acknowledged: event.target.checked,
                      }))
                    }
                    disabled={confirmDialog.isLoading}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-rose-600 focus:ring-2 focus:ring-rose-500/20 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs font-medium leading-5 text-slate-700">
                    Je confirme la suppression définitive de cet aéroport.
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
                <button
                  type="button"
                  onClick={closeConfirmDialog}
                  disabled={confirmDialog.isLoading}
                  className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={!confirmDialog.acknowledged || confirmDialog.isLoading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-linear-to-br from-rose-500 to-rose-700 px-4 text-sm font-bold text-white shadow-md shadow-rose-600/25 transition hover:from-rose-600 hover:to-rose-800 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {confirmDialog.isLoading ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Suppression…
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Supprimer
                    </>
                  )}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}