import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FleetService } from './fleet.service';
import { CreateAircraftDto } from './dto/create-aircraft.dto';
import { UpdateAircraftDto } from './dto/update-aircraft.dto';
import { CreateAircraftTypeDto } from './dto/create-aircraft-type.dto';
import { UpdateAircraftTypeDto } from './dto/update-aircraft-type.dto';

@Controller('fleet')
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  // ==================== ENDPOINTS AVIONS ====================

  @Get('aircrafts')
  trouverTousLesAvions() {
    return this.fleetService.trouverTous();
  }

  @Get('aircrafts/statistics')
  obtenirStatistiquesFlotte() {
    return this.fleetService.obtenirStatistiquesFlotte();
  }

  @Get('aircrafts/status/:statut')
  trouverAvionsParStatut(@Param('statut') statut: string) {
    const statutsValides = ['Active', 'Maintenance', 'Out of Service', 'Retired'];
    if (!statutsValides.includes(statut)) {
      throw new BadRequestException(`Statut invalide. Doit etre l'un des suivants : ${statutsValides.join(', ')}`);
    }
    return this.fleetService.trouverParStatut(statut as any);
  }

  @Get('aircrafts/home-base/:baseAttache')
  trouverAvionsParBaseAttache(@Param('baseAttache') baseAttache: string) {
    return this.fleetService.trouverParBaseAttache(baseAttache);
  }

  @Get('aircrafts/registration/:immatriculation')
  async trouverAvionParImmatriculation(@Param('immatriculation') immatriculation: string) {
    return this.fleetService.trouverParImmatriculation(immatriculation);
  }

  @Get('aircrafts/:id')
  async trouverUnAvion(@Param('id') id: string) {
    const avion = await this.fleetService.trouverUn(id);
    if (!avion) {
      throw new NotFoundException(`Avion avec l'id ${id} non trouve`);
    }
    return avion;
  }

  @Post('aircrafts')
  @HttpCode(HttpStatus.CREATED)
  creerAvion(@Body() createAircraftDto: CreateAircraftDto) {
    return this.fleetService.creer(createAircraftDto);
  }

  @Patch('aircrafts/:id')
  modifierAvion(@Param('id') id: string, @Body() updateAircraftDto: UpdateAircraftDto) {
    return this.fleetService.modifier(id, updateAircraftDto);
  }

  @Delete('aircrafts/:id')
  @HttpCode(HttpStatus.OK)
  supprimerAvion(@Param('id') id: string) {
    return this.fleetService.supprimer(id);
  }

  @Patch('aircrafts/:id/maintenance/reset')
  reinitialiserMaintenance(@Param('id') id: string) {
    return this.fleetService.reinitialiserCompteurMaintenance(id);
  }

  @Patch('aircrafts/:id/maintenance/update')
  mettreAJourStatutMaintenance(@Param('id') id: string, @Body('heuresVolees') heuresVolees: number) {
    if (!heuresVolees || heuresVolees <= 0) {
      throw new BadRequestException('heuresVolees doit etre un nombre positif');
    }
    return this.fleetService.mettreAJourStatutMaintenance(id, heuresVolees);
  }

  // ==================== ENDPOINTS TYPES D'AVION ====================

  @Get('types')
  trouverTousLesTypes() {
    return this.fleetService.trouverTousLesTypes();
  }

  @Get('types/:id')
  async trouverUnType(@Param('id') id: string) {
    return this.fleetService.trouverUnType(id);
  }

  @Post('types')
  @HttpCode(HttpStatus.CREATED)
  creerType(@Body() createAircraftTypeDto: CreateAircraftTypeDto) {
    return this.fleetService.creerType(createAircraftTypeDto);
  }

  @Patch('types/:id')
  modifierType(@Param('id') id: string, @Body() updateAircraftTypeDto: UpdateAircraftTypeDto) {
    return this.fleetService.modifierType(id, updateAircraftTypeDto);
  }

  @Delete('types/:id')
  @HttpCode(HttpStatus.OK)
  supprimerType(@Param('id') id: string) {
    return this.fleetService.supprimerType(id);
  }
}