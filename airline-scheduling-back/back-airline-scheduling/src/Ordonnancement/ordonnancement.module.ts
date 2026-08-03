import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LigneProduction } from './entities/ligne-production.entity';
import { TacheProduction } from './entities/tache-production.entity';
import { CreneauOrdonnance } from './entities/creneau-ordonnance.entity';
import { OrdonnancementController } from './controller/ordonnancement.controller';
import { OrdonnancementService } from './ordonnancement.service';
import {CreneauOrdonnanceService} from './creneau-ordonnance.service';
import {CreneauOrdonnanceController} from './controller/creneau-ordonnance.controller';
import {LigneProductionService} from './ligne-production.service';
import {LigneProductionController} from './controller/ligne-production.controller';
import {TacheProductionController} from './controller/tache-production.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([LigneProduction, TacheProduction, CreneauOrdonnance]),
  ],
  controllers: [OrdonnancementController, 
                CreneauOrdonnanceController,
                LigneProductionController,
                TacheProductionController],
  providers: [OrdonnancementService,
              CreneauOrdonnanceService, 
              LigneProductionService],
})
export class OrdonnancementModule {}