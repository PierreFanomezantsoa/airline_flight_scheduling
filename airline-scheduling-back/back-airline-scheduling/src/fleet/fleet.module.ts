import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AircraftType } from './entities/aircraft-type.entity';
import { Aircraft } from './entities/aircraft.entity';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';

@Module({
  imports: [TypeOrmModule.forFeature([Aircraft, AircraftType])],
  controllers: [FleetController],
  providers: [FleetService],
  exports: [FleetService, TypeOrmModule],
})
export class FleetModule {}
