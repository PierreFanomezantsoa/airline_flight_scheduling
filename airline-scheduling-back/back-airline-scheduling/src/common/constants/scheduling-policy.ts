/**
 * Politique interne de démonstration.
 * Les valeurs doivent être adaptées aux règles de l'opérateur et à la
 * réglementation applicable. Elles ne constituent pas des minima universels.
 */
export const SchedulingPolicy = {
  minimumTurnaroundMinutes: Number(process.env.MIN_TURNAROUND_MINUTES ?? 45),
  positioningBufferMinutes: Number(process.env.POSITIONING_BUFFER_MINUTES ?? 180),
  minimumCrewRestHours: Number(process.env.MIN_CREW_REST_HOURS ?? 10),
  maintenanceWarningHours: Number(process.env.MAINTENANCE_WARNING_HOURS ?? 10),
} as const;
