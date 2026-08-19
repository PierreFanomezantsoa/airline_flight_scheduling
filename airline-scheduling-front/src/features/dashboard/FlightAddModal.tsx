import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  X,
  Calendar,
  Plane,
  MapPin,
  Sun,
  CloudRain,
  CloudLightning,
  Clock,
  AlertCircle,
  GitFork,
  Wrench,
  ArrowRightLeft,
  CheckCircle2,
  Plus,
  Trash2,
  Cpu,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

/* ============================================================================
 * API
 * ========================================================================== */

const API_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_API_BASE_URL) ||
  (typeof globalThis !== 'undefined' &&
    (
      globalThis as {
        process?: {
          env?: {
            REACT_APP_API_BASE_URL?: string;
          };
        };
      }
    ).process?.env?.REACT_APP_API_BASE_URL) ||
  'http://localhost:5000';

/* ============================================================================
 * TYPES
 * ========================================================================== */

export interface FlightLegData {
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart: string;
  heureArrivee: string;
}

export interface FlightFormData {
  numeroVol: string;

  aeroportDepart: string;

  aeroportEscale?:
    | string
    | string[];

  dureeEscale?: number;

  aeroportArrivee: string;

  heureDepart: string;
  heureArrivee: string;

  avionId: string;

  status?:
    | 'Planifié'
    | 'Retardé'
    | 'En Vol'
    | 'Annulé'
    | 'Effectué';

  motifAnnulation?: string;

  legs?: FlightLegData[];
}

export interface MaintenanceSlot {
  id?: string;

  aircraftId?: string;
  avionId?: string;

  immatriculation?: string;
  registration?: string;

  aircraft?: {
    id?: string;

    model?: string;
    modele?: string;

    immatriculation?: string;
    registration?: string;
  };

  startTime: string;
  endTime: string;

  maintenanceType?: string;
}

export interface AircraftData {
  id: string;

  model?: string;
  modele?: string;

  registration?: string;
  immatriculation?: string;

  status?: string;
  statut?: string;
}

/**
 * Structure volontairement large afin d'être compatible
 * avec les différentes formes retournées par /flights et /flights/fast.
 */
export interface ExistingFlightData {
  id: string;

  numeroVol?: string;
  flightNumber?: string;

  aeroportDepart?: string;
  origin?: string;

  aeroportArrivee?: string;
  destination?: string;

  heureDepart?: string;
  departure?: string;

  heureArrivee?: string;
  arrival?: string;

  avionId?: string | null;
  aircraftId?: string | null;

  aircraft?: string | null;

  immatriculation?: string | null;
  registration?: string | null;

  aircraftRegistration?: string | null;

  avion?: {
    id?: string;

    immatriculation?: string;
    registration?: string;

    model?: string;
    modele?: string;
  } | null;

  aircraftObject?: {
    id?: string;

    immatriculation?: string;
    registration?: string;
  } | null;

  statut?: string;
  status?: string;
}

export interface AirportOption {
  iata: string;
  name: string;
  gmtOffset: number;
}

export type WeatherRiskLevel =
  | 'LOW'
  | 'MODERATE'
  | 'HIGH'
  | 'SEVERE'
  | 'EXTREME'
  | 'UNKNOWN'
  | 'SKIPPED';

export interface WeatherPointPreview {
  airport?: string | null;

  severity?: number | null;

  available?: boolean;

  fetchedAt?: string | null;

  targetTime?: string | null;

  error?: string | null;
}

export interface WeatherAIPreview {
  engine?: string;

  evaluatedAt?: string | null;

  score?: number | null;

  riskLevel?: WeatherRiskLevel;

  riskLabel?: string;

  confidence?: number | null;

  dataAvailable?: boolean;

  persistentSevere?: boolean;

  minutesToDeparture?: number | null;

  recommendedAction?: string;

  recommendedActionLabel?: string;

  explanation?: string;

  departure?: WeatherPointPreview | null;

  arrival?: WeatherPointPreview | null;

  stopovers?: WeatherPointPreview[];
}

interface WeatherPreviewResponse {
  status:
    | 'success'
    | 'error';

  weatherAI?: WeatherAIPreview;

  message?: string;
}

interface FlightAddModalProps {
  isOpen: boolean;

  onClose: () => void;

  onSubmit: (
    formData: FlightFormData,
  ) => Promise<void>;

  fleetAircrafts: AircraftData[];

  isLoadingFleet: boolean;

  maintenanceSlots?: MaintenanceSlot[];

  initialData?: FlightFormData;

  /**
   * Très important en modification :
   * évite que le vol soit comparé avec lui-même.
   */
  editingFlightId?: string;
}

/* ============================================================================
 * CONSTANTES
 * ========================================================================== */

const AIRPORTS_LIST:
  readonly AirportOption[] = [
  {
    iata: 'TNR',
    name: 'Antananarivo (Ivato)',
    gmtOffset: 3,
  },

  {
    iata: 'CDG',
    name: 'Paris (Charles de Gaulle)',
    gmtOffset: 2,
  },

  {
    iata: 'JFK',
    name: 'New York (JFK)',
    gmtOffset: -4,
  },

  {
    iata: 'DXB',
    name: 'Dubai International',
    gmtOffset: 4,
  },

  {
    iata: 'RUN',
    name: 'La Réunion (Roland Garros)',
    gmtOffset: 4,
  },

  {
    iata: 'MRU',
    name: 'Maurice (Sir Seewoosagur)',
    gmtOffset: 4,
  },
];

const DIRECT_ROUTES_AND_STOPS:
  Record<
    string,
    Record<
      string,
      number
    >
  > = {
  TNR: {
    CDG: 11,
    DXB: 6.5,
    RUN: 1.5,
    MRU: 1.75,
  },

  CDG: {
    TNR: 11,
    JFK: 8,
    DXB: 7,
    RUN: 11,
    MRU: 11.5,
  },

  JFK: {
    CDG: 7.5,
    DXB: 12.5,
  },

  DXB: {
    TNR: 6.5,
    CDG: 7,
    JFK: 14,
    RUN: 6,
    MRU: 6.5,
  },

  RUN: {
    TNR: 1.5,
    CDG: 11,
    DXB: 6,
    MRU: 0.75,
  },

  MRU: {
    TNR: 1.75,
    CDG: 11.5,
    DXB: 6.5,
    RUN: 0.75,
  },
};

const INITIAL_FORM_STATE:
  FlightFormData = {
  numeroVol: '',

  aeroportDepart: '',

  aeroportEscale: '',

  dureeEscale: 120,

  aeroportArrivee: '',

  heureDepart: '',

  heureArrivee: '',

  avionId: '',

  status: 'Planifié',

  motifAnnulation: '',

  legs: [],
};

/* ============================================================================
 * HELPERS
 * ========================================================================== */

const formatFlightDuration = (
  hoursDecimal: number,
): string => {
  const hours =
    Math.floor(
      hoursDecimal,
    );

  const minutes =
    Math.round(
      (
        hoursDecimal -
        hours
      ) * 60,
    );

  return `${hours}h${
    minutes > 0
      ? ` ${minutes}m`
      : ''
  }`;
};

const normalizeReference = (
  value?:
    | string
    | null,
): string => {
  return String(
    value ?? '',
  )
    .trim()
    .toUpperCase();
};

const normalizeAircraft = (
  aircraft:
    AircraftData,
) => {
  const registration =
    aircraft.immatriculation ||
    aircraft.registration ||
    '';

  const model =
    aircraft.modele ||
    aircraft.model ||
    'Modèle inconnu';

  const status =
    aircraft.statut ||
    aircraft.status ||
    '';

  const id =
    aircraft.id ||
    registration;

  return {
    id,
    registration,
    model,
    status,
  };
};

