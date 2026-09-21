import type {
  KpiSet,
  Conflict,
  Alert,
  ScheduleProposal,
  OccDecision,
  FlightStatistics,
  FlightStatusCount,
  FlightHourlyData,
  FlightDailyData,
} from './types';

// =============================================================================
// KPI GLOBAUX
// =============================================================================

export const mockKpis: KpiSet = {
  totalFlights: 248,
  assignedFlights: 221,
  unassignedFlights: 27,
  assignmentRate: 89.1,
  openConflicts: 14,
  resolvedConflicts: 63,
  fleetAvailability: 92.5,
  weatherFallbackActive: true,
};

// =============================================================================
// CONFLITS
// =============================================================================

export const mockConflicts: Conflict[] = [
  {
    id: 'C-001',
    type: 'OVERLAP',
    severity: 'CRITICAL',
    flightNumber: 'AF1204',
    aircraftRegistration: 'F-HBKA',
    reason: 'Chevauchement avec AF1188 sur le même aéronef.',
    detectedAt: '2026-05-12T08:14:00Z',
  },
  {
    id: 'C-002',
    type: 'CREW_REST',
    severity: 'HIGH',
    flightNumber: 'AF2201',
    crewMember: 'C. Martin',
    reason: 'Repos insuffisant : 8h30 < 10h réglementaires.',
    detectedAt: '2026-05-12T09:02:00Z',
  },
  {
    id: 'C-003',
    type: 'MAINTENANCE',
    severity: 'HIGH',
    flightNumber: 'AF3305',
    aircraftRegistration: 'F-GZNP',
    reason: 'Créneau maintenance A-check chevauche le vol.',
    detectedAt: '2026-05-12T10:20:00Z',
  },
  {
    id: 'C-004',
    type: 'TURNAROUND',
    severity: 'MEDIUM',
    flightNumber: 'AF4410',
    aircraftRegistration: 'F-HBKB',
    reason: 'Turnaround 35 min < 45 min requis à CDG.',
    detectedAt: '2026-05-12T11:45:00Z',
  },
  {
    id: 'C-005',
    type: 'POSITIONING',
    severity: 'MEDIUM',
    flightNumber: 'AF5520',
    aircraftRegistration: 'F-GZNR',
    reason: 'Aéronef positionné à ORY mais vol prévu à CDG.',
    detectedAt: '2026-05-12T12:10:00Z',
  },
];

// =============================================================================
// ALERTES
// =============================================================================

export const mockAlerts: Alert[] = [
  {
    id: 'A-001',
    severity: 'CRITICAL',
    title: 'Conflit dur non résolu',
    message: 'AF1204 / F-HBKA — chevauchement avec AF1188.',
    source: 'CONFLICT',
    createdAt: '2026-05-12T08:14:00Z',
  },
  {
    id: 'A-002',
    severity: 'HIGH',
    title: 'Maintenance imminente',
    message: 'F-GZNP — A-check dans 6h.',
    source: 'MAINTENANCE',
    createdAt: '2026-05-12T09:30:00Z',
  },
  {
    id: 'A-003',
    severity: 'HIGH',
    title: 'Météo — fallback ML actif',
    message: 'API météo indisponible. Source : ML local (confiance 0.72).',
    source: 'WEATHER',
    createdAt: '2026-05-12T10:00:00Z',
  },
  {
    id: 'A-004',
    severity: 'MEDIUM',
    title: 'Repos équipage limite',
    message: 'C. Martin — marge de 30 min sur le repos minimum.',
    source: 'CREW',
    createdAt: '2026-05-12T10:45:00Z',
  },
];

// =============================================================================
// SCÉNARIOS
// =============================================================================

export const mockProposals: ScheduleProposal[] = [
  {
    id: 'SP-2026-05-12-01',
    name: 'Scénario principal — semaine 20',
    status: 'OCC_VALIDATED',
    createdAt: '2026-05-10T07:00:00Z',
    updatedAt: '2026-05-10T15:30:00Z',
    flightsCount: 248,
    conflictsCount: 14,
    weatherSource: 'API',
    weatherConfidence: 0.94,
  },
  {
    id: 'SP-2026-05-11-02',
    name: 'Scénario alternatif — réduction flotte',
    status: 'PREVIEWED',
    createdAt: '2026-05-11T08:00:00Z',
    updatedAt: '2026-05-11T09:10:00Z',
    flightsCount: 232,
    conflictsCount: 21,
    weatherSource: 'ML_FALLBACK',
    weatherConfidence: 0.72,
  },
  {
    id: 'SP-2026-05-11-03',
    name: 'Scénario nuit — vols cargo',
    status: 'OCC_REJECTED',
    createdAt: '2026-05-11T20:00:00Z',
    updatedAt: '2026-05-11T22:40:00Z',
    flightsCount: 48,
    conflictsCount: 9,
    weatherSource: 'CACHE',
    weatherConfidence: 0.6,
  },
  {
    id: 'SP-2026-05-12-04',
    name: 'Scénario brouillon — ajustements OCC',
    status: 'DRAFT',
    createdAt: '2026-05-12T06:00:00Z',
    updatedAt: '2026-05-12T06:00:00Z',
    flightsCount: 250,
    conflictsCount: 18,
    weatherSource: 'API',
    weatherConfidence: 0.91,
  },
];

