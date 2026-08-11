import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CreateMaintenanceSlotDto } from './dto/create-maintenance-slot.dto';
import { UpdateMaintenanceSlotDto } from './dto/update-maintenance-slot.dto';
import { MaintenanceService } from './maintenance.service';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  findAll() { return this.maintenanceService.findAll(); }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.maintenanceService.findOne(id); }

  @Post()
  create(@Body() dto: CreateMaintenanceSlotDto) { return this.maintenanceService.create(dto); }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMaintenanceSlotDto) {
    return this.maintenanceService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.maintenanceService.remove(id); }
}
