import axios from 'axios';
// CORRECTION : Utilisation de 'import type' pour respecter verbatimModuleSyntax
import type { Aircraft } from '../fleet/fleetService'; // Ajustez le chemin relatif si nécessaire (ex: '../fleet/fleetService')

const API_URL = 'http://localhost:3001';

export interface MaintenanceSlot {
  id: string;
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

class MaintenanceService {
  private api = axios.create({ baseURL: API_URL });

  constructor() {
    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem('userToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  async findAll(): Promise<MaintenanceSlot[]> {
    const response = await this.api.get<MaintenanceSlot[]>('/maintenance');
    return response.data;
  }

  async create(dto: CreateMaintenanceSlotDto): Promise<MaintenanceSlot> {
    const response = await this.api.post<MaintenanceSlot>('/maintenance', dto);
    return response.data;
  }

  async remove(id: string): Promise<void> {
    await this.api.delete(`/maintenance/${id}`);
  }
}

export const maintenanceService = new MaintenanceService();