// =============================================================================
// DÉCISIONS OCC
// =============================================================================

export const mockDecisions: OccDecision[] = [
  {
    id: 'D-001',
    proposalId: 'SP-2026-05-12-01',
    proposalName: 'Scénario principal — semaine 20',
    decision: 'VALIDATED',
    decidedBy: 'A. Diallo',
    role: 'OCC',
    motive: 'Conflits critiques résolus, couverture flotte conforme.',
    decidedAt: '2026-05-10T15:30:00Z',
  },
  {
    id: 'D-002',
    proposalId: 'SP-2026-05-11-03',
    proposalName: 'Scénario nuit — vols cargo',
    decision: 'REJECTED',
    decidedBy: 'S. Bernard',
    role: 'OCC',
    motive: 'Trop de conflits crew rest non résolus.',
    decidedAt: '2026-05-11T22:40:00Z',
  },
  {
    id: 'D-003',
    proposalId: 'SP-2026-05-11-02',
    proposalName: 'Scénario alternatif — réduction flotte',
    decision: 'ADJUSTED',
    decidedBy: 'A. Diallo',
    role: 'OCC',
    motive: 'Réaffectation de 3 vols sur F-HBKB et F-GZNR.',
    decidedAt: '2026-05-11T09:10:00Z',
  },
];

// =============================================================================
// RÉFÉRENTIELS
// =============================================================================

export const mockAirports = ['CDG', 'ORY', 'LYS', 'NCE', 'TLS'];
export const mockAircraft = ['F-HBKA', 'F-HBKB', 'F-GZNP', 'F-GZNR'];
export const mockCrew = ['C. Martin', 'L. Petit', 'M. Roux', 'A. Diallo'];

// =============================================================================
// STATUTS DE VOL — Agrégats
// =============================================================================

export const mockFlightStatusCounts: FlightStatusCount[] = [
  { status: 'IN_FLIGHT', count: 32, label: 'Appareils en vol', color: '#0ea5e9' },
  { status: 'PLANNED',   count: 96, label: 'Planifiés',         color: '#6366f1' },
  { status: 'COMPLETED', count: 98, label: 'Effectués',         color: '#10b981' },
  { status: 'DELAYED',   count: 14, label: 'En retard',         color: '#f59e0b' },
  { status: 'CANCELLED', count: 8,  label: 'Annulés',           color: '#ef4444' },
];

// =============================================================================
// VOLS PAR HEURE
// =============================================================================

export const mockFlightHourly: FlightHourlyData[] = [
  { hour: '00h', inFlight: 2, planned: 4,  completed: 1,  delayed: 0, cancelled: 0 },
  { hour: '02h', inFlight: 1, planned: 2,  completed: 1,  delayed: 0, cancelled: 0 },
  { hour: '04h', inFlight: 3, planned: 5,  completed: 2,  delayed: 1, cancelled: 0 },
  { hour: '06h', inFlight: 6, planned: 12, completed: 8,  delayed: 2, cancelled: 1 },
  { hour: '08h', inFlight: 9, planned: 18, completed: 14, delayed: 3, cancelled: 1 },
  { hour: '10h', inFlight: 8, planned: 15, completed: 12, delayed: 2, cancelled: 1 },
  { hour: '12h', inFlight: 7, planned: 14, completed: 11, delayed: 2, cancelled: 1 },
  { hour: '14h', inFlight: 6, planned: 12, completed: 10, delayed: 2, cancelled: 1 },
  { hour: '16h', inFlight: 5, planned: 10, completed: 9,  delayed: 1, cancelled: 1 },
  { hour: '18h', inFlight: 4, planned: 8,  completed: 7,  delayed: 1, cancelled: 1 },
  { hour: '20h', inFlight: 3, planned: 6,  completed: 5,  delayed: 0, cancelled: 0 },
  { hour: '22h', inFlight: 2, planned: 4,  completed: 3,  delayed: 0, cancelled: 0 },
];

// =============================================================================
// VOLS PAR JOUR
// =============================================================================

export const mockFlightDaily: FlightDailyData[] = [
  { day: 'Lun', inFlight: 28, planned: 88,  completed: 92,  delayed: 12, cancelled: 6 },
  { day: 'Mar', inFlight: 30, planned: 92,  completed: 95,  delayed: 10, cancelled: 5 },
  { day: 'Mer', inFlight: 32, planned: 96,  completed: 98,  delayed: 14, cancelled: 8 },
  { day: 'Jeu', inFlight: 31, planned: 94,  completed: 96,  delayed: 11, cancelled: 7 },
  { day: 'Ven', inFlight: 35, planned: 102, completed: 105, delayed: 16, cancelled: 9 },
  { day: 'Sam', inFlight: 26, planned: 80,  completed: 84,  delayed: 9,  cancelled: 4 },
  { day: 'Dim', inFlight: 22, planned: 72,  completed: 76,  delayed: 7,  cancelled: 3 },
];

// =============================================================================
// STATISTIQUES GLOBALES
// =============================================================================

export const mockFlightStatistics: FlightStatistics = {
  totalFlights: 248,
  byStatus: mockFlightStatusCounts,
  hourly: mockFlightHourly,
  daily: mockFlightDaily,
  onTimeRate: 89.5,
  delayRate: 5.6,
  cancellationRate: 3.2,
  completionRate: 39.5,
};