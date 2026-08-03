import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LigneProduction } from '../Ordonnancement/entities/ligne-production.entity';

@Injectable()
export class LigneProductionService {
  constructor(
    @InjectRepository(LigneProduction)
    private readonly ligneRepository: Repository<LigneProduction>,
  ) {}

  // Récupérer toutes les lignes de production
  async findAll(): Promise<LigneProduction[]> {
    return await this.ligneRepository.find({
      order: { nom: 'ASC' },
    });
  }

  // Activer ou désactiver une ligne (Toggle)
  async toggleActive(id: number): Promise<LigneProduction> {
    const ligne = await this.ligneRepository.findOneBy({ id });
    if (!ligne) {
      throw new NotFoundException(`La ligne de production avec l'ID ${id} n'existe pas.`);
    }

    ligne.estActif = !ligne.estActif;
    return await this.ligneRepository.save(ligne);
  }
}