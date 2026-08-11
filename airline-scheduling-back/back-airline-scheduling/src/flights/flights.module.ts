import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AirportsModule } from '../airports/airports.module';
import { FleetModule } from '../fleet/fleet.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { Flight } from './entities/flight.entity';
import { FlightsController } from './flights.controller';
import { FlightsService } from './flights.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Flight]),
    AirportsModule,
    FleetModule,
    SchedulingModule,
  ],
  controllers: [FlightsController],
  providers: [FlightsService],
  exports: [FlightsService, TypeOrmModule],
})
export class FlightsModule {}
