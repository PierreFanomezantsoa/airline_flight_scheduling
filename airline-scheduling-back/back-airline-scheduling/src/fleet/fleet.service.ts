import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  findAll(): Promise<Aircraft[]> {
    return this.aircraftRepository.find({
      relations: ['type'],
      order: { immatriculation: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Aircraft> {
    const aircraft = await this.aircraftRepository.findOne({
      where: { id },
      relations: ['type'],
    });
    if (!aircraft) throw new NotFoundException(`Avion "${id}" introuvable.`);
    return aircraft;
  }

  async findByRegistration(immatriculation: string): Promise<Aircraft> {
    const registration = normalizeRegistration(immatriculation);
    const aircraft = await this.aircraftRepository.findOne({
      where: { immatriculation: registration },
      relations: ['type'],
    });
    if (!aircraft) throw new NotFoundException(`Avion "${registration}" introuvable.`);
    return aircraft;
  }

  findByStatus(statut: AircraftStatus): Promise<Aircraft[]> {
    return this.aircraftRepository.find({
      where: { statut },
      relations: ['type'],
      order: { immatriculation: 'ASC' },
    });
  }

  findByHomeBase(baseAttache: string): Promise<Aircraft[]> {
    return this.aircraftRepository.find({
      where: { baseAttache: normalizeIata(baseAttache) },
      relations: ['type'],
      order: { immatriculation: 'ASC' },
    });
  }

  async create(dto: CreateAircraftDto): Promise<Aircraft> {
    const registration = normalizeRegistration(dto.immatriculation);
    await this.assertRegistrationAvailable(registration);

    const type = dto.typeId ? await this.getType(dto.typeId) : null;
    this.assertCapacity(dto.capacite, type);

    const aircraft = this.aircraftRepository.create({
      immatriculation: registration,
      modele: type?.nomModele ?? dto.modele.trim(),
      capacite: dto.capacite,
      heuresDeVolTotales: dto.heuresDeVolTotales ?? 0,
      limiteHeuresMaintenance: dto.limiteHeuresMaintenance,
      heuresDepuisDerniereMaintenance: 0,
      statut: dto.statut ?? AircraftStatus.ACTIVE,
      baseAttache: dto.baseAttache ? normalizeIata(dto.baseAttache) : null,
      typeId: type?.id ?? null,
      type,
    });

    return this.aircraftRepository.save(aircraft);
  }

  async update(id: string, dto: UpdateAircraftDto): Promise<Aircraft> {
    const aircraft = await this.findOne(id);

    if (dto.immatriculation) {
      const registration = normalizeRegistration(dto.immatriculation);
      if (registration !== aircraft.immatriculation) {
        await this.assertRegistrationAvailable(registration, id);
        aircraft.immatriculation = registration;
      }
    }

    let type = aircraft.type;
    if (dto.typeId === null) {
      type = null;
    } else if (dto.typeId) {
      type = await this.getType(dto.typeId);
    }

    const capacity = dto.capacite ?? aircraft.capacite;
    this.assertCapacity(capacity, type);

    if (dto.modele !== undefined) aircraft.modele = dto.modele.trim();
    if (dto.capacite !== undefined) aircraft.capacite = dto.capacite;
    if (dto.limiteHeuresMaintenance !== undefined) aircraft.limiteHeuresMaintenance = dto.limiteHeuresMaintenance;
    if (dto.heuresDeVolTotales !== undefined) aircraft.heuresDeVolTotales = dto.heuresDeVolTotales;
    if (dto.statut !== undefined) aircraft.statut = dto.statut;
    if (dto.baseAttache !== undefined) aircraft.baseAttache = dto.baseAttache ? normalizeIata(dto.baseAttache) : null;

    if (dto.typeId !== undefined) {
      aircraft.typeId = type?.id ?? null;
      aircraft.type = type ?? null;
      if (type) aircraft.modele = type.nomModele;
    }

    return this.aircraftRepository.save(aircraft);
  }

  async retire(id: string): Promise<{ retired: true; id: string }> {
    const aircraft = await this.findOne(id);
    aircraft.statut = AircraftStatus.RETIRED;
    await this.aircraftRepository.save(aircraft);
    return { retired: true, id };
  }

  async addFlightHours(id: string, heuresVolees: number): Promise<Aircraft> {
    if (!Number.isFinite(heuresVolees) || heuresVolees <= 0) {
      throw new BadRequestException('heuresVolees doit être strictement positif.');
    }

    const aircraft = await this.findOne(id);
    aircraft.heuresDeVolTotales += heuresVolees;
    aircraft.heuresDepuisDerniereMaintenance += heuresVolees;

    if (aircraft.heuresDepuisDerniereMaintenance >= aircraft.limiteHeuresMaintenance) {
      aircraft.statut = AircraftStatus.MAINTENANCE;
    }

    return this.aircraftRepository.save(aircraft);
  }

  async resetMaintenanceCounter(id: string): Promise<Aircraft> {
    const aircraft = await this.findOne(id);
    aircraft.dateDerniereMaintenance = new Date();
    aircraft.heuresDepuisDerniereMaintenance = 0;
    aircraft.statut = AircraftStatus.ACTIVE;
    return this.aircraftRepository.save(aircraft);
  }

  async statistics() {
    const aircrafts = await this.findAll();
    const totalHours = aircrafts.reduce((sum, a) => sum + a.heuresDeVolTotales, 0);

    return {
      totalAvions: aircrafts.length,
      avionsActifs: aircrafts.filter((a) => a.statut === AircraftStatus.ACTIVE).length,
      avionsEnMaintenance: aircrafts.filter((a) => a.statut === AircraftStatus.MAINTENANCE).length,
      avionsHorsService: aircrafts.filter((a) => a.statut === AircraftStatus.OUT_OF_SERVICE).length,
      avionsRetires: aircrafts.filter((a) => a.statut === AircraftStatus.RETIRED).length,
      heuresDeVolTotales: totalHours,
      moyenneHeuresDeVol: aircrafts.length ? totalHours / aircrafts.length : 0,
      capaciteMoyenne: aircrafts.length
        ? aircrafts.reduce((sum, a) => sum + a.capacite, 0) / aircrafts.length
        : 0,
    };
  }

  findAllTypes(): Promise<AircraftType[]> {
    return this.aircraftTypeRepository.find({ order: { nomModele: 'ASC' } });
  }

  findType(id: string): Promise<AircraftType> {
    return this.getType(id);
  }

  async createType(dto: CreateAircraftTypeDto): Promise<AircraftType> {
    const name = dto.nomModele.trim();
    if (await this.aircraftTypeRepository.exists({ where: { nomModele: name } })) {
      throw new ConflictException(`Le modèle "${name}" existe déjà.`);
    }

    return this.aircraftTypeRepository.save(
      this.aircraftTypeRepository.create({
        ...dto,
        nomModele: name,
        fabricant: dto.fabricant.trim(),
      }),
    );
  }

  async updateType(id: string, dto: UpdateAircraftTypeDto): Promise<AircraftType> {
    const type = await this.getType(id);

    if (dto.nomModele && dto.nomModele.trim() !== type.nomModele) {
      if (await this.aircraftTypeRepository.exists({ where: { nomModele: dto.nomModele.trim() } })) {
        throw new ConflictException(`Le modèle "${dto.nomModele}" existe déjà.`);
      }
    }

    Object.assign(type, dto);
    if (dto.nomModele) type.nomModele = dto.nomModele.trim();
    if (dto.fabricant) type.fabricant = dto.fabricant.trim();
    return this.aircraftTypeRepository.save(type);
  }

  async deleteType(id: string): Promise<{ deleted: true; id: string }> {
    const type = await this.aircraftTypeRepository.findOne({
      where: { id },
      relations: ['avions'],
    });
    if (!type) throw new NotFoundException(`Type d'avion "${id}" introuvable.`);
    if (type.avions.length) {
      throw new ConflictException(`Impossible de supprimer: ${type.avions.length} avion(s) utilisent ce type.`);
    }
    await this.aircraftTypeRepository.remove(type);
    return { deleted: true, id };
  }

  private async getType(id: string): Promise<AircraftType> {
    const type = await this.aircraftTypeRepository.findOne({ where: { id } });
    if (!type) throw new NotFoundException(`Type d'avion "${id}" introuvable.`);
    return type;
  }

  private assertCapacity(capacity: number, type: AircraftType | null): void {
    if (type && capacity > type.capaciteMax) {
      throw new BadRequestException(
        `Capacité ${capacity} supérieure à la capacité maximale ${type.capaciteMax} du ${type.nomModele}.`,
      );
    }
  }

  private async assertRegistrationAvailable(registration: string, excludeId?: string): Promise<void> {
    const qb = this.aircraftRepository
      .createQueryBuilder('aircraft')
      .where('aircraft.immatriculation = :registration', { registration });
    if (excludeId) qb.andWhere('aircraft.id != :excludeId', { excludeId });
    if (await qb.getExists()) {
      throw new ConflictException(`L'immatriculation "${registration}" existe déjà.`);
    }
  }
}
