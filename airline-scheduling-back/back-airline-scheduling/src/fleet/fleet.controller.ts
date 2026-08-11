import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AircraftStatus } from '../common/enums/airline.enums';
import { CreateAircraftTypeDto } from './dto/create-aircraft-type.dto';
import { CreateAircraftDto } from './dto/create-aircraft.dto';
import { UpdateAircraftTypeDto } from './dto/update-aircraft-type.dto';
import { UpdateAircraftDto } from './dto/update-aircraft.dto';
import { FleetService } from './fleet.service';

@Controller('fleet')
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get('aircrafts')
  findAll() { return this.fleetService.findAll(); }

  @Get('aircrafts/statistics')
  statistics() { return this.fleetService.statistics(); }

  @Get('aircrafts/status/:status')
  findByStatus(@Param('status') status: string) {
    if (!Object.values(AircraftStatus).includes(status as AircraftStatus)) {
      throw new BadRequestException(`Statut d'avion invalide: ${status}`);
    }
    return this.fleetService.findByStatus(status as AircraftStatus);
  }

  @Get('aircrafts/home-base/:base')
  findByHomeBase(@Param('base') base: string) { return this.fleetService.findByHomeBase(base); }

  @Get('aircrafts/registration/:registration')
  findByRegistration(@Param('registration') registration: string) {
    return this.fleetService.findByRegistration(registration);
  }

  @Get('aircrafts/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.fleetService.findOne(id); }

  @Post('aircrafts')
  create(@Body() dto: CreateAircraftDto) { return this.fleetService.create(dto); }

  @Patch('aircrafts/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAircraftDto) {
    return this.fleetService.update(id, dto);
  }

  @Delete('aircrafts/:id')
  retire(@Param('id', ParseUUIDPipe) id: string) { return this.fleetService.retire(id); }

  @Patch('aircrafts/:id/maintenance/reset')
  resetMaintenance(@Param('id', ParseUUIDPipe) id: string) {
    return this.fleetService.resetMaintenanceCounter(id);
  }

  @Patch('aircrafts/:id/flight-hours')
  addFlightHours(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('heuresVolees') heuresVolees: number,
  ) {
    return this.fleetService.addFlightHours(id, heuresVolees);
  }

  @Get('types')
  findAllTypes() { return this.fleetService.findAllTypes(); }

  @Get('types/:id')
  findType(@Param('id', ParseUUIDPipe) id: string) { return this.fleetService.findType(id); }

  @Post('types')
  createType(@Body() dto: CreateAircraftTypeDto) { return this.fleetService.createType(dto); }

  @Patch('types/:id')
  updateType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAircraftTypeDto) {
    return this.fleetService.updateType(id, dto);
  }

  @Delete('types/:id')
  deleteType(@Param('id', ParseUUIDPipe) id: string) { return this.fleetService.deleteType(id); }
}
