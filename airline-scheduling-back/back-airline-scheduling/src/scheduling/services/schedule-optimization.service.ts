import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FlightStatus,
  ScheduleConflictType,
} from '../../common/enums/airline.enums';
import { Flight } from '../../flights/entities/flight.entity';
import { OptimizationDetail } from '../interfaces/scheduling.interfaces';
import { AircraftAvailabilityService } from './aircraft-availability.service';
import { ScheduleConflictService } from './schedule-conflict.service';

@Injectable()
export class ScheduleOptimizationService {
  constructor(
    @InjectRepository(Flight)
    private readonly flightRepository: Repository<Flight>,
    private readonly conflictService: ScheduleConflictService,
    private readonly availabilityService: AircraftAvailabilityService,
  ) {}

  /**
   * Optimisation conservatrice de type greedy.
   * Elle ne déplace pas les heures et n'annule jamais un flight automatiquement.
   * Elle tente seulement de réaffecter un appareil quand cela suffit à résoudre
   * un conflit dur.
   */
  async optimize() {
    const before = await this.conflictService.detectAll();
    const details: OptimizationDetail[] = [];
    const processed = new Set<string>();

    const reassignableTypes = new Set<ScheduleConflictType>([
      ScheduleConflictType.UNASSIGNED_AIRCRAFT,
      ScheduleConflictType.AIRCRAFT_UNAVAILABLE,
      ScheduleConflictType.AIRCRAFT_OVERLAP,
      ScheduleConflictType.TURNAROUND_TOO_SHORT,
      ScheduleConflictType.AIRCRAFT_POSITIONING,
      ScheduleConflictType.AIRCRAFT_MAINTENANCE,
      ScheduleConflictType.MAINTENANCE_DUE,
    ]);

    for (const conflict of before) {
      if (!reassignableTypes.has(conflict.type)) continue;

      const targetId = conflict.relatedRefFlight ?? conflict.refFlight;
      if (!targetId || processed.has(targetId)) continue;

      const flight = await this.flightRepository.findOne({
        where: { refFlight: targetId },
        relations: ['aircraft'],
      });

      if (!flight || flight.flightStatus === FlightStatus.CANCELLED) continue;

      const alternatives = await this.availabilityService.findAvailable(
        flight.departureTime,
        flight.arrivalTime,
        flight.depAirportCode,
        flight.arrAirportCode,
        flight.refFlight,
      );

      const replacement = alternatives.find(
        (aircraft) => aircraft.refAircraft !== flight.refAircraft,
      );

      if (!replacement) {
        details.push({
          flightNumber: flight.flightNumber,
          status: 'UNRESOLVED',
          from: flight.aircraft?.registration ?? 'NON ASSIGNÉ',
          reason: conflict.reason,
        });
        processed.add(targetId);
        continue;
      }

      const from = flight.aircraft?.registration ?? 'NON ASSIGNÉ';
      flight.refAircraft = replacement.refAircraft;
      flight.aircraft = replacement;
      await this.flightRepository.save(flight);

      details.push({
        flightNumber: flight.flightNumber,
        status: 'REASSIGNED',
        from,
        to: replacement.registration ?? 'NON RENSEIGNÉ',
        reason: conflict.reason,
      });
      processed.add(targetId);
    }

    const after = await this.conflictService.detectAll();

    return {
      timestamp: new Date().toISOString(),
      resolvedConflicts: details.filter((item) => item.status === 'REASSIGNED').length,
      unresolvedConflicts: details.filter((item) => item.status === 'UNRESOLVED').length,
      conflictsBefore: before.length,
      conflictsAfter: after.length,
      details,
      remainingConflicts: after,
    };
  }
}
