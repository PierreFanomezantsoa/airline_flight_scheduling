import axios from 'axios';
import type { Aircraft } from '../fleet/fleetService';

const API_URL =
  import.meta.env?.VITE_API_URL ||
  'http://localhost:3001';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * ⭐ Statuts possibles d'un créneau de maintenance.
 *
 * Convention identique au backend (Title Case).
 */
export type MaintenanceStatus =
  | 'Planned'
  | 'In Progress'
  | 'Pending Review'   // ⭐ nouveau — fenêtre de décision 12 h
  | 'Completed'
  | 'Cancelled';

export type MaintenanceType =
  | 'Type A'
  | 'Type C'
  | 'Aircraft On Ground';

export interface MaintenanceSlot {
  id: string;
  aircraftId: string;
  aircraft: Aircraft;
  maintenanceType: MaintenanceType;
  status: MaintenanceStatus;
  startTime: string;
  endTime: string;
  description?: string | null;

  // ⭐ Nouvelles colonnes (fenêtre 12 h)
  pendingReviewSince: string | null;
  autoCloseAt: string | null;
  extensionCount: number;

  creeA?: string;
  misAJourA?: string;
}

export interface CreateMaintenanceSlotDto {
  aircraftId: string;
  maintenanceType: MaintenanceType;
  status?: MaintenanceStatus;
  startTime: string;
  endTime: string;
  description?: string;
}

export interface UpdateMaintenanceSlotDto {
  aircraftId?: string;
  maintenanceType?: MaintenanceType;
  status?: MaintenanceStatus;
  startTime?: string;
  endTime?: string;
  description?: string | null;
}

export interface ExtendMaintenanceSlotDto {
  /** ⭐ Nombre de jours à ajouter (entier positif). */
  additionalDays: number;
}

export interface MaintenanceAvailability {
  available: boolean;

