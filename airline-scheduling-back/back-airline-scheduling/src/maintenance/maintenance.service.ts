import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import {
  AircraftStatus,
  FlightStatus,
  MaintenanceStatus,
} from '../common/enums/airline.enums';

import { Aircraft } from '../fleet/entities/aircraft.entity';
import { Flight } from '../flights/entities/flight.entity';

import { CreateMaintenanceSlotDto } from './dto/create-maintenance-slot.dto';
import { UpdateMaintenanceSlotDto } from './dto/update-maintenance-slot.dto';
import { MaintenanceSlot } from './entities/maintenance-slot.entity';

/**
 * ⭐ Fenêtre de décision après la fin prévue d'un créneau.
 * L'avion reste en MAINTENANCE pendant cette durée.
 * Passé ce délai sans action, le créneau est clôturé et
 * l'avion redevient ACTIVE.
 */
export const PENDING_REVIEW_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 h

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenanceSlot)
    private readonly maintenanceRepository: Repository<MaintenanceSlot>,

    @InjectRepository(Aircraft)
    private readonly aircraftRepository: Repository<Aircraft>,

    @InjectRepository(Flight)
    private readonly flightRepository: Repository<Flight>,
  ) {}

  /**
   * Récupère tous les créneaux après avoir appliqué la machine à états :
   *
   *   PLANNED/IN_PROGRESS ──(endTime dépassé)──► PENDING_REVIEW
   *   PENDING_REVIEW ──(autoCloseAt dépassé)──► COMPLETED
   *
   * L'IHM voit donc toujours un état cohérent :
   *   - slot PENDING_REVIEW avec un compte à rebours à afficher ;
   *   - slot COMPLETED avec avion ACTIVE.
   */
  async findAll(): Promise<MaintenanceSlot[]> {
    await this.syncExpiredMaintenances();

    return this.maintenanceRepository.find({
      relations: ['aircraft'],
      order: { startTime: 'ASC' },
    });
  }

  async findOne(id: string): Promise<MaintenanceSlot> {
    await this.syncExpiredMaintenances();

    const slot = await this.maintenanceRepository.findOne({
      where: { id },
      relations: ['aircraft'],
    });

    if (!slot) {
      throw new NotFoundException(
        `Créneau de maintenance "${id}" introuvable.`,
      );
    }

    return slot;
  }

  async create(dto: CreateMaintenanceSlotDto): Promise<MaintenanceSlot> {
    await this.syncExpiredMaintenances();

    const aircraft = await this.getAircraft(dto.aircraftId);
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    this.assertWindow(start, end);

    await this.assertNoMaintenanceOverlap(aircraft.id, start, end);
    await this.assertNoFlightOverlap(aircraft.id, start, end);

    const saved = await this.maintenanceRepository.save(
      this.maintenanceRepository.create({
        aircraftId: aircraft.id,
        aircraft,
        maintenanceType: dto.maintenanceType,
        status: dto.status ?? MaintenanceStatus.PLANNED,
        startTime: start,
        endTime: end,
        description: dto.description?.trim() ?? null,
      }),
    );

    await this.syncAircraftStatus(aircraft.id);

    return this.findOne(saved.id);
  }

  async update(
    id: string,
    dto: UpdateMaintenanceSlotDto,
  ): Promise<MaintenanceSlot> {
    await this.syncExpiredMaintenances();

    const slot = await this.findOne(id);
    const previousAircraftId = slot.aircraftId;

    const aircraftId = dto.aircraftId ?? slot.aircraftId;
    const aircraft = await this.getAircraft(aircraftId);

    const start = dto.startTime ? new Date(dto.startTime) : slot.startTime;
    const end = dto.endTime ? new Date(dto.endTime) : slot.endTime;
    const status = dto.status ?? slot.status;

    this.assertWindow(start, end);

    if (
      status !== MaintenanceStatus.CANCELLED &&
      status !== MaintenanceStatus.COMPLETED
    ) {
      await this.assertNoMaintenanceOverlap(aircraftId, start, end, id);
      await this.assertNoFlightOverlap(aircraftId, start, end);
    }

    slot.aircraftId = aircraftId;
    slot.aircraft = aircraft;
    slot.startTime = start;
    slot.endTime = end;
    slot.status = status;

    if (dto.maintenanceType !== undefined) {
      slot.maintenanceType = dto.maintenanceType;
    }

    if (dto.description !== undefined) {
      slot.description = dto.description?.trim() || null;
    }

    await this.maintenanceRepository.save(slot);

    if (status === MaintenanceStatus.COMPLETED) {
      await this.completeAircraftMaintenance(aircraftId, end);
    } else {
      await this.syncAircraftStatus(aircraftId);
    }

    if (previousAircraftId !== aircraftId) {
      await this.syncAircraftStatus(previousAircraftId);
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<{ cancelled: true; id: string }> {
    const slot = await this.findOne(id);

    slot.status = MaintenanceStatus.CANCELLED;
    slot.pendingReviewSince = null;
    slot.autoCloseAt = null;

    await this.maintenanceRepository.save(slot);
    await this.syncAircraftStatus(slot.aircraftId);

    return { cancelled: true, id };
  }

  // ─────────────────────────────────────────────────────────────
  // ⭐ NOUVELLES MÉTHODES : prolongation & clôture manuelle
  // ─────────────────────────────────────────────────────────────

  /**
   * ⭐ PROLONGER : ajoute N jours à un créneau en cours.
   *
   * Utilisable uniquement si le créneau est :
   *   - IN_PROGRESS  (encore dans la fenêtre prévue)
   *   - PENDING_REVIEW (fin prévue dépassée, fenêtre 12 h en cours)
   *
   * Effet :
   *   - endTime += N jours
   *   - status = IN_PROGRESS
   *   - pendingReviewSince / autoCloseAt = null
   *   - extensionCount += 1
   *   - avion repasse en MAINTENANCE (au cas où)
   */
  async extendSlot(
    id: string,
    additionalDays: number,
  ): Promise<MaintenanceSlot> {
    if (!Number.isInteger(additionalDays) || additionalDays <= 0) {
      throw new BadRequestException(
        'additionalDays doit être un entier strictement positif.',
      );
    }

    await this.syncExpiredMaintenances();

    const slot = await this.findOne(id);

    if (
      slot.status !== MaintenanceStatus.IN_PROGRESS &&
      slot.status !== MaintenanceStatus.PENDING_REVIEW &&
      slot.status !== MaintenanceStatus.PLANNED
    ) {
      throw new ConflictException(
        `Impossible de prolonger un créneau au statut ${slot.status}.`,
      );
    }

    const newEnd = new Date(slot.endTime);
    newEnd.setDate(newEnd.getDate() + additionalDays);
    slot.endTime = newEnd;

    slot.status = MaintenanceStatus.IN_PROGRESS;
    slot.pendingReviewSince = null;
    slot.autoCloseAt = null;
    slot.extensionCount = (slot.extensionCount ?? 0) + 1;

    await this.maintenanceRepository.save(slot);

    // Remettre l'avion en maintenance (au cas où il aurait été libéré)
    await this.aircraftRepository.update(slot.aircraftId, {
      statut: AircraftStatus.MAINTENANCE,
    });

    return this.findOne(id);
  }

  /**
   * ⭐ CLÔTURER MANUELLEMENT : termine le créneau et remet l'avion en ACTIVE.
   *
   * Utilisable si le créneau est IN_PROGRESS ou PENDING_REVIEW.
   * Idempotent si déjà COMPLETED.
   */
  async closeSlot(id: string): Promise<MaintenanceSlot> {
    await this.syncExpiredMaintenances();

    const slot = await this.findOne(id);

    if (slot.status === MaintenanceStatus.COMPLETED) {
      return slot;
    }

    if (slot.status === MaintenanceStatus.CANCELLED) {
      throw new ConflictException(
        'Ce créneau a été annulé, il ne peut pas être clôturé.',
      );
    }

    slot.status = MaintenanceStatus.COMPLETED;
    slot.pendingReviewSince = null;
    slot.autoCloseAt = null;

    await this.maintenanceRepository.save(slot);
    await this.completeAircraftMaintenance(slot.aircraftId, slot.endTime);

    return this.findOne(id);
  }

  // ─────────────────────────────────────────────────────────────
  // Vérification de disponibilité (inchangée)
  // ─────────────────────────────────────────────────────────────

  async checkAvailability(
    aircraftId: string,
    startTime: string,
    endTime: string,
  ): Promise<{
    available: boolean;
    maintenanceConflict: {
      id: string;
      maintenanceType: string;
      status: MaintenanceStatus;
      startTime: Date;
      endTime: Date;
    } | null;
    flightConflict: {
      id: string;
      numeroVol: string;
      heureDepart: Date;
      heureArrivee: Date;
    } | null;
  }> {
    await this.syncExpiredMaintenances();
    await this.getAircraft(aircraftId);

    const start = new Date(startTime);
    const end = new Date(endTime);

    this.assertWindow(start, end);

    const maintenanceConflict = await this.maintenanceRepository
      .createQueryBuilder('slot')
      .where('slot.aircraftId = :aircraftId', { aircraftId })
      .andWhere('slot.status NOT IN (:...ignored)', {
        ignored: [
          MaintenanceStatus.CANCELLED,
          MaintenanceStatus.COMPLETED,
        ],
      })
      .andWhere('slot.startTime < :end', { end })
      .andWhere('slot.endTime > :start', { start })
      .orderBy('slot.startTime', 'ASC')
      .getOne();

    const flightConflict = await this.flightRepository
      .createQueryBuilder('flight')
      .where('flight.avionId = :aircraftId', { aircraftId })
      .andWhere('flight.statut != :cancelled', {
        cancelled: FlightStatus.CANCELLED,
      })
      .andWhere('flight.heureDepart < :end', { end })
      .andWhere('flight.heureArrivee > :start', { start })
      .orderBy('flight.heureDepart', 'ASC')
      .getOne();

    return {
      available: !maintenanceConflict && !flightConflict,

      maintenanceConflict: maintenanceConflict
        ? {
            id: maintenanceConflict.id,
            maintenanceType: maintenanceConflict.maintenanceType,
            status: maintenanceConflict.status,
            startTime: maintenanceConflict.startTime,
            endTime: maintenanceConflict.endTime,
          }
        : null,

      flightConflict: flightConflict
        ? {
            id: String(flightConflict.id),
            numeroVol: flightConflict.numeroVol,
            heureDepart: flightConflict.heureDepart,
            heureArrivee: flightConflict.heureArrivee,
          }
        : null,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // ⭐ MACHINE À ÉTATS : synchronisation des créneaux expirés
  // ─────────────────────────────────────────────────────────────

  /**
   * ⭐ Deux phases :
   *
   *   1. IN_PROGRESS (ou PLANNED) dont endTime <= now
   *        ──► PENDING_REVIEW
   *        pendingReviewSince = now
   *        autoCloseAt = now + 12 h
   *        ⚠️ L'avion RESTE en MAINTENANCE
   *
   *   2. PENDING_REVIEW dont autoCloseAt <= now
   *        ──► COMPLETED
   *        ✅ L'avion repasse ACTIVE (via completeAircraftMaintenance)
   *
   * Idempotent.
   */
  async syncExpiredMaintenances(): Promise<{
    movedToPendingReview: number;
    autoClosed: number;
    aircraftIds: string[];
  }> {
    const now = new Date();

    // ─── PHASE 1 : IN_PROGRESS / PLANNED → PENDING_REVIEW ───
    const expiredSlots = await this.maintenanceRepository.find({
      where: {
        status: MaintenanceStatus.IN_PROGRESS,
        endTime: LessThanOrEqual(now),
      },
    });

    // Inclut aussi les PLANNED dont la fin est déjà passée
    // (créneau jamais démarré explicitement).
    const plannedExpired = await this.maintenanceRepository.find({
      where: {
        status: MaintenanceStatus.PLANNED,
        endTime: LessThanOrEqual(now),
      },
    });

    const toMoveToPendingReview = [...expiredSlots, ...plannedExpired];

    for (const slot of toMoveToPendingReview) {
      slot.status = MaintenanceStatus.PENDING_REVIEW;
      slot.pendingReviewSince = now;
      slot.autoCloseAt = new Date(now.getTime() + PENDING_REVIEW_WINDOW_MS);
    }

    if (toMoveToPendingReview.length > 0) {
      await this.maintenanceRepository.save(toMoveToPendingReview);
    }

    // ─── PHASE 2 : PENDING_REVIEW → COMPLETED (auto-clôture) ───
    const toClose = await this.maintenanceRepository.find({
      where: {
        status: MaintenanceStatus.PENDING_REVIEW,
        autoCloseAt: LessThanOrEqual(now),
      },
    });

    const closedAircraftIds: string[] = [];

    for (const slot of toClose) {
      slot.status = MaintenanceStatus.COMPLETED;
      slot.pendingReviewSince = null;
      slot.autoCloseAt = null;

      await this.maintenanceRepository.save(slot);

      const reset = await this.completeAircraftMaintenance(
        slot.aircraftId,
        slot.endTime,
      );

      if (reset) {
        closedAircraftIds.push(slot.aircraftId);
      }
    }

    return {
      movedToPendingReview: toMoveToPendingReview.length,
      autoClosed: toClose.length,
      aircraftIds: closedAircraftIds,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers privés (inchangés sauf mention)
  // ─────────────────────────────────────────────────────────────

  private async completeAircraftMaintenance(
    aircraftId: string,
    maintenanceEnd: Date,
  ): Promise<boolean> {
    const aircraft = await this.getAircraft(aircraftId);

    if (
      aircraft.statut === AircraftStatus.RETIRED ||
      aircraft.statut === AircraftStatus.OUT_OF_SERVICE
    ) {
      return false;
    }

    /**
     * ⚠️ Vérification importante : une AUTRE maintenance est-elle encore
     * active sur cet avion ?
     *
     * On considère comme active toute maintenance non terminée dont la
     * fenêtre PENDING_REVIEW n'est pas expirée, OU dont la période
     * [startTime, endTime] couvre encore maintenant.
     */
    const now = new Date();

    const anotherCurrentMaintenance =
      await this.maintenanceRepository
        .createQueryBuilder('slot')
        .where('slot.aircraftId = :aircraftId', { aircraftId })
        .andWhere('slot.status NOT IN (:...ignored)', {
          ignored: [
            MaintenanceStatus.CANCELLED,
            MaintenanceStatus.COMPLETED,
          ],
        })
        .andWhere(
          '(slot.startTime <= :now AND slot.endTime > :now) OR slot.status = :pending',
          {
            now,
            pending: MaintenanceStatus.PENDING_REVIEW,
          },
        )
        .getOne();

    aircraft.heuresDepuisDerniereMaintenance = 0;
    aircraft.dateDerniereMaintenance = maintenanceEnd;

    aircraft.statut = anotherCurrentMaintenance
      ? AircraftStatus.MAINTENANCE
      : AircraftStatus.ACTIVE;

    await this.aircraftRepository.save(aircraft);

    return true;
  }

  async syncAircraftStatus(aircraftId: string): Promise<void> {
    const aircraft = await this.getAircraft(aircraftId);

    if (
      [AircraftStatus.OUT_OF_SERVICE, AircraftStatus.RETIRED].includes(
        aircraft.statut,
      )
    ) {
      return;
    }

    const now = new Date();

    /**
     * ⚠️ Un avion reste en MAINTENANCE tant qu'il a :
     *   - un créneau IN_PROGRESS couvrant maintenant, OU
     *   - un créneau PENDING_REVIEW (fenêtre 12 h en cours), OU
     *   - un créneau PLANNED futur (à venir).
     *
     * On ne le libère PAS ici : la libération passe exclusivement par
     * completeAircraftMaintenance().
     */
    const activeMaintenance = await this.maintenanceRepository
      .createQueryBuilder('slot')
      .where('slot.aircraftId = :aircraftId', { aircraftId })
      .andWhere('slot.status NOT IN (:...ignored)', {
        ignored: [
          MaintenanceStatus.CANCELLED,
          MaintenanceStatus.COMPLETED,
        ],
      })
      .andWhere(
        '(slot.startTime <= :now AND slot.endTime > :now) OR slot.status IN (:...blocking)',
        {
          now,
          blocking: [
            MaintenanceStatus.PENDING_REVIEW,
            MaintenanceStatus.IN_PROGRESS,
          ],
        },
      )
      .getOne();

    if (activeMaintenance) {
      aircraft.statut = AircraftStatus.MAINTENANCE;
      await this.aircraftRepository.save(aircraft);
    }
  }

  private async getAircraft(id: string): Promise<Aircraft> {
    const aircraft = await this.aircraftRepository.findOne({
      where: { id },
    });

    if (!aircraft) {
      throw new NotFoundException(`Avion "${id}" introuvable.`);
    }

    return aircraft;
  }

  private assertWindow(start: Date, end: Date): void {
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException(
        'La date de fin doit être postérieure à la date de début.',
      );
    }
  }

  private async assertNoMaintenanceOverlap(
    aircraftId: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.maintenanceRepository
      .createQueryBuilder('slot')
      .where('slot.aircraftId = :aircraftId', { aircraftId })
      .andWhere('slot.status NOT IN (:...ignored)', {
        ignored: [
          MaintenanceStatus.CANCELLED,
          MaintenanceStatus.COMPLETED,
        ],
      })
      .andWhere('slot.startTime < :end', { end })
      .andWhere('slot.endTime > :start', { start });

    if (excludeId) {
      qb.andWhere('slot.id != :excludeId', { excludeId });
    }

    const conflict = await qb.getOne();

    if (conflict) {
      throw new ConflictException({
        code: 'MAINTENANCE_OVERLAP',
        message:
          'Un autre créneau de maintenance chevauche cette période.',
        conflictingMaintenanceId: conflict.id,
      });
    }
  }

  private async assertNoFlightOverlap(
    aircraftId: string,
    start: Date,
    end: Date,
  ): Promise<void> {
    const flight = await this.flightRepository
      .createQueryBuilder('flight')
      .where('flight.avionId = :aircraftId', { aircraftId })
      .andWhere('flight.statut != :cancelled', {
        cancelled: FlightStatus.CANCELLED,
      })
      .andWhere('flight.heureDepart < :end', { end })
      .andWhere('flight.heureArrivee > :start', { start })
      .getOne();

    if (flight) {
      throw new ConflictException({
        code: 'MAINTENANCE_FLIGHT_CONFLICT',
        message: `La maintenance chevauche le vol ${flight.numeroVol}.`,
        conflictingFlightId: flight.id,
      });
    }
  }
}