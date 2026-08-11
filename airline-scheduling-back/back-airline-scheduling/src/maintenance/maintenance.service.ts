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

  findAll(): Promise<MaintenanceSlot[]> {
    return this.maintenanceRepository.find({
      relations: ['aircraft'],
      order: { startTime: 'ASC' },
    });
  }

  async findOne(id: string): Promise<MaintenanceSlot> {
    const slot = await this.maintenanceRepository.findOne({
      where: { id },
      relations: ['aircraft'],
    });
    if (!slot) throw new NotFoundException(`Créneau de maintenance "${id}" introuvable.`);
    return slot;
  }

  async create(dto: CreateMaintenanceSlotDto): Promise<MaintenanceSlot> {
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

  async update(id: string, dto: UpdateMaintenanceSlotDto): Promise<MaintenanceSlot> {
    const slot = await this.findOne(id);
    const previousAircraftId = slot.aircraftId;
    const aircraftId = dto.aircraftId ?? slot.aircraftId;
    const aircraft = await this.getAircraft(aircraftId);
    const start = dto.startTime ? new Date(dto.startTime) : slot.startTime;
    const end = dto.endTime ? new Date(dto.endTime) : slot.endTime;
    const status = dto.status ?? slot.status;

    this.assertWindow(start, end);
    await this.assertNoMaintenanceOverlap(aircraftId, start, end, id);

    if (status !== MaintenanceStatus.CANCELLED) {
      await this.assertNoFlightOverlap(aircraftId, start, end);
    }

    slot.aircraftId = aircraftId;
    slot.aircraft = aircraft;
    slot.startTime = start;
    slot.endTime = end;
    slot.status = status;
    if (dto.maintenanceType !== undefined) slot.maintenanceType = dto.maintenanceType;
    if (dto.description !== undefined) slot.description = dto.description?.trim() || null;

    await this.maintenanceRepository.save(slot);
    await this.syncAircraftStatus(aircraftId);
    if (previousAircraftId !== aircraftId) await this.syncAircraftStatus(previousAircraftId);

    return this.findOne(id);
  }

  async remove(id: string): Promise<{ cancelled: true; id: string }> {
    const slot = await this.findOne(id);
    slot.status = MaintenanceStatus.CANCELLED;
    await this.maintenanceRepository.save(slot);
    await this.syncAircraftStatus(slot.aircraftId);
    return { cancelled: true, id };
  }

  async syncAircraftStatus(aircraftId: string): Promise<void> {
    const aircraft = await this.getAircraft(aircraftId);
    if ([AircraftStatus.OUT_OF_SERVICE, AircraftStatus.RETIRED].includes(aircraft.statut)) return;

    const now = new Date();
    const currentMaintenance = await this.maintenanceRepository
      .createQueryBuilder('slot')
      .where('slot.aircraftId = :aircraftId', { aircraftId })
      .andWhere('slot.status NOT IN (:...ignored)', {
        ignored: [MaintenanceStatus.CANCELLED, MaintenanceStatus.COMPLETED],
      })
      .andWhere('slot.startTime <= :now', { now })
      .andWhere('slot.endTime > :now', { now })
      .getOne();

    aircraft.statut = currentMaintenance ? AircraftStatus.MAINTENANCE : AircraftStatus.ACTIVE;
    await this.aircraftRepository.save(aircraft);
  }

  private async getAircraft(id: string): Promise<Aircraft> {
    const aircraft = await this.aircraftRepository.findOne({ where: { id } });
    if (!aircraft) throw new NotFoundException(`Avion "${id}" introuvable.`);
    return aircraft;
  }

  private assertWindow(start: Date, end: Date): void {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException('La date de fin doit être postérieure à la date de début.');
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
      .andWhere('slot.status != :cancelled', { cancelled: MaintenanceStatus.CANCELLED })
      .andWhere('slot.startTime < :end', { end })
      .andWhere('slot.endTime > :start', { start });
    if (excludeId) qb.andWhere('slot.id != :excludeId', { excludeId });

    const conflict = await qb.getOne();
    if (conflict) {
      throw new ConflictException({
        code: 'MAINTENANCE_OVERLAP',
        message: 'Un autre créneau de maintenance chevauche cette période.',
        conflictingMaintenanceId: conflict.id,
      });
    }
  }

  private async assertNoFlightOverlap(aircraftId: string, start: Date, end: Date): Promise<void> {
    const flight = await this.flightRepository
      .createQueryBuilder('flight')
      .where('flight.avionId = :aircraftId', { aircraftId })
      .andWhere('flight.statut != :cancelled', { cancelled: FlightStatus.CANCELLED })
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
