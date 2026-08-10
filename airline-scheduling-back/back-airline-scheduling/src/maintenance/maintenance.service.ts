import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceSlot } from './entities/maintenance-slot.entity';
import { Aircraft } from '../fleet/entities/aircraft.entity';
import { CreateMaintenanceSlotDto } from './dto/create-maintenance-slot.dto';
import { UpdateMaintenanceSlotDto } from './dto/update-maintenance-slot.dto';

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenanceSlot)
    private readonly maintenanceRepository: Repository<MaintenanceSlot>,
    @InjectRepository(Aircraft)
    private readonly aircraftRepository: Repository<Aircraft>,
  ) {}

  async findAll(): Promise<MaintenanceSlot[]> {
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

    if (!slot) {
      throw new NotFoundException(`Le créneau de maintenance avec l'ID ${id} n'existe pas.`);
    }
    return slot;
  }

  /**
   * Planifie une maintenance et bascule le statut de l'avion en 'Maintenance'
   */
  async create(createMaintenanceSlotDto: CreateMaintenanceSlotDto): Promise<MaintenanceSlot> {
    const { aircraftId, startTime, endTime, ...rest } = createMaintenanceSlotDto;

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start >= end) {
      throw new BadRequestException("La date de fin doit être strictement supérieure à la date de début.");
    }

    // 1. Vérification des chevauchements
    await this.checkForOverlap(aircraftId, start, end);

    // 2. Création du slot
    const slot = this.maintenanceRepository.create({
      ...rest,
      startTime: start,
      endTime: end,
      aircraftId,
    });

    const savedSlot = await this.maintenanceRepository.save(slot);

    // 3. MISE À JOUR DU STATUT EN BDD : Passer l'avion en 'Maintenance'
    await this.aircraftRepository.update(aircraftId, {
      statut: 'Maintenance',
    });

    return this.findOne(savedSlot.id);
  }

  async update(id: string, updateMaintenanceSlotDto: UpdateMaintenanceSlotDto): Promise<MaintenanceSlot> {
    const slot = await this.findOne(id);
    const { aircraftId, startTime, endTime, ...rest } = updateMaintenanceSlotDto;

    const start = startTime ? new Date(startTime) : slot.startTime;
    const end = endTime ? new Date(endTime) : slot.endTime;

    if (start >= end) {
      throw new BadRequestException("La date de fin doit être supérieure à la date de début.");
    }

    if (aircraftId || startTime || endTime) {
      const targetAircraftId = aircraftId || slot.aircraftId;
      await this.checkForOverlap(targetAircraftId, start, end, id);
    }

    Object.assign(slot, rest);
    slot.startTime = start;
    slot.endTime = end;

    if (aircraftId) {
      slot.aircraftId = aircraftId;
    }

    await this.maintenanceRepository.save(slot);

    // Assure que l'appareil passe bien en Maintenance
    await this.aircraftRepository.update(slot.aircraftId, { statut: 'Maintenance' });

    return this.findOne(id);
  }

  /**
   * Annule la maintenance et remet l'avion en 'Active' s'il n'a plus d'autres immobilisations
   */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const slot = await this.findOne(id);
    const aircraftId = slot.aircraftId;

    await this.maintenanceRepository.remove(slot);

    // Vérifier si l'appareil a d'autres créneaux de maintenance en cours ou à venir
    const remainingSlots = await this.maintenanceRepository.count({
      where: { aircraftId },
    });

    // S'il n'y a plus aucun créneau planifié/en cours, basculer vers statut 'Active'
    if (remainingSlots === 0) {
      await this.aircraftRepository.update(aircraftId, { statut: 'Active' });
    }

    return { deleted: true };
  }

  private async checkForOverlap(
    aircraftId: string, 
    startTime: Date, 
    endTime: Date, 
    excludeSlotId?: string
  ): Promise<void> {
    const query = this.maintenanceRepository.createQueryBuilder('slot')
      .where('slot.aircraft = :aircraftId', { aircraftId })
      .andWhere('slot.startTime < :endTime', { endTime })
      .andWhere('slot.endTime > :startTime', { startTime });

    if (excludeSlotId) {
      query.andWhere('slot.id != :excludeSlotId', { excludeSlotId });
    }

    const conflictingSlot = await query.getOne();

    if (conflictingSlot) {
      throw new ConflictException(
        `Cet appareil est déjà immobilisé ou planifié pour une autre maintenance sur cette période.`
      );
    }
  }
}