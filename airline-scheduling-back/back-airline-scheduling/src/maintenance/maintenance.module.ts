import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Aircraft } from '../fleet/entities/aircraft.entity';
import { Flight } from '../flights/entities/flight.entity';
import { MaintenanceSlot } from './entities/maintenance-slot.entity';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [TypeOrmModule.forFeature([MaintenanceSlot, Aircraft, Flight])],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService, TypeOrmModule],
})
export class MaintenanceModule {}
