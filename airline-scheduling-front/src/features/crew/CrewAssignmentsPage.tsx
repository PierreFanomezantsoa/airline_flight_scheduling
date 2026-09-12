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

const CREW_ASSIGNMENTS_ENDPOINT =
  '/crew-assignments';

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
  heuresReposAvant?: number | null;
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
  Record<CrewRole, string> = {
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

  return [
    'scheduled',
    'planifie',
    'delayed',
    'retarde',
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

function getFlightStatusStyle(
  status?: string,
): string {
  const normalized =
    normalizeStatus(
      status,
    );

  if (
    [
      'delayed',
      'retarde',
    ].includes(
      normalized,
    )
  ) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  if (
    [
      'cancelled',
      'annule',
    ].includes(
      normalized,
    )
  ) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  if (
    normalized ===
    'effectue'
  ) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (
    [
      'in-flight',
      'en vol',
    ].includes(
      normalized,
    )
  ) {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-600';
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
    return typeof data.message ===
      'string'
      ? data.message
      : 'Ce membre est déjà affecté à un autre vol pendant cette période.';
  }

  if (
    data.code ===
    'CREW_REST'
  ) {
    return typeof data.message ===
      'string'
      ? data.message
      : 'Le temps minimal de repos équipage n’est pas respecté.';
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
      data.message.message ||
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
    const payload =
      await getErrorPayload(
        response,
      );

    throw new Error(
      extractApiError(
        payload,
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
 * KPI
 * ========================================================================== */

function MetricCard({
  label,
  value,
  icon,
  subtitle,
}: {
  label: string;
  value:
    string | number;
  icon:
    React.ReactNode;
  subtitle?: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">

      <div className="flex items-start justify-between gap-3">

        <div className="min-w-0">

          <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {label}
          </span>

          <p className="mt-1.5 text-2xl font-black tabular-nums text-slate-950 sm:text-3xl">
            {value}
          </p>

          {subtitle && (
            <p className="mt-1 text-[11px] font-medium leading-4 text-slate-500 sm:text-xs">
              {subtitle}
            </p>
          )}

        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
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
    /* ========================================================================
     * STATES
     * ====================================================================== */

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
      >(null);

    const [
      assignmentToDelete,
      setAssignmentToDelete,
    ] =
      useState<
        CrewAssignment | null
      >(null);

    const [
      editingId,
      setEditingId,
    ] =
      useState<
        string | null
      >(null);

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
      >(null);

    const [
      form,
      setForm,
    ] =
      useState<CrewForm>({
        volId: '',
        utilisateurId: '',
        fonction: 'Other',
      });

    /* ========================================================================
     * LOAD MEMBERS
     * ====================================================================== */

    const loadCrewMembers =
      useCallback(
        async () => {
          setLoadingUsers(
            true,
          );

          try {
            const result =
              await getCrewMembers();

            const members =
              normalizeArray<
                PublicUser
              >(
                result,
              );

            const filtered =
              members.filter(
                (
                  user,
                ) =>
                  user.role ===
                    'Crew_Member' &&
                  user.actif !==
                    false &&
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
                  'Aucun membre d’équipage actif et approuvé n’est actuellement disponible.',
              });
            }
          } catch (
            error:
              unknown
          ) {
            setUsers([]);

            setMessage({
              type:
                'error',

              text:
                error instanceof Error
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

    /* ========================================================================
     * LOAD DATA
     * ====================================================================== */

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
                  CREW_ASSIGNMENTS_ENDPOINT,
                ),

                requestJson<
                  unknown
                >(
                  FLIGHTS_ENDPOINT,
                ),
              ]);

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
            }
          } catch (
            error:
              unknown
          ) {
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

    /* ========================================================================
     * INITIAL LOAD
     * ====================================================================== */

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

    /* ========================================================================
     * AUTO REFRESH
     * ====================================================================== */

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
      ],
    );

    /* ========================================================================
     * MODAL BODY LOCK + ESCAPE
     * ====================================================================== */

    useEffect(
      () => {
        const hasOpenModal =
          modalOpen ||
          Boolean(
            assignmentToDelete,
          );

        if (
          !hasOpenModal
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
              event.key !==
              'Escape'
            ) {
              return;
            }

            if (
              saving ||
              deletingId
            ) {
              return;
            }

            if (
              assignmentToDelete
            ) {
              setAssignmentToDelete(
                null,
              );

              return;
            }

            setModalOpen(
              false,
            );

            setEditingId(
              null,
            );
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
      },
      [
        modalOpen,
        assignmentToDelete,
        saving,
        deletingId,
      ],
    );

    /* ========================================================================
     * DERIVED
     * ====================================================================== */

    const assignableFlights =
      useMemo(
        () => {
          const currentFlightId =
            editingId
              ? form.volId
              : null;

          return flights.filter(
            (
              flight,
            ) =>
              isAssignableFlight(
                flight,
              ) ||
              flight.id ===
                currentFlightId,
          );
        },
        [
          flights,
          editingId,
          form.volId,
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

              const text =
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

              return (
                (
                  !term ||
                  text.includes(
                    term,
                  )
                ) &&
                (
                  selectedFlightId ===
                    'TOUS' ||
                  flightId ===
                    selectedFlightId
                ) &&
                (
                  selectedUserId ===
                    'TOUS' ||
                  userId ===
                    selectedUserId
                )
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

    const modalUsers =
      useMemo(
        () => {
          if (
            !editingId
          ) {
            return users;
          }

          const assignment =
            assignments.find(
              (
                item,
              ) =>
                item.id ===
                editingId,
            );

          const currentUser =
            assignment
              ?.utilisateur;

          if (
            !currentUser ||
            users.some(
              (
                user,
              ) =>
                user.id ===
                currentUser.id,
            )
          ) {
            return users;
          }

          return [
            currentUser,
            ...users,
          ];
        },
        [
          users,
          assignments,
          editingId,
        ],
      );

    /* ========================================================================
     * CREATE / EDIT MODAL
     * ====================================================================== */

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

    /* ========================================================================
     * SAVE
     * ====================================================================== */

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
          ) &&
          !editingId
        ) {
          setMessage({
            type:
              'error',

            text:
              'Ce vol ne peut plus recevoir une nouvelle affectation équipage.',
          });

          return;
        }

        const selectedUser =
          modalUsers.find(
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

          await requestJson<
            CrewAssignment
          >(
            isEdit
              ? `${CREW_ASSIGNMENTS_ENDPOINT}/${editingId}`
              : CREW_ASSIGNMENTS_ENDPOINT,

            {
              method:
                isEdit
                  ? 'PATCH'
                  : 'POST',

              body:
                JSON.stringify({
                  volId:
                    form.volId,

                  utilisateurId:
                    form.utilisateurId,

                  fonction:
                    form.fonction,
                }),
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
          setMessage({
            type:
              'error',

            text:
              error instanceof Error
                ? error.message
                : 'Impossible d’enregistrer l’affectation.',
          });
        } finally {
          setSaving(
            false,
          );
        }
      };

    /* ========================================================================
     * DELETE MODAL
     * ====================================================================== */

    const handleDelete =
      (
        assignment:
          CrewAssignment,
      ) => {
        if (
          deletingId
        ) {
          return;
        }

        setAssignmentToDelete(
          assignment,
        );
      };

    const closeDeleteModal =
      () => {
        if (
          deletingId
        ) {
          return;
        }

        setAssignmentToDelete(
          null,
        );
      };

    const confirmDelete =
      async () => {
        if (
          !assignmentToDelete ||
          deletingId
        ) {
          return;
        }

        const assignment =
          assignmentToDelete;

        setDeletingId(
          assignment.id,
        );

        setMessage(
          null,
        );

        try {
          await requestJson(
            `${CREW_ASSIGNMENTS_ENDPOINT}/${assignment.id}`,

            {
              method:
                'DELETE',
            },
          );

          setAssignmentToDelete(
            null,
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
          setMessage({
            type:
              'error',

            text:
              error instanceof Error
                ? error.message
                : 'Impossible de supprimer cette affectation.',
          });
        } finally {
          setDeletingId(
            null,
          );
        }
      };

    /* ========================================================================
     * RENDER
     * ====================================================================== */

    return (
      <div className="min-h-screen bg-slate-100 p-2.5 text-slate-800 sm:p-5 lg:p-6">

        <div className="mx-auto max-w-[1500px] space-y-3 sm:space-y-4">

          {/* ================================================================ */}
          {/* HEADER                                                           */}
          {/* ================================================================ */}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">

              <div className="flex items-start gap-3">

                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white sm:h-12 sm:w-12">

                  <Users className="h-5 w-5" />

                  <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400" />

                </div>

                <div className="min-w-0">

                  <div className="flex flex-wrap items-center gap-2">

                    <h1 className="text-lg font-black tracking-tight text-slate-950 sm:text-xl">
                      Gestion des équipages
                    </h1>

                    <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                      OCC
                    </span>

                  </div>

                  <p className="mt-1 max-w-xl text-xs font-medium leading-5 text-slate-500 sm:text-sm">
                    Affectations, fonctions à bord, chevauchements et suivi du repos.
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
                  disabled={
                    loading ||
                    loadingUsers
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 sm:h-10 sm:px-4 sm:text-sm"
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
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white transition hover:bg-emerald-800 sm:h-10 sm:px-4 sm:text-sm"
                >

                  <UserPlus className="h-4 w-4" />

                  <span className="sm:hidden">
                    Affecter
                  </span>

                  <span className="hidden sm:inline">
                    Nouvelle affectation
                  </span>

                </button>

              </div>

            </div>

            <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/80 sm:flex sm:flex-wrap sm:gap-6 sm:px-5 sm:py-3">

              <div className="border-r border-slate-200 px-3 py-2.5 sm:border-0 sm:p-0">

                <span className="block text-[10px] font-semibold uppercase text-slate-400 sm:hidden">
                  Vols
                </span>

                <span className="text-xs font-semibold text-slate-600">

                  <strong className="text-sm text-slate-900">
                    {assignableFlights.length}
                  </strong>{' '}

                  disponibles

                </span>

              </div>

              <div className="px-3 py-2.5 sm:p-0">

                <span className="block text-[10px] font-semibold uppercase text-slate-400 sm:hidden">
                  Membres
                </span>

                <span className="text-xs font-semibold text-slate-600">

                  <strong className="text-sm text-slate-900">
                    {users.length}
                  </strong>{' '}

                  disponibles

                </span>

              </div>

            </div>

          </section>

          {/* ================================================================ */}
          {/* MESSAGE                                                          */}
          {/* ================================================================ */}

          {message && (

            <div
              className={`flex items-start justify-between gap-3 rounded-2xl border p-3.5 sm:p-4 ${
                message.type ===
                'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : message.type ===
                      'info'
                    ? 'border-sky-200 bg-sky-50 text-sky-900'
                    : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >

              <div className="flex min-w-0 items-start gap-2 text-xs font-semibold leading-5 sm:text-sm">

                {message.type ===
                'success' ? (

                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 sm:h-5 sm:w-5" />

                ) : (

                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 sm:h-5 sm:w-5" />

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
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-black/5"
              >

                <X className="h-4 w-4" />

              </button>

            </div>

          )}

          {/* ================================================================ */}
          {/* KPI                                                              */}
          {/* ================================================================ */}

          <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">

            <MetricCard
              label="Affectations"
              value={
                assignments.length
              }
              subtitle="Total"
              icon={
                <Users className="h-4 w-4" />
              }
            />

            <MetricCard
              label="Membres"
              value={
                uniqueCrewCount
              }
              subtitle="Affectés"
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
              label="Repos"
              value={
                withRestInfo
              }
              subtitle="Renseignés"
              icon={
                <Clock3 className="h-4 w-4" />
              }
            />

          </section>

          {/* ================================================================ */}
          {/* FILTERS                                                          */}
          {/* ================================================================ */}

          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">

            <div className="grid gap-2.5 md:grid-cols-3">

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
                  placeholder="Vol, membre ou fonction..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10"
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
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-600"
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
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-600 disabled:opacity-50"
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

          {/* ================================================================ */}
          {/* ASSIGNMENTS                                                      */}
          {/* ================================================================ */}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">

              <div className="min-w-0">

                <h2 className="text-sm font-black text-slate-900 sm:text-base">
                  Affectations équipage
                </h2>

                <p className="mt-1 text-[11px] leading-4 text-slate-500 sm:text-xs">
                  Vol, membre, fonction et repos avant rotation.
                </p>

              </div>

              <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                {filteredAssignments.length}
              </span>

            </div>

            {/* ============================================================ */}
            {/* MOBILE CARDS                                                 */}
            {/* ============================================================ */}

            <div className="md:hidden">

              {loading ? (

                <div className="flex min-h-[180px] items-center justify-center">

                  <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">

                    <RefreshCw className="h-4 w-4 animate-spin" />

                    Chargement...

                  </span>

                </div>

              ) : filteredAssignments.length ===
                0 ? (

                <div className="flex min-h-[180px] items-center justify-center px-5 text-center">

                  <div>

                    <Users className="mx-auto h-9 w-9 text-slate-300" />

                    <p className="mt-2 text-sm font-bold text-slate-700">
                      Aucune affectation
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Modifiez les filtres ou créez une nouvelle affectation.
                    </p>

                  </div>

                </div>

              ) : (

                <div className="divide-y divide-slate-100">

                  {filteredAssignments.map(
                    (
                      assignment,
                    ) => {
                      const flight =
                        assignment.vol;

                      const user =
                        assignment.utilisateur;

                      return (

                        <article
                          key={
                            assignment.id
                          }
                          className="bg-white p-4"
                        >

                          {/* TOP */}

                          <div className="flex items-start justify-between gap-3">

                            <div className="flex min-w-0 items-center gap-3">

                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">

                                <Plane className="h-4 w-4" />

                              </div>

                              <div className="min-w-0">

                                <p className="text-base font-black text-slate-900">

                                  {flight?.numeroVol ??
                                    getAssignmentFlightId(
                                      assignment,
                                    )}

                                </p>

                                <span
                                  className={`mt-1 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${getFlightStatusStyle(
                                    flight?.statut,
                                  )}`}
                                >
                                  {flight?.statut ??
                                    'Statut inconnu'}
                                </span>

                              </div>

                            </div>

                            <div className="flex gap-1.5">

                              <button
                                type="button"
                                onClick={() =>
                                  openEditModal(
                                    assignment,
                                  )
                                }
                                aria-label="Modifier"
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition active:bg-sky-50"
                              >

                                <Pencil className="h-4 w-4" />

                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleDelete(
                                    assignment,
                                  )
                                }
                                aria-label="Supprimer"
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-rose-500 transition hover:border-rose-200 hover:bg-rose-50"
                              >

                                <Trash2 className="h-4 w-4" />

                              </button>

                            </div>

                          </div>

                          {/* ROUTE */}

                          <div className="mt-4 rounded-xl bg-slate-50 p-3">

                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Itinéraire
                            </span>

                            <div className="mt-1.5 flex items-center gap-2 font-mono text-sm font-bold text-slate-800">

                              <span>
                                {flight?.aeroportDepart ??
                                  '--'}
                              </span>

                              <ArrowRight className="h-4 w-4 text-slate-300" />

                              <span>
                                {flight?.aeroportArrivee ??
                                  '--'}
                              </span>

                            </div>

                          </div>

                          {/* MEMBER */}

                          <div className="mt-3 rounded-xl border border-slate-200 p-3">

                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Membre d’équipage
                            </span>

                            <div className="mt-2 flex items-start gap-2.5">

                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">

                                <Users className="h-4 w-4" />

                              </div>

                              <div className="min-w-0">

                                <p className="truncate text-sm font-bold text-slate-900">

                                  {user?.nom ??
                                    'Utilisateur'}

                                </p>

                                <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">

                                  <Mail className="h-3.5 w-3.5 shrink-0" />

                                  <span className="truncate">

                                    {user?.email ??
                                      getAssignmentUserId(
                                        assignment,
                                      )}

                                  </span>

                                </p>

                              </div>

                            </div>

                          </div>

                          {/* GRID */}

                          <div className="mt-3 grid grid-cols-2 gap-2">

                            <div className="rounded-xl border border-slate-200 p-3">

                              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                Fonction
                              </span>

                              <span className="mt-1.5 block text-xs font-bold leading-5 text-sky-700">

                                {formatRole(
                                  assignment.fonction,
                                )}

                              </span>

                            </div>

                            <div className="rounded-xl border border-slate-200 p-3">

                              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                Repos avant
                              </span>

                              {assignment.heuresReposAvant ===
                                null ||
                              assignment.heuresReposAvant ===
                                undefined ? (

                                <span className="mt-1.5 block text-xs font-medium text-slate-400">
                                  Non calculé
                                </span>

                              ) : (

                                <span className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">

                                  <Clock3 className="h-4 w-4" />

                                  {assignment.heuresReposAvant.toFixed(
                                    1,
                                  )}
                                  {' h'}

                                </span>

                              )}

                            </div>

                          </div>

                          {/* DATE */}

                          <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">

                            <Clock3 className="h-4 w-4 text-slate-400" />

                            <div>

                              <span className="block text-[10px] font-bold uppercase text-slate-400">
                                Départ du vol
                              </span>

                              <span className="mt-0.5 block text-sm font-semibold text-slate-700">

                                {formatDateTime(
                                  flight?.heureDepart,
                                )}

                              </span>

                            </div>

                          </div>

                        </article>

                      );
                    },
                  )}

                </div>

              )}

            </div>

            {/* ============================================================ */}
            {/* DESKTOP TABLE                                                */}
            {/* ============================================================ */}

            <div className="hidden overflow-x-auto md:block">

              <table className="w-full min-w-[1100px] text-left">

                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">

                  <tr>

                    <th className="px-4 py-3.5">
                      Vol
                    </th>

                    <th className="px-4 py-3.5">
                      Itinéraire
                    </th>

                    <th className="px-4 py-3.5">
                      Membre
                    </th>

                    <th className="px-4 py-3.5">
                      Fonction
                    </th>

                    <th className="px-4 py-3.5">
                      Départ
                    </th>

                    <th className="px-4 py-3.5">
                      Repos avant
                    </th>

                    <th className="px-4 py-3.5 text-right">
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
                        className="px-4 py-14 text-center"
                      >

                        <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">

                          <RefreshCw className="h-4 w-4 animate-spin" />

                          Chargement des affectations...

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
                        className="px-4 py-14 text-center"
                      >

                        <Users className="mx-auto h-8 w-8 text-slate-300" />

                        <p className="mt-2 text-sm font-semibold text-slate-600">
                          Aucune affectation trouvée
                        </p>

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

                            {/* VOL */}

                            <td className="px-4 py-4">

                              <div className="flex items-center gap-3">

                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">

                                  <Plane className="h-4 w-4" />

                                </div>

                                <div>

                                  <p className="text-sm font-black text-slate-900">

                                    {flight?.numeroVol ??
                                      getAssignmentFlightId(
                                        assignment,
                                      )}

                                  </p>

                                  <span
                                    className={`mt-1 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${getFlightStatusStyle(
                                      flight?.statut,
                                    )}`}
                                  >
                                    {flight?.statut ??
                                      'Inconnu'}
                                  </span>

                                </div>

                              </div>

                            </td>

                            {/* ROUTE */}

                            <td className="px-4 py-4">

                              <span className="font-mono text-sm font-semibold text-slate-700">

                                {flight?.aeroportDepart ??
                                  '--'}
                                {' → '}
                                {flight?.aeroportArrivee ??
                                  '--'}

                              </span>

                            </td>

                            {/* MEMBER */}

                            <td className="px-4 py-4">

                              <p className="text-sm font-bold text-slate-800">

                                {user?.nom ??
                                  'Utilisateur'}

                              </p>

                              <p className="mt-1 text-xs text-slate-500">

                                {user?.email ??
                                  getAssignmentUserId(
                                    assignment,
                                  )}

                              </p>

                            </td>

                            {/* ROLE */}

                            <td className="px-4 py-4">

                              <span className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700">

                                {formatRole(
                                  assignment.fonction,
                                )}

                              </span>

                            </td>

                            {/* DATE */}

                            <td className="px-4 py-4 text-sm font-medium text-slate-600">

                              {formatDateTime(
                                flight?.heureDepart,
                              )}

                            </td>

                            {/* REST */}

                            <td className="px-4 py-4">

                              {assignment.heuresReposAvant ===
                                null ||
                              assignment.heuresReposAvant ===
                                undefined ? (

                                <span className="text-xs font-medium text-slate-400">
                                  Non calculé
                                </span>

                              ) : (

                                <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">

                                  <Clock3 className="h-3.5 w-3.5" />

                                  {assignment.heuresReposAvant.toFixed(
                                    1,
                                  )}{' '}
                                  h

                                </span>

                              )}

                            </td>

                            {/* ACTIONS */}

                            <td className="px-4 py-4">

                              <div className="flex justify-end gap-2">

                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditModal(
                                      assignment,
                                    )
                                  }
                                  title="Modifier"
                                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                                >

                                  <Pencil className="h-4 w-4" />

                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDelete(
                                      assignment,
                                    )
                                  }
                                  title="Supprimer"
                                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
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

        {/* ================================================================== */}
        {/* MODAL CREATE / EDIT                                                */}
        {/* ================================================================== */}

        {modalOpen && (

          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-[2px] sm:items-center sm:p-5"
            onMouseDown={(
              event,
            ) => {
              if (
                event.currentTarget ===
                  event.target &&
                !saving
              ) {
                closeModal();
              }
            }}
          >

            <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-[620px] sm:rounded-2xl">

              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

              {/* HEADER */}

              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">

                <div className="flex min-w-0 items-center gap-3">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 sm:h-11 sm:w-11">

                    {editingId ? (

                      <Pencil className="h-5 w-5" />

                    ) : (

                      <UserPlus className="h-5 w-5" />

                    )}

                  </div>

                  <div className="min-w-0">

                    <h2 className="text-base font-black text-slate-950 sm:text-lg">

                      {editingId
                        ? 'Modifier l’affectation'
                        : 'Nouvelle affectation'}

                    </h2>

                    <p className="mt-0.5 text-[11px] leading-4 text-slate-500 sm:text-xs">
                      Vol, membre et fonction à bord.
                    </p>

                  </div>

                </div>

                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  disabled={
                    saving
                  }
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                >

                  <X className="h-4 w-4" />

                </button>

              </div>

              {/* FORM */}

              <form
                onSubmit={
                  handleSubmit
                }
                className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6"
              >

                {/* VOL */}

                <label className="block">

                  <span className="mb-2 block text-xs font-bold text-slate-700">

                    Vol

                    <span className="ml-1 text-rose-500">
                      *
                    </span>

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
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
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

                        </option>

                      ),
                    )}

                  </select>

                </label>

                {/* MEMBER */}

                <label className="block">

                  <div className="mb-2 flex items-center justify-between">

                    <span className="text-xs font-bold text-slate-700">
                      Membre d’équipage *
                    </span>

                    {!loadingUsers && (

                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">

                        {modalUsers.length}{' '}

                        disponible
                        {modalUsers.length >
                        1
                          ? 's'
                          : ''}

                      </span>

                    )}

                  </div>

                  <div className="relative">

                    <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <select
                      required
                      value={
                        form.utilisateurId
                      }
                      disabled={
                        loadingUsers ||
                        modalUsers.length ===
                          0
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
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 disabled:bg-slate-100"
                    >

                      <option value="">

                        {loadingUsers
                          ? 'Chargement...'
                          : modalUsers.length ===
                              0
                            ? 'Aucun membre disponible'
                            : 'Sélectionner un membre'}

                      </option>

                      {modalUsers.map(
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

                            {user.nom}
                            {' — '}
                            {user.email}

                          </option>

                        ),
                      )}

                    </select>

                  </div>

                  {!loadingUsers &&
                    modalUsers.length ===
                      0 && (

                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">

                      <p className="text-xs font-bold text-amber-900">
                        Aucun membre disponible
                      </p>

                      <p className="mt-1 text-xs leading-5 text-amber-700">
                        Vérifiez le rôle Crew_Member, le statut APPROVED et l’activation du compte.
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          void loadCrewMembers()
                        }
                        className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-700"
                      >

                        <RefreshCw className="h-3.5 w-3.5" />

                        Recharger

                      </button>

                    </div>

                  )}

                </label>

                {/* ROLE */}

                <label className="block">

                  <span className="mb-2 block text-xs font-bold text-slate-700">
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
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
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

                {/* INFO */}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">

                  <div className="flex items-start gap-2.5">

                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />

                    <div>

                      <p className="text-sm font-bold text-slate-800">
                        Contrôles opérationnels
                      </p>

                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Les chevauchements et le repos minimal sont vérifiés avant l’enregistrement.
                      </p>

                    </div>

                  </div>

                </div>

                {/* ACTIONS */}

                <div className="sticky bottom-0 -mx-4 -mb-4 grid grid-cols-2 gap-2 border-t border-slate-100 bg-white px-4 py-4 sm:-mx-6 sm:-mb-6 sm:flex sm:justify-end sm:px-6">

                  <button
                    type="button"
                    onClick={
                      closeModal
                    }
                    disabled={
                      saving
                    }
                    className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Annuler
                  </button>

                  <button
                    type="submit"
                    disabled={
                      saving ||
                      loadingUsers ||
                      modalUsers.length ===
                        0
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50 sm:min-w-[140px]"
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

        {/* ================================================================== */}
        {/* DELETE CONFIRMATION MODAL                                          */}
        {/* ================================================================== */}

        {assignmentToDelete && (

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-assignment-title"
            className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 backdrop-blur-[2px] sm:items-center sm:p-5"
            onMouseDown={(
              event,
            ) => {
              if (
                event.currentTarget ===
                  event.target &&
                !deletingId
              ) {
                closeDeleteModal();
              }
            }}
          >

            <div className="w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-[480px] sm:rounded-2xl">

              {/* MOBILE HANDLE */}

              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

              {/* HEADER */}

              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">

                <div className="flex min-w-0 items-start gap-3">

                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">

                    <Trash2 className="h-5 w-5" />

                  </div>

                  <div className="min-w-0">

                    <h2
                      id="delete-assignment-title"
                      className="text-base font-black text-slate-950 sm:text-lg"
                    >
                      Supprimer l’affectation
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Vérifiez les informations avant de confirmer la suppression.
                    </p>

                  </div>

                </div>

                <button
                  type="button"
                  onClick={
                    closeDeleteModal
                  }
                  disabled={
                    Boolean(
                      deletingId,
                    )
                  }
                  aria-label="Fermer"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                >

                  <X className="h-4 w-4" />

                </button>

              </div>

              {/* BODY */}

              <div className="p-5 sm:p-6">

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">

                  {/* CREW */}

                  <div className="flex items-start gap-3">

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 ring-1 ring-slate-200">

                      <Users className="h-4 w-4" />

                    </div>

                    <div className="min-w-0">

                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Membre d’équipage
                      </span>

                      <p className="mt-1 truncate text-sm font-bold text-slate-900">

                        {assignmentToDelete.utilisateur?.nom ??
                          'Utilisateur'}

                      </p>

                      {assignmentToDelete.utilisateur?.email && (

                        <p className="mt-0.5 truncate text-xs text-slate-500">

                          {assignmentToDelete.utilisateur.email}

                        </p>

                      )}

                    </div>

                  </div>

                  <div className="my-4 border-t border-slate-200" />

                  {/* FLIGHT + ROLE */}

                  <div className="grid grid-cols-2 gap-4">

                    <div>

                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Vol
                      </span>

                      <div className="mt-1.5 flex items-center gap-2">

                        <Plane className="h-4 w-4 text-emerald-700" />

                        <span className="font-mono text-sm font-black text-slate-900">

                          {assignmentToDelete.vol?.numeroVol ??
                            getAssignmentFlightId(
                              assignmentToDelete,
                            )}

                        </span>

                      </div>

                    </div>

                    <div>

                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Fonction
                      </span>

                      <span className="mt-1.5 block text-sm font-bold text-sky-700">

                        {formatRole(
                          assignmentToDelete.fonction,
                        )}

                      </span>

                    </div>

                  </div>

                  {/* ROUTE */}

                  <div className="mt-4">

                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Itinéraire
                    </span>

                    <div className="mt-1.5 flex items-center gap-2 font-mono text-sm font-bold text-slate-700">

                      <span>

                        {assignmentToDelete.vol?.aeroportDepart ??
                          '--'}

                      </span>

                      <ArrowRight className="h-4 w-4 text-slate-300" />

                      <span>

                        {assignmentToDelete.vol?.aeroportArrivee ??
                          '--'}

                      </span>

                    </div>

                  </div>

                  {/* DEPARTURE */}

                  <div className="mt-4">

                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Départ
                    </span>

                    <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">

                      <Clock3 className="h-4 w-4 text-slate-400" />

                      {formatDateTime(
                        assignmentToDelete.vol?.heureDepart,
                      )}

                    </div>

                  </div>

                </div>

                {/* WARNING */}

                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5">

                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />

                  <div>

                    <p className="text-xs font-bold text-rose-900">
                      Confirmation requise
                    </p>

                    <p className="mt-1 text-xs leading-5 text-rose-700">
                      Cette opération supprimera l’affectation de ce membre au vol. Elle ne supprime ni le membre d’équipage ni le vol.
                    </p>

                  </div>

                </div>

              </div>

              {/* ACTIONS */}

              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex sm:justify-end sm:px-6">

                <button
                  type="button"
                  onClick={
                    closeDeleteModal
                  }
                  disabled={
                    Boolean(
                      deletingId,
                    )
                  }
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[110px]"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void confirmDelete()
                  }
                  disabled={
                    Boolean(
                      deletingId,
                    )
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[150px]"
                >

                  {deletingId ? (

                    <RefreshCw className="h-4 w-4 animate-spin" />

                  ) : (

                    <Trash2 className="h-4 w-4" />

                  )}

                  {deletingId
                    ? 'Suppression...'
                    : 'Supprimer'}

                </button>

              </div>

            </div>

          </div>

        )}

      </div>
    );
  };

export default CrewAssignmentsPage;