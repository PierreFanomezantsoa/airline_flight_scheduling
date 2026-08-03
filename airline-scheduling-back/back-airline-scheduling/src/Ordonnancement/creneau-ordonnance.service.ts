import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreneauOrdonnance } from '../Ordonnancement/entities/creneau-ordonnance.entity';

@Injectable()
export class CreneauOrdonnanceService {
  constructor(
    @InjectRepository(CreneauOrdonnance)
    private readonly creneauRepository: Repository<CreneauOrdonnance>,
  ) {}

  // Récupérer tous les créneaux avec les relations liées
  async findAllWithRelations(): Promise<CreneauOrdonnance[]> {
    return await this.creneauRepository.find({
      relations: ['ligne', 'tache'],
      order: {
        ligne: { id: 'ASC' },
        ordreSequence: 'ASC',
      },
    });
  }
}