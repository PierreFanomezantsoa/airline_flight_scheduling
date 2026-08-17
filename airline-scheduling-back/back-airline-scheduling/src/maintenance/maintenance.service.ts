import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
   * Important :
   * avant de renvoyer le planning, on finalise les maintenances expirées.
   * Ainsi l'IHM voit immédiatement :
   * - slot => COMPLETED
   * - heures depuis maintenance => 0
   * - date dernière maintenance => date de fin atelier
   * - avion => Active
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

    await this.assertNoMaintenanceOverlap(
      aircraft.id,
      start,
      end,
    );

    await this.assertNoFlightOverlap(
      aircraft.id,
      start,
      end,
    );

    const saved = await this.maintenanceRepository.save(
      this.maintenanceRepository.create({
        aircraftId: aircraft.id,
        aircraft,
        maintenanceType: dto.maintenanceType,
        status:
          dto.status ??
          MaintenanceStatus.PLANNED,
        startTime: start,
        endTime: end,
        description:
          dto.description?.trim() ??
          null,
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

    const previousAircraftId =
      slot.aircraftId;

    const aircraftId =
      dto.aircraftId ??
      slot.aircraftId;

    const aircraft =
      await this.getAircraft(aircraftId);

    const start =
      dto.startTime
        ? new Date(dto.startTime)
        : slot.startTime;

    const end =
      dto.endTime
        ? new Date(dto.endTime)
        : slot.endTime;

    const status =
      dto.status ??
      slot.status;

    this.assertWindow(start, end);

    if (
      status !== MaintenanceStatus.CANCELLED &&
      status !== MaintenanceStatus.COMPLETED
    ) {
      await this.assertNoMaintenanceOverlap(
        aircraftId,
        start,
        end,
        id,
      );

      await this.assertNoFlightOverlap(
        aircraftId,
        start,
        end,
      );
    }

    slot.aircraftId = aircraftId;
    slot.aircraft = aircraft;
    slot.startTime = start;
    slot.endTime = end;
    slot.status = status;

    if (dto.maintenanceType !== undefined) {
      slot.maintenanceType =
        dto.maintenanceType;
    }

    if (dto.description !== undefined) {
      slot.description =
        dto.description?.trim() ||
        null;
    }

    await this.maintenanceRepository.save(slot);

    /**
     * Si l'utilisateur passe manuellement le slot à COMPLETED,
     * on applique immédiatement la remise à zéro technique.
     */
    if (
      status === MaintenanceStatus.COMPLETED
    ) {
      await this.completeAircraftMaintenance(
        aircraftId,
        end,
      );
    } else {
      await this.syncAircraftStatus(aircraftId);
    }

    if (
      previousAircraftId !== aircraftId
    ) {
      await this.syncAircraftStatus(
        previousAircraftId,
      );
    }

    return this.findOne(id);
  }

  async remove(
    id: string,
  ): Promise<{
    cancelled: true;
    id: string;
  }> {
    const slot =
      await this.findOne(id);

    slot.status =
      MaintenanceStatus.CANCELLED;

    await this.maintenanceRepository.save(slot);
    await this.syncAircraftStatus(slot.aircraftId);

    return {
      cancelled: true,
      id,
    };
  }

  /**
   * Pré-vérification utilisée par MaintenancePlanning.
   *
   * GET /maintenance/check-availability
   *
   * Retourne les conflits au lieu de lancer immédiatement une exception 409.
   */
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

    const maintenanceConflict =
      await this.maintenanceRepository
        .createQueryBuilder('slot')
        .where(
          'slot.aircraftId = :aircraftId',
          { aircraftId },
        )
        .andWhere(
          'slot.status NOT IN (:...ignored)',
          {
            ignored: [
              MaintenanceStatus.CANCELLED,
              MaintenanceStatus.COMPLETED,
            ],
          },
        )
        .andWhere(
          'slot.startTime < :end',
          { end },
        )
        .andWhere(
          'slot.endTime > :start',
          { start },
        )
        .orderBy(
          'slot.startTime',
          'ASC',
        )
        .getOne();

    const flightConflict =
      await this.flightRepository
        .createQueryBuilder('flight')
        .where(
          'flight.avionId = :aircraftId',
          { aircraftId },
        )
        .andWhere(
          'flight.statut != :cancelled',
          {
            cancelled:
              FlightStatus.CANCELLED,
          },
        )
        .andWhere(
          'flight.heureDepart < :end',
          { end },
        )
        .andWhere(
          'flight.heureArrivee > :start',
          { start },
        )
        .orderBy(
          'flight.heureDepart',
          'ASC',
        )
        .getOne();

    return {
      available:
        !maintenanceConflict &&
        !flightConflict,

      maintenanceConflict:
        maintenanceConflict
          ? {
              id:
                maintenanceConflict.id,
              maintenanceType:
                maintenanceConflict.maintenanceType,
              status:
                maintenanceConflict.status,
              startTime:
                maintenanceConflict.startTime,
              endTime:
                maintenanceConflict.endTime,
            }
          : null,

      flightConflict:
        flightConflict
          ? {
              id:
                String(flightConflict.id),
              numeroVol:
                flightConflict.numeroVol,
              heureDepart:
                flightConflict.heureDepart,
              heureArrivee:
                flightConflict.heureArrivee,
            }
          : null,
    };
  }

  /**
   * FIN D'ATELIER AUTOMATIQUE
   *
   * Cherche les slots non terminés/non annulés dont endTime <= maintenant.
   * Pour chaque appareil :
   * 1. passe le ou les slots expirés en COMPLETED ;
   * 2. remet heuresDepuisDerniereMaintenance à 0 ;
   * 3. dateDerniereMaintenance = dernière date de fin atelier ;
   * 4. remet l'avion à ACTIVE s'il n'a pas une autre maintenance en cours.
   *
   * Cette méthode est idempotente :
   * un slot déjà COMPLETED n'est plus retraité.
   */
  async syncExpiredMaintenances(): Promise<{
    completedSlots: number;
    resetAircrafts: number;
    aircraftIds: string[];
  }> {
    const now = new Date();

    const expiredSlots =
      await this.maintenanceRepository
        .createQueryBuilder('slot')
        .where(
          'slot.status NOT IN (:...ignored)',
          {
            ignored: [
              MaintenanceStatus.CANCELLED,
              MaintenanceStatus.COMPLETED,
            ],
          },
        )
        .andWhere(
          'slot.endTime <= :now',
          { now },
        )
        .orderBy(
          'slot.endTime',
          'ASC',
        )
        .getMany();

    if (expiredSlots.length === 0) {
      return {
        completedSlots: 0,
        resetAircrafts: 0,
        aircraftIds: [],
      };
    }

    const latestEndByAircraft =
      new Map<string, Date>();

    for (const slot of expiredSlots) {
      slot.status =
        MaintenanceStatus.COMPLETED;

      const current =
        latestEndByAircraft.get(
          slot.aircraftId,
        );

      if (
        !current ||
        slot.endTime > current
      ) {
        latestEndByAircraft.set(
          slot.aircraftId,
          slot.endTime,
        );
      }
    }

    await this.maintenanceRepository.save(
      expiredSlots,
    );

    let resetAircrafts = 0;
    const resetIds: string[] = [];

    for (
      const [
        aircraftId,
        maintenanceEnd,
      ]
      of latestEndByAircraft
    ) {
      const reset =
        await this.completeAircraftMaintenance(
          aircraftId,
          maintenanceEnd,
        );

      if (reset) {
        resetAircrafts += 1;
        resetIds.push(aircraftId);
      }
    }

    return {
      completedSlots:
        expiredSlots.length,
      resetAircrafts,
      aircraftIds:
        resetIds,
    };
  }

  /**
   * Applique la même logique que :
   * PATCH /fleet/aircrafts/:id/maintenance/reset
   *
   * mais directement dans le backend Maintenance pour éviter
   * un couplage HTTP entre modules du même NestJS.
   */
  private async completeAircraftMaintenance(
    aircraftId: string,
    maintenanceEnd: Date,
  ): Promise<boolean> {
    const aircraft =
      await this.getAircraft(
        aircraftId,
      );

    if (
      aircraft.statut === AircraftStatus.RETIRED ||
      aircraft.statut === AircraftStatus.OUT_OF_SERVICE
    ) {
      return false;
    }

    /**
     * Si une AUTRE maintenance est encore réellement en cours,
     * l'appareil ne doit pas redevenir actif.
     */
    const now = new Date();

    const anotherCurrentMaintenance =
      await this.maintenanceRepository
        .createQueryBuilder('slot')
        .where(
          'slot.aircraftId = :aircraftId',
          { aircraftId },
        )
        .andWhere(
          'slot.status NOT IN (:...ignored)',
          {
            ignored: [
              MaintenanceStatus.CANCELLED,
              MaintenanceStatus.COMPLETED,
            ],
          },
        )
        .andWhere(
          'slot.startTime <= :now',
          { now },
        )
        .andWhere(
          'slot.endTime > :now',
          { now },
        )
        .getOne();

    /**
     * La visite de maintenance est terminée :
     * le compteur technique repart toujours à zéro.
     */
    aircraft.heuresDepuisDerniereMaintenance = 0;
    aircraft.dateDerniereMaintenance =
      maintenanceEnd;

    aircraft.statut =
      anotherCurrentMaintenance
        ? AircraftStatus.MAINTENANCE
        : AircraftStatus.ACTIVE;

    await this.aircraftRepository.save(
      aircraft,
    );

    return true;
  }

  async syncAircraftStatus(
    aircraftId: string,
  ): Promise<void> {
    const aircraft =
      await this.getAircraft(
        aircraftId,
      );

    if (
      [
        AircraftStatus.OUT_OF_SERVICE,
        AircraftStatus.RETIRED,
      ].includes(
        aircraft.statut,
      )
    ) {
      return;
    }

    const now = new Date();

    const currentMaintenance =
      await this.maintenanceRepository
        .createQueryBuilder('slot')
        .where(
          'slot.aircraftId = :aircraftId',
          { aircraftId },
        )
        .andWhere(
          'slot.status NOT IN (:...ignored)',
          {
            ignored: [
              MaintenanceStatus.CANCELLED,
              MaintenanceStatus.COMPLETED,
            ],
          },
        )
        .andWhere(
          'slot.startTime <= :now',
          { now },
        )
        .andWhere(
          'slot.endTime > :now',
          { now },
        )
        .getOne();

    aircraft.statut =
      currentMaintenance
        ? AircraftStatus.MAINTENANCE
        : aircraft.statut;

    /**
     * On ne force pas ACTIVE ici si le compteur a atteint le seuil.
     * Le reset à ACTIVE appartient à completeAircraftMaintenance().
     */
    await this.aircraftRepository.save(
      aircraft,
    );
  }

  private async getAircraft(
    id: string,
  ): Promise<Aircraft> {
    const aircraft =
      await this.aircraftRepository.findOne({
        where: { id },
      });

    if (!aircraft) {
      throw new NotFoundException(
        `Avion "${id}" introuvable.`,
      );
    }

    return aircraft;
  }

  private assertWindow(
    start: Date,
    end: Date,
  ): void {
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
    const qb =
      this.maintenanceRepository
        .createQueryBuilder('slot')
        .where(
          'slot.aircraftId = :aircraftId',
          { aircraftId },
        )
        .andWhere(
          'slot.status NOT IN (:...ignored)',
          {
            ignored: [
              MaintenanceStatus.CANCELLED,
              MaintenanceStatus.COMPLETED,
            ],
          },
        )
        .andWhere(
          'slot.startTime < :end',
          { end },
        )
        .andWhere(
          'slot.endTime > :start',
          { start },
        );

    if (excludeId) {
      qb.andWhere(
        'slot.id != :excludeId',
        { excludeId },
      );
    }

    const conflict =
      await qb.getOne();

    if (conflict) {
      throw new ConflictException({
        code:
          'MAINTENANCE_OVERLAP',
        message:
          'Un autre créneau de maintenance chevauche cette période.',
        conflictingMaintenanceId:
          conflict.id,
      });
    }
  }

  private async assertNoFlightOverlap(
    aircraftId: string,
    start: Date,
    end: Date,
  ): Promise<void> {
    const flight =
      await this.flightRepository
        .createQueryBuilder('flight')
        .where(
          'flight.avionId = :aircraftId',
          { aircraftId },
        )
        .andWhere(
          'flight.statut != :cancelled',
          {
            cancelled:
              FlightStatus.CANCELLED,
          },
        )
        .andWhere(
          'flight.heureDepart < :end',
          { end },
        )
        .andWhere(
          'flight.heureArrivee > :start',
          { start },
        )
        .getOne();

    if (flight) {
      throw new ConflictException({
        code:
          'MAINTENANCE_FLIGHT_CONFLICT',
        message:
          `La maintenance chevauche le vol ${flight.numeroVol}.`,
        conflictingFlightId:
          flight.id,
      });
    }
  }
}