import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Airport } from './entities/airport.entity';
import { AirportsController } from './airports.controller';
import { AirportsSeederService } from './airports-seeder.service';
import { AirportsService } from './airports.service';

@Module({
  imports: [TypeOrmModule.forFeature([Airport])],
  controllers: [AirportsController],
  providers: [AirportsService, AirportsSeederService],
  exports: [AirportsService, TypeOrmModule],
})
export class AirportsModule {}
