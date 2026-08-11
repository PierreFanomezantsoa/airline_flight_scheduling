export enum AircraftStatus {
  ACTIVE = 'Active',
  MAINTENANCE = 'Maintenance',
  OUT_OF_SERVICE = 'Out of Service',
  RETIRED = 'Retired',
}

export enum FlightStatus {
  SCHEDULED = 'Scheduled',
  DELAYED = 'Delayed',
  CANCELLED = 'Cancelled',
  IN_FLIGHT = 'In-Flight',
  COMPLETED = 'Completed',
  EFFECTUE = 'Effectué',
}

export enum MaintenanceType {
  TYPE_A = 'Type A',
  TYPE_C = 'Type C',
  AOG = 'Aircraft On Ground',
}

export enum MaintenanceStatus {
  PLANNED = 'Planned',
  IN_PROGRESS = 'In Progress',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled',
}

export enum CrewRole {
  CAPTAIN = 'Captain',
  FIRST_OFFICER = 'First Officer',
  PURSER = 'Purser',
  CABIN_CREW = 'Cabin Crew',
  OTHER = 'Other',
}

export enum ConflictSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum ScheduleConflictType {
  INVALID_TIME_WINDOW = 'INVALID_TIME_WINDOW',
  UNASSIGNED_AIRCRAFT = 'UNASSIGNED_AIRCRAFT',
  AIRCRAFT_UNAVAILABLE = 'AIRCRAFT_UNAVAILABLE',
  AIRCRAFT_OVERLAP = 'AIRCRAFT_OVERLAP',
  TURNAROUND_TOO_SHORT = 'TURNAROUND_TOO_SHORT',
  AIRCRAFT_POSITIONING = 'AIRCRAFT_POSITIONING',
  AIRCRAFT_MAINTENANCE = 'AIRCRAFT_MAINTENANCE',
  MAINTENANCE_DUE = 'MAINTENANCE_DUE',
  CREW_OVERLAP = 'CREW_OVERLAP',
  CREW_REST = 'CREW_REST',
}
