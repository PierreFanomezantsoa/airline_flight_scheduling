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
  | {
      kind: 'success' | 'error';

      message: string;
    }
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
  {
    value: AircraftStatus.ACTIVE,
    label: 'Actif',
  },

  {
    value: AircraftStatus.MAINTENANCE,
    label: 'Maintenance',
  },

  {
    value: AircraftStatus.OUT_OF_SERVICE,
    label: 'Hors service',
  },

  {
    value: AircraftStatus.RETIRED,
    label: 'Retiré',
  },
];

// =============================================================================
// STYLE INPUT
// =============================================================================

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15';

// =============================================================================
// LECTURE ERREUR BACKEND
// =============================================================================

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload: unknown =
      await response.json();

    if (
      payload &&
      typeof payload === 'object'
    ) {
      const data =
        payload as {
          message?: string | string[];

          error?: string;
        };

      if (
        Array.isArray(
          data.message,
        )
      ) {
        const message =
          data.message
            .filter(
              (
                item,
              ): item is string =>
                typeof item ===
                'string',
            )
            .join(' ')
            .trim();

        if (
          message
        ) {
          return message;
        }
      }

      if (
        typeof data.message ===
          'string' &&
        data.message.trim()
      ) {
        return data.message.trim();
      }

      if (
        typeof data.error ===
          'string' &&
        data.error.trim()
      ) {
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
  fallback =
    'Une erreur est survenue.',
): string {
  if (
    error instanceof ApiError
  ) {
    if (
      error.status === 0
    ) {
      return (
        'Impossible de communiquer avec le serveur. ' +
        'Vérifiez que le backend est démarré et que la configuration CORS est correcte.'
      );
    }

    if (
      error.status === 401
    ) {
      return (
        'Votre session est invalide ou a expiré. ' +
        'Veuillez vous reconnecter.'
      );
    }

    if (
      error.status === 403
    ) {
      return (
        "Vous n'avez pas les autorisations nécessaires pour accéder à cette fonctionnalité."
      );
    }

    return (
      error.message ||
      fallback
    );
  }

  if (
    error instanceof Error
  ) {
    return (
      error.message ||
      fallback
    );
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
  const response =
    await authFetch(
      path,
      options,
    );

  if (
    response.status === 204
  ) {
    return undefined as T;
  }

  if (
    !response.ok
  ) {
    const message =
      await readErrorMessage(
        response,
        'Une erreur serveur est survenue.',
      );

    throw new ApiError(
      message,
      response.status,
    );
  }

  try {
    return (
      await response.json()
    ) as T;
  } catch {
    throw new Error(
      'Le serveur a retourné une réponse JSON invalide.',
    );
  }
}

// =============================================================================
// SYNCHRONISATION MAINTENANCES TERMINÉES
// =============================================================================

async function syncExpiredMaintenances(
  signal?: AbortSignal,
): Promise<void> {
  try {
    const response =
      await authFetch(
        '/maintenance/sync-expired',
        {
          method:
            'PATCH',

          signal,
        },
      );

    if (
      !response.ok
    ) {
      const message =
        await readErrorMessage(
          response,
          'Synchronisation automatique des maintenances impossible.',
        );

      console.warn(
        '[AircraftManagement] Maintenance sync :',
        message,
      );
    }
  } catch (
    error: unknown
  ) {
    // Une erreur d'authentification doit remonter.
    if (
      error instanceof ApiError &&
      (
        error.status === 401 ||
        error.status === 403
      )
    ) {
      throw error;
    }

    if (
      error instanceof DOMException &&
      error.name === 'AbortError'
    ) {
      throw error;
    }

    /*
     * Une panne uniquement liée à la synchronisation maintenance
     * ne doit pas empêcher l'affichage de la flotte.
     */
    console.warn(
      '[AircraftManagement] Synchronisation maintenance ignorée :',
      error,
    );
  }
}

// =============================================================================
// FORMAT NOMBRE
// =============================================================================

function formatNumber(
  value: number,
  digits = 1,
): string {
  return new Intl.NumberFormat(
    'fr-FR',
    {
      maximumFractionDigits:
        digits,
    },
  ).format(
    Number.isFinite(
      value,
    )
      ? value
      : 0,
  );
}

// =============================================================================
// FORMAT DATE
// =============================================================================

function formatDate(
  value?: string | null,
): string {
  if (
    !value
  ) {
    return 'Jamais';
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return 'Date inconnue';
  }

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      day:
        '2-digit',

      month:
        '2-digit',

      year:
        'numeric',
    },
  ).format(
    date,
  );
}

// =============================================================================
// RATIO MAINTENANCE
// =============================================================================

