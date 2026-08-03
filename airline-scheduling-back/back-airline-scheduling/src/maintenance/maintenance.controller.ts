import { Controller, Get, Post, Patch, Delete, Body, Param, NotFoundException } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceSlotDto } from './dto/create-maintenance-slot.dto';
import { UpdateMaintenanceSlotDto } from './dto/update-maintenance-slot.dto';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  findAll() {
    return this.maintenanceService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const slot = await this.maintenanceService.findOne(id);
    if (!slot) {
      throw new NotFoundException(`Maintenance slot with id ${id} not found`);
    }
    return slot;
  }

  @Post()
  create(@Body() createMaintenanceSlotDto: CreateMaintenanceSlotDto) {
    return this.maintenanceService.create(createMaintenanceSlotDto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMaintenanceSlotDto: UpdateMaintenanceSlotDto) {
    return this.maintenanceService.update(id, updateMaintenanceSlotDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.maintenanceService.remove(id);
  }
}
