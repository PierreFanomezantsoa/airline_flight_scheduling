import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import axios from 'axios';

import {
  Wrench,
  Plus,
  Calendar,
  Clock,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  X,
  Plane,
  RefreshCw,
  Gauge,
} from 'lucide-react';

import {
  fleetService,
} from '../fleet/fleetService';
import type {
  Aircraft,
} from '../fleet/fleetService';

import {
  maintenanceService,
} from './maintenanceService';
import type {
  MaintenanceSlot,
} from './maintenanceService';

type MaintenanceType =
  | 'Type A'
  | 'Type C'
  | 'Aircraft On Ground';

interface ToastState {
  id: number;
  message: string;
  type:
    | 'success'
    | 'error';
}

interface DeleteModalState {
  isOpen: boolean;
  slotId: string | null;
  aircraftRegistration:
    | string
    | null;
}

/**
 * Le fleetService peut exposer les noms normalisés frontend
 * (registration/model/status), tandis que le backend Fleet utilise
 * immatriculation/modele/statut.
 *
 * Cette intersection rend MaintenancePlanning compatible avec les deux.
 */
type AircraftLike =
  Aircraft & {
    immatriculation?: string;
    modele?: string;
    statut?: string;
    baseAttache?: string | null;
    heuresDeVolTotales?: number;
    heuresDepuisDerniereMaintenance?: number;
    limiteHeuresMaintenance?: number;
    dateDerniereMaintenance?: string | null;
    type?: {
      nomModele?: string;
      fabricant?: string;
    } | null;
  };

const getAircraftRegistration = (
  aircraft?: AircraftLike | null,
): string =>
  aircraft?.registration ||
  aircraft?.immatriculation ||
  'Appareil inconnu';

const getAircraftModel = (
  aircraft?: AircraftLike | null,
): string =>
  aircraft?.model ||
  aircraft?.modele ||
  aircraft?.type?.nomModele ||
  'Modèle inconnu';

const getAircraftStatus = (
  aircraft?: AircraftLike | null,
): string =>
  (
    aircraft?.status ||
    aircraft?.statut ||
    ''
  )
    .trim()
    .toLowerCase();

const isMaintenanceAircraft = (
  aircraft: AircraftLike,
): boolean => {
  const status =
    getAircraftStatus(
      aircraft,
    );

  return (
    status === 'maintenance' ||
    status.includes(
      'mainten',
    )
  );
};

const isRetiredAircraft = (
  aircraft: AircraftLike,
): boolean => {
  const status =
    getAircraftStatus(
      aircraft,
    );

  return (
    status === 'retired' ||
    status.includes(
      'retir',
    )
  );
};

const getStatus = (
  start: string,
  end: string,
  type: string,
) => {
  const now =
    new Date();

  const startDateObj =
    new Date(start);

  const endDateObj =
    new Date(end);

  if (
    type ===
    'Aircraft On Ground'
  ) {
    return {
      label:
        'Urgence AOG',
      css:
        'bg-rose-50 text-rose-700 border-rose-100',
      iconColor:
        'bg-rose-50 text-rose-600 border border-rose-100/50',
      icon: (
        <ShieldAlert className="h-5 w-5" />
      ),
    };
  }

  if (
    now <
    startDateObj
  ) {
    return {
      label:
        'Planifié',
      css:
        'bg-amber-50 text-amber-700 border-amber-100',
      iconColor:
        'bg-amber-50 text-amber-600 border border-amber-100/50',
      icon: (
        <Calendar className="h-5 w-5" />
      ),
    };
  }

  if (
    now >
    endDateObj
  ) {
    return {
      label:
        'Terminé',
      css:
        'bg-emerald-50 text-emerald-700 border-emerald-100',
      iconColor:
        'bg-emerald-50 text-emerald-600 border border-emerald-100/50',
      icon: (
        <CheckCircle2 className="h-5 w-5" />
      ),
    };
  }

  return {
    label:
      'En Atelier',
    css:
      'bg-emerald-50 text-emerald-900 border-emerald-100/60',
    iconColor:
      'bg-emerald-50/60 text-emerald-800 border border-emerald-100/50',
    icon: (
      <Wrench className="h-5 w-5 animate-pulse" />
    ),
  };
};

/**
 * Durée affichée en jours calendaires.
 */
const calculateDurationInDays = (
  start: string,
  end: string,
): number => {
  const startMs =
    new Date(
      start,
    ).getTime();

  const endMs =
    new Date(
      end,
    ).getTime();

  if (
    Number.isNaN(
      startMs,
    ) ||
    Number.isNaN(
      endMs,
    ) ||
    endMs <=
      startMs
  ) {
    return 1;
  }

  return Math.max(
    1,
    Math.ceil(
      (endMs -
        startMs) /
        (
          24 *
          60 *
          60 *
          1000
        ),
    ),
  );
};

/**
 * CORRECTION IMPORTANTE :
 *
 * Pour 1 jour à partir du 12/08 :
 * début = 12/08 00:00:00
 * fin   = 12/08 23:59:59.999
 *
 * L'ancienne logique :
 * day + durationDays puis 23:59:59
 * créait presque 2 jours pour durationDays = 1.
 */
