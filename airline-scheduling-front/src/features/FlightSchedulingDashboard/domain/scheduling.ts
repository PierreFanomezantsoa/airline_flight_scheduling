import type {
  AnalyticsMetrics,
  Flight,
} from '../FlightSchedulerDetails';
import type {
  GanttPayload,
  GanttRow,
} from '../FlightSchedulerGantt';

export interface EligibleFlight {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  aircraftId?: string | null;
}

export interface MessageState {
  text: string;
  type: 'success' | 'error' | 'info';
}

interface RawGanttRow extends GanttRow {
  baseAttache?: string | null;
  homeBase?: string | null;
  baseAirport?: string | null;
  positionActuelle?: string | null;
  currentAirport?: string | null;
}

export function getFriendlyError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.message.includes('Failed to fetch')) {
      return 'Impossible de contacter le serveur. Vérifiez votre connexion.';
    }
    return error.message || fallback;
  }
  return fallback;
}

export function normalizeFlightStatus(value?: string | null): string {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/_/g, ' ');
  if (['IN-FLIGHT', 'IN FLIGHT', 'EN VOL'].includes(normalized)) return 'En Vol';
  if (['DELAYED', 'RETARDÉ', 'RETARDE', 'SHIFTED'].includes(normalized)) return 'Retardé';
  if (['CANCELLED', 'CANCELED', 'ANNULÉ', 'ANNULE'].includes(normalized)) return 'Annulé';
  if (['EFFECTUÉ', 'EFFECTUE', 'DONE', 'COMPLETED', 'LANDED'].includes(normalized)) return 'Effectué';
  return 'Planifié';
}

export function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function flightBelongsToAircraft(flight: Flight, row: GanttRow): boolean {
  const aircraftId = String(flight.aircraft ?? '').trim().toUpperCase();
  const registration = String(flight.aircraftModel ?? '').trim().toUpperCase();
  const rowId = String(row.aircraftId ?? '').trim().toUpperCase();
  const rowRegistration = String(row.aircraftRegistration ?? '').trim().toUpperCase();

  return Boolean(
    (aircraftId && rowId && aircraftId === rowId) ||
      (registration && rowRegistration && registration === rowRegistration),
  );
}

function inferAircraftPosition(row: GanttRow, flights: Flight[]): string | null {
  if (row.aircraftId === 'UNASSIGNED') return null;

  const aircraftFlights = flights.filter((flight) => flightBelongsToAircraft(flight, row));
  const now = Date.now();
  const inFlight = aircraftFlights.find(
    (flight) => normalizeFlightStatus(flight.status) === 'En Vol',
  );
  if (inFlight?.destination) return inFlight.destination;

  const completed = aircraftFlights
    .filter((flight) => {
      const arrival = safeDate(flight.arrival);
      return (
        normalizeFlightStatus(flight.status) === 'Effectué' ||
        Boolean(arrival && arrival.getTime() <= now)
      );
    })
    .sort(
      (a, b) =>
        (safeDate(b.arrival)?.getTime() ?? 0) -
        (safeDate(a.arrival)?.getTime() ?? 0),
    )[0];
  if (completed?.destination) return completed.destination;

  const next = aircraftFlights
    .filter((flight) => {
      const departure = safeDate(flight.departure);
      return Boolean(departure && departure.getTime() > now);
    })
    .sort(
      (a, b) =>
        (safeDate(a.departure)?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (safeDate(b.departure)?.getTime() ?? Number.MAX_SAFE_INTEGER),
    )[0];

  return next?.origin ?? null;
}

export function normalizeGanttPayload(payload: unknown, flights: Flight[]): GanttPayload {
  const raw = (payload ?? {}) as {
    gantt?: { rows?: RawGanttRow[]; items?: unknown[]; timezone?: string };
    rows?: RawGanttRow[];
    items?: unknown[];
    timezone?: string;
  };
  const gantt = raw.gantt ?? raw;
  const rows: RawGanttRow[] = Array.isArray(gantt.rows) ? gantt.rows : [];
  const flightById = new Map(flights.map((flight) => [flight.id, flight]));
  const items = Array.isArray(gantt.items)
    ? (gantt.items as GanttPayload['items'])
    : [];

  return {
    timezone: gantt.timezone ?? 'UTC',
    items: items.map((item) => {
      const flight = flightById.get(item.flightId ?? item.id);
      const rawStops = item.stopovers ?? flight?.stops ?? flight?.stopover;
      const stopovers = (Array.isArray(rawStops) ? rawStops : [rawStops])
        .map((stop) => String(stop ?? '').trim().toUpperCase())
        .filter(Boolean);
      const start = safeDate(item.start);
      const end = safeDate(item.end);
      const durationMinutes =
        item.durationMinutes ??
        flight?.durationMinutes ??
        (start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : null);

      return {
        ...item,
        stopovers,
        stopoverDurationMinutes:
          item.stopoverDurationMinutes ?? flight?.stopoverDurationMinutes ?? null,
        durationMinutes,
      };
    }),
    rows: rows.map((row) => {
      const base = row.base || row.baseAttache || row.homeBase || row.baseAirport || null;
      const currentPosition =
        row.currentPosition || row.positionActuelle || row.currentAirport || null;
      const normalized: GanttRow = {
        aircraftId: row.aircraftId,
        aircraftRegistration: row.aircraftRegistration,
        capacity: row.capacity ?? null,
        base,
        currentPosition,
        status: row.status ?? null,
      };

      if (!normalized.currentPosition) {
        normalized.currentPosition = inferAircraftPosition(normalized, flights);
      }

      return normalized;
    }),
  };
}

export function buildFallbackAnalytics(flights: Flight[]): AnalyticsMetrics {
  const statuses = flights.map((flight) => normalizeFlightStatus(flight.status));
  const count = (status: string) => statuses.filter((value) => value === status).length;
  const onTimeCount = count('Planifié');
  const delayedCount = count('Retardé');
  const inFlightCount = count('En Vol');
  const cancelledCount = count('Annulé');
  const completedCount = count('Effectué');
  const denominator = Math.max(0, flights.length - cancelledCount - inFlightCount);

  return {
    totalFlights: flights.length,
    otpRate: denominator > 0 ? Number(((onTimeCount / denominator) * 100).toFixed(1)) : 0,
    onTimeCount,
    delayedCount,
    inFlightCount,
    cancelledCount,
    completedCount,
  };
}
