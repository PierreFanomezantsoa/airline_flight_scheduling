import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  ChevronDown,
  Plus,
  Search,
  Trash2,
  Cpu,
  RefreshCw,
  ShieldAlert,
  Activity,
} from 'lucide-react';
import { authFetch, pythonFetch } from '../Api/apiService';

/* ============================================================================
 * CONFIGURATION API — Python (port 5000 en dev, /python en prod via Nginx)
 * ============================================================================
 *
 * Les routes /flights, /flights/fast et /flights/weather/assess sont
 * hébergées sur le service Python (Flask), pas sur NestJS.
 *
 *   DEV  → VITE_PYTHON_BASE_URL = http://localhost:5000
 *   PROD → VITE_PYTHON_BASE_URL = /python
 *
 * Nginx en production redirige /python/... vers 127.0.0.1:5000/...
 * ========================================================================== */

/* ============================================================================
 * TYPES
 * ========================================================================== */

export interface FlightLegData {
  flightNumber: string;
  depAirportCode: string;
  arrAirportCode: string;
  departureTime: string;
  arrivalTime: string;
}

export interface FlightFormData {
  flightNumber: string;
  depAirportCode: string;
  stopoverCodes?: string | string[];
  stopoverMins?: number;
  arrAirportCode: string;
  departureTime: string;
  arrivalTime: string;
  refAircraft: string;
  flightStatus?: 'Planifié' | 'Retardé' | 'En Vol' | 'Annulé' | 'Effectué';
  motifAnnulation?: string;
  legs?: FlightLegData[];
}

export interface MaintenanceSlot {
  refMaintSlot?: string;
  refAircraft?: string;
  registration?: string;
  aircraft?: {
    refAircraft?: string;
    model?: string;
    registration?: string;
  };
  startTime: string;
  endTime: string;
  maintType?: string;
}

export interface AircraftData {
  refAircraft: string;
  model?: string;
  registration?: string;
  aircraftStatus?: string;
}

export interface ExistingFlightData {
  refFlight: string;
  flightNumber?: string;
  depAirportCode?: string;
  origin?: string;
  arrAirportCode?: string;
  destination?: string;
  departureTime?: string;
  departure?: string;
  arrivalTime?: string;
  arrival?: string;
  refAircraft?: string | null;
  aircraft?: string | {
    refAircraft?: string;
    registration?: string;
    model?: string;
  } | null;
  registration?: string | null;
  aircraftRegistration?: string | null;
  aircraftObject?: {
    refAircraft?: string;
    registration?: string;
  } | null;
  flightStatus?: string;
}

export interface AirportOption {
  refAirport: string;
  airportName: string;
  timezone: string;
  active: boolean;
}

export const MIN_STOPOVER_DURATION_MINUTES = 45;
const DEFAULT_STOPOVER_DURATION_MINUTES = 120;

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

export interface WeatherLocalMLPoint {
  airport?: string;
  available?: boolean;
  source?: string;
  score?: number | null;
  riskLevel?: WeatherRiskLevel;
  riskLabel?: string;
  confidence?: number | null;
  recommendedAction?: string;
  error?: string | null;
}

export interface WeatherLocalMLDetail {
  available?: boolean;
  source?: string;
  departure?: WeatherLocalMLPoint | null;
  arrival?: WeatherLocalMLPoint | null;
  stopovers?: WeatherLocalMLPoint[];
  evaluatedAt?: string | null;
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
  advisoryScore?: number | null;
  advisorySource?: string;
  advisoryRiskLevel?: WeatherRiskLevel;
  advisoryRiskLabel?: string;
  localML?: WeatherLocalMLDetail | null;
  localMLAvailable?: boolean;
  degraded?: boolean;
  apiAvailable?: boolean;
  mlAvailable?: boolean;
  stale?: boolean;
}

interface WeatherPreviewResponse {
  status: 'success' | 'error';
  weatherAI?: WeatherAIPreview;
  message?: string;
}

interface FlightAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: FlightFormData) => Promise<void>;
  fleetAircrafts: AircraftData[];
  isLoadingFleet: boolean;
  fleetLoadError?: string | null;
  onRetryFleet?: () => void;
  maintenanceSlots?: MaintenanceSlot[];
  initialData?: FlightFormData;
  editingFlightId?: string;
}

/* ============================================================================
 * CONSTANTES
 * ========================================================================== */

const DIRECT_ROUTES_AND_STOPS: Record<string, Record<string, number>> = {
  TNR: { CDG: 11, DXB: 6.5, RUN: 1.5, MRU: 1.75 },
  CDG: { TNR: 11, JFK: 8, DXB: 7, RUN: 11, MRU: 11.5, LHR: 1.25 },
  JFK: { CDG: 7.5, DXB: 12.5 },
  LHR: { CDG: 1.25 },
  DXB: { TNR: 6.5, CDG: 7, JFK: 14, RUN: 6, MRU: 6.5 },
  RUN: { TNR: 1.5, CDG: 11, DXB: 6, MRU: 0.75 },
  MRU: { TNR: 1.75, CDG: 11.5, DXB: 6.5, RUN: 0.75 },
};

const INITIAL_FORM_STATE: FlightFormData = {
  flightNumber: '',
  depAirportCode: '',
  stopoverCodes: '',
  stopoverMins: DEFAULT_STOPOVER_DURATION_MINUTES,
  arrAirportCode: '',
  departureTime: '',
  arrivalTime: '',
  refAircraft: '',
  flightStatus: 'Planifié',
  motifAnnulation: '',
  legs: [],
};

/* ============================================================================
 * HELPERS
 * ========================================================================== */

const formatFlightDuration = (hoursDecimal: number): string => {
  const hours = Math.floor(hoursDecimal);
  const minutes = Math.round((hoursDecimal - hours) * 60);
  return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
};

const normalizeReference = (value?: string | null): string =>
  String(value ?? '').trim().toUpperCase();

const normalizeAircraft = (aircraft: AircraftData) => {
  const registration = aircraft.registration || '';
  const model = aircraft.model || 'Modèle inconnu';
  const aircraftStatus = aircraft.aircraftStatus || '';
  const refAircraft = aircraft.refAircraft || registration;
  return { refAircraft, registration, model, aircraftStatus };
};

const getAircraftRefs = (aircraft: ReturnType<typeof normalizeAircraft>): string[] =>
  Array.from(
    new Set(
      [aircraft.refAircraft, aircraft.registration]
        .map(normalizeReference)
        .filter(Boolean),
    ),
  );

const getSlotAircraftRef = (slot: MaintenanceSlot): string | undefined =>
  slot.registration ||
  slot.registration ||
  slot.aircraft?.registration ||
  slot.aircraft?.registration ||
  slot.refAircraft ||
  slot.refAircraft ||
  slot.aircraft?.refAircraft;

const isAircraftInMaintenanceStatus = (status?: string): boolean => {
  if (!status) return false;
  const normalized = status.toLowerCase().trim();
  return (
    normalized.includes('mainten') ||
    normalized.includes('immobilis') ||
    normalized === 'out_of_service' ||
    normalized === 'out of service'
  );
};