const buildMaintenanceInterval = (
  dateValue: string,
  durationDays: number,
): {
  start: Date;
  end: Date;
} | null => {
  if (
    !dateValue ||
    durationDays <= 0
  ) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] =
    dateValue
      .split('-')
      .map(Number);

  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }

  const start =
    new Date(
      year,
      month - 1,
      day,
      0,
      0,
      0,
      0,
    );

  const nextDay =
    new Date(
      year,
      month - 1,
      day +
        durationDays,
      0,
      0,
      0,
      0,
    );

  const end =
    new Date(
      nextDay.getTime() -
        1,
    );

  return {
    start,
    end,
  };
};

/**
 * Même règle que le backend NestJS :
 *
 * slot.startTime < requestedEnd
 * &&
 * slot.endTime > requestedStart
 */
const intervalsOverlap = (
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean =>
  startA <
    endB &&
  endA >
    startB;

const formatNumber = (
  value?: number,
  digits = 1,
): string =>
  new Intl.NumberFormat(
    'fr-FR',
    {
      maximumFractionDigits:
        digits,
    },
  ).format(
    Number.isFinite(
      value,
    )
      ? Number(value)
      : 0,
  );

const maintenanceRatio = (
  aircraft: AircraftLike,
): number => {
  const used =
    Number(
      aircraft
        .heuresDepuisDerniereMaintenance ??
        0,
    );

  const limit =
    Number(
      aircraft
        .limiteHeuresMaintenance ??
        0,
    );

  if (
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
        (used /
          limit) *
          100,
      ),
    ),
  );
};

const syncExpiredMaintenances = async (): Promise<void> => {
  const API_URL =
    import.meta.env?.VITE_API_URL ||
    'http://localhost:3001';

  const token =
    localStorage.getItem('userToken') ||
    sessionStorage.getItem('userToken') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token');

  await axios.patch(
    `${API_URL}/maintenance/sync-expired`,
    undefined,
    {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : undefined,
    },
  );
};

const getAxiosErrorMessage = (
  error: unknown,
): string => {
  if (
    axios.isAxiosError(
      error,
    )
  ) {
    const data =
      error.response
        ?.data as
        | {
            message?:
              | string
              | string[];
            error?:
              string;
          }
        | undefined;

    if (
      Array.isArray(
        data?.message,
      )
    ) {
      return data.message.join(
        ' ',
      );
    }

    if (
      typeof data
        ?.message ===
        'string' &&
      data.message.trim()
    ) {
      return data.message;
    }

    if (
      typeof data
        ?.error ===
        'string' &&
      data.error.trim()
    ) {
      return data.error;
    }

    if (
      error.response
        ?.status ===
      409
    ) {
      return (
        "Cet appareil possède déjà un créneau de maintenance " +
        'qui chevauche la période demandée.'
      );
    }

    return (
      error.message ||
      'Erreur de communication avec le serveur.'
    );
  }

  if (
    error instanceof
    Error
  ) {
    return error.message;
  }

  return (
    'Une erreur inattendue est survenue.'
  );
};

