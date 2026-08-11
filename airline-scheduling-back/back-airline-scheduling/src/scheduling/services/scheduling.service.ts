import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ConflictSeverity,
} from '../../common/enums/airline.enums';
import { normalizeIata } from '../../common/utils/normalizers';
import { AircraftAvailabilityQueryDto } from '../dto/aircraft-availability-query.dto';
import { FlightCandidate } from '../interfaces/scheduling.interfaces';
import { AircraftAvailabilityService } from './aircraft-availability.service';
import { ScheduleConflictService } from './schedule-conflict.service';
import { ScheduleOptimizationService } from './schedule-optimization.service';

@Injectable()
export class SchedulingService {
  constructor(
    private readonly conflictService: ScheduleConflictService,
    private readonly availabilityService: AircraftAvailabilityService,
    private readonly optimizationService: ScheduleOptimizationService,
  ) {}

  validateCandidate(candidate: FlightCandidate, excludeFlightId?: string) {
    return this.conflictService.validateCandidate(candidate, excludeFlightId);
  }

  async detectAll() {
    const conflicts = await this.conflictService.detectAll();
    return {
      timestamp: new Date().toISOString(),
      totalConflicts: conflicts.length,
      criticalConflicts: conflicts.filter((c) => c.severity === ConflictSeverity.CRITICAL).length,
      highConflicts: conflicts.filter((c) => c.severity === ConflictSeverity.HIGH).length,
      mediumConflicts: conflicts.filter((c) => c.severity === ConflictSeverity.MEDIUM).length,
      conflicts,
    };
  }

  async findAvailableAircraft(query: AircraftAvailabilityQueryDto) {
    const start = new Date(query.start);
    const end = new Date(query.end);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException(
        'La fin de la fenêtre doit être postérieure au début.',
      );
    }

    return this.availabilityService.findAvailable(
      start,
      end,
      query.origin ? normalizeIata(query.origin) : undefined,
      query.destination ? normalizeIata(query.destination) : undefined,
    );
  }

  optimize() {
    return this.optimizationService.optimize();
  }
}
