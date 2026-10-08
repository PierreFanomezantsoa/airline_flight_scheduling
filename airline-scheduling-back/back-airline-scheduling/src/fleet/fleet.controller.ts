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
  UseGuards,
} from '@nestjs/common';
import { AircraftStatus } from '../common/enums/airline.enums';
import { CreateAircraftTypeDto } from './dto/create-aircraft-type.dto';
import { CreateAircraftDto } from './dto/create-aircraft.dto';
import { UpdateAircraftTypeDto } from './dto/update-aircraft-type.dto';
import { UpdateAircraftDto } from './dto/update-aircraft.dto';
import { FleetService } from './fleet.service';
import { AuthenticatedRoles } from '../auth/decorators/authenticated-roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

@Controller('fleet')
@UseGuards(SessionAuthGuard)
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get('aircrafts')
  findAll() { return this.fleetService.findAll(); }

  @Get('aircrafts/statistics')
  statistics() { return this.fleetService.statistics(); }

  @Get('aircrafts/status/:status')
  findByStatus(@Param('status') status: string) {
    if (!Object.values(AircraftStatus).includes(status as AircraftStatus)) {
      throw new BadRequestException(`Statut d'aircraft invalide: ${status}`);
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
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.MAINTENANCE_ENGINEER)
  create(@Body() dto: CreateAircraftDto) { return this.fleetService.create(dto); }

  @Patch('aircrafts/:id')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.MAINTENANCE_ENGINEER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAircraftDto) {
    return this.fleetService.update(id, dto);
  }

  @Delete('aircrafts/:id')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.MAINTENANCE_ENGINEER)
  retire(@Param('id', ParseUUIDPipe) id: string) { return this.fleetService.retire(id); }

  @Patch('aircrafts/:id/maintenance/reset')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.MAINTENANCE_ENGINEER)
  resetMaintenance(@Param('id', ParseUUIDPipe) id: string) {
    return this.fleetService.resetMaintenanceCounter(id);
  }

  @Patch('aircrafts/:id/flight-hours')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.MAINTENANCE_ENGINEER)
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
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.MAINTENANCE_ENGINEER)
  createType(@Body() dto: CreateAircraftTypeDto) { return this.fleetService.createType(dto); }

  @Patch('types/:id')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.MAINTENANCE_ENGINEER)
  updateType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAircraftTypeDto) {
    return this.fleetService.updateType(id, dto);
  }

  @Delete('types/:id')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.MAINTENANCE_ENGINEER)
  deleteType(@Param('id', ParseUUIDPipe) id: string) { return this.fleetService.deleteType(id); }
}