function maintenanceRatio(
  aircraft: Aircraft,
): number {
  const current =
    Number(
      aircraft.heuresDepuisDerniereMaintenance,
    );

  const limit =
    Number(
      aircraft.limiteHeuresMaintenance,
    );

  if (
    !Number.isFinite(
      current,
    ) ||
    !Number.isFinite(
      limit,
    ) ||
    limit <= 0
  ) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      Math.round(
        (
          current /
          limit
        ) *
          100,
      ),
    ),
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AircraftManagement() {
  // ===========================================================================
  // DONNÉES
  // ===========================================================================

  const [
    aircrafts,
    setAircrafts,
  ] =
    useState<
      Aircraft[]
    >(
      [],
    );

  const [
    types,
    setTypes,
  ] =
    useState<
      AircraftType[]
    >(
      [],
    );

  const [
    statistics,
    setStatistics,
  ] =
    useState<
      FleetStatistics | null
    >(
      null,
    );

  // ===========================================================================
  // ÉTATS UI
  // ===========================================================================

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false,
    );

  const [
    actionAircraftId,
    setActionAircraftId,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    searchTerm,
    setSearchTerm,
  ] =
    useState(
      '',
    );

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<
      AircraftStatus | 'ALL'
    >(
      'ALL',
    );

  const [
    notice,
    setNotice,
  ] =
    useState<Notice>(
      null,
    );

  // ===========================================================================
  // MODAL CREATE / UPDATE
  // ===========================================================================

  const [
    isModalOpen,
    setIsModalOpen,
  ] =
    useState(
      false,
    );

  const [
    editingAircraft,
    setEditingAircraft,
  ] =
    useState<
      Aircraft | null
    >(
      null,
    );

  const [
    formData,
    setFormData,
  ] =
    useState<AircraftFormData>(
      EMPTY_FORM,
    );

  // ===========================================================================
  // MODAL HEURES
  // ===========================================================================

  const [
    hoursAircraft,
    setHoursAircraft,
  ] =
    useState<
      Aircraft | null
    >(
      null,
    );

  const [
    flightHours,
    setFlightHours,
  ] =
    useState(
      '',
    );

  // ===========================================================================
  // MODAL MAINTENANCE
  // ===========================================================================

  const [
    maintenanceAircraft,
    setMaintenanceAircraft,
  ] =
    useState<
      Aircraft | null
    >(
      null,
    );

  // ===========================================================================
  // ÉVITER CHARGEMENTS SIMULTANÉS
  // ===========================================================================

  const loadingRequestRef =
    useRef(
      false,
    );

  // ===========================================================================
  // LOAD DATA
  // ===========================================================================

  const loadData =
    useCallback(
      async (
        signal?: AbortSignal,
        silent = false,
      ) => {
        if (
          loadingRequestRef.current
        ) {
          return;
        }

        loadingRequestRef.current =
          true;

        if (
          !silent
        ) {
          setLoading(
            true,
          );

          setNotice(
            null,
          );
        }

        try {
          // -------------------------------------------------------------------
          // SYNCHRONISATION MAINTENANCE
          // -------------------------------------------------------------------

          await syncExpiredMaintenances(
            signal,
          );

          if (
            signal?.aborted
          ) {
            return;
          }

          // -------------------------------------------------------------------
          // CHARGEMENT
          // -------------------------------------------------------------------

          const [
            aircraftResult,
            typeResult,
            statisticsResult,
          ] =
            await Promise.allSettled([
              requestJson<
                Aircraft[]
              >(
                '/fleet/aircrafts',
                {
                  signal,
                },
              ),

              requestJson<
                AircraftType[]
              >(
                '/fleet/types',
                {
                  signal,
                },
              ),

              requestJson<
                FleetStatistics
              >(
                '/fleet/aircrafts/statistics',
                {
                  signal,
                },
              ),
            ]);

          if (
            signal?.aborted
          ) {
            return;
          }

          // -------------------------------------------------------------------
          // AVIONS
          // -------------------------------------------------------------------

          if (
            aircraftResult.status ===
            'rejected'
          ) {
            throw aircraftResult.reason;
          }

          setAircrafts(
            Array.isArray(
              aircraftResult.value,
            )
              ? aircraftResult.value
              : [],
          );

          // -------------------------------------------------------------------
          // TYPES
          // -------------------------------------------------------------------

          if (
            typeResult.status ===
            'fulfilled'
          ) {
            setTypes(
              Array.isArray(
                typeResult.value,
              )
                ? typeResult.value
                : [],
            );
          } else {
            console.warn(
              '[AircraftManagement] Types indisponibles :',
              typeResult.reason,
            );

            if (
              !silent
            ) {
              setTypes(
                [],
              );
            }
          }

          // -------------------------------------------------------------------
          // STATISTIQUES
          // -------------------------------------------------------------------

          if (
            statisticsResult.status ===
            'fulfilled'
          ) {
            setStatistics(
              statisticsResult.value,
            );
          } else {
            console.warn(
              '[AircraftManagement] Statistiques indisponibles :',
              statisticsResult.reason,
            );

            if (
              !silent
            ) {
              setStatistics(
                null,
              );
            }
          }
        } catch (
          error: unknown
        ) {
          if (
            signal?.aborted
          ) {
            return;
          }

          if (
            error instanceof DOMException &&
            error.name === 'AbortError'
          ) {
            return;
          }

          const message =
            getErrorMessage(
              error,
              'Impossible de charger la flotte.',
            );

          const authenticationError =
            error instanceof ApiError &&
            (
              error.status === 401 ||
              error.status === 403
            );

          if (
            !silent ||
            authenticationError
          ) {
            setNotice({
              kind:
                'error',

              message,
            });
          }

          console.error(
            '[AircraftManagement] Erreur chargement :',
            error,
          );
        } finally {
          loadingRequestRef.current =
            false;

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

  // ===========================================================================
  // CHARGEMENT INITIAL
  // ===========================================================================

  useEffect(
    () => {
      const controller =
        new AbortController();

      void loadData(
        controller.signal,
        false,
      );

      return () => {
        controller.abort();
      };
    },
    [
      loadData,
    ],
  );

  // ===========================================================================
  // RAFRAÎCHISSEMENT AUTOMATIQUE
  // ===========================================================================

  useEffect(
    () => {
      const timer =
        window.setInterval(
          () => {
            void loadData(
              undefined,
              true,
            );
          },
          30_000,
        );

      return () => {
        window.clearInterval(
          timer,
        );
      };
    },
    [
      loadData,
    ],
  );

  // ===========================================================================
  // TYPE SÉLECTIONNÉ
  // ===========================================================================

  const selectedType =
    useMemo(
      () =>
        types.find(
          (
            item,
          ) =>
            item.id ===
            formData.typeId,
        ) ??
        null,
      [
        types,
        formData.typeId,
      ],
    );

  // ===========================================================================
  // FILTRE
  // ===========================================================================

  const filteredAircrafts =
    useMemo(
      () => {
        const query =
          searchTerm
            .trim()
            .toLowerCase();

        return aircrafts.filter(
          (
            aircraft,
          ) => {
            if (
              statusFilter !==
                'ALL' &&
              aircraft.statut !==
                statusFilter
            ) {
              return false;
            }

            if (
              !query
            ) {
              return true;
            }

            return [
              aircraft.immatriculation,
              aircraft.modele,
              aircraft.baseAttache ??
                '',
              aircraft.type
                ?.nomModele ??
                '',
              aircraft.type
                ?.fabricant ??
                '',
            ].some(
              (
                value,
              ) =>
                value
                  .toLowerCase()
                  .includes(
                    query,
                  ),
            );
          },
        );
      },
      [
        aircrafts,
        searchTerm,
        statusFilter,
      ],
    );

  // ===========================================================================
  // CREATE MODAL
  // ===========================================================================

  const openCreate =
    () => {
      setEditingAircraft(
        null,
      );

      setFormData({
        ...EMPTY_FORM,
      });

      setNotice(
        null,
      );

      setIsModalOpen(
        true,
      );
    };

  // ===========================================================================
  // EDIT MODAL
  // ===========================================================================

  const openEdit =
    (
      aircraft: Aircraft,
    ) => {
      setEditingAircraft(
        aircraft,
      );

      setFormData({
        immatriculation:
          aircraft.immatriculation,

        modele:
          aircraft.modele,

        capacite:
          aircraft.capacite,

        heuresDeVolTotales:
          aircraft.heuresDeVolTotales,

        limiteHeuresMaintenance:
          aircraft.limiteHeuresMaintenance,

        statut:
          aircraft.statut,

        baseAttache:
          aircraft.baseAttache ??
          '',

        typeId:
          aircraft.typeId ??
          '',
      });

      setNotice(
        null,
      );

      setIsModalOpen(
        true,
      );
    };

  // ===========================================================================
  // CLOSE MODAL
  // ===========================================================================

  const closeModal =
    () => {
      if (
        submitting
      ) {
        return;
      }

      setIsModalOpen(
        false,
      );

      setEditingAircraft(
        null,
      );

      setFormData({
        ...EMPTY_FORM,
      });
    };

  // ===========================================================================
  // CHANGE FORM
  // ===========================================================================

  const handleChange =
    (
      event: ChangeEvent<
        HTMLInputElement |
        HTMLSelectElement
      >,
    ) => {
      const {
        name,
        value,
      } =
        event.target;

      setFormData(
        (
          current,
        ) => {
          if (
            name ===
            'typeId'
          ) {
            const selected =
              types.find(
                (
                  item,
                ) =>
                  item.id ===
                  value,
              );

            if (
              !selected
            ) {
              return {
                ...current,

                typeId:
                  '',
              };
            }

            const capacity =
              typeof selected.capaciteMax ===
                'number' &&
              selected.capaciteMax >
                0
                ? Math.min(
                    Math.max(
                      1,
                      current.capacite,
                    ),
                    selected.capaciteMax,
                  )
                : current.capacite;

            const maintenanceLimit =
              typeof selected.intervalleMaintenanceHeures ===
                'number' &&
              selected.intervalleMaintenanceHeures >
                0
                ? selected.intervalleMaintenanceHeures
                : current.limiteHeuresMaintenance;

            return {
              ...current,

              typeId:
                selected.id,

              modele:
                selected.nomModele,

              capacite:
                capacity,

              limiteHeuresMaintenance:
                maintenanceLimit,
            };
          }

          if (
            name ===
              'immatriculation' ||
            name ===
              'baseAttache'
          ) {
            return {
              ...current,

              [name]:
                value.toUpperCase(),
            };
          }

          if (
            name ===
              'capacite' ||
            name ===
              'heuresDeVolTotales' ||
            name ===
              'limiteHeuresMaintenance'
          ) {
            return {
              ...current,

              [name]:
                value ===
                ''
                  ? 0
                  : Number(
                      value,
                    ),
            };
          }

          return {
            ...current,

            [name]:
              value,
          };
        },
      );
    };

  // ===========================================================================
  // VALIDATION FORM
  // ===========================================================================

  const validateForm =
    (): string | null => {
      if (
        !formData.immatriculation.trim()
      ) {
        return "L'immatriculation est obligatoire.";
      }

      if (
        !formData.modele.trim()
      ) {
        return 'Le modèle est obligatoire.';
      }

      if (
        !Number.isInteger(
          formData.capacite,
        ) ||
        formData.capacite <=
          0
      ) {
        return 'La capacité doit être un entier strictement positif.';
      }

      if (
        !Number.isFinite(
          formData.limiteHeuresMaintenance,
        ) ||
        formData.limiteHeuresMaintenance <=
          0
      ) {
        return 'La limite de maintenance doit être strictement positive.';
      }

      if (
        !Number.isFinite(
          formData.heuresDeVolTotales,
        ) ||
        formData.heuresDeVolTotales <
          0
      ) {
        return 'Les heures de vol totales ne peuvent pas être négatives.';
      }

      if (
        formData.baseAttache &&
        formData.baseAttache
          .trim()
          .length !==
          3
      ) {
        return "La base d'attache doit être un code IATA de 3 caractères.";
      }

      if (
        selectedType?.capaciteMax &&
        formData.capacite >
          selectedType.capaciteMax
      ) {
        return `La capacité ne peut pas dépasser ${selectedType.capaciteMax} sièges pour ${selectedType.nomModele}.`;
      }

      return null;
    };

  // ===========================================================================
  // SUBMIT CREATE / UPDATE
  // ===========================================================================

  const handleSubmit =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      if (
        submitting
      ) {
        return;
      }

      const validationError =
        validateForm();

      if (
        validationError
      ) {
        setNotice({
          kind:
            'error',

          message:
            validationError,
        });

        return;
      }

      setSubmitting(
        true,
      );

      setNotice(
        null,
      );

      const commonPayload = {
        immatriculation:
          formData.immatriculation
            .trim()
            .toUpperCase(),

        modele:
          formData.modele.trim(),

        capacite:
          formData.capacite,

        heuresDeVolTotales:
          formData.heuresDeVolTotales,

        limiteHeuresMaintenance:
          formData.limiteHeuresMaintenance,

        statut:
          formData.statut,

        baseAttache:
          formData.baseAttache
            .trim()
            .toUpperCase() ||
          undefined,
      };

      try {
        if (
          editingAircraft
        ) {
          await requestJson<Aircraft>(
            `/fleet/aircrafts/${editingAircraft.id}`,
            {
              method:
                'PATCH',

              body:
                JSON.stringify({
                  ...commonPayload,

                  typeId:
                    formData.typeId ||
                    null,
                }),
            },
          );

          setNotice({
            kind:
              'success',

            message:
              `L'avion ${commonPayload.immatriculation} a été mis à jour.`,
          });
        } else {
          await requestJson<Aircraft>(
            '/fleet/aircrafts',
            {
              method:
                'POST',

              body:
                JSON.stringify({
                  ...commonPayload,

                  typeId:
                    formData.typeId ||
                    undefined,
                }),
            },
          );

          setNotice({
            kind:
              'success',

            message:
              `L'avion ${commonPayload.immatriculation} a été créé.`,
          });
        }

        setIsModalOpen(
          false,
        );

        setEditingAircraft(
          null,
        );

        await loadData(
          undefined,
          true,
        );
      } catch (
        error: unknown
      ) {
        setNotice({
          kind:
            'error',

          message:
            getErrorMessage(
              error,
              "Impossible d'enregistrer l'avion.",
            ),
        });
      } finally {
        setSubmitting(
          false,
        );
      }
    };

  // ===========================================================================
  // RETIRER AVION
  // ===========================================================================

  const retireAircraft =
    async (
      aircraft: Aircraft,
    ) => {
      if (
        aircraft.statut ===
        AircraftStatus.RETIRED
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `Retirer l'avion ${aircraft.immatriculation} de la flotte ?\n\nLe backend ne supprime pas la ligne : le statut deviendra "Retired".`,
        );

      if (
        !confirmed
      ) {
        return;
      }

      setActionAircraftId(
        aircraft.id,
      );

      setNotice(
        null,
      );

      try {
        await requestJson<{
          retired: true;

          id: string;
        }>(
          `/fleet/aircrafts/${aircraft.id}`,
          {
            method:
              'DELETE',
          },
        );

        setNotice({
          kind:
            'success',

          message:
            `L'avion ${aircraft.immatriculation} a été retiré de la flotte.`,
        });

        await loadData(
          undefined,
          true,
        );
      } catch (
        error: unknown
      ) {
        setNotice({
          kind:
            'error',

          message:
            getErrorMessage(
              error,
              "Impossible de retirer l'avion.",
            ),
        });
      } finally {
        setActionAircraftId(
          null,
        );
      }
    };

  // ===========================================================================
  // OPEN MAINTENANCE RESET
  // ===========================================================================

  const openMaintenanceResetModal =
    (
      aircraft: Aircraft,
    ) => {
      if (
        aircraft.statut ===
        AircraftStatus.RETIRED
      ) {
        return;
      }

      setMaintenanceAircraft(
        aircraft,
      );

      setNotice(
        null,
      );
    };

  // ===========================================================================
  // CLOSE MAINTENANCE RESET
  // ===========================================================================

  const closeMaintenanceResetModal =
    () => {
      if (
        maintenanceAircraft &&
        actionAircraftId ===
          maintenanceAircraft.id
      ) {
        return;
      }

      setMaintenanceAircraft(
        null,
      );
    };

  // ===========================================================================
  // RESET MAINTENANCE
  // ===========================================================================

  const resetMaintenance =
    async () => {
      if (
        !maintenanceAircraft
      ) {
        return;
      }

      const aircraft =
        maintenanceAircraft;

      setActionAircraftId(
        aircraft.id,
      );

      setNotice(
        null,
      );

      try {
        await requestJson<Aircraft>(
          `/fleet/aircrafts/${aircraft.id}/maintenance/reset`,
          {
            method:
              'PATCH',
          },
        );

        setMaintenanceAircraft(
          null,
        );

        setNotice({
          kind:
            'success',

          message:
            `Maintenance de ${aircraft.immatriculation} réinitialisée avec succès.`,
        });

        await loadData(
          undefined,
          true,
        );
      } catch (
        error: unknown
      ) {
        setNotice({
          kind:
            'error',

          message:
            getErrorMessage(
              error,
              'Impossible de réinitialiser la maintenance.',
            ),
        });
      } finally {
        setActionAircraftId(
          null,
        );
      }
    };

  // ===========================================================================
  // AJOUT HEURES VOL
  // ===========================================================================

  const submitFlightHours =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      if (
        !hoursAircraft ||
        submitting
      ) {
        return;
      }

      const hours =
        Number(
          flightHours,
        );

      if (
        !Number.isFinite(
          hours,
        ) ||
        hours <=
          0
      ) {
        setNotice({
          kind:
            'error',

          message:
            'Les heures volées doivent être strictement positives.',
        });

        return;
      }

      setSubmitting(
        true,
      );

      setNotice(
        null,
      );

      try {
        await requestJson<Aircraft>(
          `/fleet/aircrafts/${hoursAircraft.id}/flight-hours`,
          {
            method:
              'PATCH',

            body:
              JSON.stringify({
                heuresVolees:
                  hours,
              }),
          },
        );

        const registration =
          hoursAircraft.immatriculation;

        setHoursAircraft(
          null,
        );

        setFlightHours(
          '',
        );

        setNotice({
          kind:
            'success',

          message:
            `${formatNumber(hours)} h ajoutée(s) à ${registration}.`,
        });

        await loadData(
          undefined,
          true,
        );
      } catch (
        error: unknown
      ) {
        setNotice({
          kind:
            'error',

          message:
            getErrorMessage(
              error,
              "Impossible d'ajouter les heures de vol.",
            ),
        });
      } finally {
        setSubmitting(
          false,
        );
      }
    };

  // ===========================================================================
  // BADGE STATUT
  // ===========================================================================

  const renderStatusBadge =
    (
      status: AircraftStatus,
    ) => {
      switch (
        status
      ) {
        case AircraftStatus.ACTIVE:
          return (
            <StatusBadge
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
              icon={
                <CheckCircle2 className="h-3.5 w-3.5" />
              }
              label="Actif"
            />
          );

        case AircraftStatus.MAINTENANCE:
          return (
            <StatusBadge
              className="border-amber-200 bg-amber-50 text-amber-700"
              icon={
                <Wrench className="h-3.5 w-3.5" />
              }
              label="Maintenance"
            />
          );

        case AircraftStatus.OUT_OF_SERVICE:
          return (
            <StatusBadge
              className="border-rose-200 bg-rose-50 text-rose-700"
              icon={
                <AlertTriangle className="h-3.5 w-3.5" />
              }
              label="Hors service"
            />
          );

        case AircraftStatus.RETIRED:

        default:
          return (
            <StatusBadge
              className="border-slate-200 bg-slate-100 text-slate-600"
              icon={
                <History className="h-3.5 w-3.5" />
              }
              label="Retiré"
            />
          );
      }
    };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <div className="mx-auto min-h-screen max-w-375 space-y-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">

      {/* ==================================================================== */}
      {/* HEADER */}
      {/* ==================================================================== */}

      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">

        <div className="flex items-center gap-3">

          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
            <Plane className="h-6 w-6" />
          </div>

          <div>

            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
              Avions de la flotte
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Aéronefs physiques, maintenance et heures de vol.
            </p>

          </div>

        </div>

        <div className="flex flex-wrap gap-2">

          <button
            type="button"
            onClick={
              () =>
                void loadData()
            }
            disabled={
              loading
            }
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
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
              openCreate
            }
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
          >

            <Plus className="h-4 w-4" />

            Ajouter un avion

          </button>

        </div>

      </div>

      {/* ==================================================================== */}
      {/* NOTICE */}
      {/* ==================================================================== */}

      {notice && (
        <div
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            notice.kind ===
            'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >

          {notice.kind ===
          'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}

          <span className="flex-1">
            {notice.message}
          </span>

          <button
            type="button"
            onClick={
              () =>
                setNotice(
                  null,
                )
            }
            className="rounded p-0.5 opacity-70 hover:opacity-100"
            aria-label="Fermer le message"
          >

            <X className="h-4 w-4" />

          </button>

        </div>
      )}

      {/* ==================================================================== */}
      {/* STATS */}
      {/* ==================================================================== */}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">

        <StatCard
          label="Total"
          value={
            statistics?.totalAvions ??
            aircrafts.length
          }
          icon={
            <Plane className="h-4 w-4" />
          }
        />

        <StatCard
          label="Actifs"
          value={
            statistics?.avionsActifs ??
            aircrafts.filter(
              (
                aircraft,
              ) =>
                aircraft.statut ===
                AircraftStatus.ACTIVE,
            ).length
          }
          icon={
            <CheckCircle2 className="h-4 w-4" />
          }
        />

        <StatCard
          label="Maintenance"
          value={
            statistics?.avionsEnMaintenance ??
            aircrafts.filter(
              (
                aircraft,
              ) =>
                aircraft.statut ===
                AircraftStatus.MAINTENANCE,
            ).length
          }
          icon={
            <Wrench className="h-4 w-4" />
          }
        />

        <StatCard
          label="Hors service"
          value={
            statistics?.avionsHorsService ??
            aircrafts.filter(
              (
                aircraft,
              ) =>
                aircraft.statut ===
                AircraftStatus.OUT_OF_SERVICE,
            ).length
          }
          icon={
            <AlertTriangle className="h-4 w-4" />
          }
        />

        <StatCard
          label="Retirés"
          value={
            statistics?.avionsRetires ??
            aircrafts.filter(
              (
                aircraft,
              ) =>
                aircraft.statut ===
                AircraftStatus.RETIRED,
            ).length
          }
          icon={
            <History className="h-4 w-4" />
          }
        />

      </div>

      {/* ==================================================================== */}
      {/* SEARCH / FILTER */}
      {/* ==================================================================== */}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

        <div className="relative w-full max-w-xl">

          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

          <input
            type="search"
            value={
              searchTerm
            }
            onChange={
              (
                event,
              ) =>
                setSearchTerm(
                  event.target.value,
                )
            }
            placeholder="Immatriculation, modèle, fabricant ou base..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
          />

        </div>

        <div className="flex items-center gap-2">

          <select
            value={
              statusFilter
            }
            onChange={
              (
                event,
              ) =>
                setStatusFilter(
                  event.target.value as
                    | AircraftStatus
                    | 'ALL',
                )
            }
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 outline-none"
          >

            <option value="ALL">
              Tous les statuts
            </option>

            {STATUS_OPTIONS.map(
              (
                option,
              ) => (
                <option
                  key={
                    option.value
                  }
                  value={
                    option.value
                  }
                >
                  {option.label}
                </option>
              ),
            )}

          </select>

          <span className="whitespace-nowrap rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
            {filteredAircrafts.length}{' '}
            appareil(s)
          </span>

        </div>

      </div>

      {/* ==================================================================== */}
      {/* TABLE */}
      {/* ==================================================================== */}

      <div className="overflow-hidden rounded-2xl border border-slate-200">

        <div className="overflow-x-auto">

          <table className="w-full min-w-270 text-left text-sm">

            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">

              <tr>

                <th className="px-5 py-3.5">
                  Immatriculation
                </th>

                <th className="px-5 py-3.5">
                  Type / modèle
                </th>

                <th className="px-5 py-3.5">
                  Capacité
                </th>

                <th className="px-5 py-3.5">
                  Base
                </th>

                <th className="px-5 py-3.5">
                  Heures totales
                </th>

                <th className="px-5 py-3.5">
                  Maintenance
                </th>

                <th className="px-5 py-3.5">
                  Statut
                </th>

                <th className="px-5 py-3.5 text-right">
                  Actions
                </th>

              </tr>

            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">

              {loading ? (

                <tr>

                  <td
                    colSpan={
                      8
                    }
                    className="px-5 py-14 text-center text-slate-400"
                  >

                    <span className="inline-flex items-center gap-2">

                      <LoaderCircle className="h-4 w-4 animate-spin" />

                      Chargement de la flotte...

                    </span>

                  </td>

                </tr>

              ) : filteredAircrafts.length ===
                0 ? (

                <tr>

                  <td
                    colSpan={
                      8
                    }
                    className="px-5 py-14 text-center text-slate-400"
                  >
                    Aucun avion trouvé.
                  </td>

                </tr>

              ) : (

                filteredAircrafts.map(
                  (
                    aircraft,
                  ) => {
                    const ratio =
                      maintenanceRatio(
                        aircraft,
                      );

                    const busy =
                      actionAircraftId ===
                      aircraft.id;

                    return (
                      <tr
                        key={
                          aircraft.id
                        }
                        className="transition hover:bg-slate-50/70"
                      >

                        <td className="px-5 py-4">

                          <div className="font-extrabold tracking-wide text-slate-900">
                            {
                              aircraft.immatriculation
                            }
                          </div>

                          <div className="mt-1 text-[11px] text-slate-400">
                            Dernière maint. :{' '}
                            {formatDate(
                              aircraft.dateDerniereMaintenance,
                            )}
                          </div>

                        </td>

                        <td className="px-5 py-4">

                          <div className="font-semibold text-slate-700">
                            {aircraft.type
                              ?.nomModele ??
                              aircraft.modele}
                          </div>

                          <div className="mt-0.5 text-xs text-slate-400">
                            {aircraft.type
                              ?.fabricant ??
                              aircraft.modele}
                          </div>

                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {aircraft.capacite}{' '}
                          sièges
                        </td>

                        <td className="px-5 py-4">

                          {aircraft.baseAttache ? (

                            <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-700">
                              {
                                aircraft.baseAttache
                              }
                            </span>

                          ) : (

                            <span className="text-slate-300">
                              —
                            </span>

                          )}

                        </td>

                        <td className="px-5 py-4 font-medium text-slate-600">
                          {formatNumber(
                            aircraft.heuresDeVolTotales,
                          )}{' '}
                          h
                        </td>

                        <td className="px-5 py-4">

                          <div className="w-44">

                            <div className="mb-1.5 flex justify-between text-xs">

                              <span className="font-semibold text-slate-700">
                                {formatNumber(
                                  aircraft.heuresDepuisDerniereMaintenance,
                                )}{' '}
                                h
                              </span>

                              <span className="text-slate-400">
                                /{' '}
                                {formatNumber(
                                  aircraft.limiteHeuresMaintenance,
                                )}{' '}
                                h
                              </span>

                            </div>

                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">

                              <div
                                className={`h-full rounded-full ${
                                  ratio >=
                                  90
                                    ? 'bg-rose-500'
                                    : ratio >=
                                        75
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-600'
                                }`}
                                style={{
                                  width:
                                    `${ratio}%`,
                                }}
                              />

                            </div>

                            <div className="mt-1 text-[10px] font-medium text-slate-400">
                              {ratio}% utilisé
                            </div>

                          </div>

                        </td>

                        <td className="px-5 py-4">
                          {renderStatusBadge(
                            aircraft.statut,
                          )}
                        </td>

                        <td className="px-5 py-4 text-right">

                          <div className="flex items-center justify-end gap-1">

                            <button
                              type="button"
                              onClick={
                                () => {
                                  setHoursAircraft(
                                    aircraft,
                                  );

                                  setFlightHours(
                                    '',
                                  );

                                  setNotice(
                                    null,
                                  );
                                }
                              }
                              disabled={
                                busy ||
                                aircraft.statut ===
                                  AircraftStatus.RETIRED
                              }
                              title="Ajouter des heures de vol"
                              className="rounded-lg p-2 text-slate-400 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-35"
                            >

                              <Gauge className="h-4 w-4" />

                            </button>

                            <button
                              type="button"
                              onClick={
                                () =>
                                  openMaintenanceResetModal(
                                    aircraft,
                                  )
                              }
                              disabled={
                                busy ||
                                aircraft.statut ===
                                  AircraftStatus.RETIRED
                              }
                              title="Réinitialiser la maintenance"
                              className="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-35"
                            >

                              <RotateCcw
                                className={`h-4 w-4 ${
                                  busy
                                    ? 'animate-spin'
                                    : ''
                                }`}
                              />

                            </button>

                            <button
                              type="button"
                              onClick={
                                () =>
                                  openEdit(
                                    aircraft,
                                  )
                              }
                              disabled={
                                busy
                              }
                              title="Modifier"
                              className="rounded-lg p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-35"
                            >

                              <Pencil className="h-4 w-4" />

                            </button>

                            <button
                              type="button"
                              onClick={
                                () =>
                                  void retireAircraft(
                                    aircraft,
                                  )
                              }
                              disabled={
                                busy ||
                                aircraft.statut ===
                                  AircraftStatus.RETIRED
                              }
                              title={
                                aircraft.statut ===
                                AircraftStatus.RETIRED
                                  ? 'Avion déjà retiré'
                                  : "Retirer l'avion"
                              }
                              className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-35"
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

      </div>

      {/* ==================================================================== */}
      {/* STATS BAS */}
      {/* ==================================================================== */}

      {statistics && (

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-600 sm:grid-cols-3">

          <InfoMetric
            label="Heures flotte"
            value={`${formatNumber(statistics.heuresDeVolTotales)} h`}
          />

          <InfoMetric
            label="Moyenne / avion"
            value={`${formatNumber(statistics.moyenneHeuresDeVol)} h`}
          />

          <InfoMetric
            label="Capacité moyenne"
            value={`${formatNumber(statistics.capaciteMoyenne, 0)} sièges`}
          />

        </div>

      )}

      {/* ==================================================================== */}
      {/* MODAL CREATE / EDIT */}
      {/* ==================================================================== */}

      {isModalOpen && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">

          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-2xl">

            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">

              <div>

                <h2 className="text-lg font-extrabold text-slate-800">
                  {editingAircraft
                    ? `Modifier ${editingAircraft.immatriculation}`
                    : 'Ajouter un avion'}
                </h2>

                <p className="mt-0.5 text-xs text-slate-400">
                  Champs alignés sur le backend Fleet.
                </p>

              </div>

              <button
                type="button"
                onClick={
                  closeModal
                }
                disabled={
                  submitting
                }
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                aria-label="Fermer"
              >

                <X className="h-5 w-5" />

              </button>

            </div>

            <form
              onSubmit={
                handleSubmit
              }
              className="space-y-5 p-6"
            >

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

                <Field
                  label="Immatriculation"
                  required
                >

                  <input
                    name="immatriculation"
                    value={
                      formData.immatriculation
                    }
                    onChange={
                      handleChange
                    }
                    maxLength={
                      20
                    }
                    required
                    placeholder="5R-MDA"
                    className={
                      inputClass
                    }
                  />

                </Field>

                <Field label="Type d'avion">

                  <select
                    name="typeId"
                    value={
                      formData.typeId
                    }
                    onChange={
                      handleChange
                    }
                    className={
                      inputClass
                    }
                  >

                    <option value="">
                      — Aucun type —
                    </option>

                    {types.map(
                      (
                        type,
                      ) => (
                        <option
                          key={
                            type.id
                          }
                          value={
                            type.id
                          }
                        >
                          {
                            type.nomModele
                          }
                          {type.fabricant
                            ? ` — ${type.fabricant}`
                            : ''}
                        </option>
                      ),
                    )}

                  </select>

                  {selectedType && (

                    <p className="mt-1.5 text-[11px] text-slate-400">

                      Max.{' '}
                      {selectedType.capaciteMax ??
                        '—'}{' '}
                      sièges

                      {selectedType.intervalleMaintenanceHeures
                        ? ` · Maintenance ${formatNumber(selectedType.intervalleMaintenanceHeures)} h`
                        : ''}

                    </p>

                  )}

                </Field>

                <Field
                  label="Modèle"
                  required
                >

                  <input
                    name="modele"
                    value={
                      formData.modele
                    }
                    onChange={
                      handleChange
                    }
                    maxLength={
                      100
                    }
                    required
                    readOnly={
                      Boolean(
                        selectedType,
                      )
                    }
                    placeholder="ATR 72-600"
                    className={`${inputClass} ${
                      selectedType
                        ? 'cursor-not-allowed bg-slate-100 text-slate-500'
                        : ''
                    }`}
                  />

                  {selectedType && (

                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Synchronisé avec le type choisi.
                    </p>

                  )}

                </Field>

                <Field
                  label="Capacité"
                  required
                >

                  <input
                    type="number"
                    name="capacite"
                    min={
                      1
                    }
                    max={
                      selectedType?.capaciteMax
                    }
                    step={
                      1
                    }
                    value={
                      formData.capacite
                    }
                    onChange={
                      handleChange
                    }
                    required
                    className={
                      inputClass
                    }
                  />

                </Field>

                <Field
                  label="Limite maintenance (h)"
                  required
                >

                  <input
                    type="number"
                    name="limiteHeuresMaintenance"
                    min={
                      0.1
                    }
                    step={
                      0.1
                    }
                    value={
                      formData.limiteHeuresMaintenance
                    }
                    onChange={
                      handleChange
                    }
                    required
                    className={
                      inputClass
                    }
                  />

                </Field>

                <Field label="Heures de vol totales">

                  <input
                    type="number"
                    name="heuresDeVolTotales"
                    min={
                      0
                    }
                    step={
                      0.1
                    }
                    value={
                      formData.heuresDeVolTotales
                    }
                    onChange={
                      handleChange
                    }
                    className={
                      inputClass
                    }
                  />

                </Field>

                <Field
                  label="Statut"
                  required
                >

                  <select
                    name="statut"
                    value={
                      formData.statut
                    }
                    onChange={
                      handleChange
                    }
                    className={
                      inputClass
                    }
                  >

                    {STATUS_OPTIONS.map(
                      (
                        option,
                      ) => (
                        <option
                          key={
                            option.value
                          }
                          value={
                            option.value
                          }
                        >
                          {
                            option.label
                          }
                        </option>
                      ),
                    )}

                  </select>

                </Field>

                <Field label="Base d'attache IATA">

                  <input
                    name="baseAttache"
                    value={
                      formData.baseAttache
                    }
                    onChange={
                      handleChange
                    }
                    maxLength={
                      3
                    }
                    placeholder="TNR"
                    className={`${inputClass} uppercase`}
                  />

                </Field>

              </div>

              {editingAircraft && (

                <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs leading-relaxed text-sky-800">
                  Le compteur « heures depuis dernière maintenance » et la date de maintenance ne sont pas modifiés ici.
                </div>

              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">

                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  disabled={
                    submitting
                  }
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={
                    submitting
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >

                  {submitting && (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  )}

                  {editingAircraft
                    ? 'Enregistrer'
                    : "Créer l'avion"}

                </button>

              </div>

            </form>

          </div>

        </div>

      )}

      {/* ==================================================================== */}
      {/* MODAL MAINTENANCE */}
      {/* ==================================================================== */}

      {maintenanceAircraft && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="maintenance-reset-title"
        >

          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">

            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">

              <div className="flex items-start gap-3">

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-700">

                  <RotateCcw className="h-5 w-5" />

                </div>

                <div>

                  <h2
                    id="maintenance-reset-title"
                    className="font-extrabold text-slate-800"
                  >
                    Réinitialiser la maintenance
                  </h2>

                  <p className="mt-0.5 text-xs text-slate-400">
                    {maintenanceAircraft.immatriculation}{' '}
                    ·{' '}
                    {maintenanceAircraft.type
                      ?.nomModele ??
                      maintenanceAircraft.modele}
                  </p>

                </div>

              </div>

              <button
                type="button"
                onClick={
                  closeMaintenanceResetModal
                }
                disabled={
                  actionAircraftId ===
                  maintenanceAircraft.id
                }
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Fermer"
              >

                <X className="h-5 w-5" />

              </button>

            </div>

            <div className="space-y-4 p-5">

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">

                <div className="flex items-start gap-3">

                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

                  <div>

                    <p className="text-sm font-bold text-amber-900">
                      Confirmer la fin de maintenance ?
                    </p>

                  </div>

                </div>

              </div>

              <div className="grid grid-cols-2 gap-3">

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">

                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Compteur actuel
                  </span>

                  <p className="mt-1 text-lg font-black text-slate-800">
                    {formatNumber(
                      maintenanceAircraft.heuresDepuisDerniereMaintenance,
                    )}{' '}
                    h
                  </p>

                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">

                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Limite maintenance
                  </span>

                  <p className="mt-1 text-lg font-black text-slate-800">
                    {formatNumber(
                      maintenanceAircraft.limiteHeuresMaintenance,
                    )}{' '}
                    h
                  </p>

                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">

                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Potentiel utilisé
                  </span>

                  <p className="mt-1 text-lg font-black text-slate-800">
                    {maintenanceRatio(
                      maintenanceAircraft,
                    )}{' '}
                    %
                  </p>

                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">

                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Dernière maintenance
                  </span>

                  <p className="mt-1 text-sm font-black text-slate-800">
                    {formatDate(
                      maintenanceAircraft.dateDerniereMaintenance,
                    )}
                  </p>

                </div>

              </div>

              <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs leading-5 text-sky-800">
                Après confirmation, les données seront rechargées automatiquement afin de mettre à jour le compteur, la date de maintenance, le statut et les statistiques de flotte.
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">

                <button
                  type="button"
                  onClick={
                    closeMaintenanceResetModal
                  }
                  disabled={
                    actionAircraftId ===
                    maintenanceAircraft.id
                  }
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  onClick={
                    () =>
                      void resetMaintenance()
                  }
                  disabled={
                    actionAircraftId ===
                    maintenanceAircraft.id
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                >

                  {actionAircraftId ===
                  maintenanceAircraft.id ? (

                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Réinitialisation...
                    </>

                  ) : (

                    <>
                      <RotateCcw className="h-4 w-4" />
                      Confirmer la réinitialisation
                    </>

                  )}

                </button>

              </div>

            </div>

          </div>

        </div>

      )}

      {/* ==================================================================== */}
      {/* MODAL HEURES VOL */}
      {/* ==================================================================== */}

      {hoursAircraft && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">

          <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">

              <div>

                <h2 className="font-extrabold text-slate-800">
                  Ajouter des heures
                </h2>

                <p className="mt-0.5 text-xs text-slate-400">
                  {hoursAircraft.immatriculation}{' '}
                  ·{' '}
                  {hoursAircraft.modele}
                </p>

              </div>

              <button
                type="button"
                onClick={
                  () =>
                    setHoursAircraft(
                      null,
                    )
                }
                disabled={
                  submitting
                }
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                aria-label="Fermer"
              >

                <X className="h-5 w-5" />

              </button>

            </div>

            <form
              onSubmit={
                submitFlightHours
              }
              className="space-y-4 p-5"
            >

              <Field
                label="Heures volées"
                required
              >

                <input
                  type="number"
                  min={
                    0.1
                  }
                  step={
                    0.1
                  }
                  autoFocus
                  value={
                    flightHours
                  }
                  onChange={
                    (
                      event,
                    ) =>
                      setFlightHours(
                        event.target.value,
                      )
                  }
                  placeholder="Ex. 2.5"
                  className={
                    inputClass
                  }
                />

              </Field>

              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                Cette action augmente les heures totales et le compteur depuis maintenance. Le backend bascule automatiquement l&apos;avion en maintenance si la limite est atteinte.
              </div>

              <div className="flex justify-end gap-2">

                <button
                  type="button"
                  onClick={
                    () =>
                      setHoursAircraft(
                        null,
                      )
                  }
                  disabled={
                    submitting
                  }
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={
                    submitting
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >

                  {submitting && (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
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

// =============================================================================
// FIELD
// =============================================================================

function Field({
  label,
  required = false,
  children,
}: {
  label: string;

  required?: boolean;

  children: ReactNode;
}) {
  return (
    <label className="block">

      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-600">

        {label}

        {required && (
          <span className="ml-1 text-rose-500">
            *
          </span>
        )}

      </span>

      {children}

    </label>
  );
}

// =============================================================================
// STATUS BADGE
// =============================================================================

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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {icon}

      {label}
    </span>
  );
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;

  value: number;

  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">

      <div className="flex items-center justify-between text-slate-400">

        <span className="text-[11px] font-bold uppercase tracking-wide">
          {label}
        </span>

        {icon}

      </div>

      <div className="mt-2 text-2xl font-black tracking-tight text-slate-800">
        {formatNumber(
          value,
          0,
        )}
      </div>

    </div>
  );
}

// =============================================================================
// INFO METRIC
// =============================================================================

function InfoMetric({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div>

      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>

      <p className="mt-1 font-bold text-slate-800">
        {value}
      </p>

    </div>
  );
}