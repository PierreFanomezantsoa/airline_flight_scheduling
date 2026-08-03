import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Airport } from './airport.entity';
import { AirportsService } from './airports.service';
import { AirportsSeederService } from './airports-seeder.service';
import { AirportsController } from './airports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Airport])],
  controllers: [AirportsController],
  providers: [AirportsService, AirportsSeederService],
  exports: [AirportsService], // Permet à d'autres modules (ex: FlightsModule) de l'utiliser
})
export class AirportsModule {}