// src/features/maintenance/maintenanceService.ts

import axios from 'axios';
import type { AxiosInstance } from 'axios';

import { getAuthSession, clearAuthSession } from '../Api/apiService';
import type { Aircraft } from '../fleet/fleetService';

/* ============================================================================
 * CONFIGURATION API
 * ============================================================================
 *
 *   DEV  → VITE_API_BASE_URL = http://localhost:3001
 *   PROD → VITE_API_BASE_URL = /api
 *
 * Nginx en production redirige /api/... vers 127.0.0.1:3001/...
 * ========================================================================== */

const FALLBACK_API_URL: string = import.meta.env.PROD
  ? '/api'
  : 'http://localhost:3001';

const RAW_API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || FALLBACK_API_URL;

const API_URL: string = RAW_API_BASE_URL.replace(/\/+$/, '');

if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info('[maintenanceService] API :', {
    baseUrl: API_URL,
    fallbackUsed: !import.meta.env.VITE_API_BASE_URL,
  });
}

/* ============================================================================
 * TYPES
 * ========================================================================== */

/**
 * ⭐ Statuts possibles d'un créneau de maintenance.
 *
 * Convention identique au backend (Title Case).
 */
export type MaintenanceStatus =
  | 'Planned'
  | 'In Progress'
  | 'Pending Review' // ⭐ nouveau — fenêtre de décision 12 h
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

/* ============================================================================
 * SERVICE
 * ========================================================================== */

class MaintenanceService {
  private readonly api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    /* ---------------------------------------------------------------------
     * INTERCEPTEUR REQUÊTE — injecte le token JWT
     *
     * ✅ Utilise getAuthSession() qui cherche dans localStorage ET
     *    sessionStorage (selon "Se souvenir de moi").
     * ------------------------------------------------------------------- */

    this.api.interceptors.request.use((config) => {
      const session = getAuthSession();
      if (session?.token) {
        config.headers.Authorization = `Bearer ${session.token}`;
      }
      return config;
    });

    /* ---------------------------------------------------------------------
     * INTERCEPTEUR RÉPONSE — gère 401
     * ------------------------------------------------------------------- */

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          console.warn('[maintenanceService] Session expirée (401)');
          clearAuthSession();
        }
        return Promise.reject(error);
      },
    );
  }

  /* =======================================================================
   * MAPPING
   * ===================================================================== */

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

  /* =======================================================================
   * LECTURE
   * ===================================================================== */

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

  /* =======================================================================
   * ÉCRITURE
   * ===================================================================== */

  async create(dto: CreateMaintenanceSlotDto): Promise<MaintenanceSlot> {
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

  /* =======================================================================
   * ⭐ ACTIONS PENDING_REVIEW
   * ===================================================================== */

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
    const body: ExtendMaintenanceSlotDto = { additionalDays };

    const response = await this.api.patch<RawMaintenanceSlotResponse>(
      `/maintenance/${id}/extend`,
      body,
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

  /* =======================================================================
   * SYNCHRONISATION (fallback si pas de cron backend)
   * ===================================================================== */

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