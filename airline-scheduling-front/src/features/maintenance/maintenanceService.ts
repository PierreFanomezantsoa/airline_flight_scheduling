import axios from 'axios';
import type { Aircraft } from '../fleet/fleetService';

const API_URL =
  import.meta.env?.VITE_API_URL ||
  'http://localhost:3001';

export interface MaintenanceSlot {
  id: string;
  aircraftId: string;
  aircraft: Aircraft;
  maintenanceType:
    | 'Type A'
    | 'Type C'
    | 'Aircraft On Ground';
  status?: string;
  startTime: string;
  endTime: string;
  description?: string;
}

export interface CreateMaintenanceSlotDto {
  aircraftId: string;
  maintenanceType:
    | 'Type A'
    | 'Type C'
    | 'Aircraft On Ground';
  status?: string;
  startTime: string;
  endTime: string;
  description?: string;
}

export interface MaintenanceAvailability {
  available: boolean;

  maintenanceConflict: {
    id: string;
    maintenanceType: string;
    startTime: string;
    endTime: string;
  } | null;

  flightConflict: {
    id: string;
    numeroVol: string;
    heureDepart: string;
    heureArrivee: string;
  } | null;
}

interface RawMaintenanceSlotResponse {
  id: string;
  aircraftId: string;
  maintenanceType:
    | 'Type A'
    | 'Type C'
    | 'Aircraft On Ground';
  status?: string;
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
  private readonly api =
    axios.create({
      baseURL:
        API_URL,

      headers: {
        'Content-Type':
          'application/json',
      },
    });

  constructor() {
    this.api.interceptors.request.use(
      (config) => {
        /**
         * Compatible localStorage + sessionStorage,
         * selon votre logique remember-me.
         */
        const token =
          localStorage.getItem(
            'userToken',
          ) ||
          sessionStorage.getItem(
            'userToken',
          ) ||
          localStorage.getItem(
            'token',
          ) ||
          sessionStorage.getItem(
            'token',
          );

        if (token) {
          config.headers.Authorization =
            `Bearer ${token}`;
        }

        return config;
      },
    );
  }

  private mapMaintenanceSlot(
    data: RawMaintenanceSlotResponse,
  ): MaintenanceSlot {
    if (!data.aircraft) {
      return data as unknown as MaintenanceSlot;
    }

    return {
      ...data,

      aircraft: {
        ...data.aircraft,

        registration:
          data.aircraft.registration ??
          data.aircraft.immatriculation ??
          'Inconnu',

        model:
          data.aircraft.model ??
          data.aircraft.modele ??
          'N/A',
      } as Aircraft,
    };
  }

  async findAll(): Promise<
    MaintenanceSlot[]
  > {
    const response =
      await this.api.get<
        RawMaintenanceSlotResponse[]
      >(
        '/maintenance',
      );

    return response.data.map(
      (item) =>
        this.mapMaintenanceSlot(
          item,
        ),
    );
  }

  /**
   * À appeler depuis MaintenancePlanning AVANT create().
   * Cela permet d'afficher la vraie raison du conflit sans déclencher
   * systématiquement un POST 409.
   */
  async checkAvailability(
    aircraftId: string,
    startTime: string,
    endTime: string,
  ): Promise<MaintenanceAvailability> {
    const response =
      await this.api.get<MaintenanceAvailability>(
        '/maintenance/check-availability',
        {
          params: {
            aircraftId,
            startTime,
            endTime,
          },
        },
      );

    return response.data;
  }

  async create(
    dto: CreateMaintenanceSlotDto,
  ): Promise<MaintenanceSlot> {
    const response =
      await this.api.post<
        RawMaintenanceSlotResponse
      >(
        '/maintenance',
        dto,
      );

    return this.mapMaintenanceSlot(
      response.data,
    );
  }

  async remove(
    id: string,
  ): Promise<void> {
    await this.api.delete(
      `/maintenance/${id}`,
    );
  }
}

export const maintenanceService =
  new MaintenanceService();