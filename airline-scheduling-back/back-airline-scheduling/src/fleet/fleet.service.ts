import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AircraftStatus } from '../common/enums/airline.enums';
import { normalizeIata, normalizeRegistration } from '../common/utils/normalizers';
import { CreateAircraftTypeDto } from './dto/create-aircraft-type.dto';
import { CreateAircraftDto } from './dto/create-aircraft.dto';
import { UpdateAircraftTypeDto } from './dto/update-aircraft-type.dto';
import { UpdateAircraftDto } from './dto/update-aircraft.dto';
import { AircraftType } from './entities/aircraft-type.entity';
import { Aircraft } from './entities/aircraft.entity';

@Injectable()
export class FleetService {
  constructor(
    @InjectRepository(Aircraft)
    private readonly aircraftRepository: Repository<Aircraft>,
    @InjectRepository(AircraftType)
    private readonly aircraftTypeRepository: Repository<AircraftType>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(): Promise<Aircraft[]> {
    return this.aircraftRepository.find({
      relations: ['aircraftType'],
      order: { registration: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Aircraft> {
    const aircraft = await this.aircraftRepository.findOne({
      where: { refAircraft: id },
      relations: ['aircraftType'],
    });
    if (!aircraft) throw new NotFoundException(`Avion "${id}" introuvable.`);
    return aircraft;
  }

  async findByRegistration(value: string): Promise<Aircraft> {
    const registration = normalizeRegistration(value);
    const aircraft = await this.aircraftRepository.findOne({
      where: { registration: registration },
      relations: ['aircraftType'],
    });
    if (!aircraft) throw new NotFoundException(`Avion "${registration}" introuvable.`);
    return aircraft;
  }

  findByAircraftStatus(aircraftStatus: AircraftStatus): Promise<Aircraft[]> {
    return this.aircraftRepository.find({
      where: { aircraftStatus },
      relations: ['aircraftType'],
      order: { registration: 'ASC' },
    });
  }

  findByHomeBase(homeBase: string): Promise<Aircraft[]> {
    return this.aircraftRepository.find({
      where: { homeBase: normalizeIata(homeBase) },
      relations: ['aircraftType'],
      order: { registration: 'ASC' },
    });
  }

  async create(dto: CreateAircraftDto): Promise<Aircraft> {
    const registration = normalizeRegistration(dto.registration);
    await this.assertRegistrationAvailable(registration);

    const type = dto.refAircraftType ? await this.getType(dto.refAircraftType) : null;
    this.assertCapacity(dto.capacity, type);

    const aircraft = this.aircraftRepository.create({
      registration: registration,
      model: type?.modelName ?? dto.model.trim(),
      capacity: dto.capacity,
      totalFlightHrs: dto.totalFlightHrs ?? 0,
      maintLimitHrs: dto.maintLimitHrs,
      hrsSinceMaint: 0,
      aircraftStatus: dto.aircraftStatus ?? AircraftStatus.ACTIVE,
      homeBase: dto.homeBase ? normalizeIata(dto.homeBase) : null,
      refAircraftType: type?.refAircraftType ?? null,
      aircraftType: type,
    });

    return this.aircraftRepository.save(aircraft);
  }

  async update(id: string, dto: UpdateAircraftDto): Promise<Aircraft> {
    const aircraft = await this.findOne(id);

    if (dto.registration) {
      const registration = normalizeRegistration(dto.registration);
      if (registration !== aircraft.registration) {
        await this.assertRegistrationAvailable(registration, id);
        aircraft.registration = registration;
      }
    }

    let type = aircraft.aircraftType;
    if (dto.refAircraftType === null) {
      type = null;
    } else if (dto.refAircraftType) {
      type = await this.getType(dto.refAircraftType);
    }

    const capacity = dto.capacity ?? aircraft.capacity;
    this.assertCapacity(capacity, type);

    if (dto.model !== undefined) aircraft.model = dto.model.trim();
    if (dto.capacity !== undefined) aircraft.capacity = dto.capacity;
    if (dto.maintLimitHrs !== undefined) aircraft.maintLimitHrs = dto.maintLimitHrs;
    if (dto.totalFlightHrs !== undefined) aircraft.totalFlightHrs = dto.totalFlightHrs;
    if (dto.aircraftStatus !== undefined) {
      aircraft.aircraftStatus = dto.aircraftStatus;
    }
    if (dto.homeBase !== undefined) aircraft.homeBase = dto.homeBase ? normalizeIata(dto.homeBase) : null;

    if (dto.refAircraftType !== undefined) {
      aircraft.refAircraftType = type?.refAircraftType ?? null;
      aircraft.aircraftType = type ?? null;
      if (type) aircraft.model = type.modelName;
    }

    return this.aircraftRepository.save(aircraft);
  }

  async retire(id: string): Promise<{ retired: true; refAircraft: string }> {
    const aircraft = await this.findOne(id);
    aircraft.aircraftStatus = AircraftStatus.RETIRED;
    await this.aircraftRepository.save(aircraft);
    return { retired: true, refAircraft: id };
  }

  /**
   * Ajoute des heures réellement effectuées à un appareil.
   *
   * Le verrou pessimiste évite de perdre des heures lorsque deux vols
   * terminés tentent de mettre à jour le même aircraft au même moment.
   *
   * Le paramètre manager permet à FlightsService d'effectuer la mise à jour
   * de l'aircraft et le marquage du flight dans UNE SEULE transaction.
   */
  async addFlightHours(
    id: string,
    heuresVolees: number,
    manager?: EntityManager,
  ): Promise<Aircraft> {
    this.assertPositiveFlightHours(heuresVolees);

    if (manager) {
      return this.addFlightHoursWithManager(manager, id, heuresVolees);
    }

    return this.dataSource.transaction((transactionManager) =>
      this.addFlightHoursWithManager(transactionManager, id, heuresVolees),
    );
  }

  private async addFlightHoursWithManager(
    manager: EntityManager,
    id: string,
    heuresVolees: number,
  ): Promise<Aircraft> {
    // ⚠️ CORRECTION : le verrou pessimiste NE DOIT PAS être combiné à une
    // jointure externe (LEFT JOIN). PostgreSQL refuse `FOR UPDATE` sur le
    // côté nullable d'un LEFT JOIN (erreur 0A000).
    //
    // On verrouille donc uniquement la table `aircrafts` via QueryBuilder,
    // puis on charge la relation `type` séparément (elle n'a pas besoin
    // d'être verrouillée car on ne la modifie pas).
    const aircraft = await manager
      .createQueryBuilder(Aircraft, 'aircraft')
      .setLock('pessimistic_write')
      .where('aircraft.refAircraft = :id', { id })
      .getOne();

    if (!aircraft) {
      throw new NotFoundException(`Avion "${id}" introuvable.`);
    }

    // Chargement de la relation hors verrou (lecture seule)
    aircraft.aircraftType = aircraft.refAircraftType
      ? await manager.findOne(AircraftType, { where: { refAircraftType: aircraft.refAircraftType } })
      : null;

    // Mise à jour des compteurs
    aircraft.totalFlightHrs =
      Number(aircraft.totalFlightHrs || 0) + heuresVolees;

    aircraft.hrsSinceMaint =
      Number(aircraft.hrsSinceMaint || 0) + heuresVolees;

    if (
      aircraft.hrsSinceMaint >=
      aircraft.maintLimitHrs
    ) {
      aircraft.aircraftStatus = AircraftStatus.MAINTENANCE;
    }

    return manager.save(Aircraft, aircraft);
  }

  private assertPositiveFlightHours(heuresVolees: number): void {
    if (!Number.isFinite(heuresVolees) || heuresVolees <= 0) {
      throw new BadRequestException(
        'heuresVolees doit être strictement positif.',
      );
    }
  }

  async resetMaintenanceCounter(id: string): Promise<Aircraft> {
    const aircraft = await this.findOne(id);
    aircraft.lastMaintAt = new Date();
    aircraft.hrsSinceMaint = 0;
    aircraft.aircraftStatus = AircraftStatus.ACTIVE;
    return this.aircraftRepository.save(aircraft);
  }

  async statistics() {
    const aircrafts = await this.findAll();
    const totalHours = aircrafts.reduce((sum, a) => sum + a.totalFlightHrs, 0);

    return {
      totalAvions: aircrafts.length,
      avionsActifs: aircrafts.filter((a) => a.aircraftStatus === AircraftStatus.ACTIVE).length,
      avionsEnMaintenance: aircrafts.filter((a) => a.aircraftStatus === AircraftStatus.MAINTENANCE).length,
      avionsHorsService: aircrafts.filter((a) => a.aircraftStatus === AircraftStatus.OUT_OF_SERVICE).length,
      avionsRetires: aircrafts.filter((a) => a.aircraftStatus === AircraftStatus.RETIRED).length,
      totalFlightHrs: totalHours,
      moyenneHeuresDeVol: aircrafts.length ? totalHours / aircrafts.length : 0,
      capaciteMoyenne: aircrafts.length
        ? aircrafts.reduce((sum, a) => sum + a.capacity, 0) / aircrafts.length
        : 0,
    };
  }

  findAllTypes(): Promise<AircraftType[]> {
    return this.aircraftTypeRepository.find({ order: { modelName: 'ASC' } });
  }

  findType(id: string): Promise<AircraftType> {
    return this.getType(id);
  }

  async createType(dto: CreateAircraftTypeDto): Promise<AircraftType> {
    const name = dto.modelName.trim();
    if (await this.aircraftTypeRepository.exists({ where: { modelName: name } })) {
      throw new ConflictException(`Le modèle "${name}" existe déjà.`);
    }

    return this.aircraftTypeRepository.save(
      this.aircraftTypeRepository.create({
        ...dto,
        modelName: name,
        manufacturer: dto.manufacturer.trim(),
      }),
    );
  }

  async updateType(id: string, dto: UpdateAircraftTypeDto): Promise<AircraftType> {
    const type = await this.getType(id);

    if (dto.modelName && dto.modelName.trim() !== type.modelName) {
      if (await this.aircraftTypeRepository.exists({ where: { modelName: dto.modelName.trim() } })) {
        throw new ConflictException(`Le modèle "${dto.modelName}" existe déjà.`);
      }
    }

    Object.assign(type, dto);
    if (dto.modelName) type.modelName = dto.modelName.trim();
    if (dto.manufacturer) type.manufacturer = dto.manufacturer.trim();
    return this.aircraftTypeRepository.save(type);
  }

  async deleteType(id: string): Promise<{ deleted: true; id: string }> {
    const type = await this.aircraftTypeRepository.findOne({
      where: { refAircraftType: id },
      relations: ['aircraft'],
    });
    if (!type) throw new NotFoundException(`Type d'aircraft "${id}" introuvable.`);
    if (type.aircraft.length) {
      throw new ConflictException(`Impossible de supprimer: ${type.aircraft.length} aircraft(s) utilisent ce type.`);
    }
    await this.aircraftTypeRepository.remove(type);
    return { deleted: true, id };
  }

  private async getType(id: string): Promise<AircraftType> {
    const type = await this.aircraftTypeRepository.findOne({ where: { refAircraftType: id } });
    if (!type) throw new NotFoundException(`Type d'aircraft "${id}" introuvable.`);
    return type;
  }

  private assertCapacity(capacity: number, type: AircraftType | null): void {
    if (type && capacity > type.maxCapacity) {
      throw new BadRequestException(
        `Capacité ${capacity} supérieure à la capacité maximale ${type.maxCapacity} du ${type.modelName}.`,
      );
    }
  }

  private async assertRegistrationAvailable(registration: string, excludeId?: string): Promise<void> {
    const qb = this.aircraftRepository
      .createQueryBuilder('aircraft')
      .where('aircraft.registration = :registration', { registration });
    if (excludeId) qb.andWhere('aircraft.refAircraft != :excludeId', { excludeId });
    if (await qb.getExists()) {
      throw new ConflictException(`L'registration "${registration}" existe déjà.`);
    }
  }
}