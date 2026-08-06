import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceSlot } from './entities/maintenance-slot.entity';
import { Aircraft } from '../fleet/entities/aircraft.entity'; // <-- Ajustez le chemin vers votre entité Aircraft
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MaintenanceSlot, Aircraft]), // <-- Ajout de Aircraft ici
  ],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}