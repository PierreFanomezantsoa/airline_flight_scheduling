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

// src/services/flightsApi.ts
const API_URL = 'http://localhost:3001/flights'; // Adaptez l'URL si besoin

export const flightsApi = {
  getAll: async (): Promise<Flight[]> => {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('Erreur lors de la récupération des vols');
    return res.json();
  },

  getOne: async (id: string): Promise<Flight> => {
    const res = await fetch(`${API_URL}/${id}`);
    if (!res.ok) throw new Error('Vol introuvable');
    return res.json();
  },

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

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur de suppression');
  },

  runOptimization: async (): Promise<OptimizationResult> => {
    const res = await fetch(`${API_URL}/optimize`, { method: 'POST' });
    if (!res.ok) throw new Error("Erreur lors de l'optimisation");
    return res.json();
  },
};