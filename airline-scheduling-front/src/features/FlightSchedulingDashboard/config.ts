export interface AutoScheduleOptions {
  horizonDays: number;
  turnaroundMinutes: number;
  shiftStepMinutes: number;
  maxShiftMinutes: number;
}

export const AUTO_SCHEDULE_OPTIONS: AutoScheduleOptions = {
  horizonDays: 7,
  turnaroundMinutes: 45,
  shiftStepMinutes: 15,
  maxShiftMinutes: 360,
};

export const AUTO_SCHEDULE_ENDPOINTS = {
  generate: '/flights/auto-schedule/generate',
  gantt: '/flights/auto-schedule/gantt',
  eligible: '/flights/auto-schedule/eligible',
  analytics: '/flights/analytics',
  flights: '/flights',
} as const;

export const STATUS_FILTERS = [
  { id: 'TOUS', label: 'Tous' },
  { id: 'Planifié', label: 'Planifiés' },
  { id: 'En Vol', label: 'En vol' },
  { id: 'Retardé', label: 'Retardés' },
  { id: 'Effectué', label: 'Effectués' },
  { id: 'Annulé', label: 'Annulés' },
] as const;

export const FOCUS_RING =
  'outline-none transition focus-visible:ring-4 focus-visible:ring-sky-500/15 focus-visible:ring-offset-1';

export const FLIGHT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
