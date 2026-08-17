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
   */
  @Patch('sync-expired')
  syncExpiredMaintenances() {
    return this.maintenanceService.syncExpiredMaintenances();
  }

  /**
   * Vérifie la disponibilité d'un appareil avant de créer
   * un créneau de maintenance.
   *
   * IMPORTANT : cette route doit rester AVANT @Get(':id'),
   * sinon "check-availability" est interprété comme un UUID
   * et ParseUUIDPipe renvoie 400 Bad Request.
   */
  @Get('check-availability')
  checkAvailability(
    @Query('aircraftId')
    aircraftId: string,

    @Query('startTime')
    startTime: string,

    @Query('endTime')
    endTime: string,
  ) {
    return this.maintenanceService.checkAvailability(
      aircraftId,
      startTime,
      endTime,
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.maintenanceService.findOne(id);
  }

  @Post()
  create(
    @Body()
    dto: CreateMaintenanceSlotDto,
  ) {
    return this.maintenanceService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe)
    id: string,

    @Body()
    dto: UpdateMaintenanceSlotDto,
  ) {
    return this.maintenanceService.update(
      id,
      dto,
    );
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.maintenanceService.remove(id);
  }
}