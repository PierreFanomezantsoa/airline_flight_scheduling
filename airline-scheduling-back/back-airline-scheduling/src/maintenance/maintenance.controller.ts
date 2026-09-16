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
} from '@nestjs/common';

import { CreateMaintenanceSlotDto } from './dto/create-maintenance-slot.dto';
import { UpdateMaintenanceSlotDto } from './dto/update-maintenance-slot.dto';
import { ExtendMaintenanceSlotDto } from './dto/extend-maintenance-slot.dto';
import { MaintenanceService } from './maintenance.service';

@Controller('maintenance')
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
    @Query('aircraftId') aircraftId: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
  ) {
    return this.maintenanceService.checkAvailability(
      aircraftId,
      startTime,
      endTime,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.maintenanceService.findOne(id);
  }

  @Post()
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
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.maintenanceService.closeSlot(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceSlotDto,
  ) {
    return this.maintenanceService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.maintenanceService.remove(id);
  }
}