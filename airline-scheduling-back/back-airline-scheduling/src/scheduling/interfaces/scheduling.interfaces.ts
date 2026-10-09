import {
  ConflictSeverity,
  ScheduleConflictType,
} from '../../common/enums/airline.enums';

export interface FlightCandidate {
  flightNumber: string;
  depAirportCode: string;
  stopoverCodes?: string | null;
  arrAirportCode: string;
  departureTime: Date;
  arrivalTime: Date;
  refAircraft?: string | null;
  /** Total ground time during stopovers, in minutes. */
  stopoverMins?: number | null;
}

export interface ScheduleConflict {
  id: string;
  type: ScheduleConflictType;
  severity: ConflictSeverity;
  blocking: boolean;
  reason: string;
  recommendation: string;
  refFlight?: string;
  relatedRefFlight?: string;
  flightNumber?: string;
  relatedFlightNumber?: string;
  refAircraft?: string | null;
  aircraftRegistration?: string | null;
  overlapMinutes?: number;
  gapMinutes?: number;
  metadata?: Record<string, unknown>;
}

export interface ScheduleValidationResult {
  valid: boolean;
  operationallyReady: boolean;
  conflicts: ScheduleConflict[];
}

export interface OptimizationDetail {
  flightNumber: string;
  status: 'REASSIGNED' | 'UNRESOLVED';
  from?: string;
  to?: string;
  reason?: string;
}