const getAircraftRefs = (
  aircraft:
    ReturnType<
      typeof normalizeAircraft
    >,
): string[] => {
  return Array.from(
    new Set(
      [
        aircraft.id,
        aircraft.registration,
      ]
        .map(
          normalizeReference,
        )
        .filter(Boolean),
    ),
  );
};

const getSlotAircraftRef = (
  slot:
    MaintenanceSlot,
): string | undefined => {
  return (
    slot.immatriculation ||
    slot.registration ||
    slot.aircraft
      ?.immatriculation ||
    slot.aircraft
      ?.registration ||
    slot.aircraftId ||
    slot.avionId ||
    slot.aircraft?.id
  );
};

const isAircraftInMaintenanceStatus = (
  status?: string,
): boolean => {
  if (!status) {
    return false;
  }

  const normalized =
    status
      .toLowerCase()
      .trim();

  return (
    normalized.includes(
      'mainten',
    ) ||
    normalized.includes(
      'immobilis',
    ) ||
    normalized ===
      'out_of_service' ||
    normalized ===
      'out of service'
  );
};

/**
 * Détection standard du chevauchement :
 *
 * A : [startA -------- endA]
 * B :       [startB -------- endB]
 *
 * conflit si :
 * startA < endB ET endA > startB
 */
const checkOverlap = (
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean => {
  const aStart =
    new Date(
      startA,
    ).getTime();

  const aEnd =
    new Date(
      endA,
    ).getTime();

  const bStart =
    new Date(
      startB,
    ).getTime();

  const bEnd =
    new Date(
      endB,
    ).getTime();

  if (
    !Number.isFinite(
      aStart,
    ) ||
    !Number.isFinite(
      aEnd,
    ) ||
    !Number.isFinite(
      bStart,
    ) ||
    !Number.isFinite(
      bEnd,
    )
  ) {
    return false;
  }

  return (
    aStart <
      bEnd &&
    aEnd >
      bStart
  );
};

const getExistingFlightAircraftRefs =
  (
    flight:
      ExistingFlightData,
  ): string[] => {
    return Array.from(
      new Set(
        [
          flight.avionId,
          flight.aircraftId,
          flight.aircraft,
          flight.immatriculation,
          flight.registration,
          flight.aircraftRegistration,

          flight.avion
            ?.id,

          flight.avion
            ?.immatriculation,

          flight.avion
            ?.registration,

          flight.aircraftObject
            ?.id,

          flight.aircraftObject
            ?.immatriculation,

          flight.aircraftObject
            ?.registration,
        ]
          .map(
            normalizeReference,
          )
          .filter(Boolean),
      ),
    );
  };

const sameAircraft = (
  aircraft:
    ReturnType<
      typeof normalizeAircraft
    >,

  flight:
    ExistingFlightData,
): boolean => {
  const aircraftRefs =
    getAircraftRefs(
      aircraft,
    );

  const flightRefs =
    getExistingFlightAircraftRefs(
      flight,
    );

  return aircraftRefs.some(
    (
      reference,
    ) =>
      flightRefs.includes(
        reference,
      ),
  );
};

const getExistingFlightStart =
  (
    flight:
      ExistingFlightData,
  ): string => {
    return (
      flight.heureDepart ||
      flight.departure ||
      ''
    );
  };

const getExistingFlightEnd =
  (
    flight:
      ExistingFlightData,
  ): string => {
    return (
      flight.heureArrivee ||
      flight.arrival ||
      ''
    );
  };

const getExistingFlightNumber =
  (
    flight:
      ExistingFlightData,
  ): string => {
    return (
      flight.numeroVol ||
      flight.flightNumber ||
      'Vol existant'
    );
  };

const getExistingFlightStatus =
  (
    flight:
      ExistingFlightData,
  ): string => {
    return normalizeReference(
      flight.statut ||
        flight.status ||
        '',
    );
  };

const isCancelledFlight = (
  flight:
    ExistingFlightData,
): boolean => {
  const status =
    getExistingFlightStatus(
      flight,
    );

  return [
    'ANNULÉ',
    'ANNULE',
    'CANCELLED',
    'CANCELED',
  ].includes(
    status,
  );
};

const formatDateToIsoInput = (
  date:
    Date,
): string => {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() +
        1,
    ).padStart(
      2,
      '0',
    );

  const day =
    String(
      date.getDate(),
    ).padStart(
      2,
      '0',
    );

  const hours =
    String(
      date.getHours(),
    ).padStart(
      2,
      '0',
    );

  const minutes =
    String(
      date.getMinutes(),
    ).padStart(
      2,
      '0',
    );

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const clamp01 = (
  value?:
    | number
    | null,
) => {
  if (
    value == null ||
    !Number.isFinite(
      Number(
        value,
      ),
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      1,
      Number(
        value,
      ),
    ),
  );
};

const formatWeatherPercent = (
  value?:
    | number
    | null,
) => {
  const normalized =
    clamp01(
      value,
    );

  return normalized ==
    null
    ? '--'
    : `${Math.round(
        normalized *
          100,
      )}%`;
};

const getWeatherPreviewStyle =
  (
    preview?:
      | WeatherAIPreview
      | null,
  ) => {
    const level =
      preview?.riskLevel;

    if (
      level ===
      'EXTREME'
    ) {
      return {
        icon: (
          <CloudLightning className="h-4 w-4" />
        ),

        wrapper:
          'border-rose-200 bg-rose-50 text-rose-950',

        badge:
          'border-rose-200 bg-white text-rose-700',

        accent:
          'text-rose-700',
      };
    }

    if (
      level ===
        'SEVERE' ||
      level ===
        'HIGH'
    ) {
      return {
        icon: (
          <AlertCircle className="h-4 w-4" />
        ),

        wrapper:
          'border-orange-200 bg-orange-50 text-orange-950',

        badge:
          'border-orange-200 bg-white text-orange-700',

        accent:
          'text-orange-700',
      };
    }

    if (
      level ===
      'MODERATE'
    ) {
      return {
        icon: (
          <CloudRain className="h-4 w-4" />
        ),

        wrapper:
          'border-amber-200 bg-amber-50 text-amber-950',

        badge:
          'border-amber-200 bg-white text-amber-700',

        accent:
          'text-amber-700',
      };
    }

    if (
      preview
        ?.dataAvailable ===
        false ||
      level ===
        'UNKNOWN'
    ) {
      return {
        icon: (
          <AlertCircle className="h-4 w-4" />
        ),

        wrapper:
          'border-slate-200 bg-slate-50 text-slate-800',

        badge:
          'border-slate-200 bg-white text-slate-600',

        accent:
          'text-slate-600',
      };
    }

    return {
      icon: (
        <Sun className="h-4 w-4" />
      ),

      wrapper:
        'border-emerald-200 bg-emerald-50 text-emerald-950',

      badge:
        'border-emerald-200 bg-white text-emerald-700',

      accent:
        'text-emerald-700',
    };
  };

const calculateArrivalGMT =
  (
    originIata:
      string,

    destinationIata:
      string,

    departureIsoString:
      string,
  ): string => {
    if (
      !originIata ||
      !destinationIata ||
      !departureIsoString
    ) {
      return '';
    }

    const originAirport =
      AIRPORTS_LIST.find(
        (
          airport,
        ) =>
          airport.iata ===
          originIata,
      );

    const destinationAirport =
      AIRPORTS_LIST.find(
        (
          airport,
        ) =>
          airport.iata ===
          destinationIata,
      );

    if (
      !originAirport ||
      !destinationAirport ||
      originIata ===
        destinationIata
    ) {
      return '';
    }

    const durationHours =
      DIRECT_ROUTES_AND_STOPS[
        originIata
      ]?.[
        destinationIata
      ];

    if (
      durationHours ===
      undefined
    ) {
      return '';
    }

    const departureDate =
      new Date(
        departureIsoString,
      );

    if (
      Number.isNaN(
        departureDate.getTime(),
      )
    ) {
      return '';
    }

    const gmtDifference =
      destinationAirport.gmtOffset -
      originAirport.gmtOffset;

    const totalMinutes =
      (
        durationHours +
        gmtDifference
      ) * 60;

    const arrivalDate =
      new Date(
        departureDate.getTime() +
          totalMinutes *
            60 *
            1000,
      );

    return formatDateToIsoInput(
      arrivalDate,
    );
  };

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

export const FlightAddModal:
  React.FC<
    FlightAddModalProps
  > = ({
    isOpen,

    onClose,

    onSubmit,

    fleetAircrafts,

    isLoadingFleet,

    maintenanceSlots = [],

    initialData,

    editingFlightId,
  }) => {
    const [
      newFlight,
      setNewFlight,
    ] =
      useState<FlightFormData>(
        INITIAL_FORM_STATE,
      );

    const [
      selectedStop,
      setSelectedStop,
    ] =
      useState('');

    const [
      layoverHours,
      setLayoverHours,
    ] =
      useState(2);

    const [
      isSubmitting,
      setIsSubmitting,
    ] =
      useState(false);

    /* =========================================================================
     * EXISTING FLIGHTS
     * ======================================================================= */

    const [
      existingFlights,
      setExistingFlights,
    ] =
      useState<
        ExistingFlightData[]
      >([]);

    const [
      isLoadingExistingFlights,
      setIsLoadingExistingFlights,
    ] =
      useState(false);

    const [
      flightAvailabilityError,
      setFlightAvailabilityError,
    ] =
      useState<
        string | null
      >(null);

    /* =========================================================================
     * WEATHER
     * ======================================================================= */

    const [
      weatherPreview,
      setWeatherPreview,
    ] =
      useState<
        WeatherAIPreview |
        null
      >(null);

    const [
      isWeatherChecking,
      setIsWeatherChecking,
    ] =
      useState(false);

    const [
      weatherPreviewError,
      setWeatherPreviewError,
    ] =
      useState<
        string | null
      >(null);

    const isEdition =
      Boolean(
        initialData,
      );

    /* =========================================================================
     * RESET FORM
     * ======================================================================= */

    useEffect(() => {
      if (!isOpen) {
        return;
      }

      setWeatherPreview(
        null,
      );

      setWeatherPreviewError(
        null,
      );

      setIsWeatherChecking(
        false,
      );

      setFlightAvailabilityError(
        null,
      );

      if (
        initialData
      ) {
        setNewFlight({
          ...initialData,
        });

        const stop =
          Array.isArray(
            initialData.aeroportEscale,
          )
            ? initialData.aeroportEscale[
                0
              ]
            : initialData.aeroportEscale ||
              '';

        setSelectedStop(
          stop,
        );

        if (
          initialData.dureeEscale
        ) {
          setLayoverHours(
            Math.max(
              1,
              Math.round(
                initialData.dureeEscale /
                  60,
              ),
            ),
          );
        }
      } else {
        setNewFlight({
          ...INITIAL_FORM_STATE,
        });

        setSelectedStop(
          '',
        );

        setLayoverHours(
          2,
        );
      }
    }, [
      isOpen,
      initialData,
    ]);

    /* =========================================================================
     * LOAD EXISTING FLIGHTS
     *
     * Nécessaire pour détecter si un avion est déjà utilisé sur un autre vol.
     * ======================================================================= */

    useEffect(() => {
      if (!isOpen) {
        return;
      }

      const controller =
        new AbortController();

      const loadExistingFlights =
        async () => {
          setIsLoadingExistingFlights(
            true,
          );

          setFlightAvailabilityError(
            null,
          );

          try {
            let response =
              await fetch(
                `${API_BASE_URL}/flights/fast`,
                {
                  signal:
                    controller.signal,
                },
              );

            if (
              response.status ===
              404
            ) {
              response =
                await fetch(
                  `${API_BASE_URL}/flights?weather=0`,
                  {
                    signal:
                      controller.signal,
                  },
                );
            }

            if (
              !response.ok
            ) {
              throw new Error(
                `Impossible de charger les vols existants (HTTP ${response.status}).`,
              );
            }

            const payload =
              await response.json();

            setExistingFlights(
              Array.isArray(
                payload,
              )
                ? payload
                : [],
            );
          } catch (
            error:
              unknown
          ) {
            if (
              error instanceof
                Error &&
              error.name ===
                'AbortError'
            ) {
              return;
            }

            console.error(
              'Erreur chargement vols :',
              error,
            );

            setExistingFlights(
              [],
            );

            setFlightAvailabilityError(
              error instanceof
                Error
                ? error.message
                : 'Impossible de vérifier la disponibilité des avions.',
            );
          } finally {
            if (
              !controller
                .signal
                .aborted
            ) {
              setIsLoadingExistingFlights(
                false,
              );
            }
          }
        };

      void loadExistingFlights();

      return () => {
        controller.abort();
      };
    }, [
      isOpen,
    ]);

    /* =========================================================================
     * ESC KEY
     * ======================================================================= */

    useEffect(() => {
      const handleKeyDown =
        (
          event:
            KeyboardEvent,
        ) => {
          if (
            event.key ===
              'Escape' &&
            isOpen &&
            !isSubmitting
          ) {
            onClose();
          }
        };

      window.addEventListener(
        'keydown',
        handleKeyDown,
      );

      return () =>
        window.removeEventListener(
          'keydown',
          handleKeyDown,
        );
    }, [
      isOpen,
      isSubmitting,
      onClose,
    ]);

    /* =========================================================================
     * DIRECT ROUTE
     * ======================================================================= */

    const directDurationHours =
      useMemo(
        () => {
          if (
            !newFlight.aeroportDepart ||
            !newFlight.aeroportArrivee
          ) {
            return null;
          }

          return (
            DIRECT_ROUTES_AND_STOPS[
              newFlight
                .aeroportDepart
            ]?.[
              newFlight
                .aeroportArrivee
            ] ??
            null
          );
        },
        [
          newFlight.aeroportDepart,
          newFlight.aeroportArrivee,
        ],
      );

    const isDirectRoute =
      directDurationHours !==
      null;

    /* =========================================================================
     * SUGGESTED STOPS
     * ======================================================================= */

    const suggestedStops =
      useMemo(
        () => {
          if (
            !newFlight.aeroportDepart ||
            !newFlight.aeroportArrivee
          ) {
            return [];
          }

          const origin =
            newFlight.aeroportDepart;

          const destination =
            newFlight.aeroportArrivee;

          return AIRPORTS_LIST
            .map(
              (
                airport,
              ) =>
                airport.iata,
            )
            .filter(
              (
                hub,
              ) =>
                hub !==
                  origin &&
                hub !==
                  destination,
            )
            .filter(
              (
                hub,
              ) =>
                DIRECT_ROUTES_AND_STOPS[
                  origin
                ]?.[
                  hub
                ] !==
                  undefined &&
                DIRECT_ROUTES_AND_STOPS[
                  hub
                ]?.[
                  destination
                ] !==
                  undefined,
            );
        },
        [
          newFlight.aeroportDepart,
          newFlight.aeroportArrivee,
        ],
      );

    /* =========================================================================
     * ROUTE CALCULATION
     * ======================================================================= */

    const routeCalculation =
      useMemo(
        () => {
          const {
            aeroportDepart,
            aeroportArrivee,
            heureDepart,
            numeroVol,
          } =
            newFlight;

          if (
            !aeroportDepart ||
            !aeroportArrivee ||
            !heureDepart
          ) {
            return {
              calculatedArrival:
                '',

              generatedLegs:
                [] as FlightLegData[],
            };
          }

          /* -------------------------------------------------------------------
           * DIRECT
           * ----------------------------------------------------------------- */

          if (
            !selectedStop
          ) {
            if (
              isDirectRoute
            ) {
              const calculatedArrival =
                calculateArrivalGMT(
                  aeroportDepart,
                  aeroportArrivee,
                  heureDepart,
                );

              return {
                calculatedArrival,
                generatedLegs:
                  [] as FlightLegData[],
              };
            }

            return {
              calculatedArrival:
                '',

              generatedLegs:
                [] as FlightLegData[],
            };
          }

          /* -------------------------------------------------------------------
           * STOPOVER
           * ----------------------------------------------------------------- */

          const leg1Arrival =
            calculateArrivalGMT(
              aeroportDepart,
              selectedStop,
              heureDepart,
            );

          if (
            !leg1Arrival
          ) {
            return {
              calculatedArrival:
                '',

              generatedLegs:
                [] as FlightLegData[],
            };
          }

          const leg1ArrivalDate =
            new Date(
              leg1Arrival,
            );

          const leg2DepartureDate =
            new Date(
              leg1ArrivalDate.getTime() +
                layoverHours *
                  3600 *
                  1000,
            );

          const leg2Departure =
            formatDateToIsoInput(
              leg2DepartureDate,
            );

          const leg2Arrival =
            calculateArrivalGMT(
              selectedStop,
              aeroportArrivee,
              leg2Departure,
            );

          const baseFlightNumber =
            numeroVol ||
            'FL';

          const generatedLegs:
            FlightLegData[] = [
            {
              numeroVol:
                `${baseFlightNumber}-A`,

              aeroportDepart,

              aeroportArrivee:
                selectedStop,

              heureDepart,

              heureArrivee:
                leg1Arrival,
            },

            {
              numeroVol:
                `${baseFlightNumber}-B`,

              aeroportDepart:
                selectedStop,

              aeroportArrivee,

              heureDepart:
                leg2Departure,

              heureArrivee:
                leg2Arrival,
            },
          ];

          return {
            calculatedArrival:
              leg2Arrival,

            generatedLegs,
          };
        },
        [
          newFlight,
          selectedStop,
          layoverHours,
          isDirectRoute,
        ],
      );

    /* =========================================================================
     * SYNC ROUTE
     * ======================================================================= */

    useEffect(() => {
      setNewFlight(
        (
          previous,
        ) => {
          const isArrivalSame =
            previous.heureArrivee ===
            routeCalculation.calculatedArrival;

          const areLegsSame =
            JSON.stringify(
              previous.legs,
            ) ===
            JSON.stringify(
              routeCalculation.generatedLegs,
            );

          const previousStop =
            Array.isArray(
              previous.aeroportEscale,
            )
              ? previous.aeroportEscale[
                  0
                ] ||
                ''
              : previous.aeroportEscale ||
                '';

          const isStopSame =
            previousStop ===
            selectedStop;

          const expectedDuration =
            selectedStop
              ? layoverHours *
                60
              : undefined;

          const isDurationSame =
            previous.dureeEscale ===
            expectedDuration;

          if (
            isArrivalSame &&
            areLegsSame &&
            isStopSame &&
            isDurationSame
          ) {
            return previous;
          }

          return {
            ...previous,

            aeroportEscale:
              selectedStop ||
              undefined,

            dureeEscale:
              expectedDuration,

            heureArrivee:
              routeCalculation.calculatedArrival,

            legs:
              routeCalculation.generatedLegs,
          };
        },
      );
    }, [
      routeCalculation,
      selectedStop,
      layoverHours,
    ]);

    /* =========================================================================
     * PAST DATE
     * ======================================================================= */

    const isPastDate =
      useMemo(
        () => {
          if (
            !newFlight.heureDepart
          ) {
            return false;
          }

          const departure =
            new Date(
              newFlight.heureDepart,
            );

          if (
            Number.isNaN(
              departure.getTime(),
            )
          ) {
            return false;
          }

          return (
            departure <
            new Date()
          );
        },
        [
          newFlight.heureDepart,
        ],
      );

    /* =========================================================================
     * WEATHER
     * ======================================================================= */

    useEffect(() => {
      if (!isOpen) {
        return;
      }

      const canAssess =
        Boolean(
          newFlight.aeroportDepart,
        ) &&
        Boolean(
          newFlight.aeroportArrivee,
        ) &&
        Boolean(
          newFlight.heureDepart,
        ) &&
        Boolean(
          newFlight.heureArrivee,
        ) &&
        !(
          !isDirectRoute &&
          !selectedStop
        );

      if (
        !canAssess
      ) {
        setWeatherPreview(
          null,
        );

        setWeatherPreviewError(
          null,
        );

        setIsWeatherChecking(
          false,
        );

        return;
      }

      const controller =
        new AbortController();

      const timeoutId =
        window.setTimeout(
          async () => {
            setIsWeatherChecking(
              true,
            );

            setWeatherPreviewError(
              null,
            );

            try {
              const departure =
                new Date(
                  newFlight.heureDepart,
                );

              const arrival =
                new Date(
                  newFlight.heureArrivee,
                );

              const response =
                await fetch(
                  `${API_BASE_URL}/flights/weather/assess`,
                  {
                    method:
                      'POST',

                    headers: {
                      'Content-Type':
                        'application/json',

                      Accept:
                        'application/json',
                    },

                    signal:
                      controller.signal,

                    body:
                      JSON.stringify({
                        aeroportDepart:
                          newFlight.aeroportDepart,

                        aeroportArrivee:
                          newFlight.aeroportArrivee,

                        aeroportEscale:
                          selectedStop ||
                          undefined,

                        heureDepart:
                          departure.toISOString(),

                        heureArrivee:
                          arrival.toISOString(),
                      }),
                  },
                );

              const payload:
                WeatherPreviewResponse =
                  await response
                    .json()
                    .catch(
                      () => ({
                        status:
                          'error',

                        message:
                          'Réponse météo invalide.',
                      }),
                    );

              if (
                !response.ok ||
                !payload.weatherAI
              ) {
                throw new Error(
                  payload.message ||
                    'Prévision météo indisponible.',
                );
              }

              setWeatherPreview(
                payload.weatherAI,
              );
            } catch (
              error:
                unknown
            ) {
              if (
                error instanceof
                  Error &&
                error.name ===
                  'AbortError'
              ) {
                return;
              }

              console.error(
                'Erreur pré-évaluation météo :',
                error,
              );

              setWeatherPreview(
                null,
              );

              setWeatherPreviewError(
                error instanceof
                  Error
                  ? error.message
                  : 'Impossible d’évaluer la météo.',
              );
            } finally {
              if (
                !controller
                  .signal
                  .aborted
              ) {
                setIsWeatherChecking(
                  false,
                );
              }
            }
          },
          650,
        );

      return () => {
        window.clearTimeout(
          timeoutId,
        );

        controller.abort();
      };
    }, [
      isOpen,
      newFlight.aeroportDepart,
      newFlight.aeroportArrivee,
      newFlight.heureDepart,
      newFlight.heureArrivee,
      selectedStop,
      isDirectRoute,
    ]);

    /* =========================================================================
     * SWAP
     * ======================================================================= */

    const handleSwapAirports =
      useCallback(
        () => {
          setNewFlight(
            (
              previous,
            ) => ({
              ...previous,

              aeroportDepart:
                previous.aeroportArrivee,

              aeroportArrivee:
                previous.aeroportDepart,
            }),
          );

          setSelectedStop(
            '',
          );
        },
        [],
      );

    /* =========================================================================
     * FLEET + MAINTENANCE + FLIGHT OVERLAP
     * ======================================================================= */

    const fleetWithStatus =
      useMemo(
        () => {
          const {
            heureDepart,
            heureArrivee,
          } =
            newFlight;

          const hasDates =
            Boolean(
              heureDepart &&
              heureArrivee,
            );

          return fleetAircrafts.map(
            (
              rawAircraft,
            ) => {
              const aircraft =
                normalizeAircraft(
                  rawAircraft,
                );

              /* ---------------------------------------------------------------
               * GLOBAL MAINTENANCE STATUS
               * ------------------------------------------------------------- */

              const isGlobalMaint =
                isAircraftInMaintenanceStatus(
                  aircraft.status,
                );

              /* ---------------------------------------------------------------
               * MAINTENANCE SLOT
               * ------------------------------------------------------------- */

              let slotConflict:
                MaintenanceSlot |
                undefined;

              if (
                hasDates
              ) {
                slotConflict =
                  maintenanceSlots.find(
                    (
                      slot,
                    ) => {
                      const slotRef =
                        normalizeReference(
                          getSlotAircraftRef(
                            slot,
                          ),
                        );

                      if (
                        !slotRef
                      ) {
                        return false;
                      }

                      const aircraftRefs =
                        getAircraftRefs(
                          aircraft,
                        );

                      if (
                        !aircraftRefs.includes(
                          slotRef,
                        )
                      ) {
                        return false;
                      }

                      return checkOverlap(
                        heureDepart,
                        heureArrivee,
                        slot.startTime,
                        slot.endTime,
                      );
                    },
                  );
              }

              /* ---------------------------------------------------------------
               * OTHER FLIGHT OVERLAP
               * ------------------------------------------------------------- */

              let flightConflict:
                ExistingFlightData |
                undefined;

              if (
                hasDates
              ) {
                flightConflict =
                  existingFlights.find(
                    (
                      existingFlight,
                    ) => {
                      /*
                       * En modification, ne pas détecter le vol contre lui-même.
                       */
                      if (
                        editingFlightId &&
                        existingFlight.id ===
                          editingFlightId
                      ) {
                        return false;
                      }

                      /*
                       * Fallback si editingFlightId n'a pas encore été passé :
                       * ne pas comparer exactement le même vol initial.
                       */
                      if (
                        isEdition &&
                        !editingFlightId &&
                        initialData
                      ) {
                        const existingNumber =
                          normalizeReference(
                            getExistingFlightNumber(
                              existingFlight,
                            ),
                          );

                        const currentNumber =
                          normalizeReference(
                            initialData.numeroVol,
                          );

                        const existingStart =
                          getExistingFlightStart(
                            existingFlight,
                          );

                        const existingEnd =
                          getExistingFlightEnd(
                            existingFlight,
                          );

                        if (
                          existingNumber ===
                            currentNumber &&
                          existingStart ===
                            initialData.heureDepart &&
                          existingEnd ===
                            initialData.heureArrivee
                        ) {
                          return false;
                        }
                      }

                      /*
                       * Un vol annulé ne monopolise plus l'appareil.
                       */
                      if (
                        isCancelledFlight(
                          existingFlight,
                        )
                      ) {
                        return false;
                      }

                      /*
                       * Vérifier le même avion physique :
                       * UUID ou immatriculation.
                       */
                      if (
                        !sameAircraft(
                          aircraft,
                          existingFlight,
                        )
                      ) {
                        return false;
                      }

                      const existingStart =
                        getExistingFlightStart(
                          existingFlight,
                        );

                      const existingEnd =
                        getExistingFlightEnd(
                          existingFlight,
                        );

                      if (
                        !existingStart ||
                        !existingEnd
                      ) {
                        return false;
                      }

                      return checkOverlap(
                        heureDepart,
                        heureArrivee,
                        existingStart,
                        existingEnd,
                      );
                    },
                  );
              }

              const isSlotMaint =
                Boolean(
                  slotConflict,
                );

              const hasFlightConflict =
                Boolean(
                  flightConflict,
                );

              const isDisabled =
                isGlobalMaint ||
                isSlotMaint ||
                hasFlightConflict;

              let labelSuffix =
                '';

              if (
                isGlobalMaint
              ) {
                labelSuffix =
                  ` 🛠️ (EN MAINTENANCE - ${
                    aircraft.status ||
                    'Immobilisé'
                  })`;
              } else if (
                isSlotMaint
              ) {
                labelSuffix =
                  ' ⚠️ (Créneau réservé pour maintenance)';
              } else if (
                flightConflict
              ) {
                labelSuffix =
                  ` ⛔ (Occupé par ${getExistingFlightNumber(
                    flightConflict,
                  )})`;
              }

              return {
                ...aircraft,

                isGlobalMaint,

                isSlotMaint,

                hasFlightConflict,

                isDisabled,

                labelSuffix,

                slotConflict,

                flightConflict,
              };
            },
          );
        },
        [
          fleetAircrafts,
          maintenanceSlots,
          existingFlights,
          editingFlightId,
          initialData,
          isEdition,
          newFlight.heureDepart,
          newFlight.heureArrivee,
        ],
      );

    /* =========================================================================
     * SELECTED AIRCRAFT
     * ======================================================================= */

    const selectedAircraft =
      useMemo(
        () => {
          if (
            !newFlight.avionId
          ) {
            return undefined;
          }

          const selectedRef =
            normalizeReference(
              newFlight.avionId,
            );

          return fleetWithStatus.find(
            (
              aircraft,
            ) => {
              const refs =
                getAircraftRefs(
                  aircraft,
                );

              return refs.includes(
                selectedRef,
              );
            },
          );
        },
        [
          fleetWithStatus,
          newFlight.avionId,
        ],
      );

    /*
     * Si l'utilisateur avait sélectionné un avion,
     * puis modifie l'heure et que cet avion devient occupé,
     * on conserve la sélection pour pouvoir afficher précisément
     * le message de conflit.
     *
     * On ne vide donc PAS automatiquement avionId.
     */

    /* =========================================================================
     * VALIDATION
     * ======================================================================= */

    const validationError =
      useMemo(
        () => {
          /* ---------------------------------------------------------------
           * ROUTE
           * ------------------------------------------------------------- */

          if (
            !isDirectRoute &&
            !selectedStop &&
            newFlight.aeroportDepart &&
            newFlight.aeroportArrivee
          ) {
            return (
              `Absence de liaison directe entre ` +
              `${newFlight.aeroportDepart} et ` +
              `${newFlight.aeroportArrivee}. ` +
              `Veuillez sélectionner une escale.`
            );
          }

          /* ---------------------------------------------------------------
           * DATES
           * ------------------------------------------------------------- */

          if (
            newFlight.heureDepart &&
            newFlight.heureArrivee
          ) {
            const departure =
              new Date(
                newFlight.heureDepart,
              );

            const arrival =
              new Date(
                newFlight.heureArrivee,
              );

            if (
              Number.isNaN(
                departure.getTime(),
              ) ||
              Number.isNaN(
                arrival.getTime(),
              )
            ) {
              return 'Les dates de départ ou d’arrivée sont invalides.';
            }

            if (
              arrival <=
              departure
            ) {
              return "L'heure d'arrivée doit être strictement postérieure au départ.";
            }
          }

          /* ---------------------------------------------------------------
           * AIRCRAFT
           * ------------------------------------------------------------- */

          if (
            selectedAircraft
          ) {
            const aircraftName =
              selectedAircraft.registration ||
              selectedAircraft.model ||
              'Appareil';

            /* -------------------------------------------------------------
             * GLOBAL MAINTENANCE
             * ----------------------------------------------------------- */

            if (
              selectedAircraft.isGlobalMaint
            ) {
              return (
                `Immobilisation technique : l'appareil ` +
                `${aircraftName} est actuellement en maintenance ` +
                `(${selectedAircraft.status || 'indisponible'}).`
              );
            }

            /* -------------------------------------------------------------
             * MAINTENANCE SLOT
             * ----------------------------------------------------------- */

            if (
              selectedAircraft.slotConflict
            ) {
              const conflict =
                selectedAircraft.slotConflict;

              const maintenanceType =
                conflict.maintenanceType
                  ? ` (${conflict.maintenanceType})`
                  : '';

              return (
                `Conflit de maintenance : l'appareil ${aircraftName} ` +
                `est réservé pour maintenance${maintenanceType} du ` +
                `${new Date(
                  conflict.startTime,
                ).toLocaleString(
                  'fr-FR',
                )} au ` +
                `${new Date(
                  conflict.endTime,
                ).toLocaleString(
                  'fr-FR',
                )}.`
              );
            }

            /* -------------------------------------------------------------
             * AIRCRAFT OVERLAP
             * ----------------------------------------------------------- */

            if (
              selectedAircraft.flightConflict
            ) {
              const conflict =
                selectedAircraft.flightConflict;

              const conflictNumber =
                getExistingFlightNumber(
                  conflict,
                );

              const conflictStart =
                getExistingFlightStart(
                  conflict,
                );

              const conflictEnd =
                getExistingFlightEnd(
                  conflict,
                );

              return (
                `Conflit de planification : l'avion ${aircraftName} ` +
                `est déjà affecté au vol ${conflictNumber} du ` +
                `${new Date(
                  conflictStart,
                ).toLocaleString(
                  'fr-FR',
                )} au ` +
                `${new Date(
                  conflictEnd,
                ).toLocaleString(
                  'fr-FR',
                )}. ` +
                `Les deux rotations se chevauchent.`
              );
            }
          }

          return null;
        },
        [
          newFlight.aeroportDepart,
          newFlight.aeroportArrivee,
          newFlight.heureDepart,
          newFlight.heureArrivee,
          isDirectRoute,
          selectedStop,
          selectedAircraft,
        ],
      );

    /* =========================================================================
     * SUBMIT
     * ======================================================================= */

    const handleSubmit =
      async (
        event:
          React.FormEvent,
      ) => {
        event.preventDefault();

        if (
          validationError ||
          isSubmitting ||
          isLoadingExistingFlights
        ) {
          return;
        }

        setIsSubmitting(
          true,
        );

        try {
          const finalFlightData:
            FlightFormData = {
            ...newFlight,

            status:
              isPastDate
                ? 'Annulé'
                : newFlight.status ||
                  'Planifié',

            motifAnnulation:
              isPastDate
                ? 'Date de départ dépassée à la création'
                : newFlight.motifAnnulation,
          };

          await onSubmit(
            finalFlightData,
          );

          setNewFlight({
            ...INITIAL_FORM_STATE,
          });

          setSelectedStop(
            '',
          );

          onClose();
        } catch (
          error
        ) {
          console.error(
            'Erreur lors de la soumission du vol :',
            error,
          );
        } finally {
          setIsSubmitting(
            false,
          );
        }
      };

    /* =========================================================================
     * CLOSED
     * ======================================================================= */

    if (!isOpen) {
      return null;
    }

    /* =========================================================================
     * RENDER
     * ======================================================================= */

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">

        <div
          className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="flight-modal-title"
        >

          {/* =================================================================
              HEADER
          ================================================================= */}

          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">

            <div className="flex items-center gap-3">

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">

                <Plane className="h-4 w-4 rotate-45" />

              </div>

              <div>

                <h3
                  id="flight-modal-title"
                  className="text-sm font-black text-slate-900"
                >
                  {isEdition
                    ? 'Modifier la rotation'
                    : 'Créer une rotation'}
                </h3>

                <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                  Planification du vol, itinéraire et disponibilité des ressources
                </p>

              </div>

            </div>

            <button
              type="button"
              onClick={
                onClose
              }
              disabled={
                isSubmitting
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              aria-label="Fermer la fenêtre"
            >

              <X className="h-4 w-4" />

            </button>

          </div>

          {/* =================================================================
              FORM
          ================================================================= */}

          <form
            onSubmit={
              handleSubmit
            }
            className="flex-1 space-y-4 overflow-y-auto p-6 text-xs"
          >

            {/* ===============================================================
                FLIGHT NUMBER
            =============================================================== */}

            <div>

              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                Numéro du vol
              </label>

              <input
                type="text"
                required
                placeholder="Ex. MD050"
                value={
                  newFlight.numeroVol
                }
                onChange={(
                  event,
                ) =>
                  setNewFlight(
                    (
                      previous,
                    ) => ({
                      ...previous,

                      numeroVol:
                        event.target.value.toUpperCase(),
                    }),
                  )
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm font-black uppercase text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />

            </div>

            {/* ===============================================================
                ROUTE
            =============================================================== */}

            <div className="space-y-1.5">

              <div className="flex items-center justify-between">

                <label className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Itinéraire
                </label>

                {newFlight.aeroportDepart &&
                  newFlight.aeroportArrivee && (

                  <button
                    type="button"
                    onClick={
                      handleSwapAirports
                    }
                    className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 hover:text-emerald-800"
                  >

                    <ArrowRightLeft className="h-3 w-3" />

                    Intervertir

                  </button>

                )}

              </div>

              <div className="grid grid-cols-2 gap-3">

                <div className="relative">

                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

                  <select
                    required
                    value={
                      newFlight.aeroportDepart
                    }
                    onChange={(
                      event,
                    ) => {
                      setNewFlight(
                        (
                          previous,
                        ) => ({
                          ...previous,

                          aeroportDepart:
                            event.target.value,
                        }),
                      );

                      setSelectedStop(
                        '',
                      );
                    }}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-bold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white"
                  >

                    <option value="">
                      Départ
                    </option>

                    {AIRPORTS_LIST.map(
                      (
                        airport,
                      ) => (

                        <option
                          key={
                            airport.iata
                          }
                          value={
                            airport.iata
                          }
                        >
                          {airport.iata} - {airport.name} (GMT
                          {airport.gmtOffset >=
                          0
                            ? `+${airport.gmtOffset}`
                            : airport.gmtOffset}
                          )
                        </option>

                      ),
                    )}

                  </select>

                </div>

                <div className="relative">

                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

                  <select
                    required
                    value={
                      newFlight.aeroportArrivee
                    }
                    onChange={(
                      event,
                    ) => {
                      setNewFlight(
                        (
                          previous,
                        ) => ({
                          ...previous,

                          aeroportArrivee:
                            event.target.value,
                        }),
                      );

                      setSelectedStop(
                        '',
                      );
                    }}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-bold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white"
                  >

                    <option value="">
                      Arrivée
                    </option>

                    {AIRPORTS_LIST.map(
                      (
                        airport,
                      ) =>
                        airport.iata !==
                          newFlight.aeroportDepart && (

                          <option
                            key={
                              airport.iata
                            }
                            value={
                              airport.iata
                            }
                          >
                            {airport.iata} - {airport.name} (GMT
                            {airport.gmtOffset >=
                            0
                              ? `+${airport.gmtOffset}`
                              : airport.gmtOffset}
                            )
                          </option>

                        ),
                    )}

                  </select>

                </div>

              </div>

            </div>

            {/* ===============================================================
                DIRECT ROUTE
            =============================================================== */}

            {isDirectRoute &&
              directDurationHours !==
                null && (

              <div className="space-y-2">

                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">

                  <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-800">

                    <CheckCircle2 className="h-3.5 w-3.5" />

                    Route directe disponible

                  </span>

                  <span className="rounded-md bg-white px-2 py-1 font-mono text-[9px] font-black text-emerald-700">

                    {formatFlightDuration(
                      directDurationHours,
                    )}

                  </span>

                </div>

                {!selectedStop ? (

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedStop(
                        suggestedStops[
                          0
                        ] ||
                          '',
                      )
                    }
                    className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-emerald-700"
                  >

                    <Plus className="h-3 w-3" />

                    Ajouter une escale facultative

                  </button>

                ) : (

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedStop(
                        '',
                      )
                    }
                    className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-600 hover:text-rose-700"
                  >

                    <Trash2 className="h-3 w-3" />

                    Supprimer l’escale

                  </button>

                )}

              </div>

            )}

            {/* ===============================================================
                STOPOVER
            =============================================================== */}

            {(selectedStop ||
              (
                !isDirectRoute &&
                newFlight.aeroportDepart &&
                newFlight.aeroportArrivee
              )) && (

              <div
                className={`space-y-3 rounded-xl border p-3 ${
                  !isDirectRoute
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >

                {!isDirectRoute && (

                  <div className="flex items-start gap-2">

                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

                    <div>

                      <p className="text-[10px] font-black text-amber-900">
                        Escale obligatoire
                      </p>

                      <p className="mt-0.5 text-[10px] leading-4 text-amber-700">
                        Aucune liaison directe entre{' '}
                        <strong>
                          {newFlight.aeroportDepart}
                        </strong>{' '}
                        et{' '}
                        <strong>
                          {newFlight.aeroportArrivee}
                        </strong>.
                      </p>

                    </div>

                  </div>

                )}

                <div>

                  <label className="mb-1.5 block text-[8px] font-black uppercase tracking-wide text-slate-500">
                    Aéroport d’escale
                  </label>

                  {suggestedStops.length >
                  0 ? (

                    <div className="grid grid-cols-2 gap-2">

                      {suggestedStops.map(
                        (
                          stopIata,
                        ) => {
                          const stopAirport =
                            AIRPORTS_LIST.find(
                              (
                                airport,
                              ) =>
                                airport.iata ===
                                stopIata,
                            );

                          const active =
                            selectedStop ===
                            stopIata;

                          return (

                            <button
                              key={
                                stopIata
                              }
                              type="button"
                              onClick={() =>
                                setSelectedStop(
                                  stopIata,
                                )
                              }
                              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                                active
                                  ? 'border-emerald-700 bg-emerald-700 text-white'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
                              }`}
                            >

                              <div>

                                <span className="font-mono text-xs font-black">
                                  {
                                    stopIata
                                  }
                                </span>

                                <p className={`mt-0.5 truncate text-[8px] ${
                                  active
                                    ? 'text-emerald-100'
                                    : 'text-slate-400'
                                }`}>
                                  {
                                    stopAirport?.name
                                  }
                                </p>

                              </div>

                              {active && (
                                <CheckCircle2 className="h-4 w-4" />
                              )}

                            </button>

                          );
                        },
                      )}

                    </div>

                  ) : (

                    <p className="text-[10px] font-semibold text-rose-600">
                      Aucun hub compatible trouvé.
                    </p>

                  )}

                </div>

                {selectedStop && (

                  <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2">

                    <label className="text-[9px] font-bold text-slate-600">
                      Durée de l’escale
                    </label>

                    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2">

                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={
                          layoverHours
                        }
                        onChange={(
                          event,
                        ) =>
                          setLayoverHours(
                            Math.max(
                              1,
                              Number(
                                event.target.value,
                              ),
                            ),
                          )
                        }
                        className="h-8 w-10 text-center text-xs font-black text-slate-900 outline-none"
                      />

                      <span className="text-[9px] font-bold text-slate-400">
                        h
                      </span>

                    </div>

                  </div>

                )}

              </div>

            )}

            {/* ===============================================================
                LEGS
            =============================================================== */}

            {newFlight.legs &&
              newFlight.legs.length >
                0 && (

              <div className="space-y-2 rounded-xl bg-slate-900 p-3 text-white">

                <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-emerald-400">

                  <GitFork className="h-3 w-3" />

                  Tronçons générés ({newFlight.legs.length})

                </span>

                {newFlight.legs.map(
                  (
                    leg,
                    index,
                  ) => (

                    <div
                      key={`${leg.numeroVol}-${index}`}
                      className="flex items-center justify-between rounded-lg bg-slate-800 px-2.5 py-2"
                    >

                      <div className="flex items-center gap-2">

                        <span className="rounded bg-emerald-900 px-1.5 py-0.5 font-mono text-[9px] font-black text-emerald-300">
                          {
                            leg.numeroVol
                          }
                        </span>

                        <span className="font-mono text-[10px]">
                          {leg.aeroportDepart} → {leg.aeroportArrivee}
                        </span>

                      </div>

                      <div className="text-right font-mono text-[8px] text-slate-300">

                        <p>
                          {leg.heureDepart.split(
                            'T',
                          )[1]}
                        </p>

                        <p>
                          {leg.heureArrivee.split(
                            'T',
                          )[1]}
                        </p>

                      </div>

                    </div>

                  ),
                )}

              </div>

            )}

            {/* ===============================================================
                TIMES
            =============================================================== */}

            <div className="grid grid-cols-2 gap-3">

              <div>

                <label className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-slate-500">
                  Départ
                </label>

                <div className="relative">

                  <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

                  <input
                    type="datetime-local"
                    required
                    value={
                      newFlight.heureDepart
                    }
                    onChange={(
                      event,
                    ) =>
                      setNewFlight(
                        (
                          previous,
                        ) => ({
                          ...previous,

                          heureDepart:
                            event.target.value,
                        }),
                      )
                    }
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-2 text-[10px] font-semibold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white"
                  />

                </div>

              </div>

              <div>

                <label className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-slate-500">
                  Arrivée calculée
                </label>

                <div className="relative">

                  <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

                  <input
                    type="datetime-local"
                    required
                    readOnly
                    disabled={
                      !isDirectRoute &&
                      !selectedStop
                    }
                    value={
                      newFlight.heureArrivee
                    }
                    className="h-10 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 pl-9 pr-2 text-[10px] font-semibold text-slate-700 outline-none disabled:opacity-50"
                  />

                </div>

              </div>

            </div>

            {/* ===============================================================
                AIRCRAFT
            =============================================================== */}

            <div>

              <div className="mb-1.5 flex items-center justify-between gap-2">

                <label className="text-[9px] font-black uppercase tracking-wide text-slate-500">
                  Appareil assigné
                </label>

                {isLoadingExistingFlights && (

                  <span className="inline-flex items-center gap-1 text-[8px] font-bold text-slate-400">

                    <RefreshCw className="h-3 w-3 animate-spin" />

                    Vérification disponibilité...

                  </span>

                )}

              </div>

              <select
                value={
                  newFlight.avionId
                }
                onChange={(
                  event,
                ) =>
                  setNewFlight(
                    (
                      previous,
                    ) => ({
                      ...previous,

                      avionId:
                        event.target.value,
                    }),
                  )
                }
                disabled={
                  isLoadingFleet ||
                  isLoadingExistingFlights ||
                  (
                    !isDirectRoute &&
                    !selectedStop
                  )
                }
                className={`h-10 w-full rounded-xl border px-3 text-xs font-bold outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  selectedAircraft?.flightConflict
                    ? 'border-rose-300 bg-rose-50 text-rose-900'
                    : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-emerald-500 focus:bg-white'
                }`}
              >

                <option value="">
                  {isLoadingFleet
                    ? 'Chargement de la flotte...'
                    : isLoadingExistingFlights
                      ? 'Vérification des disponibilités...'
                      : '-- Sélectionner un avion --'}
                </option>

                {fleetWithStatus.map(
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
                      disabled={
                        aircraft.isDisabled
                      }
                    >
                      {aircraft.registration
                        ? `${aircraft.registration} (${aircraft.model})`
                        : aircraft.model}
                      {aircraft.labelSuffix}
                    </option>

                  ),
                )}

              </select>

              {flightAvailabilityError && (

                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">

                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />

                  <p className="text-[9px] leading-4 text-amber-800">
                    {flightAvailabilityError}
                  </p>

                </div>

              )}

            </div>

            {/* ===============================================================
                VALIDATION ERROR
            =============================================================== */}

            {validationError && (

              <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3">

                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-rose-600">

                  {selectedAircraft?.flightConflict ? (
                    <ShieldAlert className="h-4 w-4" />
                  ) : (
                    <Wrench className="h-4 w-4" />
                  )}

                </div>

                <div>

                  <p className="text-[8px] font-black uppercase tracking-[0.12em] text-rose-500">

                    {selectedAircraft?.flightConflict
                      ? 'Conflit avion détecté'
                      : 'Validation impossible'}

                  </p>

                  <p className="mt-1 text-[10px] font-semibold leading-5 text-rose-900">
                    {
                      validationError
                    }
                  </p>

                </div>

              </div>

            )}

            {/* ===============================================================
                PAST DATE
            =============================================================== */}

            {isPastDate &&
              !validationError && (

              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">

                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

                <div>

                  <p className="text-[8px] font-black uppercase tracking-wide text-amber-600">
                    Avis d’ordonnancement
                  </p>

                  <p className="mt-1 text-[10px] font-semibold leading-4 text-amber-900">
                    La date de départ est dépassée. Le vol sera enregistré avec le statut Annulé.
                  </p>

                </div>

              </div>

            )}

            {/* ===============================================================
                WEATHER
            =============================================================== */}

            {!isPastDate &&
              !validationError &&
              newFlight.aeroportDepart &&
              newFlight.aeroportArrivee &&
              newFlight.heureDepart &&
              newFlight.heureArrivee && (

              <div
                className={`rounded-xl border p-3 ${
                  weatherPreview
                    ? getWeatherPreviewStyle(
                        weatherPreview,
                      ).wrapper
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >

                <div className="flex items-start gap-3">

                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white ${
                      weatherPreview
                        ? getWeatherPreviewStyle(
                            weatherPreview,
                          ).accent
                        : 'text-slate-500'
                    }`}
                  >

                    {isWeatherChecking ? (

                      <RefreshCw className="h-4 w-4 animate-spin" />

                    ) : weatherPreview ? (

                      getWeatherPreviewStyle(
                        weatherPreview,
                      ).icon

                    ) : (

                      <Cpu className="h-4 w-4" />

                    )}

                  </div>

                  <div className="min-w-0 flex-1">

                    <div className="flex flex-wrap items-center gap-2">

                      <span className="text-[8px] font-black uppercase tracking-[0.14em] opacity-70">
                        Météo pré-vol
                      </span>

                      {weatherPreview && (

                        <span
                          className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase ${
                            getWeatherPreviewStyle(
                              weatherPreview,
                            ).badge
                          }`}
                        >
                          {weatherPreview.riskLabel ||
                            weatherPreview.riskLevel ||
                            'Évalué'}
                        </span>

                      )}

                    </div>

                    {isWeatherChecking ? (

                      <p className="mt-1 text-[10px] font-bold leading-5">
                        Analyse des conditions météo en cours...
                      </p>

                    ) : weatherPreview ? (

                      <>

                        <div className="mt-2 flex flex-wrap gap-2">

                          <span className="rounded-lg border border-white/70 bg-white/70 px-2 py-1 font-mono text-[9px] font-black">
                            Risque{' '}
                            {formatWeatherPercent(
                              weatherPreview.score,
                            )}
                          </span>

                          <span className="rounded-lg border border-white/70 bg-white/70 px-2 py-1 font-mono text-[9px] font-black">
                            Confiance{' '}
                            {formatWeatherPercent(
                              weatherPreview.confidence,
                            )}
                          </span>

                        </div>

                        <div className="mt-2 rounded-lg border border-white/70 bg-white/70 p-2.5">

                          <span className="text-[8px] font-black uppercase tracking-wide opacity-60">
                            Recommandation OCC
                          </span>

                          <p className="mt-0.5 text-[10px] font-black leading-5">
                            {weatherPreview.recommendedActionLabel ||
                              'Surveillance météo'}
                          </p>

                          <p className="mt-1 text-[9px] font-semibold leading-4 opacity-80">
                            {weatherPreview.explanation ||
                              'Évaluation météo disponible.'}
                          </p>

                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2">

                          <div className="rounded-lg border border-white/70 bg-white/60 p-2">

                            <span className="block text-[8px] font-black uppercase opacity-60">
                              Départ {newFlight.aeroportDepart}
                            </span>

                            <span className="mt-0.5 block font-mono text-[9px] font-black">
                              {formatWeatherPercent(
                                weatherPreview.departure?.severity,
                              )}
                            </span>

                          </div>

                          <div className="rounded-lg border border-white/70 bg-white/60 p-2 text-right">

                            <span className="block text-[8px] font-black uppercase opacity-60">
                              Arrivée {newFlight.aeroportArrivee}
                            </span>

                            <span className="mt-0.5 block font-mono text-[9px] font-black">
                              {formatWeatherPercent(
                                weatherPreview.arrival?.severity,
                              )}
                            </span>

                          </div>

                        </div>

                      </>

                    ) : weatherPreviewError ? (

                      <>

                        <p className="mt-1 text-[10px] font-bold text-slate-700">
                          Prévision météo non disponible.
                        </p>

                        <p className="mt-0.5 text-[9px] text-slate-500">
                          {
                            weatherPreviewError
                          }
                        </p>

                      </>

                    ) : (

                      <p className="mt-1 text-[10px] font-bold">
                        Préparation de l’analyse météo...
                      </p>

                    )}

                  </div>

                </div>

              </div>

            )}

            {/* ===============================================================
                ACTIONS
            =============================================================== */}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">

              <button
                type="button"
                onClick={
                  onClose
                }
                disabled={
                  isSubmitting
                }
                className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>

              <button
                type="submit"
                disabled={
                  Boolean(
                    validationError,
                  ) ||
                  isSubmitting ||
                  isLoadingExistingFlights ||
                  (
                    !isDirectRoute &&
                    !selectedStop
                  )
                }
                className="inline-flex h-9 min-w-33.75 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-[10px] font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >

                {isSubmitting && (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                )}

                {isSubmitting
                  ? 'Enregistrement...'
                  : isEdition
                    ? 'Mettre à jour'
                    : 'Enregistrer le vol'}

              </button>

            </div>

          </form>

        </div>

      </div>
    );
  };

export default FlightAddModal;