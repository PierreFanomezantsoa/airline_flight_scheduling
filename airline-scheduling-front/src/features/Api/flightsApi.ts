// src/types/flight.ts
export interface Aircraft {
  id: string;
  immatriculation: string;
  modele?: string;
}

export interface Flight {
  id: string;
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart: string;
  heureArrivee: string;
  statut: 'Scheduled' | 'Delayed' | 'Cancelled' | 'Completed';
  avion?: Aircraft;
  avionId?: string;
}

export interface OptimizationResult {
  timestamp: string;
  resolvedConflicts: number;
  unresolvedConflicts: number;
  details: Array<{
    flightNumber: string;
    status: 'REASSIGNED' | 'UNRESOLVED';
    from?: string;
    to?: string;
    reason?: string;
  }>;
}

// =============================================================================
// src/services/flightsApi.ts
// =============================================================================
//
// Détection automatique de l'environnement :
//
//   DEV  (npm run dev)   → VITE_API_BASE_URL = http://localhost:3001
//   PROD (npm run build) → VITE_API_BASE_URL = /api
//
// Les valeurs sont définies dans :
//   - .env.development
//   - .env.production
//
// Le proxy Nginx en production redirige /api/... vers 127.0.0.1:3001/...
// =============================================================================

/**
 * URL de fallback utilisée si VITE_API_BASE_URL n'est pas défini.
 *
 * - En développement : on suppose que le backend tourne en local
 * - En production    : on utilise un chemin relatif (proxy Nginx)
 */
const FALLBACK_API_BASE_URL: string = import.meta.env.PROD
  ? '/api'
  : 'http://localhost:3001';

/**
 * URL de base de l'API (sans slash final).
 *
 * Exemples :
 *   DEV  → "http://localhost:3001"
 *   PROD → "/api"
 */
const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL ||
  FALLBACK_API_BASE_URL
).replace(/\/+$/, '');

/**
 * URL complète du endpoint /flights.
 *
 * Exemples :
 *   DEV  → "http://localhost:3001/flights"
 *   PROD → "/api/flights"
 */
const API_URL: string = `${API_BASE_URL}/flights`;

// ─────────────────────────────────────────────────────────────
// Logs de debug (uniquement en développement)
// ─────────────────────────────────────────────────────────────

if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info('[flightsApi] Configuration chargée :', {
    mode: 'development',
    apiUrl: API_URL,
    fallbackUsed: !import.meta.env.VITE_API_BASE_URL,
  });
}

// =============================================================================
// FLIGHTS API
// =============================================================================

export const flightsApi = {
  /**
   * Récupère tous les vols.
   * GET /flights
   */
  getAll: async (): Promise<Flight[]> => {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('Erreur lors de la récupération des vols');
    return res.json();
  },

  /**
   * Récupère un vol par son ID.
   * GET /flights/:id
   */
  getOne: async (id: string): Promise<Flight> => {
    const res = await fetch(`${API_URL}/${id}`);
    if (!res.ok) throw new Error('Vol introuvable');
    return res.json();
  },

  /**
   * Crée un nouveau vol.
   * POST /flights
   */
  create: async (flight: Partial<Flight>): Promise<Flight> => {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flight),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erreur à la création');
    return data;
  },

  /**
   * Met à jour un vol existant.
   * PATCH /flights/:id
   */
  update: async (id: string, flight: Partial<Flight>): Promise<Flight> => {
    const res = await fetch(`${API_URL}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flight),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erreur de mise à jour');
    return data;
  },

  /**
   * Supprime un vol.
   * DELETE /flights/:id
   */
  delete: async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur de suppression');
  },

  /**
   * Lance l'optimisation automatique du planning.
   * POST /flights/optimize
   */
  runOptimization: async (): Promise<OptimizationResult> => {
    const res = await fetch(`${API_URL}/optimize`, { method: 'POST' });
    if (!res.ok) throw new Error("Erreur lors de l'optimisation");
    return res.json();
  },
};

// =============================================================================
// EXPORTS
// =============================================================================

export { API_BASE_URL, API_URL };