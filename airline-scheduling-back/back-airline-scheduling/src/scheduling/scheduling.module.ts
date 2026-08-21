import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrewAssignment } from '../crew/entities/crew-assignment.entity';
import { Aircraft } from '../fleet/entities/aircraft.entity';
import { Flight } from '../flights/entities/flight.entity';
import { MaintenanceSlot } from '../maintenance/entities/maintenance-slot.entity';
import { NetworkConfigurationModule } from '../network-configuration/network-configuration.module';
import { SchedulingController } from './scheduling.controller';
import { AircraftAvailabilityService } from './services/aircraft-availability.service';
import { ScheduleConflictService } from './services/schedule-conflict.service';
import { ScheduleOptimizationService } from './services/schedule-optimization.service';
import { SchedulingService } from './services/scheduling.service';

@Module({
  imports: [
    NetworkConfigurationModule,
    TypeOrmModule.forFeature([
      Flight,
      Aircraft,
      MaintenanceSlot,
      CrewAssignment,
    ]),
  ],
  controllers: [SchedulingController],
  providers: [
    ScheduleConflictService,
    AircraftAvailabilityService,
    ScheduleOptimizationService,
    SchedulingService,
  ],
  exports: [
    ScheduleConflictService,
    AircraftAvailabilityService,
    ScheduleOptimizationService,
    SchedulingService,
  ],
})
export class SchedulingModule {}
