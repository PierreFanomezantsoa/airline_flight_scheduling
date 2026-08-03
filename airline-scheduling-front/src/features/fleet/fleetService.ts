// fleetService.ts
import axios from 'axios';

const API_URL = 'http://localhost:3001'; 

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

// Interface pour intercepter d'éventuelles clés en français venant de NestJS
interface BackendFleetStatistics {
  totalAircrafts?: number; total_aircrafts?: number; totalAeronefs?: number;
  activeAircrafts?: number; active_aircrafts?: number; aeronefsActifs?: number;
  inMaintenanceAircrafts?: number; enMaintenance?: number;
  outOfServiceAircrafts?: number; horsService?: number;
  retiredAircrafts?: number; retires?: number;
  totalFlightHours?: number; heuresVolTotales?: number;
  averageFlightHours?: number; moyenneHeuresVol?: number;
  averageCapacity?: number; capaciteMoyenne?: number;
}

class FleetService {
  private api: ReturnType<typeof axios.create>;

  constructor() {
    this.api = axios.create({
      baseURL: API_URL,
    });

    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem('userToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

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

  // Mapping robuste des statistiques pour parer à toute variante de nommage du Back
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
    const response = await this.api.get<BackendAircraft[]>('/fleet/aircrafts');
    return response.data.map(item => this.mapToFrontend(item));
  }

async getFleetStatistics(): Promise<FleetStatistics> {
    const response = await this.api.get('/fleet/aircrafts/statistics');
    
    // On passe d'abord par votre dictionnaire d'interception (les clés du Back NestJS)
    const backendData: BackendFleetStatistics = {
      totalAircrafts: response.data.totalAvions,
      activeAircrafts: response.data.avionsActifs,
      inMaintenanceAircrafts: response.data.avionsEnMaintenance,
      outOfServiceAircrafts: response.data.avionsHorsService,
      retiredAircrafts: response.data.avionsRetires,
      totalFlightHours: response.data.heuresDeVolTotales,
      averageFlightHours: response.data.moyenneHeuresDeVol,
      averageCapacity: response.data.capaciteMoyenne,
    };

    // On utilise votre mapper robuste qui renvoie exactement le type FleetStatistics
    return this.mapStatsToFrontend(backendData);
  }

  async createAircraft(dto: CreateAircraftDto): Promise<Aircraft> {
    const backendDto = {
      immatriculation: dto.registration,
      modele: dto.model,
      capacite: dto.capacity,
      limiteHeuresMaintenance: dto.maintenanceHoursLimit,
      heuresDeVolTotales: dto.totalFlightHours,
      statut: dto.status,
      baseAttache: dto.homeBase,
    };
    const response = await this.api.post<BackendAircraft>('/fleet/aircrafts', backendDto);
    return this.mapToFrontend(response.data);
  }

  async deleteAircraft(id: string): Promise<void> {
    await this.api.delete(`/fleet/aircrafts/${id}`);
  }

  async resetMaintenanceCounter(id: string): Promise<Aircraft> {
    const response = await this.api.patch<BackendAircraft>(`/fleet/aircrafts/${id}/maintenance/reset`);
    return this.mapToFrontend(response.data);
  }
}

export const fleetService = new FleetService();