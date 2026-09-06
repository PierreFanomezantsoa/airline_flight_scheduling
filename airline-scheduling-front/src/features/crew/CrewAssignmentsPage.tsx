import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
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
} from '../Api/apiService';

import {
  getCrewMembers,
  type PublicUser,
} from '../Api/apiService';

/* ============================================================================
 * ENDPOINTS
 * ========================================================================== */

const CREW_ENDPOINT =
  '/users/crew-members';

const FLIGHTS_ENDPOINT =
  '/flights';

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

  heuresReposAvant?:
    | number
    | null;
}

interface CrewForm {
  volId: string;

  utilisateurId: string;

  fonction: CrewRole;
}

interface MessageState {
  type:
    | 'success'
    | 'error'
    | 'info';

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

const CREW_ROLES:
  CrewRole[] = [
    'Captain',
    'First Officer',
    'Purser',
    'Cabin Crew',
    'Other',
  ];

const ROLE_LABELS:
  Record<
    CrewRole,
    string
  > = {
  Captain:
    'Commandant de bord',

  'First Officer':
    'Copilote',

  Purser:
    'Chef de cabine',

  'Cabin Crew':
    'Personnel de cabine',

  Other:
    'Autre',
};

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function normalizeArray<T>(
  payload: unknown,
): T[] {
  if (
    Array.isArray(
      payload,
    )
  ) {
    return payload as T[];
  }

  if (
    payload &&
    typeof payload ===
      'object'
  ) {
    const data =
      (
        payload as ApiPayload<T[]>
      ).data;

    if (
      Array.isArray(
        data,
      )
    ) {
      return data;
    }
  }

  return [];
}

function formatRole(
  role?:
    string | null,
): string {
  if (!role) {
    return 'Non défini';
  }

  return (
    ROLE_LABELS[
      role as CrewRole
    ] ??
    role
  );
}

function safeDate(
  value?:
    string | null,
): Date | null {
  if (!value) {
    return null;
  }

  const date =
    new Date(
      value,
    );

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date;
}

function formatDateTime(
  value?:
    string | null,
): string {
  const date =
    safeDate(
      value,
    );

  if (!date) {
    return '--';
  }

  return date.toLocaleString(
    'fr-FR',
    {
      dateStyle:
        'short',

      timeStyle:
        'short',
    },
  );
}

function normalizeStatus(
  value?:
    string | null,
): string {
  return String(
    value ?? '',
  )
    .trim()
    .toLowerCase()
    .normalize(
      'NFD',
    )
    .replace(
      /[\u0300-\u036f]/g,
      '',
    );
}

function isAssignableFlight(
  flight:
    Flight,
): boolean {
  const status =
    normalizeStatus(
      flight.statut,
    );

  return ![
    'cancelled',
    'annule',
    'effectue',
  ].includes(
    status,
  );
}

function getAssignmentFlightId(
  assignment:
    CrewAssignment,
): string {
  return (
    assignment.volId ||
    assignment.vol?.id ||
    ''
  );
}

function getAssignmentUserId(
  assignment:
    CrewAssignment,
): string {
  return (
    assignment.utilisateurId ||
    assignment.utilisateur?.id ||
    ''
  );
}

async function getErrorPayload(
  response:
    Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractApiError(
  payload:
    unknown,

  fallback:
    string,
): string {
  if (
    !payload ||
    typeof payload !==
      'object'
  ) {
    return fallback;
  }

  const data =
    payload as {
      code?: string;

      message?:
        | string
        | string[]
        | {
            code?: string;
            message?: string;
          };

      error?: string;
    };

  if (
    Array.isArray(
      data.message,
    )
  ) {
    return data.message.join(
      ' | ',
    );
  }

  if (
    data.code ===
    'CREW_OVERLAP'
  ) {
    return (
      typeof data.message ===
        'string'
        ? data.message
        : 'Ce membre est déjà affecté à un autre vol pendant cette période.'
    );
  }

  if (
    data.code ===
    'CREW_REST'
  ) {
    return (
      typeof data.message ===
        'string'
        ? data.message
        : 'Le temps minimal de repos équipage n’est pas respecté.'
    );
  }

  if (
    typeof data.message ===
      'object' &&
    data.message !==
      null
  ) {
    if (
      data.message.code ===
      'CREW_OVERLAP'
    ) {
      return (
        data.message.message ||
        'Ce membre est déjà affecté à un autre vol pendant cette période.'
      );
    }

    if (
      data.message.code ===
      'CREW_REST'
    ) {
      return (
        data.message.message ||
        'Le temps minimal de repos équipage n’est pas respecté.'
      );
    }

    return (
      data.message
        .message ||
      fallback
    );
  }

  if (
    typeof data.message ===
      'string'
  ) {
    return data.message;
  }

  if (
    data.error
  ) {
    return String(
      data.error,
    );
  }

  return fallback;
}

async function getApiErrorMessage(
  response:
    Response,

  fallback:
    string,
): Promise<string> {
  const payload =
    await getErrorPayload(
      response,
    );

  return extractApiError(
    payload,
    fallback,
  );
}

async function requestJson<T>(
  path:
    string,

  options:
    RequestInit = {},
): Promise<T> {
  const response =
    await authFetch(
      path,
      options,
    );

  if (
    !response.ok
  ) {
    throw new Error(
      await getApiErrorMessage(
        response,
        `Erreur serveur HTTP ${response.status}`,
      ),
    );
  }

  if (
    response.status ===
    204
  ) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/* ============================================================================
 * METRIC
 * ========================================================================== */

function MetricCard({
  label,
  value,
  icon,
  subtitle,
}: {
  label:
    string;

  value:
    string | number;

  icon:
    React.ReactNode;

  subtitle?:
    string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

      <div className="flex items-start justify-between gap-3">

        <div>

          <span className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">
            {label}
          </span>

          <p className="mt-2 text-2xl font-black tabular-nums text-slate-950">
            {value}
          </p>

          {subtitle && (
            <p className="mt-1 text-[9px] font-medium text-slate-400">
              {subtitle}
            </p>
          )}

        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          {icon}
        </div>

      </div>

    </article>
  );
}

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

export const CrewAssignmentsPage:
  React.FC = () => {
    /* =========================================================================
     * STATES
     * ======================================================================= */

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
      useState<
        Flight[]
      >([]);

    const [
      users,
      setUsers,
    ] =
      useState<
        PublicUser[]
      >([]);

    const [
      loading,
      setLoading,
    ] =
      useState(
        true,
      );

    const [
      loadingUsers,
      setLoadingUsers,
    ] =
      useState(
        false,
      );

    const [
      saving,
      setSaving,
    ] =
      useState(
        false,
      );

    const [
      deletingId,
      setDeletingId,
    ] =
      useState<
        string | null
      >(
        null,
      );

    const [
      editingId,
      setEditingId,
    ] =
      useState<
        string | null
      >(
        null,
      );

    const [
      modalOpen,
      setModalOpen,
    ] =
      useState(
        false,
      );

    const [
      searchTerm,
      setSearchTerm,
    ] =
      useState('');

    const [
      selectedFlightId,
      setSelectedFlightId,
    ] =
      useState(
        'TOUS',
      );

    const [
      selectedUserId,
      setSelectedUserId,
    ] =
      useState(
        'TOUS',
      );

    const [
      message,
      setMessage,
    ] =
      useState<
        MessageState | null
      >(
        null,
      );

    const [
      form,
      setForm,
    ] =
      useState<
        CrewForm
      >({
        volId: '',
        utilisateurId: '',
        fonction: 'Other',
      });

    /* =========================================================================
     * LOAD CREW MEMBERS
     * ======================================================================= */

    const loadCrewMembers =
      useCallback(
        async () => {
          setLoadingUsers(
            true,
          );

          try {
            const members =
              await getCrewMembers();

            const filtered =
              members.filter(
                (
                  user,
                ) =>
                  user.actif !==
                    false &&
                  user.role ===
                    'Crew_Member' &&
                  user.accountStatus ===
                    'APPROVED',
              );

            setUsers(
              filtered,
            );

            if (
              filtered.length ===
              0
            ) {
              setMessage({
                type:
                  'info',

                text:
                  'Aucun membre d’équipage actif et approuvé n’est disponible.',
              });
            }
          } catch (
            error:
              unknown
          ) {
            console.error(
              '[CrewAssignments] Chargement membres :',
              error,
            );

            setUsers(
              [],
            );

            setMessage({
              type:
                'error',

              text:
                error instanceof
                  Error
                  ? error.message
                  : 'Impossible de charger les membres d’équipage.',
            });
          } finally {
            setLoadingUsers(
              false,
            );
          }
        },
        [],
      );

    /* =========================================================================
     * LOAD DATA
     * ======================================================================= */

    const loadData =
      useCallback(
        async (
          silent =
            false,
        ) => {
          if (
            !silent
          ) {
            setLoading(
              true,
            );

            setMessage(
              null,
            );
          }

          try {
            const [
              assignmentsResult,
              flightsResult,
            ] =
              await Promise.allSettled([
                requestJson<
                  unknown
                >(
                  CREW_ENDPOINT,
                ),

                requestJson<
                  unknown
                >(
                  FLIGHTS_ENDPOINT,
                ),
              ]);

            /* ===============================================================
             * ASSIGNMENTS
             * ============================================================= */

            if (
              assignmentsResult.status ===
              'rejected'
            ) {
              throw assignmentsResult.reason;
            }

            setAssignments(
              normalizeArray<
                CrewAssignment
              >(
                assignmentsResult.value,
              ),
            );

            /* ===============================================================
             * FLIGHTS
             * ============================================================= */

            if (
              flightsResult.status ===
              'fulfilled'
            ) {
              setFlights(
                normalizeArray<
                  Flight
                >(
                  flightsResult.value,
                ),
              );
            } else {
              setFlights(
                [],
              );

              console.error(
                '[CrewAssignments] Vols :',
                flightsResult.reason,
              );
            }
          } catch (
            error:
              unknown
          ) {
            console.error(
              '[CrewAssignments] Chargement :',
              error,
            );

            setMessage({
              type:
                'error',

              text:
                error instanceof Error
                  ? error.message
                  : 'Impossible de charger les affectations équipage.',
            });
          } finally {
            if (
              !silent
            ) {
              setLoading(
                false,
              );
            }
          }
        },
        [],
      );

    /* =========================================================================
     * INITIAL LOAD
     * ======================================================================= */

    useEffect(
      () => {
        void Promise.all([
          loadData(),
          loadCrewMembers(),
        ]);
      },
      [
        loadData,
        loadCrewMembers,
      ],
    );

    /* =========================================================================
     * AUTO REFRESH
     * ======================================================================= */

    useEffect(
      () => {
        const timer =
          window.setInterval(
            () => {
              if (
                document.visibilityState ===
                'visible'
              ) {
                void loadData(
                  true,
                );

                void loadCrewMembers();
              }
            },
            30_000,
          );

        return () =>
          window.clearInterval(
            timer,
          );
      },
      [
        loadData,
        loadCrewMembers,
      ],
    );

    /* =========================================================================
     * MODAL SCROLL
     * ======================================================================= */

    useEffect(() => {
      if (
        !modalOpen
      ) {
        return;
      }

      const previousOverflow =
        document.body.style
          .overflow;

      document.body.style.overflow =
        'hidden';

      const handleEscape =
        (
          event:
            KeyboardEvent,
        ) => {
          if (
            event.key ===
              'Escape' &&
            !saving
          ) {
            setModalOpen(
              false,
            );

            setEditingId(
              null,
            );
          }
        };

      window.addEventListener(
        'keydown',
        handleEscape,
      );

      return () => {
        document.body.style.overflow =
          previousOverflow;

        window.removeEventListener(
          'keydown',
          handleEscape,
        );
      };
    }, [
      modalOpen,
      saving,
    ]);

    /* =========================================================================
     * DERIVED
     * ======================================================================= */

    const assignableFlights =
      useMemo(
        () =>
          flights.filter(
            isAssignableFlight,
          ),
        [
          flights,
        ],
      );

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

              const flightId =
                getAssignmentFlightId(
                  assignment,
                );

              const userId =
                getAssignmentUserId(
                  assignment,
                );

              const searchValues =
                [
                  flight?.numeroVol,
                  flight?.aeroportDepart,
                  flight?.aeroportArrivee,
                  user?.nom,
                  user?.email,
                  assignment.fonction,
                ]
                  .filter(
                    Boolean,
                  )
                  .join(
                    ' ',
                  )
                  .toLowerCase();

              const matchesSearch =
                !term ||
                searchValues.includes(
                  term,
                );

              const matchesFlight =
                selectedFlightId ===
                  'TOUS' ||
                flightId ===
                  selectedFlightId;

              const matchesUser =
                selectedUserId ===
                  'TOUS' ||
                userId ===
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

    const uniqueCrewCount =
      useMemo(
        () =>
          new Set(
            assignments
              .map(
                getAssignmentUserId,
              )
              .filter(
                Boolean,
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
            assignments
              .map(
                getAssignmentFlightId,
              )
              .filter(
                Boolean,
              ),
          ).size,
        [
          assignments,
        ],
      );

    const withRestInfo =
      useMemo(
        () =>
          assignments.filter(
            (
              item,
            ) =>
              item.heuresReposAvant !==
                null &&
              item.heuresReposAvant !==
                undefined,
          ).length,
        [
          assignments,
        ],
      );

    const selectedFlight =
      useMemo(
        () =>
          flights.find(
            (
              flight,
            ) =>
              flight.id ===
              form.volId,
          ) ??
          null,
        [
          flights,
          form.volId,
        ],
      );

    /* =========================================================================
     * MODAL ACTIONS
     * ======================================================================= */

    const openCreateModal =
      () => {
        setEditingId(
          null,
        );

        setForm({
          volId:
            '',

          utilisateurId:
            '',

          fonction:
            'Other',
        });

        setMessage(
          null,
        );

        /*
         * On recharge les Crew_Member à chaque ouverture.
         */
        void loadCrewMembers();

        setModalOpen(
          true,
        );
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
            getAssignmentFlightId(
              assignment,
            ),

          utilisateurId:
            getAssignmentUserId(
              assignment,
            ),

          fonction:
            assignment.fonction ??
            'Other',
        });

        setMessage(
          null,
        );

        void loadCrewMembers();

        setModalOpen(
          true,
        );
      };

    const closeModal =
      () => {
        if (
          saving
        ) {
          return;
        }

        setModalOpen(
          false,
        );

        setEditingId(
          null,
        );
      };

    /* =========================================================================
     * SAVE
     * ======================================================================= */

    const handleSubmit =
      async (
        event:
          React.FormEvent,
      ) => {
        event.preventDefault();

        if (
          saving
        ) {
          return;
        }

        if (
          !form.volId ||
          !form.utilisateurId ||
          !form.fonction
        ) {
          setMessage({
            type:
              'error',

            text:
              'Veuillez sélectionner un vol, un membre d’équipage et sa fonction.',
          });

          return;
        }

        if (
          selectedFlight &&
          !isAssignableFlight(
            selectedFlight,
          )
        ) {
          setMessage({
            type:
              'error',

            text:
              'Ce vol ne peut plus recevoir une affectation équipage.',
          });

          return;
        }

        const selectedUser =
          users.find(
            (
              user,
            ) =>
              user.id ===
              form.utilisateurId,
          );

        if (
          !selectedUser
        ) {
          setMessage({
            type:
              'error',

            text:
              'Le membre d’équipage sélectionné est introuvable.',
          });

          return;
        }

        if (
          selectedUser.actif ===
          false
        ) {
          setMessage({
            type:
              'error',

            text:
              'Ce membre d’équipage est désactivé.',
          });

          return;
        }

        if (
          selectedUser.accountStatus !==
          'APPROVED'
        ) {
          setMessage({
            type:
              'error',

            text:
              'Le compte de ce membre d’équipage n’est pas encore approuvé.',
          });

          return;
        }

        setSaving(
          true,
        );

        setMessage(
          null,
        );

        try {
          const isEdit =
            Boolean(
              editingId,
            );

          const payload = {
            volId:
              form.volId,

            utilisateurId:
              form.utilisateurId,

            fonction:
              form.fonction,
          };

          await requestJson<
            CrewAssignment
          >(
            isEdit
              ? `${CREW_ENDPOINT}/${editingId}`
              : CREW_ENDPOINT,

            {
              method:
                isEdit
                  ? 'PATCH'
                  : 'POST',

              body:
                JSON.stringify(
                  payload,
                ),
            },
          );

          setModalOpen(
            false,
          );

          setEditingId(
            null,
          );

          setMessage({
            type:
              'success',

            text:
              isEdit
                ? 'Affectation équipage modifiée avec succès.'
                : 'Membre d’équipage affecté avec succès.',
          });

          await loadData(
            true,
          );
        } catch (
          error:
            unknown
        ) {
          console.error(
            '[CrewAssignments] Enregistrement :',
            error,
          );

          setMessage({
            type:
              'error',

            text:
              error instanceof
                Error
                ? error.message
                : 'Impossible d’enregistrer l’affectation.',
          });
        } finally {
          setSaving(
            false,
          );
        }
      };

    /* =========================================================================
     * DELETE
     * ======================================================================= */

    const handleDelete =
      async (
        assignment:
          CrewAssignment,
      ) => {
        const userName =
          assignment.utilisateur
            ?.nom ??
          assignment.utilisateur
            ?.email ??
          'ce membre';

        const flightNumber =
          assignment.vol
            ?.numeroVol ??
          'ce vol';

        const confirmed =
          window.confirm(
            `Supprimer l’affectation de ${userName} au vol ${flightNumber} ?`,
          );

        if (
          !confirmed
        ) {
          return;
        }

        setDeletingId(
          assignment.id,
        );

        setMessage(
          null,
        );

        try {
          await requestJson<
            unknown
          >(
            `${CREW_ENDPOINT}/${assignment.id}`,
            {
              method:
                'DELETE',
            },
          );

          setMessage({
            type:
              'success',

            text:
              'Affectation supprimée avec succès.',
          });

          await loadData(
            true,
          );
        } catch (
          error:
            unknown
        ) {
          console.error(
            '[CrewAssignments] Suppression :',
            error,
          );

          setMessage({
            type:
              'error',

            text:
              error instanceof
                Error
                ? error.message
                : 'Impossible de supprimer cette affectation.',
          });
        } finally {
          setDeletingId(
            null,
          );
        }
      };

    /* =========================================================================
     * RENDER
     * ======================================================================= */

    return (
      <div className="min-h-screen bg-slate-100 p-4 text-slate-800 sm:p-6 lg:p-8">

        <div className="mx-auto max-w-[1500px] space-y-4">

          {/* HEADER */}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">

              <div className="flex items-center gap-3">

                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">

                  <Users className="h-5 w-5" />

                  <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />

                </div>

                <div>

                  <div className="flex flex-wrap items-center gap-2">

                    <h1 className="text-lg font-black tracking-tight text-slate-950">
                      Gestion des équipages
                    </h1>

                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-700">
                      OCC
                    </span>

                  </div>

                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    Affectations, fonctions, chevauchements et repos des équipages.
                  </p>

                </div>

              </div>

              <div className="flex flex-wrap gap-2">

                <button
                  type="button"
                  onClick={() => {
                    void loadData();
                    void loadCrewMembers();
                  }}
                  disabled={
                    loading ||
                    loadingUsers
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >

                  <RefreshCw
                    className={`h-4 w-4 ${
                      loading ||
                      loadingUsers
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
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white transition hover:bg-emerald-800"
                >

                  <UserPlus className="h-4 w-4" />

                  Nouvelle affectation

                </button>

              </div>

            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 bg-slate-50/80 px-5 py-2.5 text-[10px] font-semibold text-slate-500">

              <span>
                <strong className="text-slate-700">
                  {assignableFlights.length}
                </strong>{' '}
                vols disponibles
              </span>

              <span>
                <strong className="text-slate-700">
                  {users.length}
                </strong>{' '}
                Crew_Member disponibles
              </span>

              <span>
                Contrôle des conflits et du repos
              </span>

            </div>

          </section>

          {/* MESSAGE */}

          {message && (

            <div
              className={`flex items-start justify-between gap-3 rounded-2xl border p-4 ${
                message.type ===
                'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : message.type ===
                      'info'
                    ? 'border-sky-200 bg-sky-50 text-sky-900'
                    : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >

              <div className="flex items-start gap-2 text-sm font-semibold">

                {message.type ===
                'success' ? (

                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />

                ) : (

                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

                )}

                <span>
                  {message.text}
                </span>

              </div>

              <button
                type="button"
                onClick={() =>
                  setMessage(
                    null,
                  )
                }
                className="rounded-lg p-1 hover:bg-black/5"
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
              subtitle="Total enregistré"
              icon={
                <Users className="h-4 w-4" />
              }
            />

            <MetricCard
              label="Membres"
              value={
                uniqueCrewCount
              }
              subtitle="Membres affectés"
              icon={
                <ShieldCheck className="h-4 w-4" />
              }
            />

            <MetricCard
              label="Vols couverts"
              value={
                assignedFlightCount
              }
              subtitle="Avec équipage"
              icon={
                <Plane className="h-4 w-4" />
              }
            />

            <MetricCard
              label="Repos calculé"
              value={
                withRestInfo
              }
              subtitle="Affectations renseignées"
              icon={
                <Clock3 className="h-4 w-4" />
              }
            />

          </section>

          {/* FILTERS */}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

            <div className="grid gap-3 md:grid-cols-3">

              <div className="relative">

                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  type="search"
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
                  placeholder="Vol, membre, fonction..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs font-semibold outline-none focus:border-emerald-600 focus:bg-white"
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
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-emerald-600"
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
                        flight.id}
                      {' — '}
                      {flight.aeroportDepart ??
                        '?'}
                      {' → '}
                      {flight.aeroportArrivee ??
                        '?'}
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
                disabled={
                  loadingUsers
                }
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-emerald-600 disabled:opacity-50"
              >

                <option value="TOUS">
                  {loadingUsers
                    ? 'Chargement des membres...'
                    : 'Tous les membres'}
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
                      {user.nom} — {user.email}
                    </option>

                  ),
                )}

              </select>

            </div>

          </section>

          {/* TABLE */}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">

              <div>

                <h2 className="text-sm font-black text-slate-900">
                  Affectations équipage
                </h2>

                <p className="mt-0.5 text-[10px] text-slate-400">
                  Vol, membre, fonction et repos avant rotation
                </p>

              </div>

              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-500">
                {filteredAssignments.length} résultat(s)
              </span>

            </div>

            <div className="overflow-x-auto">

              <table className="w-full min-w-[1000px] text-left text-sm">

                <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-500">

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
                      Repos avant
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
                        className="px-4 py-14 text-center text-slate-400"
                      >

                        <span className="inline-flex items-center gap-2">

                          <RefreshCw className="h-4 w-4 animate-spin" />

                          Chargement...

                        </span>

                      </td>

                    </tr>

                  ) : filteredAssignments.length ===
                    0 ? (

                    <tr>

                      <td
                        colSpan={
                          7
                        }
                        className="px-4 py-14 text-center text-slate-400"
                      >
                        Aucune affectation trouvée.
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
                            className="transition hover:bg-slate-50"
                          >

                            <td className="px-4 py-4">

                              <div className="flex items-center gap-2">

                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                                  <Plane className="h-4 w-4" />
                                </div>

                                <div>

                                  <p className="font-black text-slate-900">
                                    {flight?.numeroVol ??
                                      getAssignmentFlightId(
                                        assignment,
                                      )}
                                  </p>

                                  <p className="text-[9px] text-slate-400">
                                    {flight?.statut ??
                                      'Statut inconnu'}
                                  </p>

                                </div>

                              </div>

                            </td>

                            <td className="px-4 py-4 font-semibold text-slate-600">
                              {flight?.aeroportDepart ??
                                '--'}
                              {' → '}
                              {flight?.aeroportArrivee ??
                                '--'}
                            </td>

                            <td className="px-4 py-4">

                              <p className="font-bold text-slate-800">
                                {user?.nom ??
                                  'Utilisateur'}
                              </p>

                              <p className="mt-0.5 text-[10px] text-slate-400">
                                {user?.email ??
                                  getAssignmentUserId(
                                    assignment,
                                  )}
                              </p>

                            </td>

                            <td className="px-4 py-4">

                              <span className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[9px] font-black text-sky-700">
                                {formatRole(
                                  assignment.fonction,
                                )}
                              </span>

                            </td>

                            <td className="px-4 py-4 text-[11px] text-slate-500">
                              {formatDateTime(
                                flight?.heureDepart,
                              )}
                            </td>

                            <td className="px-4 py-4">

                              {assignment.heuresReposAvant ===
                                null ||
                              assignment.heuresReposAvant ===
                                undefined ? (

                                <span className="text-[10px] text-slate-400">
                                  Non calculé
                                </span>

                              ) : (

                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">

                                  <Clock3 className="h-3 w-3" />

                                  {assignment.heuresReposAvant.toFixed(
                                    1,
                                  )} h

                                </span>

                              )}

                            </td>

                            <td className="px-4 py-4">

                              <div className="flex justify-end gap-1.5">

                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditModal(
                                      assignment,
                                    )
                                  }
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-sky-50 hover:text-sky-700"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
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
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                                >

                                  {deletingId ===
                                  assignment.id ? (

                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />

                                  ) : (

                                    <Trash2 className="h-3.5 w-3.5" />

                                  )}

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

        {/* MODAL */}

        {modalOpen && (

          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          >

            <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">

              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">

                <div>

                  <h2 className="text-base font-black text-slate-950">
                    {editingId
                      ? 'Modifier l’affectation'
                      : 'Nouvelle affectation'}
                  </h2>

                  <p className="mt-1 text-[10px] text-slate-400">
                    Sélection du vol, du membre et de sa fonction à bord.
                  </p>

                </div>

                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  disabled={
                    saving
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>

              </div>

              <form
                onSubmit={
                  handleSubmit
                }
                className="space-y-4 p-5"
              >

                {/* VOL */}

                <label className="block">

                  <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-slate-400">
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
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-emerald-600"
                  >

                    <option value="">
                      Sélectionner un vol
                    </option>

                    {assignableFlights.map(
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
                            flight.id}
                          {' — '}
                          {flight.aeroportDepart ??
                            '?'}
                          {' → '}
                          {flight.aeroportArrivee ??
                            '?'}
                          {' — '}
                          {formatDateTime(
                            flight.heureDepart,
                          )}
                        </option>

                      ),
                    )}

                  </select>

                </label>

                {/* MEMBER */}

                <label className="block">

                  <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-slate-400">
                    Membre d’équipage *
                  </span>

                  <select
                    required
                    value={
                      form.utilisateurId
                    }
                    disabled={
                      loadingUsers
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
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >

                    <option value="">
                      {loadingUsers
                        ? 'Chargement des membres...'
                        : users.length ===
                            0
                          ? 'Aucun membre disponible'
                          : 'Sélectionner un membre'}
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
                          {user.nom} — {user.email}
                        </option>

                      ),
                    )}

