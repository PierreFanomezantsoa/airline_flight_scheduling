import { Injectable } from '@nestjs/common';
import { AirlineOptimizer } from './optimizer';
import { OptimizationRequestDto } from './dto/optimization-request.dto';

@Injectable()
export class IaService {
  async optimizeSchedule(request: OptimizationRequestDto) {
    return AirlineOptimizer.detectAndResolveConflicts(
      request.flights,
      request.turnaround_minutes ?? 45,
    );
  }
}
