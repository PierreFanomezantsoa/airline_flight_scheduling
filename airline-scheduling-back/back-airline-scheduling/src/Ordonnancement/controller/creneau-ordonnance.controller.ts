import { Controller, Get } from '@nestjs/common';
import { CreneauOrdonnanceService } from '../creneau-ordonnance.service';

// Le chemin doit être 'creneaux-ordonnancement'
@Controller('creneaux-ordonnancement')
export class CreneauOrdonnanceController {
  constructor(private readonly service: CreneauOrdonnanceService) {}

  @Get()
  findAll() {
    // Attention à bien charger les relations ("ligne" et "tache") dans votre service !
    return this.service.findAllWithRelations(); 
  }
}