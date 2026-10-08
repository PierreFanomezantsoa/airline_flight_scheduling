import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CreateMaintenanceSlotDto } from './dto/create-maintenance-slot.dto';
import { UpdateMaintenanceSlotDto } from './dto/update-maintenance-slot.dto';
import { ExtendMaintenanceSlotDto } from './dto/extend-maintenance-slot.dto';
import { MaintenanceService } from './maintenance.service';
import { AuthenticatedRoles } from '../auth/decorators/authenticated-roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

@Controller('maintenance')
@UseGuards(SessionAuthGuard)
export class MaintenanceController {
  constructor(
    private readonly maintenanceService: MaintenanceService,
  ) {}

  @Get()
  findAll() {
    return this.maintenanceService.findAll();
  }

  /**
   * À appeler périodiquement depuis le frontend si vous ne voulez pas
   * installer @nestjs/schedule.
   *
   * PATCH /maintenance/sync-expired
   *
   * ⚠️ Depuis l'ajout de la fenêtre PENDING_REVIEW :
   * cet endpoint effectue DEUX opérations :
   *   1. IN_PROGRESS/PLANNED → PENDING_REVIEW (fin dépassée)
   *   2. PENDING_REVIEW → COMPLETED (autoCloseAt dépassé)
   */
  @Patch('sync-expired')
  @AuthenticatedRoles(UserRole.MAINTENANCE_ENGINEER)
  syncExpiredMaintenances() {
    return this.maintenanceService.syncExpiredMaintenances();
  }

  /**
   * Vérifie la disponibilité d'un appareil avant de créer
   * un créneau de maintenance.
   *
   * ⚠️ Cette route doit rester AVANT @Get(':id'),
   * sinon "check-availability" est interprété comme un UUID
   * et ParseUUIDPipe renvoie 400 Bad Request.
   */
  @Get('check-availability')
  checkAvailability(
    @Query('refAircraft') refAircraft: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
  ) {
    return this.maintenanceService.checkAvailability(
      refAircraft,
      startTime,
      endTime,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.maintenanceService.findOne(id);
  }

  @Post()
  @AuthenticatedRoles(UserRole.MAINTENANCE_ENGINEER)
  create(@Body() dto: CreateMaintenanceSlotDto) {
    return this.maintenanceService.create(dto);
  }

  /**
   * ⭐ PROLONGER une maintenance en cours.
   *
   * PATCH /maintenance/:id/extend
   * Body : { additionalDays: number }
   *
   * Utilisable quand le créneau est IN_PROGRESS ou PENDING_REVIEW.
   */
  @Patch(':id/extend')
  @AuthenticatedRoles(UserRole.MAINTENANCE_ENGINEER)
  extend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtendMaintenanceSlotDto,
  ) {
    return this.maintenanceService.extendSlot(id, dto.additionalDays);
  }

  /**
   * ⭐ CLÔTURER une maintenance.
   *
   * PATCH /maintenance/:id/close
   *
   * Utilisable quand le créneau est IN_PROGRESS ou PENDING_REVIEW.
   * Idempotent si déjà COMPLETED.
   */
  @Patch(':id/close')
  @AuthenticatedRoles(UserRole.MAINTENANCE_ENGINEER)
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.maintenanceService.closeSlot(id);
  }

  @Patch(':id')
  @AuthenticatedRoles(UserRole.MAINTENANCE_ENGINEER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceSlotDto,
  ) {
    return this.maintenanceService.update(id, dto);
  }

  @Delete(':id')
  @AuthenticatedRoles(UserRole.MAINTENANCE_ENGINEER)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.maintenanceService.remove(id);
  }
}