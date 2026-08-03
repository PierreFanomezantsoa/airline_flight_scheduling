import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { OrdonnancementService } from '../ordonnancement.service';
import { CreerLigneDto, AssignerTacheDto, DeplacerCreneauDto } from '../dto/ordonnancement.dto';

@Controller('api/ordonnancement')
export class OrdonnancementController {
  constructor(private readonly ordonnancementService: OrdonnancementService) {}

  // --- GESTION DES LIGNES ---
  
  @Get('lignes')
  obtenirToutesLesLignes() {
    return this.ordonnancementService.obtenirLignes();
  }

  @Post('lignes')
  creerLigne(@Body() dto: CreerLigneDto) {
    return this.ordonnancementService.creerLigne(dto);
  }

  // --- CARNET DE COMMANDES / BACKLOG ---

  @Get('taches/en-attente')
  obtenirTachesEnAttente() {
    return this.ordonnancementService.obtenirTachesEnAttente();
  }

  // --- CALENDRIER D'ORDONNANCEMENT ---

  @Get('calendrier')
  obtenirCalendrier(
    @Query('debut') debut: string,
    @Query('fin') fin: string,
  ) {
    return this.ordonnancementService.obtenirCalendrier(new Date(debut), new Date(fin));
  }

  @Post('assigner')
  assignerTacheALigne(@Body() dto: AssignerTacheDto) {
    return this.ordonnancementService.assignerTache(dto);
  }

  @Put('deplacer/:id')
  deplacerCreneau(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeplacerCreneauDto,
  ) {
    return this.ordonnancementService.deplacerCreneau(id, dto);
  }

  @Delete('desordonnancer/:id')
  retirerPlanification(@Param('id', ParseIntPipe) id: number) {
    return this.ordonnancementService.retirerPlanification(id);
  }
}