const checkOverlap = (
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean => {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();

  if (
    !Number.isFinite(aStart) ||
    !Number.isFinite(aEnd) ||
    !Number.isFinite(bStart) ||
    !Number.isFinite(bEnd)
  ) {
    return false;
  }

  return aStart < bEnd && aEnd > bStart;
};

const getExistingFlightAircraftRefs = (flight: ExistingFlightData): string[] =>
  Array.from(
    new Set(
      [
        flight.refAircraft,
        typeof flight.aircraft === 'string'
          ? flight.aircraft
          : flight.aircraft?.refAircraft,
        flight.registration,
        flight.aircraftRegistration,
        typeof flight.aircraft === 'object' && flight.aircraft
          ? flight.aircraft.refAircraft
          : undefined,
        typeof flight.aircraft === 'object' && flight.aircraft
          ? flight.aircraft.registration
          : undefined,
        flight.aircraftObject?.refAircraft,
        flight.aircraftObject?.registration,
      ]
        .map(normalizeReference)
        .filter(Boolean),
    ),
  );

const sameAircraft = (
  aircraft: ReturnType<typeof normalizeAircraft>,
  flight: ExistingFlightData,
): boolean => {
  const aircraftRefs = getAircraftRefs(aircraft);
  const flightRefs = getExistingFlightAircraftRefs(flight);
  return aircraftRefs.some((reference) => flightRefs.includes(reference));
};

const getExistingFlightStart = (flight: ExistingFlightData): string =>
  flight.departureTime || flight.departure || '';

const getExistingFlightEnd = (flight: ExistingFlightData): string =>
  flight.arrivalTime || flight.arrival || '';

const getExistingFlightNumber = (flight: ExistingFlightData): string =>
  flight.flightNumber || flight.flightNumber || 'Vol existant';

const getExistingFlightStatus = (flight: ExistingFlightData): string =>
  normalizeReference(flight.flightStatus || flight.flightStatus || '');

const isCancelledFlight = (flight: ExistingFlightData): boolean => {
  const status = getExistingFlightStatus(flight);
  return ['ANNULÉ', 'ANNULE', 'CANCELLED', 'CANCELED'].includes(status);
};

interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const getZonedDateTimeParts = (date: Date, timezone: string): ZonedDateTimeParts => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
};

const formatDateTimeInTimezone = (value: string, timezone?: string): string => {
  if (!value || !timezone) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  try {
    const parts = getZonedDateTimeParts(date, timezone);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  } catch {
    return '';
  }
};

const localDateTimeToIso = (value: string, timezone?: string): string => {
  if (!value || !timezone) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return '';

  const [, year, month, day, hour, minute] = match.map(Number);
  const targetLocalAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = targetLocalAsUtc;

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = getZonedDateTimeParts(new Date(timestamp), timezone);
      const displayedAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      );
      const difference = targetLocalAsUtc - displayedAsUtc;
      if (difference === 0) break;
      timestamp += difference;
    }

    const result = new Date(timestamp);
    const verified = getZonedDateTimeParts(result, timezone);
    if (
      verified.year !== year ||
      verified.month !== month ||
      verified.day !== day ||
      verified.hour !== hour ||
      verified.minute !== minute
    ) {
      return '';
    }
    return result.toISOString();
  } catch {
    return '';
  }
};

const clamp01 = (value?: number | null) => {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(1, Number(value)));
};

const formatWeatherPercent = (value?: number | null) => {
  const normalized = clamp01(value);
  return normalized == null ? '--' : `${Math.round(normalized * 100)}%`;
};

const getWeatherPreviewStyle = (preview?: WeatherAIPreview | null) => {
  const level = preview?.riskLevel;

  if (level === 'EXTREME') {
    return {
      icon: <CloudLightning className="h-4 w-4" />,
      wrapper: 'border-rose-200 bg-rose-50 text-rose-950',
      badge: 'border-rose-200 bg-white text-rose-700',
      accent: 'text-rose-700',
    };
  }
  if (level === 'SEVERE' || level === 'HIGH') {
    return {
      icon: <AlertCircle className="h-4 w-4" />,
      wrapper: 'border-orange-200 bg-orange-50 text-orange-950',
      badge: 'border-orange-200 bg-white text-orange-700',
      accent: 'text-orange-700',
    };
  }
  if (level === 'MODERATE') {
    return {
      icon: <CloudRain className="h-4 w-4" />,
      wrapper: 'border-amber-200 bg-amber-50 text-amber-950',
      badge: 'border-amber-200 bg-white text-amber-700',
      accent: 'text-amber-700',
    };
  }
  if (preview?.dataAvailable === false || level === 'UNKNOWN') {
    return {
      icon: <AlertCircle className="h-4 w-4" />,
      wrapper: 'border-slate-200 bg-slate-50 text-slate-800',
      badge: 'border-slate-200 bg-white text-slate-600',
      accent: 'text-slate-600',
    };
  }
  return {
    icon: <Sun className="h-4 w-4" />,
    wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    badge: 'border-emerald-200 bg-white text-emerald-700',
    accent: 'text-emerald-700',
  };
};

const getWeatherSourceBadge = (preview?: WeatherAIPreview | null) => {
  if (!preview) return null;

  if (preview.dataAvailable === false || preview.riskLevel === 'UNKNOWN') {
    return {
      label: 'Indisponible',
      className: 'border-slate-300 bg-slate-100 text-slate-700',
      title: 'Aucune donnée météo disponible — vérifiez le fournisseur météo en production',
    };
  }

  if (preview.degraded || preview.stale) {
    return {
      label: 'Dégradé',
      className: 'border-amber-300 bg-amber-100 text-amber-800',
      title: 'Source dégradée : décision OCC requise',
    };
  }

  const source = preview.advisorySource || '';

  if (source.includes('LOCAL_ML') && !source.includes('API_PLUS')) {
    return {
      label: 'ML local',
      className: 'border-violet-300 bg-violet-100 text-violet-800',
      title: 'Score ML local consultatif — non décisionnel',
    };
  }

  if (source.includes('API_PLUS_LOCAL_ML')) {
    return {
      label: 'API + ML',
      className: 'border-emerald-300 bg-emerald-100 text-emerald-800',
      title: 'Fusion API (80%) + ML local (20%)',
    };
  }

  return {
    label: 'API',
    className: 'border-sky-300 bg-sky-100 text-sky-800',
    title: 'Fournisseur météo principal',
  };
};

const getRouteDurationMinutes = (
  originIata: string,
  destinationIata: string,
): number | null => {
  const durationHours = DIRECT_ROUTES_AND_STOPS[originIata]?.[destinationIata];
  if (durationHours === undefined || !Number.isFinite(durationHours) || durationHours <= 0) {
    return null;
  }
  return Math.round(durationHours * 60);
};

const calculateArrival = (
  originIata: string,
  destinationIata: string,
  departureIsoString: string,
  airports: AirportOption[],
): string => {
  if (!originIata || !destinationIata || !departureIsoString) return '';

  const originAirport = airports.find((airport) => airport.refAirport === originIata);
  const destinationAirport = airports.find((airport) => airport.refAirport === destinationIata);

  if (!originAirport || !destinationAirport || originIata === destinationIata) {
    return '';
  }

  const durationMinutes = getRouteDurationMinutes(originIata, destinationIata);
  if (durationMinutes === null) return '';

  const departureDate = new Date(departureIsoString);
  if (Number.isNaN(departureDate.getTime())) return '';

  return new Date(departureDate.getTime() + durationMinutes * 60_000).toISOString();
};

const formatDurationMinutes = (durationMinutes: number): string => {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return [
    hours > 0 ? `${hours} h` : '',
    minutes > 0 ? `${minutes} min` : '',
  ]
    .filter(Boolean)
    .join(' ') || '0 min';
};

