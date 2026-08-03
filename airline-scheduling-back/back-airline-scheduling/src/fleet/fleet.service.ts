import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Aircraft } from './entities/aircraft.entity';
import { AircraftType } from './entities/aircraft-type.entity';
import { CreateAircraftDto } from './dto/create-aircraft.dto';
import { UpdateAircraftDto } from './dto/update-aircraft.dto';
import { CreateAircraftTypeDto } from './dto/create-aircraft-type.dto';
import { UpdateAircraftTypeDto } from './dto/update-aircraft-type.dto';

@Injectable()
export class FleetService {
  constructor(
    @InjectRepository(Aircraft)
    private readonly aircraftRepository: Repository<Aircraft>,
    @InjectRepository(AircraftType)
    private readonly aircraftTypeRepository: Repository<AircraftType>,
  ) {}

  // ==================== OPERATIONS AVIONS ====================

  async trouverTous() {
    return this.aircraftRepository.find({
      relations: ['type'],
      order: { creeA: 'DESC' },
    });
  }

  async trouverUn(id: string) {
    return this.aircraftRepository.findOne({
      where: { id },
      relations: ['type'],
    });
  }

  async trouverParImmatriculation(immatriculation: string) {
    const avion = await this.aircraftRepository.findOne({
      where: { immatriculation },
      relations: ['type'],
    });
    if (!avion) {
      throw new NotFoundException(`Avion avec l'immatriculation ${immatriculation} non trouve`);
    }
    return avion;
  }

  async trouverParStatut(statut: 'Active' | 'Maintenance' | 'Out of Service' | 'Retired') {
    return this.aircraftRepository.find({
      where: { statut },
      relations: ['type'],
      order: { creeA: 'DESC' },
    });
  }

  async trouverParBaseAttache(baseAttache: string) {
    return this.aircraftRepository.find({
      where: { baseAttache },
      relations: ['type'],
      order: { creeA: 'DESC' },
    });
  }

  async creer(createAircraftDto: CreateAircraftDto) {
    const { typeId, ...donneesAvion } = createAircraftDto;

    const existant = await this.aircraftRepository.findOne({
      where: { immatriculation: createAircraftDto.immatriculation },
    });
    if (existant) {
      throw new BadRequestException(`L'avion avec l'immatriculation ${createAircraftDto.immatriculation} existe deja`);
    }

    const avion = this.aircraftRepository.create(donneesAvion);

    if (typeId) {
      const type = await this.aircraftTypeRepository.findOne({ where: { id: typeId } });
      if (!type) {
        throw new NotFoundException(`Type d'avion avec l'id ${typeId} non trouve`);
      }
      avion.type = type;
    }

    return this.aircraftRepository.save(avion);
  }

  async modifier(id: string, updateAircraftDto: UpdateAircraftDto) {
    const avion = await this.trouverUn(id);
    if (!avion) {
      throw new NotFoundException(`Avion avec l'id ${id} non trouve`);
    }

    const { typeId, ...donneesModification } = updateAircraftDto;

    if (donneesModification.immatriculation && donneesModification.immatriculation !== avion.immatriculation) {
      const existant = await this.aircraftRepository.findOne({
        where: { immatriculation: donneesModification.immatriculation },
      });
      if (existant) {
        throw new BadRequestException(`L'avion avec l'immatriculation ${donneesModification.immatriculation} existe deja`);
      }
    }

    Object.assign(avion, donneesModification);

    if (typeId) {
      const type = await this.aircraftTypeRepository.findOne({ where: { id: typeId } });
      if (!type) {
        throw new NotFoundException(`Type d'avion avec l'id ${typeId} non trouve`);
      }
      avion.type = type;
    }

    return this.aircraftRepository.save(avion);
  }

  async supprimer(id: string) {
    const avion = await this.trouverUn(id);
    if (!avion) {
      throw new NotFoundException(`Avion avec l'id ${id} non trouve`);
    }
    await this.aircraftRepository.remove(avion);
    return { supprime: true, id };
  }

