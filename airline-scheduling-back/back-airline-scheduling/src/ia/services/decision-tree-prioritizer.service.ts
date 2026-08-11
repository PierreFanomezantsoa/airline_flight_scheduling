import { Injectable } from '@nestjs/common';
import {
  ConflictSeverity,
  ScheduleConflictType,
} from '../../common/enums/airline.enums';
import { ScheduleConflict } from '../../scheduling/interfaces/scheduling.interfaces';

export interface PrioritizedConflict extends ScheduleConflict {
  decisionTree: {
    detector: 'DECISION_TREE_RULE_BASED';
    probability: number;
    priorityScore: number;
    explanation: string;
  };
}

/**
 * Arbre de décision explicable destiné à prioriser les conflits déjà détectés
 * par les contraintes du moteur de scheduling.
 *
 * Il ne s'agit pas d'un modèle entraîné sur données historiques. Pour un M2,
 * branchez ensuite le service Python scikit-learn sur les mêmes features.
 */
@Injectable()
export class DecisionTreePrioritizerService {
  prioritize(conflict: ScheduleConflict): PrioritizedConflict {
    let probability = 0.55;
    let explanation = 'Conflit opérationnel à surveiller.';

    if (conflict.type === ScheduleConflictType.AIRCRAFT_OVERLAP) {
      probability = 0.99;
      explanation = 'Chevauchement temporel certain sur une même ressource avion.';
    } else if (conflict.type === ScheduleConflictType.AIRCRAFT_MAINTENANCE) {
      probability = 0.98;
      explanation = 'Le vol intersecte une période d’indisponibilité maintenance.';
    } else if (conflict.type === ScheduleConflictType.CREW_OVERLAP) {
      probability = 0.98;
      explanation = 'Le même membre d’équipage est affecté à deux vols simultanés.';
    } else if (conflict.type === ScheduleConflictType.AIRCRAFT_UNAVAILABLE) {
      probability = 0.96;
      explanation = 'L’appareil n’est pas disponible au statut opérationnel requis.';
    } else if (conflict.type === ScheduleConflictType.TURNAROUND_TOO_SHORT) {
      probability = 0.88;
      explanation = 'La marge au sol est inférieure à la politique de turnaround configurée.';
    } else if (conflict.type === ScheduleConflictType.CREW_REST) {
      probability = 0.87;
      explanation = 'La période de repos est inférieure à la politique configurée.';
    } else if (conflict.type === ScheduleConflictType.AIRCRAFT_POSITIONING) {
      probability = 0.85;
      explanation = 'La continuité géographique de la rotation avion n’est pas assurée.';
    } else if (conflict.type === ScheduleConflictType.MAINTENANCE_DUE) {
      probability = conflict.blocking ? 0.9 : 0.68;
      explanation = 'Le compteur maintenance approche ou dépasse la limite configurée.';
    } else if (conflict.type === ScheduleConflictType.UNASSIGNED_AIRCRAFT) {
      probability = 0.7;
      explanation = 'Le vol reste planifiable en brouillon mais n’est pas prêt opérationnellement.';
    }

    const severityWeight = {
      [ConflictSeverity.CRITICAL]: 100,
      [ConflictSeverity.HIGH]: 75,
      [ConflictSeverity.MEDIUM]: 50,
      [ConflictSeverity.LOW]: 25,
    }[conflict.severity];

    return {
      ...conflict,
      decisionTree: {
        detector: 'DECISION_TREE_RULE_BASED',
        probability,
        priorityScore: Math.round(severityWeight * probability),
        explanation,
      },
    };
  }
}
