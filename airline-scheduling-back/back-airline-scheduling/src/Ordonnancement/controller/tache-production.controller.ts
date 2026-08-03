import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';

@Controller('api') // Si vous utilisez le préfixe global 'api'
export class TacheProductionController {
  
  // GET http://localhost:3001/api/taches-production
  @Get('taches-production')
  findAllTaches() {
    // Appelez ici le service qui récupère vos tâches en base de données
    // return this.tacheService.findAll();
    return [
      { id: 1, referenceCommande: 'CMD-001', nomProduit: 'Produit A', quantiteAProduire: 100, dureeEstimeeHeures: 4, statut: 'EN_COURS', dateCreation: new Date() }
    ]; // Exemple de mock si votre service n'est pas prêt
  }

  // GET http://localhost:3001/api/aleas-production
  @Get('aleas-production')
  findAllAleas() {
    return [];
  }

  // POST http://localhost:3001/api/aleas-production
  @Post('aleas-production')
  createAlea(@Body() dto: any) {
    return { message: 'Aléa créé', data: dto };
  }

  // PATCH http://localhost:3001/api/aleas-production/:id/resoudre
  @Patch('aleas-production/:id/resoudre')
  resoudreAlea(@Param('id') id: string) {
    return { message: `Aléa ${id} résolu` };
  }
}