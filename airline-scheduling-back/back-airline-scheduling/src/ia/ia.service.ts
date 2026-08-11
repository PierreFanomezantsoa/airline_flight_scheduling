import { Injectable } from '@nestjs/common';
import { SchedulingService } from '../scheduling/services/scheduling.service';
import { DecisionTreePrioritizerService } from './services/decision-tree-prioritizer.service';

@Injectable()
export class IaService {
  constructor(
    private readonly schedulingService: SchedulingService,
    private readonly prioritizer: DecisionTreePrioritizerService,
  ) {}

  async analyzeConflicts() {
    const result = await this.schedulingService.detectAll();
    const conflicts = result.conflicts
      .map((conflict) => this.prioritizer.prioritize(conflict))
      .sort((a, b) => b.decisionTree.priorityScore - a.decisionTree.priorityScore);

    return {
      ...result,
      model: {
        name: 'DecisionTreeConflictPrioritizer',
        detector: 'DECISION_TREE_RULE_BASED',
        trainedModel: false,
        note: 'Arbre explicable de priorisation. Les contraintes dures restent la source de vérité.',
      },
      conflicts,
    };
  }
}