                  </select>

                  {!loadingUsers &&
                    users.length ===
                      0 && (

                    <p className="mt-1.5 text-[9px] font-semibold text-amber-600">
                      Aucun utilisateur Crew_Member actif et approuvé n’a été retourné par l’API.
                    </p>

                  )}

                </label>

                {/* ROLE */}

                <label className="block">

                  <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-slate-400">
                    Fonction à bord *
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
                            event.target.value as CrewRole,
                        }),
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-emerald-600"
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

                {/* VALIDATION INFO */}

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">

                  <div className="flex items-start gap-2">

                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

                    <p className="text-[10px] font-medium leading-5 text-amber-900">
                      Le serveur vérifie automatiquement les doublons, les chevauchements d’équipage et le temps minimal de repos.
                    </p>

                  </div>

                </div>

                {/* ACTIONS */}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">

                  <button
                    type="button"
                    onClick={
                      closeModal
                    }
                    disabled={
                      saving
                    }
                    className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Annuler
                  </button>

                  <button
                    type="submit"
                    disabled={
                      saving ||
                      loadingUsers ||
                      users.length ===
                        0
                    }
                    className="inline-flex h-10 min-w-[130px] items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >

                    {saving ? (

                      <RefreshCw className="h-4 w-4 animate-spin" />

                    ) : (

                      <Save className="h-4 w-4" />

                    )}

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

export default CrewAssignmentsPage;