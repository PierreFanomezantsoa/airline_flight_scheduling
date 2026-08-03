import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceSlot } from './entities/maintenance-slot.entity';
import { CreateMaintenanceSlotDto } from './dto/create-maintenance-slot.dto';
import { UpdateMaintenanceSlotDto } from './dto/update-maintenance-slot.dto';

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenanceSlot)
    private readonly maintenanceRepository: Repository<MaintenanceSlot>,
  ) {}

  /**
   * Récupère tous les créneaux avec les informations de l'appareil associé (Jointure forcée)
   */
  async findAll(): Promise<MaintenanceSlot[]> {
    return this.maintenanceRepository.find({
      relations: ['aircraft'],
      order: { startTime: 'ASC' },
    });
  }

  /**
   * Récupère un créneau spécifique par son ID avec son appareil associé
   */
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
   * Planifie un nouveau blocage technique avec vérification stricte des conflits d'horaires
   */
  async create(createMaintenanceSlotDto: CreateMaintenanceSlotDto): Promise<MaintenanceSlot> {
    const { aircraftId, startTime, endTime, ...rest } = createMaintenanceSlotDto;

    // 1. Validation de la cohérence chronologique des dates
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start >= end) {
      throw new BadRequestException("La date de fin doit être strictement supérieure à la date de début.");
    }

    // 2. Vérification des chevauchements de plannings (Conflict Guard)
    await this.checkForOverlap(aircraftId, start, end);

    // 3. Création et liaison native via la colonne physique 'aircraftId'
    const slot = this.maintenanceRepository.create({
      ...rest,
      startTime: start,
      endTime: end,
      aircraftId, // S'appuie sur la colonne exposée explicitement dans l'entité
    });

    const savedSlot = await this.maintenanceRepository.save(slot);
    
    // 4. Retourne l'entité entièrement rechargée avec sa relation pour le Front-end
    return this.findOne(savedSlot.id);
  }

  /**
   * Met à jour un créneau existant avec réévaluation des conflits d'horaires
   */
  async update(id: string, updateMaintenanceSlotDto: UpdateMaintenanceSlotDto): Promise<MaintenanceSlot> {
    const slot = await this.findOne(id); // Lève une exception NotFoundException si le slot n'existe pas

    const { aircraftId, startTime, endTime, ...rest } = updateMaintenanceSlotDto;

    const start = startTime ? new Date(startTime) : slot.startTime;
    const end = endTime ? new Date(endTime) : slot.endTime;

    if (start >= end) {
      throw new BadRequestException("La date de fin doit être supérieure à la date de début.");
    }

    // Réévaluer les conflits uniquement si l'appareil ou les dates changent
    if (aircraftId || startTime || endTime) {
      const targetAircraftId = aircraftId || slot.aircraftId;
      await this.checkForOverlap(targetAircraftId, start, end, id);
    }

    // Application dynamique des modifications textuelles (description, type, etc.)
    Object.assign(slot, rest);
    slot.startTime = start;
    slot.endTime = end;

    if (aircraftId) {
      slot.aircraftId = aircraftId;
    }

    await this.maintenanceRepository.save(slot);
    return this.findOne(id);
  }

  /**
   * Supprime un créneau de maintenance du hangar
   */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const slot = await this.findOne(id);
    await this.maintenanceRepository.remove(slot);
    return { deleted: true };
  }

  /**
   * Algorithme de détection des chevauchements de créneaux (Overlapping)
   * Formule mathématique : (StartA < EndB) AND (EndA > StartB)
   */
  private async checkForOverlap(
    aircraftId: string, 
    startTime: Date, 
    endTime: Date, 
    excludeSlotId?: string
  ): Promise<void> {
    const query = this.maintenanceRepository.createQueryBuilder('slot')
      // CORRECTION CRUCIALE : On filtre via l'entité relationnelle 'aircraft' gérée par le mappeur TypeORM
      .where('slot.aircraft = :aircraftId', { aircraftId })
      .andWhere('slot.startTime < :endTime', { endTime })
      .andWhere('slot.endTime > :startTime', { startTime });

    // En cas de mise à jour (update), on ignore le créneau en cours de modification
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