import {
  ConflictSeverity,
  ScheduleConflictType,
} from '../../common/enums/airline.enums';

export interface FlightCandidate {
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart: Date;
  heureArrivee: Date;
  avionId?: string | null;
}

export interface ScheduleConflict {
  id: string;
  type: ScheduleConflictType;
  severity: ConflictSeverity;
  blocking: boolean;
  reason: string;
  recommendation: string;
  flightId?: string;
  relatedFlightId?: string;
  flightNumber?: string;
  relatedFlightNumber?: string;
  aircraftId?: string | null;
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
