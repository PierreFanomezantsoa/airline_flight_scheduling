import axios from 'axios';
import type { Aircraft } from '../fleet/fleetService';

// Récupération de l'URL via les variables d'environnement Vite/CRA ou fallback en dev local
const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001';

export interface MaintenanceSlot {
  id: string;
  aircraftId: string;
  aircraft: Aircraft;
  maintenanceType: 'Type A' | 'Type C' | 'Aircraft On Ground';
  startTime: string;
  endTime: string;
  description?: string;
}

export interface CreateMaintenanceSlotDto {
  aircraftId: string;
  maintenanceType: 'Type A' | 'Type C' | 'Aircraft On Ground';
  startTime: string;
  endTime: string;
  description?: string;
}

// Interface correspondant exactement aux clés renvoyées par le backend NestJS
interface RawMaintenanceSlotResponse {
  id: string;
  aircraftId: string;
  maintenanceType: 'Type A' | 'Type C' | 'Aircraft On Ground';
  startTime: string;
  endTime: string;
  description?: string;
  aircraft?: {
    id: string;
    immatriculation?: string;
    registration?: string;
    modele?: string;
    model?: string;
    [key: string]: unknown;
  };
}

class MaintenanceService {
  private readonly api = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  constructor() {
    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem('userToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  /**
   * Mappe les objets issus de l'API pour garantir la présence des clés `registration` et `model` 
   * côté Front-end, peu importe le nommage envoyé par le NestJS backend.
   */
  private mapMaintenanceSlot(data: RawMaintenanceSlotResponse): MaintenanceSlot {
    if (!data.aircraft) {
      return data as unknown as MaintenanceSlot;
    }

    return {
      ...data,
      aircraft: {
        ...data.aircraft,
        registration: data.aircraft.registration ?? data.aircraft.immatriculation ?? 'Inconnu',
        model: data.aircraft.model ?? data.aircraft.modele ?? 'N/A',
      } as Aircraft,
    };
  }

  async findAll(): Promise<MaintenanceSlot[]> {
    const response = await this.api.get<RawMaintenanceSlotResponse[]>('/maintenance');
    return response.data.map((item) => this.mapMaintenanceSlot(item));
  }

  async create(dto: CreateMaintenanceSlotDto): Promise<MaintenanceSlot> {
    const response = await this.api.post<RawMaintenanceSlotResponse>('/maintenance', dto);
    return this.mapMaintenanceSlot(response.data);
  }

  async remove(id: string): Promise<void> {
    await this.api.delete(`/maintenance/${id}`);
  }
}

export const maintenanceService = new MaintenanceService();