export const MaintenancePlanning: React.FC =
  () => {
    const [
      slots,
      setSlots,
    ] =
      useState<
        MaintenanceSlot[]
      >([]);

    const [
      aircrafts,
      setAircrafts,
    ] =
      useState<
        AircraftLike[]
      >([]);

    const [
      loading,
      setLoading,
    ] =
      useState<boolean>(
        true,
      );

    const [
      fleetRefreshing,
      setFleetRefreshing,
    ] =
      useState(false);

    const [
      selectedAircraftId,
      setSelectedAircraftId,
    ] =
      useState<string>(
        '',
      );

    const [
      maintenanceType,
      setMaintenanceType,
    ] =
      useState<MaintenanceType>(
        'Type A',
      );

    const [
      startDate,
      setStartDate,
    ] =
      useState<string>(
        '',
      );

    const [
      durationDays,
      setDurationDays,
    ] =
      useState<number>(
        1,
      );

    const [
      description,
      setDescription,
    ] =
      useState<string>(
        '',
      );

    const [
      submitting,
      setSubmitting,
    ] =
      useState<boolean>(
        false,
      );

    const [
      toasts,
      setToasts,
    ] =
      useState<
        ToastState[]
      >([]);

    const [
      deleteModal,
      setDeleteModal,
    ] =
      useState<DeleteModalState>(
        {
          isOpen:
            false,
          slotId:
            null,
          aircraftRegistration:
            null,
        },
      );

    const toastTimerRef =
      useRef<{
        [key: number]:
          number;
      }>({});

    const formRef =
      useRef<HTMLDivElement | null>(
        null,
      );

    const showToast =
      useCallback(
        (
          message:
            string,
          type:
            | 'success'
            | 'error',
        ) => {
          const id =
            Date.now();

          setToasts(
            (prev) => [
              ...prev,
              {
                id,
                message,
                type,
              },
            ],
          );

          toastTimerRef
            .current[id] =
            window.setTimeout(
              () => {
                setToasts(
                  (prev) =>
                    prev.filter(
                      (
                        toast,
                      ) =>
                        toast.id !==
                        id,
                    ),
                );

                delete toastTimerRef
                  .current[id];
              },
              4500,
            );
        },
        [],
      );

    useEffect(() => {
      return () => {
        Object.values(
          toastTimerRef.current,
        ).forEach(
          window.clearTimeout,
        );
      };
    }, []);

    const loadData =
      useCallback(
        async () => {
          try {
            setLoading(
              true,
            );

            const [
              fetchedSlots,
              fetchedAircrafts,
            ] =
              await Promise.all(
                [
                  maintenanceService.findAll(),
                  fleetService.getAircrafts(),
                ],
              );

            setSlots(
              fetchedSlots,
            );

            const fleet =
              fetchedAircrafts as
                AircraftLike[];

            setAircrafts(
              fleet,
            );

            setSelectedAircraftId(
              (
                current,
              ) => {
                if (
                  current &&
                  fleet.some(
                    (
                      aircraft,
                    ) =>
                      aircraft.id ===
                        current &&
                      !isRetiredAircraft(
                        aircraft,
                      ),
                  )
                ) {
                  return current;
                }

                const maintenanceAircraft =
                  fleet.find(
                    isMaintenanceAircraft,
                  );

                const availableAircraft =
                  fleet.find(
                    (
                      aircraft,
                    ) =>
                      !isRetiredAircraft(
                        aircraft,
                      ),
                  );

                return (
                  maintenanceAircraft
                    ?.id ||
                  availableAircraft
                    ?.id ||
                  ''
                );
              },
            );
          } catch (
            error: unknown
          ) {
            showToast(
              getAxiosErrorMessage(
                error,
              ) ||
                'Erreur lors du chargement des données de maintenance.',
              'error',
            );
          } finally {
            setLoading(
              false,
            );
          }
        },
        [
          showToast,
        ],
      );

    const refreshFleet =
      useCallback(
        async () => {
          try {
            setFleetRefreshing(
              true,
            );

            const data =
              await fleetService.getAircrafts();

            setAircrafts(
              data as AircraftLike[],
            );
          } catch (
            error: unknown
          ) {
            showToast(
              getAxiosErrorMessage(
                error,
              ),
              'error',
            );
          } finally {
            setFleetRefreshing(
              false,
            );
          }
        },
        [
          showToast,
        ],
      );

    useEffect(() => {
      void loadData();
    }, [
      loadData,
    ]);

    /**
     * Synchronise régulièrement avec AircraftManagement.
     * Si le backend bascule un avion vers "Maintenance",
     * il apparaîtra ici automatiquement.
     */
    useEffect(() => {
      const timer =
        window.setInterval(
          () => {
            void (async () => {
              try {
                // 1. Finaliser automatiquement les appareils sortis d'atelier.
                await syncExpiredMaintenances();

                // 2. Recharger le planning + la flotte.
                const [
                  refreshedSlots,
                  refreshedAircrafts,
                ] = await Promise.all([
                  maintenanceService.findAll(),
                  fleetService.getAircrafts(),
                ]);

                setSlots(refreshedSlots);
                setAircrafts(
                  refreshedAircrafts as AircraftLike[],
                );
              } catch {
                // Synchronisation silencieuse de fond.
              }
            })();
          },
          30_000,
        );

      return () =>
        window.clearInterval(
          timer,
        );
    }, []);

    const maintenanceAircrafts =
      useMemo(
        () =>
          aircrafts.filter(
            isMaintenanceAircraft,
          ),
        [
          aircrafts,
        ],
      );

    const selectableAircrafts =
      useMemo(
        () =>
          aircrafts.filter(
            (
              aircraft,
            ) =>
              !isRetiredAircraft(
                aircraft,
              ),
          ),
        [
          aircrafts,
        ],
      );

    const otherAircrafts =
      useMemo(
        () =>
          selectableAircrafts.filter(
            (
              aircraft,
            ) =>
              !isMaintenanceAircraft(
                aircraft,
              ),
          ),
        [
          selectableAircrafts,
        ],
      );

    /**
     * Conflit connu avant envoi au backend.
     * Cette pré-validation évite un POST 409 lorsqu'un slot
     * existant est déjà visible dans l'interface.
     */
    const requestedMaintenanceConflict =
      useMemo(
        () => {
          const interval =
            buildMaintenanceInterval(
              startDate,
              durationDays,
            );

          if (
            !interval ||
            !selectedAircraftId
          ) {
            return null;
          }

          return (
            slots.find(
              (
                slot,
              ) => {
                if (
                  slot.aircraftId !==
                  selectedAircraftId
                ) {
                  return false;
                }

                const existingStart =
                  new Date(
                    slot.startTime,
                  );

                const existingEnd =
                  new Date(
                    slot.endTime,
                  );

                if (
                  Number.isNaN(
                    existingStart.getTime(),
                  ) ||
                  Number.isNaN(
                    existingEnd.getTime(),
                  )
                ) {
                  return false;
                }

                return intervalsOverlap(
                  interval.start,
                  interval.end,
                  existingStart,
                  existingEnd,
                );
              },
            ) ??
            null
          );
        },
        [
          slots,
          selectedAircraftId,
          startDate,
          durationDays,
        ],
      );

    const activeSlotAircraftIds =
      useMemo(
        () => {
          const now =
            Date.now();

          return new Set(
            slots
              .filter(
                (
                  slot,
                ) =>
                  new Date(
                    slot.endTime,
                  ).getTime() >=
                  now,
              )
              .map(
                (
                  slot,
                ) =>
                  slot.aircraftId,
              ),
          );
        },
        [
          slots,
        ],
      );

    const selectAircraftForPlanning =
      (
        aircraft:
          AircraftLike,
      ) => {
        setSelectedAircraftId(
          aircraft.id,
        );

        if (
          !startDate
        ) {
          const today =
            new Date();

          setStartDate(
            [
              today.getFullYear(),
              String(
                today.getMonth() +
                  1,
              ).padStart(
                2,
                '0',
              ),
              String(
                today.getDate(),
              ).padStart(
                2,
                '0',
              ),
            ].join(
              '-',
            ),
          );
        }

        if (
          !description
        ) {
          setDescription(
            `Maintenance de ${getAircraftRegistration(
              aircraft,
            )}`,
          );
        }

        formRef.current?.scrollIntoView(
          {
            behavior:
              'smooth',
            block:
              'start',
          },
        );
      };

    const handleScheduleMaintenance =
      async (
        event:
          React.FormEvent,
      ) => {
        event.preventDefault();

        if (
          !selectedAircraftId ||
          !startDate ||
          durationDays <=
            0
        ) {
          showToast(
            'Veuillez sélectionner un appareil, une date et une durée valides.',
            'error',
          );
          return;
        }

        const interval =
          buildMaintenanceInterval(
            startDate,
            durationDays,
          );

        if (
          !interval
        ) {
          showToast(
            'La période de maintenance est invalide.',
            'error',
          );
          return;
        }

        if (
          requestedMaintenanceConflict
        ) {
          showToast(
            `Conflit : cet appareil possède déjà une maintenance du ${new Date(
              requestedMaintenanceConflict.startTime,
            ).toLocaleString(
              'fr-FR',
            )} au ${new Date(
              requestedMaintenanceConflict.endTime,
            ).toLocaleString(
              'fr-FR',
            )}.`,
            'error',
          );
          return;
        }

        try {
          setSubmitting(
            true,
          );

          /*
           * Vérification BACKEND avant le POST.
           *
           * Cela évite d'envoyer POST /maintenance lorsque le backend
           * sait déjà que la période est en conflit.
           */
          const availability =
            await maintenanceService.checkAvailability(
              selectedAircraftId,
              interval.start.toISOString(),
              interval.end.toISOString(),
            );

          if (!availability.available) {
            if (availability.maintenanceConflict) {
              const conflict =
                availability.maintenanceConflict;

              showToast(
                `Impossible de planifier : une maintenance existe déjà du ${new Date(
                  conflict.startTime,
                ).toLocaleString('fr-FR')} au ${new Date(
                  conflict.endTime,
                ).toLocaleString('fr-FR')}.`,
                'error',
              );

              return;
            }

            if (availability.flightConflict) {
              const conflict =
                availability.flightConflict;

              showToast(
                `Impossible de planifier : le vol ${conflict.numeroVol} occupe déjà cet avion du ${new Date(
                  conflict.heureDepart,
                ).toLocaleString('fr-FR')} au ${new Date(
                  conflict.heureArrivee,
                ).toLocaleString('fr-FR')}.`,
                'error',
              );

              return;
            }

            showToast(
              "Impossible de planifier : l'appareil n'est pas disponible sur cette période.",
              'error',
            );

            return;
          }

          await maintenanceService.create(
            {
              aircraftId:
                selectedAircraftId,
              maintenanceType,
              startTime:
                interval.start.toISOString(),
              endTime:
                interval.end.toISOString(),
              description:
                description.trim() ||
                undefined,
            },
          );

          showToast(
            'Blocage technique planifié avec succès.',
            'success',
          );

          setStartDate(
            '',
          );

          setDurationDays(
            1,
          );

          setDescription(
            '',
          );

          await loadData();
        } catch (
          error: unknown
        ) {
          if (
            axios.isAxiosError(
              error,
            )
          ) {
            const status =
              error.response?.status;

            const payload =
              error.response?.data as
                | {
                    code?: string;
                    message?: string | string[];
                    conflict?: unknown;
                    conflictingMaintenanceId?: string;
                    conflictingFlightId?: string;
                  }
                | undefined;

            /*
             * À garder pendant le diagnostic :
             * le navigateur affichera maintenant le vrai payload NestJS.
             */
            console.error(
              '[MaintenancePlanning] API error',
              {
                status,
                payload,
              },
            );

            if (status === 409) {
              const backendCode =
                payload?.code;

              const message =
                Array.isArray(payload?.message)
                  ? payload.message.join(' ')
                  : payload?.message ||
                    getAxiosErrorMessage(error);

              showToast(
                backendCode
                  ? `[${backendCode}] ${message}`
                  : message,
                'error',
              );

              try {
                const freshSlots =
                  await maintenanceService.findAll();

                setSlots(
                  freshSlots,
                );
              } catch {
                // Erreur principale déjà affichée.
              }

              return;
            }
          }

          showToast(
            getAxiosErrorMessage(
              error,
            ),
            'error',
          );
        } finally {
          setSubmitting(
            false,
          );
        }
      };

    const openDeleteModal =
      (
        slot:
          MaintenanceSlot,
      ) => {
        const targetAircraft =
          slot.aircraft as
            | AircraftLike
            | undefined;

        setDeleteModal(
          {
            isOpen:
              true,
            slotId:
              slot.id,
            aircraftRegistration:
              getAircraftRegistration(
                targetAircraft,
              ),
          },
        );
      };

    const closeDeleteModal =
      () => {
        setDeleteModal(
          {
            isOpen:
              false,
            slotId:
              null,
            aircraftRegistration:
              null,
          },
        );
      };

    const handleConfirmDelete =
      async () => {
        if (
          !deleteModal.slotId
        ) {
          return;
        }

        try {
          await maintenanceService.remove(
            deleteModal.slotId,
          );

          showToast(
            'Blocage technique annulé avec succès.',
            'success',
          );

          closeDeleteModal();

          await loadData();
        } catch (
          error: unknown
        ) {
          showToast(
            getAxiosErrorMessage(
              error,
            ),
            'error',
          );
        }
      };

    const selectedAircraft =
      useMemo(
        () =>
          aircrafts.find(
            (
              aircraft,
            ) =>
              aircraft.id ===
              selectedAircraftId,
          ) ?? null,
        [
          aircrafts,
          selectedAircraftId,
        ],
      );

    const maintenanceSummary =
      useMemo(
        () => {
          const now =
            Date.now();

          let planned = 0;
          let active = 0;
          let completed = 0;
          let aog = 0;

          for (
            const slot
            of slots
          ) {
            const start =
              new Date(
                slot.startTime,
              ).getTime();

            const end =
              new Date(
                slot.endTime,
              ).getTime();

            if (
              slot.maintenanceType ===
                'Aircraft On Ground' &&
              end >= now
            ) {
              aog += 1;
            }

            if (
              now <
              start
            ) {
              planned += 1;
            } else if (
              now <=
              end
            ) {
              active += 1;
            } else {
              completed += 1;
            }
          }

          return {
            planned,
            active,
            completed,
            aog,
          };
        },
        [
          slots,
        ],
      );

    if (
      loading
    ) {
      return (
        <div className="mx-auto flex min-h-[420px] w-full max-w-[1600px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>

            <div>
              <p className="text-sm font-black text-slate-800">
                Chargement de la maintenance
              </p>

              <p className="mt-1 text-xs font-medium text-slate-400">
                Synchronisation de la flotte et des créneaux techniques...
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-[1600px] space-y-5 pb-8">
        {/* ============================================================= */}
        {/* TOASTS                                                        */}
        {/* ============================================================= */}

        <div className="pointer-events-none fixed right-5 top-5 z-[70] flex w-[calc(100%-2.5rem)] max-w-md flex-col gap-3">
          {toasts.map(
            (
              toast,
            ) => (
              <div
                key={
                  toast.id
                }
                className={`pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-xl shadow-slate-950/10 ${
                  toast.type ===
                  'success'
                    ? 'border-emerald-200'
                    : 'border-rose-200'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                    toast.type ===
                    'success'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  {toast.type ===
                  'success' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[10px] font-black uppercase tracking-wider ${
                      toast.type ===
                      'success'
                        ? 'text-emerald-700'
                        : 'text-rose-600'
                    }`}
                  >
                    {toast.type ===
                    'success'
                      ? 'Opération réussie'
                      : 'Action impossible'}
                  </p>

                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-700">
                    {
                      toast.message
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setToasts(
                      (
                        current,
                      ) =>
                        current.filter(
                          (
                            item,
                          ) =>
                            item.id !==
                            toast.id,
                        ),
                    )
                  }
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ),
          )}
        </div>

        {/* ============================================================= */}
        {/* HEADER                                                        */}
        {/* ============================================================= */}

        <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-md shadow-emerald-950/15">
                <Wrench className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                    Planification de maintenance
                  </h1>
                </div>

                <p className="mt-1.5 max-w-3xl text-xs font-medium leading-5 text-slate-500 sm:text-sm">
                  Supervisez les appareils indisponibles, réservez les créneaux hangar et contrôlez les conflits avec le programme des vols.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadData()
              }
              disabled={
                fleetRefreshing
              }
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  fleetRefreshing
                    ? 'animate-spin'
                    : ''
                }`}
              />

              Actualiser les données
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:px-6">
            <span>
              {
                aircrafts.length
              }{' '}
              appareil(s) suivis
            </span>

            <span className="h-1 w-1 rounded-full bg-slate-300" />

            <span>
              {
                slots.length
              }{' '}
              créneau(x) enregistré(s)
            </span>

            <span className="h-1 w-1 rounded-full bg-slate-300" />

            <span>
              Synchronisation flotte automatique toutes les 30 s
            </span>
          </div>
        </header>

        {/* ============================================================= */}
        {/* KPI                                                           */}
        {/* ============================================================= */}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MaintenanceMetricCard
            label="En maintenance"
            value={
              maintenanceAircrafts.length
            }
            helper="Flotte"
            icon={
              <Wrench className="h-4 w-4" />
            }
            tone="amber"
          />

          <MaintenanceMetricCard
            label="En atelier"
            value={
              maintenanceSummary.active
            }
            helper="Maintenant"
            icon={
              <Gauge className="h-4 w-4" />
            }
            tone="emerald"
          />

          <MaintenanceMetricCard
            label="Planifiés"
            value={
              maintenanceSummary.planned
            }
            helper="À venir"
            icon={
              <Calendar className="h-4 w-4" />
            }
            tone="sky"
          />

          <MaintenanceMetricCard
            label="Urgences AOG"
            value={
              maintenanceSummary.aog
            }
            helper="Prioritaires"
            icon={
              <ShieldAlert className="h-4 w-4" />
            }
            tone="rose"
          />

          <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                État conflit
              </span>

              <div
                className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                  requestedMaintenanceConflict
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {requestedMaintenanceConflict ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
              </div>
            </div>

            <div className="mt-3">
              <p
                className={`text-lg font-black ${
                  requestedMaintenanceConflict
                    ? 'text-rose-700'
                    : 'text-emerald-700'
                }`}
              >
                {requestedMaintenanceConflict
                  ? 'Conflit'
                  : 'Disponible'}
              </p>

              <p className="mt-1 text-[10px] font-semibold text-slate-400">
                Pour la période saisie
              </p>
            </div>
          </div>
        </section>

        {/* ============================================================= */}
        {/* AIRCRAFT NEEDING MAINTENANCE                                  */}
        {/* ============================================================= */}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Plane className="h-4 w-4" />
                </div>

                <h2 className="text-base font-black text-slate-900">
                  Appareils nécessitant une intervention
                </h2>

                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">
                  {
                    maintenanceAircrafts.length
                  }
                </span>
              </div>

              <p className="mt-2 text-xs font-medium text-slate-500">
                Cette liste est alimentée automatiquement par le statut technique de la flotte.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void refreshFleet()
              }
              disabled={
                fleetRefreshing
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  fleetRefreshing
                    ? 'animate-spin'
                    : ''
                }`}
              />
              Synchroniser la flotte
            </button>
          </div>

          <div className="p-5 sm:p-6">
            {maintenanceAircrafts.length ===
            0 ? (
              <div className="flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-6 text-center">
                <div>
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>

                  <p className="mt-3 text-sm font-black text-emerald-800">
                    Aucun appareil signalé en maintenance
                  </p>

                  <p className="mt-1 text-xs font-medium text-emerald-700/70">
                    La flotte ne présente actuellement aucun appareil nécessitant un traitement.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {maintenanceAircrafts.map(
                  (
                    aircraft,
                  ) => {
                    const ratio =
                      maintenanceRatio(
                        aircraft,
                      );

                    const hasSlot =
                      activeSlotAircraftIds.has(
                        aircraft.id,
                      );

                    const isSelected =
                      aircraft.id ===
                      selectedAircraftId;

                    return (
                      <article
                        key={
                          aircraft.id
                        }
                        className={`group relative overflow-hidden rounded-2xl border p-4 transition ${
                          isSelected
                            ? 'border-emerald-300 bg-emerald-50/35 shadow-sm ring-2 ring-emerald-100'
                            : 'border-slate-200 bg-white hover:border-amber-200 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                                isSelected
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-700'
                              }`}
                            >
                              <Plane className="h-4 w-4" />
                            </div>

                            <div className="min-w-0">
                              <p className="font-mono text-sm font-black tracking-wide text-slate-900">
                                {getAircraftRegistration(
                                  aircraft,
                                )}
                              </p>

                              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                                {getAircraftModel(
                                  aircraft,
                                )}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${
                              hasSlot
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}
                          >
                            {hasSlot
                              ? 'Créneau réservé'
                              : 'À planifier'}
                          </span>
                        </div>

                        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold uppercase tracking-wide text-slate-400">
                              Potentiel utilisé
                            </span>

                            <strong
                              className={
                                ratio >= 90
                                  ? 'text-rose-600'
                                  : ratio >= 75
                                    ? 'text-amber-600'
                                    : 'text-emerald-700'
                              }
                            >
                              {
                                ratio
                              }
                              %
                            </strong>
                          </div>

                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                            <div
                              className={`h-full rounded-full transition-all ${
                                ratio >=
                                90
                                  ? 'bg-rose-500'
                                  : ratio >=
                                      75
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-600'
                              }`}
                              style={{
                                width: `${ratio}%`,
                              }}
                            />
                          </div>

                          <div className="mt-2 flex items-center justify-between text-[10px] font-semibold">
                            <span className="text-slate-500">
                              {formatNumber(
                                aircraft.heuresDepuisDerniereMaintenance,
                              )}{' '}
                              h utilisées
                            </span>

                            <span className="text-slate-400">
                              Limite{' '}
                              {formatNumber(
                                aircraft.limiteHeuresMaintenance,
                              )}{' '}
                              h
                            </span>
                          </div>
                        </div>

                        {!hasSlot ? (
                          <button
                            type="button"
                            onClick={() =>
                              selectAircraftForPlanning(
                                aircraft,
                              )
                            }
                            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-2.5 text-xs font-black text-white transition hover:bg-amber-700"
                          >
                            <Calendar className="h-3.5 w-3.5" />
                            Planifier cette maintenance
                          </button>
                        ) : (
                          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Immobilisation déjà programmée
                          </div>
                        )}
                      </article>
                    );
                  },
                )}
              </div>
            )}
          </div>
        </section>

        {/* ============================================================= */}
        {/* FORM + PLANNING                                               */}
        {/* ============================================================= */}

        <section className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          {/* FORM */}
          <div
            ref={
              formRef
            }
            className="h-fit rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4"
          >
            <div className="border-b border-slate-100 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Plus className="h-4 w-4" />
                </div>

                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    Nouveau blocage technique
                  </h2>

                  <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                    Réservation d&apos;un créneau d&apos;immobilisation
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={
                handleScheduleMaintenance
              }
              className="space-y-5 p-5"
            >
              {/* STEP 1 */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[9px] font-black text-white">
                    1
                  </span>

                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Appareil
                  </span>
                </div>

                <select
                  value={
                    selectedAircraftId
                  }
                  onChange={(
                    event,
                  ) =>
                    setSelectedAircraftId(
                      event.target
                        .value,
                    )
                  }
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-100/70"
                >
                  {maintenanceAircrafts.length >
                    0 && (
                    <optgroup label="Maintenance requise">
                      {maintenanceAircrafts.map(
                        (
                          aircraft,
                        ) => (
                          <option
                            key={
                              aircraft.id
                            }
                            value={
                              aircraft.id
                            }
                          >
                            {getAircraftRegistration(
                              aircraft,
                            )}{' '}
                            —{' '}
                            {getAircraftModel(
                              aircraft,
                            )}
                          </option>
                        ),
                      )}
                    </optgroup>
                  )}

                  {otherAircrafts.length >
                    0 && (
                    <optgroup label="Autres appareils">
                      {otherAircrafts.map(
                        (
                          aircraft,
                        ) => (
                          <option
                            key={
                              aircraft.id
                            }
                            value={
                              aircraft.id
                            }
                          >
                            {getAircraftRegistration(
                              aircraft,
                            )}{' '}
                            —{' '}
                            {getAircraftModel(
                              aircraft,
                            )}
                          </option>
                        ),
                      )}
                    </optgroup>
                  )}

                  {selectableAircrafts.length ===
                    0 && (
                    <option value="">
                      Aucun appareil disponible
                    </option>
                  )}
                </select>

                {selectedAircraft && (
                  <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                    <Plane className="h-3.5 w-3.5 shrink-0 text-slate-400" />

                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-black text-slate-700">
                        {getAircraftRegistration(
                          selectedAircraft,
                        )}{' '}
                        ·{' '}
                        {getAircraftModel(
                          selectedAircraft,
                        )}
                      </p>

                      <p className="mt-0.5 text-[9px] font-semibold text-slate-400">
                        Statut :{' '}
                        {getAircraftStatus(
                          selectedAircraft,
                        ) ||
                          'non renseigné'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* STEP 2 */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[9px] font-black text-white">
                    2
                  </span>

                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Intervention
                  </span>
                </div>

                <select
                  value={
                    maintenanceType
                  }
                  onChange={(
                    event,
                  ) =>
                    setMaintenanceType(
                      event.target
                        .value as MaintenanceType,
                    )
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-100/70"
                >
                  <option value="Type A">
                    Type A — Inspection légère
                  </option>

                  <option value="Type C">
                    Type C — Inspection lourde
                  </option>

                  <option value="Aircraft On Ground">
                    AOG — Intervention urgente
                  </option>
                </select>
              </div>

              {/* STEP 3 */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[9px] font-black text-white">
                    3
                  </span>

                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Période
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Début
                    </label>

                    <input
                      type="date"
                      value={
                        startDate
                      }
                      onChange={(
                        event,
                      ) =>
                        setStartDate(
                          event.target
                            .value,
                        )
                      }
                      required
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100/70"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Durée
                    </label>

                    <div className="relative">
                      <input
                        type="number"
                        min={
                          1
                        }
                        value={
                          durationDays
                        }
                        onChange={(
                          event,
                        ) =>
                          setDurationDays(
                            Math.max(
                              1,
                              Number(
                                event
                                  .target
                                  .value,
                              ) ||
                                1,
                            ),
                          )
                        }
                        required
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pr-12 text-xs font-semibold text-slate-700 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100/70"
                      />

                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-slate-400">
                        jours
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {requestedMaintenanceConflict && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />

                    <div>
                      <p className="text-[11px] font-black text-rose-800">
                        Créneau indisponible
                      </p>

                      <p className="mt-1 text-[10px] font-semibold leading-5 text-rose-700">
                        Un autre créneau existe déjà du{' '}
                        {new Date(
                          requestedMaintenanceConflict.startTime,
                        ).toLocaleString(
                          'fr-FR',
                        )}{' '}
                        au{' '}
                        {new Date(
                          requestedMaintenanceConflict.endTime,
                        ).toLocaleString(
                          'fr-FR',
                        )}
                        .
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Description / travaux prévus
                </label>

                <textarea
                  value={
                    description
                  }
                  onChange={(
                    event,
                  ) =>
                    setDescription(
                      event.target
                        .value,
                    )
                  }
                  rows={
                    3
                  }
                  placeholder="Ex. inspection cellule, contrôle moteur, remplacement de pièces..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium leading-5 text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100/70"
                />
              </div>

              <button
                type="submit"
                disabled={
                  submitting ||
                  selectableAircrafts.length ===
                    0 ||
                  Boolean(
                    requestedMaintenanceConflict,
                  )
                }
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-black text-white shadow-sm transition ${
                  requestedMaintenanceConflict
                    ? 'cursor-not-allowed bg-rose-400'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                } disabled:opacity-60`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Vérification et création...
                  </>
                ) : requestedMaintenanceConflict ? (
                  <>
                    <AlertCircle className="h-4 w-4" />
                    Période en conflit
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4" />
                    Planifier la maintenance
                  </>
                )}
              </button>

              <p className="text-center text-[9px] font-semibold leading-4 text-slate-400">
                La disponibilité est vérifiée côté serveur avant la création du créneau.
              </p>
            </form>
          </div>

          {/* PLANNING */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <Wrench className="h-4 w-4" />
                  </div>

                  <h2 className="text-base font-black text-slate-900">
                    Planning des interventions
                  </h2>
                </div>

                <p className="mt-2 text-xs font-medium text-slate-500">
                  Créneaux hangar, immobilisations et interventions techniques.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black text-slate-500">
                  {
                    slots.length
                  }{' '}
                  intervention(s)
                </span>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              {slots.length ===
              0 ? (
                <div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                  <div>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm">
                      <Wrench className="h-5 w-5" />
                    </div>

                    <p className="mt-4 text-sm font-black text-slate-700">
                      Aucun créneau de maintenance
                    </p>

                    <p className="mt-1 text-xs font-medium text-slate-400">
                      Utilisez le formulaire pour créer la première immobilisation.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {slots.map(
                    (
                      slot,
                    ) => {
                      const statusInfo =
                        getStatus(
                          slot.startTime,
                          slot.endTime,
                          slot.maintenanceType,
                        );

                      const daysCount =
                        calculateDurationInDays(
                          slot.startTime,
                          slot.endTime,
                        );

                      const targetAircraft =
                        slot.aircraft as
                          | AircraftLike
                          | undefined;

                      const registration =
                        getAircraftRegistration(
                          targetAircraft,
                        );

                      const model =
                        getAircraftModel(
                          targetAircraft,
                        );

                      const isOrphan =
                        !slot.aircraft;

                      return (
                        <article
                          key={
                            slot.id
                          }
                          className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                              <div
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${statusInfo.iconColor}`}
                              >
                                {
                                  statusInfo.icon
                                }
                              </div>

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`font-mono text-sm font-black tracking-wide ${
                                      isOrphan
                                        ? 'text-slate-400 line-through'
                                        : 'text-slate-900'
                                    }`}
                                  >
                                    {
                                      registration
                                    }
                                  </span>

                                  <span
                                    className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${statusInfo.css}`}
                                  >
                                    {
                                      statusInfo.label
                                    }
                                  </span>

                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-slate-500">
                                    {
                                      slot.maintenanceType
                                    }
                                  </span>

                                  {isOrphan && (
                                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[9px] font-black text-rose-600">
                                      Appareil introuvable
                                    </span>
                                  )}
                                </div>

                                <p className="mt-1.5 truncate text-xs font-semibold text-slate-500">
                                  {
                                    model
                                  }
                                </p>

                                {slot.description && (
                                  <p
                                    className="mt-2 max-w-xl truncate border-l-2 border-slate-200 pl-2.5 text-[10px] font-medium leading-5 text-slate-400"
                                    title={
                                      slot.description
                                    }
                                  >
                                    {
                                      slot.description
                                    }
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-3 lg:flex-nowrap lg:border-0 lg:pt-0">
                              <div className="min-w-28 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                                <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-slate-400">
                                  <Calendar className="h-3 w-3" />
                                  Début
                                </span>

                                <strong className="mt-1 block text-[11px] text-slate-700">
                                  {new Date(
                                    slot.startTime,
                                  ).toLocaleDateString(
                                    'fr-FR',
                                  )}
                                </strong>
                              </div>

                              <div className="min-w-24 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                                <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-slate-400">
                                  <Clock className="h-3 w-3" />
                                  Durée
                                </span>

                                <strong className="mt-1 block text-[11px] text-slate-700">
                                  {
                                    daysCount
                                  }{' '}
                                  {daysCount >
                                  1
                                    ? 'jours'
                                    : 'jour'}
                                </strong>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  openDeleteModal(
                                    slot,
                                  )
                                }
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                title="Annuler ce créneau"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    },
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ============================================================= */}
        {/* DELETE MODAL                                                  */}
        {/* ============================================================= */}

        {deleteModal.isOpen && (
          <div className="fixed inset-0 z-80 flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
              onClick={
                closeDeleteModal
              }
              aria-label="Fermer"
            />

            <div
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl shadow-slate-950/20"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-start justify-between border-b border-slate-100 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                    <Trash2 className="h-5 w-5" />
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Annuler le créneau
                    </h3>

                    <p className="mt-1 text-xs font-medium text-slate-500">
                      Cette action libérera l&apos;immobilisation planifiée.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={
                    closeDeleteModal
                  }
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5">
                <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-4">
                  <p className="text-xs font-semibold leading-5 text-rose-800">
                    Confirmez-vous l&apos;annulation du créneau de maintenance de l&apos;appareil{' '}
                    <span className="font-mono font-black">
                      {
                        deleteModal.aircraftRegistration
                      }
                    </span>
                    ?
                  </p>
                </div>

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={
                      closeDeleteModal
                    }
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    Retour
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void handleConfirmDelete()
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Confirmer l&apos;annulation
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

function MaintenanceMetricCard({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  icon: React.ReactNode;
  tone:
    | 'emerald'
    | 'amber'
    | 'sky'
    | 'rose';
}) {
  const tones = {
    emerald:
      'bg-emerald-50 text-emerald-700',
    amber:
      'bg-amber-50 text-amber-700',
    sky:
      'bg-sky-50 text-sky-700',
    rose:
      'bg-rose-50 text-rose-700',
  } as const;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
          {label}
        </span>

        <div
          className={`flex h-8 w-8 items-center justify-center rounded-xl ${tones[tone]}`}
        >
          {icon}
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="text-2xl font-black tracking-tight text-slate-900">
          {value}
        </span>

        <span className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
          {helper}
        </span>
      </div>
    </div>
  );
}

export default MaintenancePlanning;