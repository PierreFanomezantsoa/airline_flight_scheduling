import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { IaController } from './ia.controller';
import { IaService } from './ia.service';
import { DecisionTreePrioritizerService } from './services/decision-tree-prioritizer.service';

@Module({
  imports: [SchedulingModule],
  controllers: [IaController],
  providers: [IaService, DecisionTreePrioritizerService],
  exports: [IaService],
})
export class IaModule {}
