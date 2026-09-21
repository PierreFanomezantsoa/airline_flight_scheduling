// =============================================================================
// RÔLES & SÉVÉRITÉS
// =============================================================================

export type Role = 'PLANNER' | 'OCC' | 'MAINTENANCE' | 'CREW' | 'ADMIN';
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ScenarioStatus =
  | 'DRAFT'
  | 'PREVIEWED'
  | 'OCC_VALIDATED'
  | 'OCC_REJECTED';

// =============================================================================
// KPI SET
// =============================================================================

export interface KpiSet {
  totalFlights: number;
  assignedFlights: number;
  unassignedFlights: number;
  assignmentRate: number;
  openConflicts: number;
  resolvedConflicts: number;
  fleetAvailability: number;
  weatherFallbackActive: boolean;
}

// =============================================================================
// CONFLITS
// =============================================================================

export interface Conflict {
  id: string;
  type:
    | 'OVERLAP'
    | 'TURNAROUND'
    | 'POSITIONING'
    | 'MAINTENANCE'
    | 'CREW_REST'
    | 'WEATHER';
  severity: Severity;
  flightNumber: string;
  aircraftRegistration?: string;
  crewMember?: string;
  reason: string;
  detectedAt: string;
}

// =============================================================================
// ALERTES
// =============================================================================

export interface Alert {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  source: 'CONFLICT' | 'MAINTENANCE' | 'WEATHER' | 'CREW';
  createdAt: string;
}

// =============================================================================
// SCÉNARIOS DE PLANNING
// =============================================================================

export interface ScheduleProposal {
  id: string;
  name: string;
  status: ScenarioStatus;
  createdAt: string;
  updatedAt: string;
  flightsCount: number;
  conflictsCount: number;
  weatherSource: 'API' | 'ML_FALLBACK' | 'CACHE';
  weatherConfidence: number;
}

// =============================================================================
// DÉCISIONS OCC
// =============================================================================

export interface OccDecision {
  id: string;
  proposalId: string;
  proposalName: string;
  decision: 'VALIDATED' | 'ADJUSTED' | 'REJECTED';
  decidedBy: string;
  role: Role;
  motive: string;
  decidedAt: string;
}

// =============================================================================
// FILTRES DASHBOARD
// =============================================================================

export interface DashboardFilters {
  dateFrom: string;
  dateTo: string;
  airport: string;
  aircraft: string;
  crew: string;
  severity: Severity | 'ALL';
}

// =============================================================================
// STATUTS DE VOL (pour les graphiques)
// =============================================================================

export type FlightStatus =
  | 'IN_FLIGHT'   // Appareil en vol
  | 'PLANNED'     // Planifié
  | 'COMPLETED'   // Effectué
  | 'DELAYED'     // En retard
  | 'CANCELLED';  // Annulé

export interface FlightStatusCount {
  status: FlightStatus;
  count: number;
  label: string;
  color: string;
}

export interface FlightHourlyData {
  hour: string;        // "00h", "01h", ...
  inFlight: number;
  planned: number;
  completed: number;
  delayed: number;
  cancelled: number;
}

export interface FlightDailyData {
  day: string;         // "Lun", "Mar", ...
  inFlight: number;
  planned: number;
  completed: number;
  delayed: number;
  cancelled: number;
}

export interface FlightStatistics {
  totalFlights: number;
  byStatus: FlightStatusCount[];
  hourly: FlightHourlyData[];
  daily: FlightDailyData[];
  onTimeRate: number;        // %
  delayRate: number;         // %
  cancellationRate: number;  // %
  completionRate: number;    // %
}