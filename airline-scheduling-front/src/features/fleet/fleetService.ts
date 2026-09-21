// src/features/fleet/fleetService.ts

import { authFetch } from '../Api/apiService';

/* ============================================================================
 * TYPES
 * ========================================================================== */

export interface Aircraft {
  id: string;
  registration: string;
  model: string;
  capacity: number;
  maintenanceHoursLimit: number;
  totalFlightHours: number;
  status: 'Active' | 'Maintenance' | 'Out of Service' | 'Retired';
  homeBase?: string;
}

export interface CreateAircraftDto {
  registration: string;
  model: string;
  capacity: number;
  maintenanceHoursLimit: number;
  totalFlightHours: number;
  status: 'Active' | 'Maintenance' | 'Out of Service' | 'Retired';
  homeBase?: string;
}

export interface FleetStatistics {
  totalAircrafts: number;
  activeAircrafts: number;
  inMaintenanceAircrafts: number;
  outOfServiceAircrafts: number;
  retiredAircrafts: number;
  totalFlightHours: number;
  averageFlightHours: number;
  averageCapacity: number;
}

interface BackendAircraft {
  id: string;
  immatriculation: string;
  modele: string;
  capacite: number;
  limiteHeuresMaintenance: number;
  heuresDeVolTotales: number;
  statut: 'Active' | 'Maintenance' | 'Out of Service' | 'Retired';
  baseAttache?: string | null;
}

interface BackendFleetStatistics {
  totalAircrafts?: number;
  total_aircrafts?: number;
  totalAeronefs?: number;
  activeAircrafts?: number;
  active_aircrafts?: number;
  aeronefsActifs?: number;
  inMaintenanceAircrafts?: number;
  enMaintenance?: number;
  outOfServiceAircrafts?: number;
  horsService?: number;
  retiredAircrafts?: number;
  retires?: number;
  totalFlightHours?: number;
  heuresVolTotales?: number;
  averageFlightHours?: number;
  moyenneHeuresVol?: number;
  averageCapacity?: number;
  capaciteMoyenne?: number;
}

/* ============================================================================
 * HELPERS
 * ========================================================================== */

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function extractBackendMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as { message?: unknown; error?: unknown };

  if (Array.isArray(data.message)) return (data.message as string[]).join(' | ');
  if (typeof data.message === 'string' && data.message.trim()) return data.message;
  if (typeof data.error === 'string' && data.error.trim()) return data.error;
  return null;
}

async function ensureOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const payload = await readJsonSafe<unknown>(response.clone());
  throw new Error(extractBackendMessage(payload) || fallback);
}

/* ============================================================================
 * SERVICE
 * ========================================================================== */

class FleetService {
  private mapToFrontend(data: BackendAircraft): Aircraft {
    return {
      id: data.id,
      registration: data.immatriculation,
      model: data.modele,
      capacity: data.capacite,
      maintenanceHoursLimit: data.limiteHeuresMaintenance,
      totalFlightHours: data.heuresDeVolTotales,
      status: data.statut,
      homeBase: data.baseAttache || undefined,
    };
  }

  private mapStatsToFrontend(data: BackendFleetStatistics): FleetStatistics {
    return {
      totalAircrafts: Number(data.totalAircrafts ?? data.total_aircrafts ?? data.totalAeronefs ?? 0),
      activeAircrafts: Number(data.activeAircrafts ?? data.active_aircrafts ?? data.aeronefsActifs ?? 0),
      inMaintenanceAircrafts: Number(data.inMaintenanceAircrafts ?? data.enMaintenance ?? 0),
      outOfServiceAircrafts: Number(data.outOfServiceAircrafts ?? data.horsService ?? 0),
      retiredAircrafts: Number(data.retiredAircrafts ?? data.retires ?? 0),
      totalFlightHours: Number(data.totalFlightHours ?? data.heuresVolTotales ?? 0),
      averageFlightHours: Number(data.averageFlightHours ?? data.moyenneHeuresVol ?? 0),
      averageCapacity: Number(data.averageCapacity ?? data.capaciteMoyenne ?? 0),
    };
  }

  async getAircrafts(): Promise<Aircraft[]> {
    const response = await authFetch('/fleet/aircrafts', { method: 'GET' });
    await ensureOk(response, 'Impossible de charger la flotte.');
    const data = (await readJsonSafe<BackendAircraft[]>(response)) ?? [];
    return data.map((item) => this.mapToFrontend(item));
  }

  async getFleetStatistics(): Promise<FleetStatistics> {
    const response = await authFetch('/fleet/aircrafts/statistics', {
      method: 'GET',
    });
    await ensureOk(response, 'Impossible de charger les statistiques.');

    const payload = (await readJsonSafe<Record<string, unknown>>(response)) ?? {};

    return this.mapStatsToFrontend({
      totalAircrafts: Number(payload.totalAvions ?? 0),
      activeAircrafts: Number(payload.avionsActifs ?? 0),
      inMaintenanceAircrafts: Number(payload.avionsEnMaintenance ?? 0),
      outOfServiceAircrafts: Number(payload.avionsHorsService ?? 0),
      retiredAircrafts: Number(payload.avionsRetires ?? 0),
      totalFlightHours: Number(payload.heuresDeVolTotales ?? 0),
      averageFlightHours: Number(payload.moyenneHeuresDeVol ?? 0),
      averageCapacity: Number(payload.capaciteMoyenne ?? 0),
    });
  }

  async createAircraft(dto: CreateAircraftDto): Promise<Aircraft> {
    const response = await authFetch('/fleet/aircrafts', {
      method: 'POST',
      body: JSON.stringify({
        immatriculation: dto.registration,
        modele: dto.model,
        capacite: dto.capacity,
        limiteHeuresMaintenance: dto.maintenanceHoursLimit,
        heuresDeVolTotales: dto.totalFlightHours,
        statut: dto.status,
        baseAttache: dto.homeBase,
      }),
    });
    await ensureOk(response, "Impossible de créer l'avion.");
    const data = (await readJsonSafe<BackendAircraft>(response))!;
    return this.mapToFrontend(data);
  }

  async deleteAircraft(id: string): Promise<void> {
    const response = await authFetch(`/fleet/aircrafts/${id}`, {
      method: 'DELETE',
    });
    await ensureOk(response, "Impossible de supprimer l'avion.");
  }

  async resetMaintenanceCounter(id: string): Promise<Aircraft> {
    const response = await authFetch(`/fleet/aircrafts/${id}/maintenance/reset`, {
      method: 'PATCH',
    });
    await ensureOk(response, 'Impossible de réinitialiser le compteur.');
    const data = (await readJsonSafe<BackendAircraft>(response))!;
    return this.mapToFrontend(data);
  }
}

export const fleetService = new FleetService();