interface SearchableSelectOption {
  value: string;
  label: string;
  description: string;
  displayLabel: string;
  searchText?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  id: string;
  label: string;
  value: string;
  options: SearchableSelectOption[];
  placeholder: string;
  searchPlaceholder: string;
    required?: boolean;
    hasError?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  onChange: (value: string) => void;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  id,
  label,
  value,
  options,
    required = false,
    hasError = false,
  placeholder,
  searchPlaceholder,
  disabled = false,
  icon,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = `${id}-options`;
  const selectedOption = options.find((option) => option.value === value);
  const normalizedQuery = query
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
  const filteredOptions = options.filter((option) =>
    [option.label, option.description, option.searchText]
      .filter(Boolean)
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('fr')
      .includes(normalizedQuery),
  );

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1.5 block text-[10px] font-semibold text-slate-700"
      >
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </label>
      <div className="relative" ref={dropdownRef}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-required={required}
          disabled={disabled}
          onClick={() => {
            setIsOpen((open) => !open);
            setQuery('');
          }}
          className={`flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border px-3 text-left text-xs outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${
            hasError
              ? 'border-rose-300 bg-rose-50 text-rose-900 focus:border-rose-500 focus:ring-rose-100'
              : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 focus:border-emerald-500 focus:ring-emerald-100 disabled:bg-slate-50'
          }`}
        >
          <span className="shrink-0 text-slate-400">{icon}</span>
          <span className={`min-w-0 flex-1 truncate ${selectedOption ? 'font-semibold' : 'text-slate-400'}`}>
            {selectedOption?.displayLabel || placeholder}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-full min-w-[min(22rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>
            <div id={listboxId} role="listbox" aria-label={label} className="max-h-56 overflow-y-auto">
              {filteredOptions.length ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    disabled={option.disabled}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className="block w-full border-b border-slate-100 px-3.5 py-2.5 text-left last:border-0 hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                      {option.description}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3.5 py-4 text-center text-xs text-slate-500">
                  Aucun résultat trouvé.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * COMPOSANT
 * ========================================================================== */

export const FlightAddModal: React.FC<FlightAddModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  fleetAircrafts,
  isLoadingFleet,
  fleetLoadError,
  onRetryFleet,
  maintenanceSlots = [],
  initialData,
  editingFlightId,
}) => {
  const [newFlight, setNewFlight] = useState<FlightFormData>(INITIAL_FORM_STATE);
  const [selectedStop, setSelectedStop] = useState('');
  const [layoverMinutes, setLayoverMinutes] = useState(
    DEFAULT_STOPOVER_DURATION_MINUTES,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [airports, setAirports] = useState<AirportOption[]>([]);
  const [isLoadingAirports, setIsLoadingAirports] = useState(false);
  const [airportLoadError, setAirportLoadError] = useState<string | null>(null);
  const [timeZoneError, setTimeZoneError] = useState<string | null>(null);

  /* EXISTING FLIGHTS */
  const [existingFlights, setExistingFlights] = useState<ExistingFlightData[]>([]);
  const [isLoadingExistingFlights, setIsLoadingExistingFlights] = useState(false);
  const [flightAvailabilityError, setFlightAvailabilityError] = useState<string | null>(null);

  /* WEATHER */
  const [weatherPreview, setWeatherPreview] = useState<WeatherAIPreview | null>(null);
  const [isWeatherChecking, setIsWeatherChecking] = useState(false);
  const [weatherPreviewError, setWeatherPreviewError] = useState<string | null>(null);

  const isEdition = Boolean(initialData);

  const originAirport = useMemo(
    () => airports.find((airport) => airport.refAirport === newFlight.depAirportCode),
    [airports, newFlight.depAirportCode],
  );
  const destinationAirport = useMemo(
    () => airports.find((airport) => airport.refAirport === newFlight.arrAirportCode),
    [airports, newFlight.arrAirportCode],
  );

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    setIsLoadingAirports(true);
    setAirportLoadError(null);

    const loadAirports = async () => {
      try {
        const response = await authFetch('/airports', { signal: controller.signal });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload)) {
          throw new Error('Impossible de charger les aéroports actifs.');
        }
        setAirports(
          (payload as AirportOption[])
            .filter((airport) => airport.active !== false)
            .sort((left, right) => left.refAirport.localeCompare(right.refAirport)),
        );
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setAirports([]);
        setAirportLoadError(
          error instanceof Error ? error.message : 'Impossible de charger les aéroports.',
        );
      } finally {
        if (!controller.signal.aborted) setIsLoadingAirports(false);
      }
    };

    void loadAirports();
    return () => controller.abort();
  }, [isOpen]);

  /* =========================================================================
   * RESET FORM
   * ======================================================================= */

  useEffect(() => {
    if (!isOpen) return;

    setWeatherPreview(null);
    setWeatherPreviewError(null);
    setIsWeatherChecking(false);
    setFlightAvailabilityError(null);
    setTimeZoneError(null);

    if (initialData) {
      setNewFlight({ ...initialData });

      const stop = Array.isArray(initialData.stopoverCodes)
        ? initialData.stopoverCodes[0]
        : initialData.stopoverCodes || '';
      setSelectedStop(stop);

      if (initialData.stopoverMins) {
        setLayoverMinutes(
          Math.max(MIN_STOPOVER_DURATION_MINUTES, initialData.stopoverMins),
        );
      } else {
        setLayoverMinutes(DEFAULT_STOPOVER_DURATION_MINUTES);
      }
    } else {
      setNewFlight({ ...INITIAL_FORM_STATE });
      setSelectedStop('');
      setLayoverMinutes(DEFAULT_STOPOVER_DURATION_MINUTES);
    }
  }, [isOpen, initialData]);

  /* =========================================================================
   * LOAD EXISTING FLIGHTS
  * ✅ Utilise le client Python authentifié
   * ======================================================================= */

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();

    const loadExistingFlights = async () => {
      setIsLoadingExistingFlights(true);
      setFlightAvailabilityError(null);

      try {
        let response = await pythonFetch('/flights/fast', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (response.status === 404) {
          response = await pythonFetch('/flights?weather=0', {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });
        }

        if (!response.ok) {
          throw new Error(
            `Impossible de charger les vols existants (HTTP ${response.status}).`,
          );
        }

        const payload = await response.json();
        setExistingFlights(Array.isArray(payload) ? payload : []);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;

        console.error('Erreur chargement vols :', error);
        setExistingFlights([]);
        setFlightAvailabilityError(
          error instanceof Error
            ? error.message
            : 'Impossible de vérifier la disponibilité des aircraft.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingExistingFlights(false);
        }
      }
    };

    void loadExistingFlights();

    return () => controller.abort();
  }, [isOpen]);

  /* =========================================================================
   * ESC KEY
   * ======================================================================= */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  /* =========================================================================
   * DIRECT ROUTE
   * ======================================================================= */

  const directDurationHours = useMemo(() => {
    if (!newFlight.depAirportCode || !newFlight.arrAirportCode) return null;
    return (
      DIRECT_ROUTES_AND_STOPS[newFlight.depAirportCode]?.[newFlight.arrAirportCode] ??
      null
    );
  }, [newFlight.depAirportCode, newFlight.arrAirportCode]);

  const isDirectRoute = directDurationHours !== null;

  /* =========================================================================
   * SUGGESTED STOPS
   * ======================================================================= */

  const suggestedStops = useMemo(() => {
    if (!newFlight.depAirportCode || !newFlight.arrAirportCode) return [];

    const origin = newFlight.depAirportCode;
    const destination = newFlight.arrAirportCode;

    return airports
      .map((airport) => airport.refAirport)
      .filter((hub) => hub !== origin && hub !== destination)
      .flatMap((hub) => {
        const firstLegDuration = getRouteDurationMinutes(origin, hub);
        const secondLegDuration = getRouteDurationMinutes(hub, destination);
        return firstLegDuration !== null && secondLegDuration !== null
          ? [{ hub, firstLegDuration, secondLegDuration }]
          : [];
      })
      .sort(
        (left, right) =>
          left.firstLegDuration +
          left.secondLegDuration -
          right.firstLegDuration -
          right.secondLegDuration,
      )
      .map((candidate) => candidate.hub);
  }, [airports, newFlight.depAirportCode, newFlight.arrAirportCode]);

  /* =========================================================================
   * ROUTE CALCULATION
   * ======================================================================= */

  const routeCalculation = useMemo(() => {
    const { depAirportCode, arrAirportCode, departureTime, flightNumber } = newFlight;
    const emptyRoute = {
      calculatedArrival: '',
      generatedLegs: [] as FlightLegData[],
      firstLegArrival: '',
      secondLegDeparture: '',
      firstLegDurationMinutes: null as number | null,
      secondLegDurationMinutes: null as number | null,
      totalDurationMinutes: null as number | null,
      error: '',
    };

    if (!depAirportCode || !arrAirportCode || !departureTime) {
      return emptyRoute;
    }

    if (!selectedStop) {
      if (isDirectRoute) {
        const directDurationMinutes = getRouteDurationMinutes(
          depAirportCode,
          arrAirportCode,
        );
        const calculatedArrival = calculateArrival(
          depAirportCode,
          arrAirportCode,
          departureTime,
          airports,
        );
        return {
          ...emptyRoute,
          calculatedArrival,
          firstLegDurationMinutes: directDurationMinutes,
          totalDurationMinutes: directDurationMinutes,
          error: calculatedArrival ? '' : 'La durée du trajet direct est indisponible.',
        };
      }
      return {
        ...emptyRoute,
        error:
          suggestedStops.length === 0
            ? 'Aucun itinéraire avec escale disponible pour ce trajet.'
            : 'Sélectionnez une escale pour calculer cet itinéraire.',
      };
    }

    if (!suggestedStops.includes(selectedStop)) {
      return {
        ...emptyRoute,
        error: 'Cette escale ne relie pas les deux tronçons configurés du trajet.',
      };
    }

    if (
      !Number.isFinite(layoverMinutes) ||
      !Number.isInteger(layoverMinutes) ||
      layoverMinutes < MIN_STOPOVER_DURATION_MINUTES ||
      layoverMinutes > 24 * 60
    ) {
      return {
        ...emptyRoute,
        error:
          `La durée d’escale doit être comprise entre ` +
          `${MIN_STOPOVER_DURATION_MINUTES} minutes et 24 heures.`,
      };
    }

    const firstLegDurationMinutes = getRouteDurationMinutes(
      depAirportCode,
      selectedStop,
    );
    const secondLegDurationMinutes = getRouteDurationMinutes(
      selectedStop,
      arrAirportCode,
    );
    const firstLegArrival = calculateArrival(
      depAirportCode,
      selectedStop,
      departureTime,
      airports,
    );
    if (
      firstLegDurationMinutes === null ||
      secondLegDurationMinutes === null ||
      !firstLegArrival
    ) {
      return {
        ...emptyRoute,
        error: 'Impossible de calculer les durées des deux tronçons.',
      };
    }

    const firstLegArrivalDate = new Date(firstLegArrival);
    const secondLegDeparture = new Date(
      firstLegArrivalDate.getTime() + layoverMinutes * 60_000,
    ).toISOString();
    const secondLegArrival = calculateArrival(
      selectedStop,
      arrAirportCode,
      secondLegDeparture,
      airports,
    );
    const totalDurationMinutes =
      firstLegDurationMinutes + layoverMinutes + secondLegDurationMinutes;
    if (
      !secondLegArrival ||
      new Date(secondLegDeparture).getTime() <= firstLegArrivalDate.getTime() ||
      new Date(secondLegArrival).getTime() <= new Date(secondLegDeparture).getTime()
    ) {
      return {
        ...emptyRoute,
        error: 'Les horaires calculés pour les tronçons ne sont pas cohérents.',
      };
    }

    const baseFlightNumber = flightNumber || 'FL';

    const generatedLegs: FlightLegData[] = [
      {
        flightNumber: `${baseFlightNumber}-A`,
        depAirportCode,
        arrAirportCode: selectedStop,
        departureTime,
        arrivalTime: firstLegArrival,
      },
      {
        flightNumber: `${baseFlightNumber}-B`,
        depAirportCode: selectedStop,
        arrAirportCode,
        departureTime: secondLegDeparture,
        arrivalTime: secondLegArrival,
      },
    ];

    return {
      ...emptyRoute,
      calculatedArrival: secondLegArrival,
      generatedLegs,
      firstLegArrival,
      secondLegDeparture,
      firstLegDurationMinutes,
      secondLegDurationMinutes,
      totalDurationMinutes,
      error: '',
    };
  }, [newFlight, selectedStop, layoverMinutes, isDirectRoute, airports, suggestedStops]);

  /* SYNC ROUTE */
  useEffect(() => {
    setNewFlight((previous) => {
      const isArrivalSame = previous.arrivalTime === routeCalculation.calculatedArrival;
      const areLegsSame =
        JSON.stringify(previous.legs) === JSON.stringify(routeCalculation.generatedLegs);

      const previousStop = Array.isArray(previous.stopoverCodes)
        ? previous.stopoverCodes[0] || ''
        : previous.stopoverCodes || '';
      const isStopSame = previousStop === selectedStop;

      const expectedDuration = selectedStop ? layoverMinutes : undefined;
      const isDurationSame = previous.stopoverMins === expectedDuration;

      if (isArrivalSame && areLegsSame && isStopSame && isDurationSame) {
        return previous;
      }

      return {
        ...previous,
        stopoverCodes: selectedStop || undefined,
        stopoverMins: expectedDuration,
        arrivalTime: routeCalculation.calculatedArrival,
        legs: routeCalculation.generatedLegs,
      };
    });
  }, [routeCalculation, selectedStop, layoverMinutes]);

  /* PAST DATE */
  const isPastDate = useMemo(() => {
    if (!newFlight.departureTime) return false;
    const departure = new Date(newFlight.departureTime);
    if (Number.isNaN(departure.getTime())) return false;
    return departure < new Date();
  }, [newFlight.departureTime]);

  /* =========================================================================
   * WEATHER
  * ✅ Utilise le client Python authentifié
   * ======================================================================= */

  useEffect(() => {
    if (!isOpen) return;

    const canAssess =
      Boolean(newFlight.depAirportCode) &&
      Boolean(newFlight.arrAirportCode) &&
      Boolean(newFlight.departureTime) &&
      Boolean(newFlight.arrivalTime) &&
      !(!isDirectRoute && !selectedStop);

    if (!canAssess) {
      setWeatherPreview(null);
      setWeatherPreviewError(null);
      setIsWeatherChecking(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const timeoutId = window.setTimeout(async () => {
      setIsWeatherChecking(true);
      setWeatherPreviewError(null);

      try {
        const departure = new Date(newFlight.departureTime);
        const arrival = new Date(newFlight.arrivalTime);

        const response = await pythonFetch('/flights/weather/assess', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            depAirportCode: newFlight.depAirportCode,
            arrAirportCode: newFlight.arrAirportCode,
            stopoverCodes: selectedStop || undefined,
            departureTime: departure.toISOString(),
            arrivalTime: arrival.toISOString(),
          }),
        });

        const payload: WeatherPreviewResponse & {
          airports?: {
            departure?: {
              code?: string;
              api?: WeatherPointPreview;
              localML?: WeatherLocalMLPoint;
            };
            arrival?: {
              code?: string;
              api?: WeatherPointPreview;
              localML?: WeatherLocalMLPoint;
            };
            stopovers?: WeatherLocalMLPoint[];
          };
        } = await response.json().catch(() => ({
          status: 'error' as const,
          message: 'Réponse météo invalide.',
        }));

        if (!response.ok) {
          throw new Error(payload.message || 'Prévision météo indisponible.');
        }

        let mapped: WeatherAIPreview | null = null;

        if (payload.weatherAI) {
          mapped = { ...payload.weatherAI };
        } else if (payload.airports) {
          const { departure: dep, arrival: arr, stopovers: stops } = payload.airports;

          mapped = {
            evaluatedAt: new Date().toISOString(),
            departure: dep?.api || (dep?.localML
              ? {
                  airport: dep.code,
                  severity: dep.localML.score ?? null,
                  available: dep.localML.available,
                }
              : null),
            arrival: arr?.api || (arr?.localML
              ? {
                  airport: arr.code,
                  severity: arr.localML.score ?? null,
                  available: arr.localML.available,
                }
              : null),
            localML: {
              available: true,
              source: 'LOCAL_ML',
              departure: dep?.localML || null,
              arrival: arr?.localML || null,
              stopovers: stops || [],
            },
            localMLAvailable: true,
            degraded: false,
          };
        }

        if (!mapped) {
          throw new Error('Prévision météo indisponible.');
        }

        if (!mapped.departure && mapped.localML?.departure) {
          mapped.departure = {
            airport: mapped.localML.departure.airport,
            severity: mapped.localML.departure.score ?? null,
            available: mapped.localML.departure.available,
          };
        }

        if (!mapped.arrival && mapped.localML?.arrival) {
          mapped.arrival = {
            airport: mapped.localML.arrival.airport,
            severity: mapped.localML.arrival.score ?? null,
            available: mapped.localML.arrival.available,
          };
        }

        if (cancelled) return;
        setWeatherPreview(mapped);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (cancelled) return;

        console.error('Erreur pré-évaluation météo :', error);
        setWeatherPreview(null);
        setWeatherPreviewError(
          error instanceof Error ? error.message : 'Impossible d\'évaluer la météo.',
        );
      } finally {
        if (!cancelled && !controller.signal.aborted) {
          setIsWeatherChecking(false);
        }
      }
    }, 650);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
      setIsWeatherChecking(false);
    };
  }, [
    isOpen,
    newFlight.depAirportCode,
    newFlight.arrAirportCode,
    newFlight.departureTime,
    newFlight.arrivalTime,
    selectedStop,
    isDirectRoute,
  ]);

  /* =========================================================================
   * SWAP
   * ======================================================================= */

  const handleSwapAirports = useCallback(() => {
    setNewFlight((previous) => ({
      ...previous,
      depAirportCode: previous.arrAirportCode,
      arrAirportCode: previous.depAirportCode,
    }));
    setSelectedStop('');
  }, []);

  /* =========================================================================
   * FLEET + MAINTENANCE + FLIGHT OVERLAP
   * ======================================================================= */

  const fleetWithStatus = useMemo(() => {
    const departureTime = newFlight.departureTime;
    const arrivalTime =
      routeCalculation.calculatedArrival || newFlight.arrivalTime;
    const hasDates = Boolean(departureTime && arrivalTime);

    return fleetAircrafts.map((rawAircraft) => {
      const aircraft = normalizeAircraft(rawAircraft);

      const isGlobalMaint = isAircraftInMaintenanceStatus(aircraft.aircraftStatus);

      let slotConflict: MaintenanceSlot | undefined;

      if (hasDates) {
        slotConflict = maintenanceSlots.find((slot) => {
          const slotRef = normalizeReference(getSlotAircraftRef(slot));
          if (!slotRef) return false;

          const aircraftRefs = getAircraftRefs(aircraft);
          if (!aircraftRefs.includes(slotRef)) return false;

          return checkOverlap(departureTime, arrivalTime, slot.startTime, slot.endTime);
        });
      }

      let flightConflict: ExistingFlightData | undefined;

      if (hasDates) {
        flightConflict = existingFlights.find((existingFlight) => {
          if (editingFlightId && existingFlight.refFlight === editingFlightId) return false;

          if (isEdition && !editingFlightId && initialData) {
            const existingNumber = normalizeReference(getExistingFlightNumber(existingFlight));
            const currentNumber = normalizeReference(initialData.flightNumber);
            const existingStart = getExistingFlightStart(existingFlight);
            const existingEnd = getExistingFlightEnd(existingFlight);

            if (
              existingNumber === currentNumber &&
              existingStart === initialData.departureTime &&
              existingEnd === initialData.arrivalTime
            ) {
              return false;
            }
          }

          if (isCancelledFlight(existingFlight)) return false;
          if (!sameAircraft(aircraft, existingFlight)) return false;

          const existingStart = getExistingFlightStart(existingFlight);
          const existingEnd = getExistingFlightEnd(existingFlight);
          if (!existingStart || !existingEnd) return false;

          return checkOverlap(departureTime, arrivalTime, existingStart, existingEnd);
        });
      }

      const isSlotMaint = Boolean(slotConflict);
      const hasFlightConflict = Boolean(flightConflict);
      const isDisabled = isGlobalMaint || isSlotMaint || hasFlightConflict;

      return {
        ...aircraft,
        isGlobalMaint,
        isSlotMaint,
        hasFlightConflict,
        isDisabled,
        slotConflict,
        flightConflict,
      };
    });
  }, [
    fleetAircrafts,
    maintenanceSlots,
    existingFlights,
    editingFlightId,
    initialData,
    isEdition,
    newFlight.departureTime,
    newFlight.arrivalTime,
    routeCalculation,
  ]);

  const selectedAircraft = useMemo(() => {
    if (!newFlight.refAircraft) return undefined;
    const selectedRef = normalizeReference(newFlight.refAircraft);
    return fleetWithStatus.find((aircraft) =>
      getAircraftRefs(aircraft).includes(selectedRef),
    );
  }, [fleetWithStatus, newFlight.refAircraft]);

  /* =========================================================================
   * VALIDATION
   * ======================================================================= */

  const validationError = useMemo(() => {
    if (timeZoneError) return timeZoneError;

    if (newFlight.depAirportCode && newFlight.arrAirportCode) {
      if (!isDirectRoute && suggestedStops.length === 0) {
        return 'Aucun itinéraire avec escale disponible pour ce trajet.';
      }
      if (routeCalculation.error) return routeCalculation.error;
      if (
        selectedStop &&
        (selectedStop === newFlight.depAirportCode ||
          selectedStop === newFlight.arrAirportCode ||
          !suggestedStops.includes(selectedStop))
      ) {
        return 'Sélectionnez une escale valide entre le départ et la destination.';
      }
    }

    if (flightAvailabilityError) {
      return `Disponibilité des vols inconnue : ${flightAvailabilityError}`;
    }

    const calculatedArrival =
      routeCalculation.calculatedArrival || newFlight.arrivalTime;
    if (newFlight.departureTime && calculatedArrival) {
      const departure = new Date(newFlight.departureTime);
      const arrival = new Date(calculatedArrival);

      if (Number.isNaN(departure.getTime()) || Number.isNaN(arrival.getTime())) {
        return 'Les dates de départ ou d’arrivée sont invalides.';
      }

      if (arrival <= departure) {
        return "L'heure d'arrivée doit être strictement postérieure au départ.";
      }
    }

    if (selectedAircraft) {
      const aircraftName =
        selectedAircraft.registration || selectedAircraft.model || 'Appareil';

      if (selectedAircraft.isGlobalMaint) {
        return (
          `Immobilisation technique : l'appareil ${aircraftName} ` +
          `est actuellement en maintenance (${selectedAircraft.aircraftStatus || 'indisponible'}).`
        );
      }

      if (selectedAircraft.slotConflict) {
        const conflict = selectedAircraft.slotConflict;
        const maintType = conflict.maintType
          ? ` (${conflict.maintType})`
          : '';

        return (
          `Conflit de maintenance : l'appareil ${aircraftName} ` +
          `est réservé pour maintenance${maintType} du ` +
          `${new Date(conflict.startTime).toLocaleString('fr-FR')} au ` +
          `${new Date(conflict.endTime).toLocaleString('fr-FR')}.`
        );
      }

      if (selectedAircraft.flightConflict) {
        const conflict = selectedAircraft.flightConflict;
        const conflictNumber = getExistingFlightNumber(conflict);
        const conflictStart = getExistingFlightStart(conflict);
        const conflictEnd = getExistingFlightEnd(conflict);

        return (
          `Conflit de planification : l'aircraft ${aircraftName} ` +
          `est déjà affecté au flight ${conflictNumber} du ` +
          `${new Date(conflictStart).toLocaleString('fr-FR')} au ` +
          `${new Date(conflictEnd).toLocaleString('fr-FR')}. ` +
          `Les deux rotations se chevauchent.`
        );
      }
    }

    return null;
  }, [
    newFlight.depAirportCode,
    newFlight.arrAirportCode,
    timeZoneError,
    routeCalculation,
    suggestedStops,
    flightAvailabilityError,
    newFlight.departureTime,
    newFlight.arrivalTime,
    isDirectRoute,
    selectedStop,
    selectedAircraft,
  ]);

  /* =========================================================================
   * SUBMIT
   * ======================================================================= */

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (validationError || isSubmitting || isLoadingExistingFlights) {
      return;
    }

    setIsSubmitting(true);

    try {
      const finalFlightData: FlightFormData = {
        ...newFlight,
        stopoverCodes: selectedStop || undefined,
        stopoverMins: selectedStop ? layoverMinutes : undefined,
        arrivalTime: routeCalculation.calculatedArrival,
        legs: routeCalculation.generatedLegs,
        flightStatus: isPastDate ? 'Annulé' : newFlight.flightStatus || 'Planifié',
        motifAnnulation: isPastDate
          ? 'Date de départ dépassée à la création'
          : newFlight.motifAnnulation,
      };

      await onSubmit(finalFlightData);

      setNewFlight({ ...INITIAL_FORM_STATE });
      setSelectedStop('');
      onClose();
    } catch (error) {
      console.error('Erreur lors de la soumission du flight :', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  /* =========================================================================
   * RENDER
   * ======================================================================= */

  if (!isOpen) return null;

  const weatherSourceBadge = getWeatherSourceBadge(weatherPreview);
  const airportOptions: SearchableSelectOption[] = airports.map((airport) => ({
    value: airport.refAirport,
    label: airport.airportName,
    description: `${airport.refAirport} · ${airport.timezone}`,
    displayLabel: `${airport.refAirport} · ${airport.airportName}`,
    searchText: `${airport.refAirport} ${airport.airportName} ${airport.timezone}`,
  }));
  const aircraftOptions: SearchableSelectOption[] = fleetWithStatus.map((aircraft) => {
    const availability = aircraft.isGlobalMaint
      ? `En maintenance${aircraft.aircraftStatus ? ` · ${aircraft.aircraftStatus}` : ''}`
      : aircraft.isSlotMaint
        ? 'Maintenance prévue sur ce créneau'
        : aircraft.flightConflict
          ? `Déjà affecté au flight ${getExistingFlightNumber(aircraft.flightConflict)}`
          : 'Disponible';
    const label = aircraft.registration || aircraft.model || 'Appareil sans registration';

    return {
      value:       aircraft.refAircraft,
      label,
      description: aircraft.registration && aircraft.model
        ? `${aircraft.model} · ${availability}`
        : availability,
      displayLabel: aircraft.registration && aircraft.model
        ? `${aircraft.registration} · ${aircraft.model}`
        : label,
      searchText: `${aircraft.refAircraft} ${aircraft.registration} ${aircraft.model} ${aircraft.aircraftStatus} ${availability}`,
      disabled: aircraft.isDisabled,
    };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flight-modal-title"
      >
        {/* HEADER */}
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
                {isEdition ? 'Modifier la rotation' : 'Créer une rotation'}
              </h3>
              <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                Planification du flight, itinéraire et disponibilité des ressources
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Fermer la fenêtre"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* FORM */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-4 overflow-y-auto p-6 text-xs"
        >
          {/* FLIGHT NUMBER */}
          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
              Numéro du flight
            </label>
            <input
              type="text"
              required
              placeholder="Ex. MD050"
              value={newFlight.flightNumber}
              onChange={(event) =>
                setNewFlight((previous) => ({
                  ...previous,
                  flightNumber: event.target.value.toUpperCase(),
                }))
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm font-black uppercase text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {/* ROUTE */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              {newFlight.depAirportCode && newFlight.arrAirportCode && (
                <button
                  type="button"
                  onClick={handleSwapAirports}
                  className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 hover:text-emerald-800"
                >
                  <ArrowRightLeft className="h-3 w-3" />
                  Intervertir
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SearchableSelect
                id="flight-origin-airport"
                label="Aéroport de départ"
                                required
                value={newFlight.depAirportCode}
                options={airportOptions}
                placeholder="Choisir un aéroport…"
                searchPlaceholder="Rechercher un aéroport…"
                disabled={isLoadingAirports || Boolean(airportLoadError)}
                icon={<MapPin className="h-4 w-4" />}
                onChange={(value) => {
                  setNewFlight((previous) => ({ ...previous, depAirportCode: value }));
                  setSelectedStop('');
                }}
              />
              <SearchableSelect
                id="flight-destination-airport"
                label="Aéroport d’arrivée"
                                required
                value={newFlight.arrAirportCode}
                options={airportOptions.filter((airport) => airport.value !== newFlight.depAirportCode)}
                placeholder="Choisir un aéroport…"
                searchPlaceholder="Rechercher un aéroport…"
                disabled={isLoadingAirports || Boolean(airportLoadError)}
                icon={<MapPin className="h-4 w-4" />}
                onChange={(value) => {
                  setNewFlight((previous) => ({ ...previous, arrAirportCode: value }));
                  setSelectedStop('');
                }}
              />
            </div>
            {(isLoadingAirports || airportLoadError) && (
              <p className={`text-[10px] font-semibold ${airportLoadError ? 'text-rose-600' : 'text-slate-500'}`}>
                {airportLoadError || 'Chargement des aéroports actifs…'}
              </p>
            )}
          </div>

          {/* DIRECT ROUTE */}
          {isDirectRoute && directDurationHours !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Route directe disponible
                </span>
                <span className="rounded-md bg-white px-2 py-1 font-mono text-[9px] font-black text-emerald-700">
                  {formatFlightDuration(directDurationHours)}
                </span>
              </div>
              {!selectedStop && suggestedStops.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedStop(suggestedStops[0] || '')}
                  className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-emerald-700"
                >
                  <Plus className="h-3 w-3" />
                  Ajouter une escale facultative
                </button>
              ) : selectedStop ? (
                <button
                  type="button"
                  onClick={() => setSelectedStop('')}
                  className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-600 hover:text-rose-700"
                >
                  <Trash2 className="h-3 w-3" />
                  Supprimer l’escale
                </button>
              ) : null}
            </div>
          )}

          {/* STOPOVER */}
          {(selectedStop ||
            (!isDirectRoute && newFlight.depAirportCode && newFlight.arrAirportCode)) && (
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
                      <strong>{newFlight.depAirportCode}</strong> et{' '}
                      <strong>{newFlight.arrAirportCode}</strong>.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[8px] font-black uppercase tracking-wide text-slate-500">
                  Aéroport d’escale
                </label>
                {suggestedStops.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {suggestedStops.map((stopIata) => {
                      const stopAirport = airports.find(
                        (airport) => airport.refAirport === stopIata,
                      );
                      const active = selectedStop === stopIata;

                      return (
                        <button
                          key={stopIata}
                          type="button"
                          onClick={() => setSelectedStop(stopIata)}
                          className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                            active
                              ? 'border-emerald-700 bg-emerald-700 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
                          }`}
                        >
                          <div>
                            <span className="font-mono text-xs font-black">
                              {stopIata}
                            </span>
                            <p
                              className={`mt-0.5 truncate text-[8px] ${
                                active ? 'text-emerald-100' : 'text-slate-400'
                              }`}
                            >
                              {stopAirport?.airportName}
                            </p>
                          </div>
                          {active && <CheckCircle2 className="h-4 w-4" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] font-semibold leading-4 text-rose-700">
                        Aucun itinéraire avec escale disponible pour ce trajet.
                  </p>
                )}
              </div>

              {selectedStop && (
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
                <label
                  htmlFor="flight-stopover-duration"
                  className="text-[9px] font-bold text-slate-600"
                >
                  Durée de l’escale (minimum {MIN_STOPOVER_DURATION_MINUTES} min)
                </label>
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2">
                  <input
                    id="flight-stopover-duration"
                    type="number"
                    min={MIN_STOPOVER_DURATION_MINUTES}
                    max={24 * 60}
                    step={15}
                    value={layoverMinutes}
                    onChange={(event) =>
                      setLayoverMinutes(Number(event.target.value))
                    }
                    className="h-8 w-14 text-center text-xs font-black text-slate-900 outline-none"
                  />
                  <span className="text-[9px] font-bold text-slate-400">min</span>
                </div>
                </div>
              )}

              {selectedStop && routeCalculation.generatedLegs.length === 2 && (
                <div className="space-y-2 border-t border-slate-200 pt-2 text-[9px]">
                <div className="rounded-lg bg-white/80 p-2">
                  <p className="font-black text-slate-800">
                    {newFlight.depAirportCode} → {selectedStop}
                  </p>
                  <p className="mt-1 text-slate-600">
                    Départ{' '}
                    {formatDateTimeInTimezone(
                      newFlight.departureTime,
                      originAirport?.timezone,
                    ).replace('T', ' ')}
                    {' · '}durée{' '}
                    {formatDurationMinutes(
                      routeCalculation.firstLegDurationMinutes ?? 0,
                    )}
                  </p>
                  <p className="text-slate-600">
                    Arrivée à l’escale{' '}
                    {formatDateTimeInTimezone(
                      routeCalculation.firstLegArrival,
                      airports.find((airport) => airport.refAirport === selectedStop)
                        ?.timezone,
                    ).replace('T', ' ')}
                  </p>
                </div>
                <div className="rounded-lg bg-white/80 p-2">
                  <p className="font-black text-slate-800">
                    Escale {selectedStop} → {newFlight.arrAirportCode}
                  </p>
                  <p className="mt-1 text-slate-600">
                    Durée au sol {formatDurationMinutes(layoverMinutes)}
                    {' · '}reprise{' '}
                    {formatDateTimeInTimezone(
                      routeCalculation.secondLegDeparture,
                      airports.find((airport) => airport.refAirport === selectedStop)
                        ?.timezone,
                    ).replace('T', ' ')}
                  </p>
                  <p className="text-slate-600">
                    Durée du tronçon{' '}
                    {formatDurationMinutes(
                      routeCalculation.secondLegDurationMinutes ?? 0,
                    )}
                    {' · '}arrivée finale{' '}
                    {formatDateTimeInTimezone(
                      routeCalculation.calculatedArrival,
                      destinationAirport?.timezone,
                    ).replace('T', ' ')}
                  </p>
                </div>
                <p className="text-right font-bold text-slate-700">
                  Durée totale du voyage :{' '}
                  {formatDurationMinutes(routeCalculation.totalDurationMinutes ?? 0)}
                </p>
                </div>
              )}
            </div>
          )}

          {/* LEGS */}
          {newFlight.legs && newFlight.legs.length > 0 && (
            <div className="space-y-2 rounded-xl bg-slate-900 p-3 text-white">
              <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-emerald-400">
                <GitFork className="h-3 w-3" />
                Tronçons générés ({newFlight.legs.length})
              </span>
              {newFlight.legs.map((leg, index) => (
                <div
                  key={`${leg.flightNumber}-${index}`}
                  className="flex items-center justify-between rounded-lg bg-slate-800 px-2.5 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-emerald-900 px-1.5 py-0.5 font-mono text-[9px] font-black text-emerald-300">
                      {leg.flightNumber}
                    </span>
                    <span className="font-mono text-[10px]">
                      {leg.depAirportCode} → {leg.arrAirportCode}
                    </span>
                  </div>
                  <div className="text-right font-mono text-[8px] text-slate-300">
                    <p>
                      {formatDateTimeInTimezone(
                        leg.departureTime,
                        airports.find((airport) => airport.refAirport === leg.depAirportCode)?.timezone,
                      ).split('T')[1]}
                    </p>
                    <p>
                      {formatDateTimeInTimezone(
                        leg.arrivalTime,
                        airports.find((airport) => airport.refAirport === leg.arrAirportCode)?.timezone,
                      ).split('T')[1]}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TIMES */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-slate-500">
                Départ
                {originAirport?.timezone ? ` (${originAirport.timezone})` : ''}
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="datetime-local"
                  required
                  disabled={!originAirport}
                  value={formatDateTimeInTimezone(newFlight.departureTime, originAirport?.timezone)}
                  onChange={(event) => {
                    const localValue = event.target.value;
                    const departureIso = localDateTimeToIso(localValue, originAirport?.timezone);
                    setTimeZoneError(
                      localValue && !departureIso
                        ? `Heure locale invalide pour ${originAirport?.timezone || 'ce fuseau horaire'}.`
                        : null,
                    );
                    setNewFlight((previous) => ({ ...previous, departureTime: departureIso }));
                  }}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-2 text-[10px] font-semibold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-slate-500">
                Arrivée calculée
                {destinationAirport?.timezone ? ` (${destinationAirport.timezone})` : ''}
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="datetime-local"
                  required
                  readOnly
                  disabled={!destinationAirport || (!isDirectRoute && !selectedStop)}
                  value={formatDateTimeInTimezone(newFlight.arrivalTime, destinationAirport?.timezone)}
                  className="h-10 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 pl-9 pr-2 text-[10px] font-semibold text-slate-700 outline-none disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* AIRCRAFT */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              {isLoadingExistingFlights && (
                <span className="inline-flex items-center gap-1 text-[8px] font-bold text-slate-400">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Vérification disponibilité...
                </span>
              )}
            </div>
            <SearchableSelect
              id="flight-aircraft"
              label="Appareil assigné"
              hasError={Boolean(selectedAircraft?.flightConflict || fleetLoadError)}
              value={newFlight.refAircraft}
              options={aircraftOptions}
              placeholder={
                isLoadingFleet
                  ? 'Chargement de la flotte…'
                  : fleetAircrafts.length === 0
                    ? 'Aucun appareil disponible'
                    : 'Sélectionner un appareil…'
              }
              searchPlaceholder="Rechercher une registration ou un modèle…"
              disabled={
                isLoadingFleet ||
                isLoadingExistingFlights ||
                Boolean(fleetLoadError) ||
                Boolean(flightAvailabilityError) ||
                fleetAircrafts.length === 0 ||
                (!isDirectRoute && !selectedStop) ||
                Boolean(selectedStop && !suggestedStops.includes(selectedStop))
              }
              icon={<Plane className="h-4 w-4" />}
              onChange={(value) =>
                setNewFlight((previous) => ({
                  ...previous,
                  refAircraft: value,
                }))
              }
            />
            {fleetLoadError ? (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2">
                <p className="text-[9px] leading-4 text-rose-800">{fleetLoadError}</p>
                {onRetryFleet && (
                  <button
                    type="button"
                    onClick={onRetryFleet}
                    disabled={isLoadingFleet}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoadingFleet ? 'animate-spin' : ''}`} />
                    Réessayer
                  </button>
                )}
              </div>
            ) : !isLoadingFleet && fleetAircrafts.length === 0 ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[9px] leading-4 text-amber-800">
                Aucun appareil n’est enregistré dans la flotte.
              </p>
            ) : !isDirectRoute && !selectedStop ? (
              <p className="mt-2 text-[9px] leading-4 text-slate-500">
                Sélectionnez d’abord une escale pour activer l’affectation.
              </p>
            ) : null}
            {flightAvailabilityError && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <p className="text-[9px] leading-4 text-amber-800">
                  {flightAvailabilityError}
                </p>
              </div>
            )}
          </div>

          {/* VALIDATION ERROR */}
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
                    ? 'Conflit aircraft détecté'
                    : 'Validation impossible'}
                </p>
                <p className="mt-1 text-[10px] font-semibold leading-5 text-rose-900">
                  {validationError}
                </p>
              </div>
            </div>
          )}

          {/* PAST DATE */}
          {isPastDate && !validationError && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-[8px] font-black uppercase tracking-wide text-amber-600">
                  Avis d’ordonnancement
                </p>
                <p className="mt-1 text-[10px] font-semibold leading-4 text-amber-900">
                  La date de départ est dépassée. Le flight sera enregistré avec le
                  status Annulé.
                </p>
              </div>
            </div>
          )}

          {/* WEATHER */}
          {!isPastDate &&
            !validationError &&
            newFlight.depAirportCode &&
            newFlight.arrAirportCode &&
            newFlight.departureTime &&
            newFlight.arrivalTime && (
              <div
                className={`rounded-xl border p-3 ${
                  weatherPreview
                    ? getWeatherPreviewStyle(weatherPreview).wrapper
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white ${
                      weatherPreview
                        ? getWeatherPreviewStyle(weatherPreview).accent
                        : 'text-slate-500'
                    }`}
                  >
                    {isWeatherChecking ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : weatherPreview ? (
                      getWeatherPreviewStyle(weatherPreview).icon
                    ) : (
                      <Cpu className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[8px] font-black uppercase tracking-[0.14em] opacity-70">
                        Météo pré-flight
                      </span>
                      {weatherPreview && (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase ${
                            getWeatherPreviewStyle(weatherPreview).badge
                          }`}
                        >
                          {weatherPreview.advisoryRiskLabel ||
                            weatherPreview.riskLabel ||
                            weatherPreview.riskLevel ||
                            'Évalué'}
                        </span>
                      )}
                      {weatherPreview && weatherSourceBadge && (
                        <span
                          title={weatherSourceBadge.title}
                          className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase ${weatherSourceBadge.className}`}
                        >
                          {weatherSourceBadge.label}
                        </span>
                      )}
                      {weatherPreview?.degraded && (
                        <span
                          title="Donnée partiellement fiable — vérification OCC recommandée"
                          className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[8px] font-black uppercase text-amber-800"
                        >
                          ⚠ Dégradé
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
                            Risque {formatWeatherPercent(weatherPreview.score)}
                          </span>
                          {typeof weatherPreview.advisoryScore === 'number' && (
                            <span
                              title="Score consultatif (API + ML local)"
                              className="rounded-lg border border-white/70 bg-white/70 px-2 py-1 font-mono text-[9px] font-black"
                            >
                              Conseil {formatWeatherPercent(weatherPreview.advisoryScore)}
                            </span>
                          )}
                          <span className="rounded-lg border border-white/70 bg-white/70 px-2 py-1 font-mono text-[9px] font-black">
                            Confiance {formatWeatherPercent(weatherPreview.confidence)}
                          </span>
                        </div>

                        <div className="mt-2 rounded-lg border border-white/70 bg-white/70 p-2.5">
                          <span className="text-[8px] font-black uppercase tracking-wide opacity-60">
                            Recommandation OCC
                          </span>
                          <p className="mt-0.5 text-[10px] font-black leading-5">
                            {weatherPreview.recommendedActionLabel || 'Surveillance météo'}
                          </p>
                          <p className="mt-1 text-[9px] font-semibold leading-4 opacity-80">
                            {weatherPreview.explanation || 'Évaluation météo disponible.'}
                          </p>
                          {weatherPreview.dataAvailable === false &&
                            (weatherPreview.departure?.error || weatherPreview.arrival?.error) && (
                              <p className="mt-1 text-[9px] font-medium leading-4 text-slate-600">
                                Détail :{' '}
                                {weatherPreview.departure?.error || weatherPreview.arrival?.error}
                              </p>
                            )}
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div className="rounded-lg border border-white/70 bg-white/60 p-2">
                            <span className="block text-[8px] font-black uppercase opacity-60">
                              Départ {newFlight.depAirportCode}
                            </span>
                            <span className="mt-0.5 block font-mono text-[9px] font-black">
                              {formatWeatherPercent(
                                weatherPreview.departure?.severity ??
                                  weatherPreview.localML?.departure?.score,
                              )}
                            </span>
                            {weatherPreview.localML?.departure?.riskLabel && (
                              <span className="mt-0.5 block text-[8px] font-semibold opacity-70">
                                ML : {weatherPreview.localML.departure.riskLabel}
                              </span>
                            )}
                          </div>
                          <div className="rounded-lg border border-white/70 bg-white/60 p-2 text-right">
                            <span className="block text-[8px] font-black uppercase opacity-60">
                              Arrivée {newFlight.arrAirportCode}
                            </span>
                            <span className="mt-0.5 block font-mono text-[9px] font-black">
                              {formatWeatherPercent(
                                weatherPreview.arrival?.severity ??
                                  weatherPreview.localML?.arrival?.score,
                              )}
                            </span>
                            {weatherPreview.localML?.arrival?.riskLabel && (
                              <span className="mt-0.5 block text-[8px] font-semibold opacity-70">
                                ML : {weatherPreview.localML.arrival.riskLabel}
                              </span>
                            )}
                          </div>
                        </div>

                        {weatherPreview.localML?.stopovers &&
                          weatherPreview.localML.stopovers.length > 0 && (
                            <div className="mt-2 rounded-lg border border-white/70 bg-white/60 p-2">
                              <span className="block text-[8px] font-black uppercase opacity-60">
                                Escale
                                {weatherPreview.localML.stopovers.length > 1 ? 's' : ''}
                              </span>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {weatherPreview.localML.stopovers.map((stop, idx) => (
                                  <span
                                    key={`${stop.airport}-${idx}`}
                                    className="inline-flex items-center gap-1 rounded-md border border-white/70 bg-white px-2 py-0.5 font-mono text-[9px] font-black"
                                  >
                                    {stop.airport}
                                    <span className="opacity-60">
                                      {formatWeatherPercent(stop.score)}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                        {weatherPreview.degraded && (
                          <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/80 p-2">
                            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                            <p className="text-[8px] font-semibold leading-3.5 text-amber-800">
                              Source dégradée :{' '}
                              {weatherPreview.localML?.source || 'ML local'}.
                              Décision OCC requise avant affectation.
                            </p>
                          </div>
                        )}

                        {weatherPreview.evaluatedAt && (
                          <p className="mt-1 text-right text-[8px] font-semibold text-slate-500/80">
                            <Activity className="mr-1 inline h-2.5 w-2.5" />
                            Évalué à{' '}
                            {new Date(weatherPreview.evaluatedAt).toLocaleTimeString(
                              'fr-FR',
                              { hour: '2-digit', minute: '2-digit' },
                            )}
                          </p>
                        )}
                      </>
                    ) : weatherPreviewError ? (
                      <>
                        <p className="mt-1 text-[10px] font-bold text-slate-700">
                          Prévision météo non disponible.
                        </p>
                        <p className="mt-0.5 text-[9px] text-slate-500">
                          {weatherPreviewError}
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

          {/* ACTIONS */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={
                Boolean(validationError) ||
                isSubmitting ||
                isLoadingExistingFlights ||
                (!isDirectRoute && !selectedStop)
              }
              className="inline-flex h-9 min-w-33.75 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-[10px] font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {isSubmitting
                ? 'Enregistrement...'
                : isEdition
                  ? 'Mettre à jour'
                  : 'Enregistrer le flight'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FlightAddModal;