  async obtenirStatistiquesFlotte() {
    const avions = await this.trouverTous();
    const statistiques = {
      totalAvions: avions.length,
      avionsActifs: avions.filter((a) => a.statut === 'Active').length,
      avionsEnMaintenance: avions.filter((a) => a.statut === 'Maintenance').length,
      avionsHorsService: avions.filter((a) => a.statut === 'Out of Service').length,
      avionsRetires: avions.filter((a) => a.statut === 'Retired').length,
      heuresDeVolTotales: avions.reduce((somme, a) => somme + a.heuresDeVolTotales, 0),
      moyenneHeuresDeVol: avions.length > 0 ? avions.reduce((somme, a) => somme + a.heuresDeVolTotales, 0) / avions.length : 0,
      capaciteMoyenne: avions.length > 0 ? avions.reduce((somme, a) => somme + a.capacite, 0) / avions.length : 0,
    };
    return statistiques;
  }

  async mettreAJourStatutMaintenance(id: string, heuresVolees: number) {
    const avion = await this.trouverUn(id);
    if (!avion) {
      throw new NotFoundException(`Avion avec l'id ${id} non trouve`);
    }

    avion.heuresDeVolTotales += heuresVolees;
    avion.heuresDepuisDerniereMaintenance += heuresVolees;

    if (avion.heuresDepuisDerniereMaintenance >= avion.limiteHeuresMaintenance) {
      avion.statut = 'Maintenance';
    }

    return this.aircraftRepository.save(avion);
  }

  async reinitialiserCompteurMaintenance(id: string) {
    const avion = await this.trouverUn(id);
    if (!avion) {
      throw new NotFoundException(`Avion avec l'id ${id} non trouve`);
    }

    avion.dateDerniereMaintenance = new Date();
    avion.heuresDepuisDerniereMaintenance = 0;
    avion.statut = 'Active';

    return this.aircraftRepository.save(avion);
  }

  // ==================== OPERATIONS TYPES D'AVION ====================

  async trouverTousLesTypes() {
    return this.aircraftTypeRepository.find({
      relations: ['avions'],
      order: { creeA: 'DESC' },
    });
  }

  async trouverUnType(id: string) {
    const type = await this.aircraftTypeRepository.findOne({
      where: { id },
      relations: ['avions'],
    });
    if (!type) {
      throw new NotFoundException(`Type d'avion avec l'id ${id} non trouve`);
    }
    return type;
  }

  async creerType(createAircraftTypeDto: CreateAircraftTypeDto) {
    const existant = await this.aircraftTypeRepository.findOne({
      where: { nomModele: createAircraftTypeDto.nomModele },
    });
    if (existant) {
      throw new BadRequestException(`Le type d'avion avec le modele ${createAircraftTypeDto.nomModele} existe deja`);
    }

    const type = this.aircraftTypeRepository.create(createAircraftTypeDto);
    return this.aircraftTypeRepository.save(type);
  }

  async modifierType(id: string, updateAircraftTypeDto: UpdateAircraftTypeDto) {
    const type = await this.trouverUnType(id);

    if (updateAircraftTypeDto.nomModele && updateAircraftTypeDto.nomModele !== type.nomModele) {
      const existant = await this.aircraftTypeRepository.findOne({
        where: { nomModele: updateAircraftTypeDto.nomModele },
      });
      if (existant) {
        throw new BadRequestException(`Le type d'avion avec le modele ${updateAircraftTypeDto.nomModele} existe deja`);
      }
    }

    Object.assign(type, updateAircraftTypeDto);
    return this.aircraftTypeRepository.save(type);
  }

  async supprimerType(id: string) {
    const type = await this.trouverUnType(id);

    const avions = await this.aircraftRepository.find({ where: { type: { id } } });
    if (avions.length > 0) {
      throw new BadRequestException(`Impossible de supprimer un type d'avion avec ${avions.length} avion(s) associe(s)`);
    }

    await this.aircraftTypeRepository.remove(type);
    return { supprime: true, id };
  }
}