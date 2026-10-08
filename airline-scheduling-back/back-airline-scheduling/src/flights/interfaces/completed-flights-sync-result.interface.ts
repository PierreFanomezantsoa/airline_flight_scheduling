/**
 * Erreur rencontrée pendant la synchronisation d'un flight terminé.
 * Ce type est exporté afin que NestJS/TypeScript puisse générer proprement
 * les déclarations .d.ts du contrôleur public.
 */
export interface CompletedFlightSyncError {
  refFlight: string;
  flightNumber?: string;
  message: string;
}

/**
 * Résultat public de PATCH /flights/sync/completed.
 */
export interface CompletedFlightsSyncResult {
  /** Nombre de vols candidats examinés. */
  scanned: number;

  /** Nombre de vols confirmés au status Effectué. */
  completed: number;

  /** Nombre de vols dont les heures ont été créditées pendant cet appel. */
  credited: number;

  /** Nombre de vols déjà comptabilisés ou sans nouveau crédit à appliquer. */
  skipped: number;

  /** Erreurs unitaires : une erreur n'interrompt pas tout le batch. */
  errors: CompletedFlightSyncError[];
}