  maintenanceConflict: {
    id: string;
    maintenanceType: string;
    status: MaintenanceStatus;
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

/**
 * Réponse brute du backend.
 * Les noms peuvent varier (immatriculation/modele vs registration/model).
 */
interface RawMaintenanceSlotResponse {
  id: string;
  aircraftId: string;
  maintenanceType: MaintenanceType;
  status?: MaintenanceStatus;
  startTime: string;
  endTime: string;
  description?: string | null;

  // ⭐ Champs fenêtre 12 h
  pendingReviewSince?: string | null;
  autoCloseAt?: string | null;
  extensionCount?: number;

  creeA?: string;
  misAJourA?: string;

  aircraft?: {
    id: string;
    immatriculation?: string;
    registration?: string;
    modele?: string;
    model?: string;
    [key: string]: unknown;
  };
}

// ═══════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════

class MaintenanceService {
  private readonly api = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  constructor() {
    this.api.interceptors.request.use((config) => {
      /**
       * Compatible localStorage + sessionStorage,
       * selon votre logique remember-me.
       */
      const token =
        localStorage.getItem('userToken') ||
        sessionStorage.getItem('userToken') ||
        localStorage.getItem('token') ||
        sessionStorage.getItem('token');

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      return config;
    });
  }

  // ───────────────────────────────────────────────────────────
  // MAPPING
  // ───────────────────────────────────────────────────────────

  private mapMaintenanceSlot(
    data: RawMaintenanceSlotResponse,
  ): MaintenanceSlot {
    const mappedAircraft: Aircraft | undefined = data.aircraft
      ? ({
          ...data.aircraft,
          registration:
            data.aircraft.registration ??
            data.aircraft.immatriculation ??
            'Inconnu',
          model:
            data.aircraft.model ??
            data.aircraft.modele ??
            'N/A',
        } as Aircraft)
      : undefined;

    return {
      id: data.id,
      aircraftId: data.aircraftId,
      aircraft: mappedAircraft as Aircraft,
      maintenanceType: data.maintenanceType,
      status: (data.status ?? 'Planned') as MaintenanceStatus,
      startTime: data.startTime,
      endTime: data.endTime,
      description: data.description ?? null,

      // ⭐ Fenêtre 12 h
      pendingReviewSince: data.pendingReviewSince ?? null,
      autoCloseAt: data.autoCloseAt ?? null,
      extensionCount: data.extensionCount ?? 0,

      creeA: data.creeA,
      misAJourA: data.misAJourA,
    };
  }

  // ───────────────────────────────────────────────────────────
  // LECTURE
  // ───────────────────────────────────────────────────────────

  async findAll(): Promise<MaintenanceSlot[]> {
    const response = await this.api.get<RawMaintenanceSlotResponse[]>(
      '/maintenance',
    );

    return response.data.map((item) => this.mapMaintenanceSlot(item));
  }

  async findOne(id: string): Promise<MaintenanceSlot> {
    const response = await this.api.get<RawMaintenanceSlotResponse>(
      `/maintenance/${id}`,
    );

    return this.mapMaintenanceSlot(response.data);
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
    const response = await this.api.get<MaintenanceAvailability>(
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

  // ───────────────────────────────────────────────────────────
  // ÉCRITURE
  // ───────────────────────────────────────────────────────────

  async create(
    dto: CreateMaintenanceSlotDto,
  ): Promise<MaintenanceSlot> {
    const response = await this.api.post<RawMaintenanceSlotResponse>(
      '/maintenance',
      dto,
    );

    return this.mapMaintenanceSlot(response.data);
  }

  async update(
    id: string,
    dto: UpdateMaintenanceSlotDto,
  ): Promise<MaintenanceSlot> {
    const response = await this.api.patch<RawMaintenanceSlotResponse>(
      `/maintenance/${id}`,
      dto,
    );

    return this.mapMaintenanceSlot(response.data);
  }

  async remove(id: string): Promise<void> {
    await this.api.delete(`/maintenance/${id}`);
  }

  // ───────────────────────────────────────────────────────────
  // ⭐ ACTIONS PENDING_REVIEW
  // ───────────────────────────────────────────────────────────

  /**
   * ⭐ PROLONGER : ajoute N jours à un créneau en cours.
   *
   * Utilisable quand le créneau est :
   *   - `In Progress` (encore dans la fenêtre prévue)
   *   - `Pending Review` (fin prévue dépassée, fenêtre 12 h en cours)
   *
   * Effet côté backend :
   *   - endTime += N jours
   *   - status = `In Progress`
   *   - pendingReviewSince / autoCloseAt remis à null
   *   - extensionCount += 1
   *   - avion reste en MAINTENANCE
   */
  async extend(
    id: string,
    additionalDays: number,
  ): Promise<MaintenanceSlot> {
    const response = await this.api.patch<RawMaintenanceSlotResponse>(
      `/maintenance/${id}/extend`,
      { additionalDays } satisfies ExtendMaintenanceSlotDto,
    );

    return this.mapMaintenanceSlot(response.data);
  }

  /**
   * ⭐ CLÔTURER : termine un créneau et remet l'avion en ACTIVE.
   *
   * Utilisable quand le créneau est `In Progress` ou `Pending Review`.
   * Idempotent si déjà `Completed`.
   */
  async close(id: string): Promise<MaintenanceSlot> {
    const response = await this.api.patch<RawMaintenanceSlotResponse>(
      `/maintenance/${id}/close`,
    );

    return this.mapMaintenanceSlot(response.data);
  }

  // ───────────────────────────────────────────────────────────
  // SYNCHRONISATION (fallback si pas de cron backend)
  // ───────────────────────────────────────────────────────────

  /**
   * ⭐ Force la machine à états côté backend :
   *   - In Progress → Pending Review (endTime dépassé)
   *   - Pending Review → Completed (autoCloseAt dépassé)
   *
   * Utile si vous n'utilisez PAS @nestjs/schedule côté backend.
   * Sinon, le cron s'en charge et vous pouvez retirer cet appel.
   */
  async syncExpired(): Promise<{
    movedToPendingReview: number;
    autoClosed: number;
    aircraftIds: string[];
  }> {
    const response = await this.api.patch<{
      movedToPendingReview: number;
      autoClosed: number;
      aircraftIds: string[];
    }>('/maintenance/sync-expired');

    return response.data;
  }
}

export const maintenanceService = new MaintenanceService();