import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Users,
  UserPlus,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  Save,
  AlertTriangle,
  CheckCircle2,
  Plane,
  Clock3,
  ShieldCheck,
} from 'lucide-react';

/* ============================================================================
 * CONFIG
 * ========================================================================== */

const API_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_API_BASE_URL) ||
  'http://localhost:3001';

const CREW_ENDPOINT = '/crew-assignments';

/* ============================================================================
 * TYPES
 * ========================================================================== */

type CrewRole =
  | 'Captain'
  | 'FirstOfficer'
  | 'Purser'
  | 'CabinCrew'
  | 'Dispatcher'
  | 'Other'
  | string;

interface Flight {
  id: string;
  numeroVol?: string;
  aeroportDepart?: string;
  aeroportArrivee?: string;
  heureDepart?: string;
  heureArrivee?: string;
  statut?: string;
}

interface User {
  id: string;
  nom?: string;
  email?: string;
  role?: string;
  actif?: boolean;
}

interface CrewAssignment {
  id: string;

  volId: string;
  vol?: Flight;

  utilisateurId: string;
  utilisateur?: User;

  fonction: CrewRole;

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

/* ============================================================================
 * HELPERS
 * ========================================================================== */

const CREW_ROLES: CrewRole[] = [
  'Captain',
  'FirstOfficer',
  'Purser',
  'CabinCrew',
  'Dispatcher',
  'Other',
];

const roleLabels: Record<string, string> = {
  Captain: 'Commandant',
  FirstOfficer: 'Copilote',
  Purser: 'Chef de cabine',
  CabinCrew: 'Personnel cabine',
  Dispatcher: 'Agent opérations',
  Other: 'Autre',
};

const formatRole = (
  role?: string | null,
) => {
  if (!role) return 'Non défini';

  return roleLabels[role] ?? role;
};

const safeDate = (
  value?: string | null,
) => {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
};

const formatDateTime = (
  value?: string | null,
) => {
  const date = safeDate(value);

  if (!date) return '--';

  return date.toLocaleString(
    'fr-FR',
    {
      dateStyle: 'short',
      timeStyle: 'short',
    },
  );
};

const getErrorPayload =
  async (response: Response) => {
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

const getApiErrorMessage =
  async (
    response: Response,
    fallback: string,
  ): Promise<string> => {
    const payload =
      await getErrorPayload(response);

    if (!payload) {
      return fallback;
    }

    const message =
      payload.message ??
      payload.error ??
      fallback;

    if (
      typeof message === 'object' &&
      message !== null
    ) {
      if (
        message.code ===
        'CREW_OVERLAP'
      ) {
        return (
          message.message ??
          'Ce membre est déjà affecté à un autre vol sur cette période.'
        );
      }

      if (
        message.code ===
        'CREW_REST'
      ) {
        return (
          message.message ??
          'Le temps minimal de repos équipage n’est pas respecté.'
        );
      }

      return (
        message.message ??
        fallback
      );
    }

    return String(message);
  };

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

export const CrewAssignmentsPage:
  React.FC = () => {
    const [
      assignments,
      setAssignments,
    ] =
      useState<
        CrewAssignment[]
      >([]);

    const [
      flights,
      setFlights,
    ] =
      useState<Flight[]>([]);

    const [
      users,
      setUsers,
    ] =
      useState<User[]>([]);

    const [
      loading,
      setLoading,
    ] =
      useState(false);

    const [
      saving,
      setSaving,
    ] =
      useState(false);

    const [
      deletingId,
      setDeletingId,
    ] =
      useState<string | null>(
        null,
      );

    const [
      editingId,
      setEditingId,
    ] =
      useState<string | null>(
        null,
      );

    const [
      modalOpen,
      setModalOpen,
    ] =
      useState(false);

    const [
      searchTerm,
      setSearchTerm,
    ] =
      useState('');

    const [
      selectedFlightId,
      setSelectedFlightId,
    ] =
      useState('TOUS');

    const [
      selectedUserId,
      setSelectedUserId,
    ] =
      useState('TOUS');

    const [
      message,
      setMessage,
    ] =
      useState<MessageState | null>(
        null,
      );

    const [
      form,
      setForm,
    ] =
      useState<CrewForm>({
        volId: '',
        utilisateurId: '',
        fonction: 'Other',
      });

    /* ======================================================================
     * LOAD
     * ==================================================================== */

    const loadData =
      useCallback(
        async () => {
          setLoading(true);

          try {
            const [
              assignmentsResponse,
              flightsResponse,
              usersResponse,
            ] =
              await Promise.all([
                fetch(
                  `${API_BASE_URL}${CREW_ENDPOINT}`,
                ),

                fetch(
                  `${API_BASE_URL}/flights`,
                ),

                fetch(
                  `${API_BASE_URL}/users`,
                ),
              ]);

            if (
              !assignmentsResponse.ok
            ) {
              throw new Error(
                'Impossible de charger les affectations équipage.',
              );
            }

            const assignmentPayload =
              await assignmentsResponse.json();

            setAssignments(
              Array.isArray(
                assignmentPayload,
              )
                ? assignmentPayload
                : [],
            );

            if (
              flightsResponse.ok
            ) {
              const payload =
                await flightsResponse.json();

              setFlights(
                Array.isArray(payload)
                  ? payload
                  : [],
              );
            }

            if (
              usersResponse.ok
            ) {
              const payload =
                await usersResponse.json();

              setUsers(
                Array.isArray(payload)
                  ? payload.filter(
                      (
                        user: User,
                      ) =>
                        user.actif !==
                        false,
                    )
                  : [],
              );
            }
          } catch (
            error: unknown
          ) {
            setMessage({
              type: 'error',

              text:
                error instanceof Error
                  ? error.message
                  : 'Erreur de chargement.',
            });
          } finally {
            setLoading(false);
          }
        },
        [],
      );

    useEffect(
      () => {
        void loadData();
      },
      [
        loadData,
      ],
    );

    /* ======================================================================
     * FILTER
     * ==================================================================== */

    const filteredAssignments =
      useMemo(
        () => {
          const term =
            searchTerm
              .trim()
              .toLowerCase();

          return assignments.filter(
            (
              assignment,
            ) => {
              const flight =
                assignment.vol;

              const user =
                assignment.utilisateur;

              const matchesSearch =
                !term ||
                String(
                  flight?.numeroVol ??
                    '',
                )
                  .toLowerCase()
                  .includes(
                    term,
                  ) ||
                String(
                  flight?.aeroportDepart ??
                    '',
                )
                  .toLowerCase()
                  .includes(
                    term,
                  ) ||
                String(
                  flight?.aeroportArrivee ??
                    '',
                )
                  .toLowerCase()
                  .includes(
                    term,
                  ) ||
                String(
                  user?.nom ??
                    '',
                )
                  .toLowerCase()
                  .includes(
                    term,
                  ) ||
                String(
                  user?.email ??
                    '',
                )
                  .toLowerCase()
                  .includes(
                    term,
                  ) ||
                String(
                  assignment.fonction ??
                    '',
                )
                  .toLowerCase()
                  .includes(
                    term,
                  );

              const matchesFlight =
                selectedFlightId ===
                  'TOUS' ||
                assignment.volId ===
                  selectedFlightId;

              const matchesUser =
                selectedUserId ===
                  'TOUS' ||
                assignment.utilisateurId ===
                  selectedUserId;

              return (
                matchesSearch &&
                matchesFlight &&
                matchesUser
              );
            },
          );
        },
        [
          assignments,
          searchTerm,
          selectedFlightId,
          selectedUserId,
        ],
      );

    /* ======================================================================
     * FORM
     * ==================================================================== */

    const openCreateModal =
      () => {
        setEditingId(null);

        setForm({
          volId: '',
          utilisateurId: '',
          fonction: 'Other',
        });

        setModalOpen(true);

        setMessage(null);
      };

    const openEditModal =
      (
        assignment:
          CrewAssignment,
      ) => {
        setEditingId(
          assignment.id,
        );

        setForm({
          volId:
            assignment.volId,

          utilisateurId:
            assignment.utilisateurId,

          fonction:
            assignment.fonction,
        });

        setModalOpen(true);

        setMessage(null);
      };

    const closeModal =
      () => {
        if (saving) {
          return;
        }

        setModalOpen(false);

        setEditingId(null);
      };

    /* ======================================================================
     * SAVE
     * ==================================================================== */

    const handleSubmit =
      async (
        event:
          React.FormEvent,
      ) => {
        event.preventDefault();

        if (
          !form.volId ||
          !form.utilisateurId ||
          !form.fonction
        ) {
          setMessage({
            type: 'error',
            text:
              'Veuillez renseigner le vol, le membre d’équipage et la fonction.',
          });

          return;
        }

        setSaving(true);

        setMessage(null);

        try {
          const isEdit =
            Boolean(
              editingId,
            );

          const url =
            isEdit
              ? `${API_BASE_URL}${CREW_ENDPOINT}/${editingId}`
              : `${API_BASE_URL}${CREW_ENDPOINT}`;

     const response = await fetch(
  `${API_BASE_URL}/crew-assignments`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      volId: form.volId,
      utilisateurId: form.utilisateurId,
      fonction: form.fonction,
    }),
  },
);

const responseBody = await response
  .json()
  .catch(() => null);

console.log(
  'POST /crew-assignments',
  {
    volId: form.volId,
    utilisateurId: form.utilisateurId,
    fonction: form.fonction,
  },
);

console.log(
  'Réponse backend crew:',
  response.status,
  responseBody,
);

if (!response.ok) {
  const backendMessage =
    Array.isArray(responseBody?.message)
      ? responseBody.message.join(' | ')
      : typeof responseBody?.message === 'string'
        ? responseBody.message
        : responseBody?.message?.message ||
          responseBody?.error ||
          `Erreur HTTP ${response.status}`;

  throw new Error(backendMessage);
}

          setModalOpen(false);
          setEditingId(null);
          setMessage({
            type: 'success',
            text:
              isEdit
                ? 'Affectation équipage modifiée avec succès.'
                : 'Membre d’équipage affecté au vol avec succès.',
          });

          await loadData();
        } catch (
          error: unknown
        ) {
          setMessage({
            type: 'error',

            text:
              error instanceof Error
                ? error.message
                : 'Erreur lors de l’enregistrement.',
          });
        } finally {
          setSaving(false);
        }
      };

    /* ======================================================================
     * DELETE
     * ==================================================================== */

    const handleDelete =
      async (
        assignment:
          CrewAssignment,
      ) => {
        const confirmed =
          window.confirm(
            `Supprimer l’affectation de ${
              assignment
                .utilisateur
                ?.nom ??
              'ce membre'
            } au vol ${
              assignment
                .vol
                ?.numeroVol ??
              ''
            } ?`,
          );

        if (
          !confirmed
        ) {
          return;
        }

        setDeletingId(
          assignment.id,
        );

        setMessage(null);

        try {
          const response =
            await fetch(
              `${API_BASE_URL}${CREW_ENDPOINT}/${assignment.id}`,
              {
                method:
                  'DELETE',
              },
            );

          if (
            !response.ok
          ) {
            throw new Error(
              await getApiErrorMessage(
                response,
                'Impossible de supprimer cette affectation.',
              ),
            );
          }

          setMessage({
            type: 'success',

            text:
              'Affectation supprimée avec succès.',
          });

          await loadData();
        } catch (
          error: unknown
        ) {
          setMessage({
            type: 'error',

            text:
              error instanceof Error
                ? error.message
                : 'Erreur lors de la suppression.',
          });
        } finally {
          setDeletingId(
            null,
          );
        }
      };

    /* ======================================================================
     * KPI
     * ==================================================================== */

    const uniqueCrewCount =
      useMemo(
        () =>
          new Set(
            assignments.map(
              (
                item,
              ) =>
                item.utilisateurId,
            ),
          ).size,
        [
          assignments,
        ],
      );

    const assignedFlightCount =
      useMemo(
        () =>
          new Set(
            assignments.map(
              (
                item,
              ) =>
                item.volId,
            ),
          ).size,
        [
          assignments,
        ],
      );

    const withRestInfo =
      assignments.filter(
        (
          item,
        ) =>
          item.heuresReposAvant !==
            null &&
          item.heuresReposAvant !==
            undefined,
      ).length;

    /* ======================================================================
     * RENDER
     * ==================================================================== */

    return (
      <div className="min-h-screen bg-slate-100 p-4 text-slate-800 sm:p-6 lg:p-8">

        <div className="mx-auto max-w-[1500px] space-y-5">

          {/* HEADER */}

          <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

              <div className="flex items-center gap-3">

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-white">

                  <Users className="h-5 w-5" />

                </div>

                <div>

                  <h1 className="text-xl font-black text-slate-950">
                    Gestion des équipages
                  </h1>

                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    Affectation des membres d’équipage aux vols
                  </p>

                </div>

              </div>

              <div className="flex flex-wrap gap-2">

                <button
                  type="button"
                  onClick={() =>
                    void loadData()
                  }
                  disabled={
                    loading
                  }
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >

                  <RefreshCw
                    className={`h-4 w-4 ${
                      loading
                        ? 'animate-spin'
                        : ''
                    }`}
                  />

                  Actualiser

                </button>

                <button
                  type="button"
                  onClick={
                    openCreateModal
                  }
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white hover:bg-emerald-800"
                >

                  <UserPlus className="h-4 w-4" />

                  Nouvelle affectation

                </button>

              </div>

            </div>

          </header>

          {/* MESSAGE */}

          {message && (

            <div
              className={`flex items-center justify-between rounded-2xl border p-4 ${
                message.type ===
                'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : message.type ===
                      'info'
                    ? 'border-sky-200 bg-sky-50 text-sky-900'
                    : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >

              <div className="flex items-center gap-2 text-sm font-semibold">

                {message.type ===
                'success' ? (

                  <CheckCircle2 className="h-5 w-5" />

                ) : (

                  <AlertTriangle className="h-5 w-5" />

                )}

                {
                  message.text
                }

              </div>

              <button
                type="button"
                onClick={() =>
                  setMessage(
                    null,
                  )
                }
              >

                <X className="h-4 w-4" />

              </button>

            </div>

          )}

          {/* KPI */}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">

            <MetricCard
              label="Affectations"
              value={
                assignments.length
              }
              icon={
                <Users className="h-4 w-4" />
              }
            />

            <MetricCard
              label="Membres actifs"
              value={
                uniqueCrewCount
              }
              icon={
                <ShieldCheck className="h-4 w-4" />
              }
            />

            <MetricCard
              label="Vols couverts"
              value={
                assignedFlightCount
              }
              icon={
                <Plane className="h-4 w-4" />
              }
            />

            <MetricCard
              label="Repos calculé"
              value={
                withRestInfo
              }
              icon={
                <Clock3 className="h-4 w-4" />
              }
            />

          </section>

          {/* FILTERS */}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <div className="grid gap-3 md:grid-cols-3">

              <div className="relative">

                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  type="text"
                  placeholder="Rechercher un vol, membre, fonction..."
                  value={
                    searchTerm
                  }
                  onChange={(
                    event,
                  ) =>
                    setSearchTerm(
                      event.target.value,
                    )
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs font-semibold outline-none focus:border-emerald-700 focus:bg-white"
                />

              </div>

              <select
                value={
                  selectedFlightId
                }
                onChange={(
                  event,
                ) =>
                  setSelectedFlightId(
                    event.target.value,
                  )
                }
                className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-emerald-700"
              >

                <option value="TOUS">
                  Tous les vols
                </option>

                {flights.map(
                  (
                    flight,
                  ) => (

                    <option
                      key={
                        flight.id
                      }
                      value={
                        flight.id
                      }
                    >
                      {flight.numeroVol ??
                        flight.id}{' '}
                      {flight.aeroportDepart
                        ? `— ${flight.aeroportDepart} → ${flight.aeroportArrivee ?? '?'}`
                        : ''}
                    </option>

                  ),
                )}

              </select>

              <select
                value={
                  selectedUserId
                }
                onChange={(
                  event,
                ) =>
                  setSelectedUserId(
                    event.target.value,
                  )
                }
                className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-emerald-700"
              >

                <option value="TOUS">
                  Tous les membres
                </option>

                {users.map(
                  (
                    user,
                  ) => (

                    <option
                      key={
                        user.id
                      }
                      value={
                        user.id
                      }
                    >
                      {user.nom ??
                        user.email ??
                        user.id}
                    </option>

                  ),
                )}

              </select>

            </div>

          </section>

          {/* TABLE */}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex items-center justify-between border-b border-slate-200 p-5">

              <h2 className="text-base font-black text-slate-900">
                Affectations équipage
              </h2>

              <span className="text-xs font-semibold text-slate-400">
                {
                  filteredAssignments.length
                }{' '}
                résultat(s)
              </span>

            </div>

            <div className="overflow-x-auto">

              <table className="w-full min-w-[1000px] text-left text-sm">

                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">

                  <tr>

                    <th className="px-4 py-3">
                      Vol
                    </th>

                    <th className="px-4 py-3">
                      Itinéraire
                    </th>

                    <th className="px-4 py-3">
                      Membre
                    </th>

                    <th className="px-4 py-3">
                      Fonction
                    </th>

                    <th className="px-4 py-3">
                      Départ
                    </th>

                    <th className="px-4 py-3">
                      Repos avant vol
                    </th>

                    <th className="px-4 py-3 text-right">
                      Actions
                    </th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-100">

                  {loading ? (

                    <tr>

                      <td
                        colSpan={
                          7
                        }
                        className="px-4 py-10 text-center text-slate-400"
                      >
                        Chargement...
                      </td>

                    </tr>

                  ) : filteredAssignments.length ===
                    0 ? (

                    <tr>

                      <td
                        colSpan={
                          7
                        }
                        className="px-4 py-10 text-center text-slate-400"
                      >
                        Aucune affectation trouvée
                      </td>

                    </tr>

                  ) : (

                    filteredAssignments.map(
                      (
                        assignment,
                      ) => {

                        const flight =
                          assignment.vol;

                        const user =
                          assignment.utilisateur;

                        return (

                          <tr
                            key={
                              assignment.id
                            }
                            className="hover:bg-slate-50"
                          >

                            <td className="px-4 py-4 font-black text-slate-900">

                              {flight?.numeroVol ??
                                assignment.volId}

                            </td>

                            <td className="px-4 py-4 font-semibold text-slate-600">

                              {flight?.aeroportDepart ??
                                '--'}{' '}
                              ➔{' '}
                              {flight?.aeroportArrivee ??
                                '--'}

                            </td>

                            <td className="px-4 py-4">

                              <div className="font-bold text-slate-800">

                                {user?.nom ??
                                  'Utilisateur'}

                              </div>

                              <div className="mt-0.5 text-[10px] text-slate-400">

                                {user?.email ??
                                  assignment.utilisateurId}

                              </div>

                            </td>

                            <td className="px-4 py-4">

                              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black text-sky-700">

                                {formatRole(
                                  assignment.fonction,
                                )}

                              </span>

                            </td>

                            <td className="px-4 py-4 text-xs text-slate-500">

                              {formatDateTime(
                                flight?.heureDepart,
                              )}

                            </td>

                            <td className="px-4 py-4">

                              {assignment.heuresReposAvant ===
                                null ||
                              assignment.heuresReposAvant ===
                                undefined ? (

                                <span className="text-xs text-slate-400">
                                  Premier vol
                                </span>

                              ) : (

                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">

                                  <Clock3 className="h-3 w-3" />

                                  {assignment.heuresReposAvant.toFixed(
                                    1,
                                  )}{' '}
                                  h

                                </span>

                              )}

                            </td>

                            <td className="px-4 py-4">

                              <div className="flex justify-end gap-2">

                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditModal(
                                      assignment,
                                    )
                                  }
                                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                                >

                                  <Pencil className="h-4 w-4" />

                                </button>

                                <button
                                  type="button"
                                  disabled={
                                    deletingId ===
                                    assignment.id
                                  }
                                  onClick={() =>
                                    void handleDelete(
                                      assignment,
                                    )
                                  }
                                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                                >

                                  <Trash2 className="h-4 w-4" />

                                </button>

                              </div>

                            </td>

                          </tr>

                        );
                      },
                    )

                  )}

                </tbody>

              </table>

            </div>

          </section>

        </div>

        {/* ================================================================ */}
        {/* MODAL                                                           */}
        {/* ================================================================ */}

        {modalOpen && (

          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">

            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">

              <div className="flex items-center justify-between border-b border-slate-200 p-5">

                <div>

                  <h2 className="text-lg font-black text-slate-950">

                    {editingId
                      ? 'Modifier l’affectation'
                      : 'Nouvelle affectation'}

                  </h2>

                  <p className="mt-1 text-xs text-slate-400">

                    Le backend vérifiera automatiquement les chevauchements et le repos minimal.

                  </p>

                </div>

                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                >

                  <X className="h-5 w-5" />

                </button>

              </div>

              <form
                onSubmit={
                  handleSubmit
                }
                className="space-y-4 p-5"
              >

                <label className="block">

                  <span className="mb-1.5 block text-[10px] font-black uppercase text-slate-400">
                    Vol *
                  </span>

                  <select
                    required
                    value={
                      form.volId
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          volId:
                            event.target.value,
                        }),
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-emerald-700"
                  >

                    <option value="">
                      Sélectionner un vol
                    </option>

                    {flights.map(
                      (
                        flight,
                      ) => (

                        <option
                          key={
                            flight.id
                          }
                          value={
                            flight.id
                          }
                        >
                          {flight.numeroVol ??
                            flight.id}{' '}
                          —{' '}
                          {flight.aeroportDepart ??
                            '?'}{' '}
                          →{' '}
                          {flight.aeroportArrivee ??
                            '?'}
                        </option>

                      ),
                    )}

                  </select>

                </label>

                <label className="block">

                  <span className="mb-1.5 block text-[10px] font-black uppercase text-slate-400">
                    Membre d’équipage *
                  </span>

                  <select
                    required
                    value={
                      form.utilisateurId
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          utilisateurId:
                            event.target.value,
                        }),
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-emerald-700"
                  >

                    <option value="">
                      Sélectionner un membre
                    </option>

                    {users.map(
                      (
                        user,
                      ) => (

                        <option
                          key={
                            user.id
                          }
                          value={
                            user.id
                          }
                        >
                          {user.nom ??
                            user.email ??
                            user.id}
                          {user.role
                            ? ` — ${user.role}`
                            : ''}
                        </option>

                      ),
                    )}

                  </select>

                </label>

                <label className="block">

                  <span className="mb-1.5 block text-[10px] font-black uppercase text-slate-400">
                    Fonction *
                  </span>

                  <select
                    required
                    value={
                      form.fonction
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          fonction:
                            event.target.value,
                        }),
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-emerald-700"
                  >

                    {CREW_ROLES.map(
                      (
                        role,
                      ) => (

                        <option
                          key={
                            role
                          }
                          value={
                            role
                          }
                        >
                          {formatRole(
                            role,
                          )}
                        </option>

                      ),
                    )}

                  </select>

                </label>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">

                  <div className="flex gap-2 text-xs font-semibold text-amber-800">

                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

                    <span>
                      Lors de l’enregistrement, le système vérifie automatiquement
                      les conflits d’équipage et le temps minimal de repos avant le vol.
                    </span>

                  </div>

                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">

                  <button
                    type="button"
                    onClick={
                      closeModal
                    }
                    disabled={
                      saving
                    }
                    className="h-11 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Annuler
                  </button>

                  <button
                    type="submit"
                    disabled={
                      saving
                    }
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50"
                  >

                    <Save className="h-4 w-4" />

                    {saving
                      ? 'Enregistrement...'
                      : editingId
                        ? 'Enregistrer'
                        : 'Affecter'}

                  </button>

                </div>

              </form>

            </div>

          </div>

        )}

      </div>
    );
  };

/* ============================================================================
 * SMALL COMPONENT
 * ========================================================================== */

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

      <div className="flex items-center justify-between text-slate-400">

        <span className="text-[9px] font-black uppercase tracking-wider">
          {label}
        </span>

        {icon}

      </div>

      <div className="mt-2 text-2xl font-black text-slate-900">
        {value}
      </div>

    </div>
  );
}

export default CrewAssignmentsPage;