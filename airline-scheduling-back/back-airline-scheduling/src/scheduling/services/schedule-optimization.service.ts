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
   * Elle ne déplace pas les heures et n'annule jamais un vol automatiquement.
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

      const targetId = conflict.relatedFlightId ?? conflict.flightId;
      if (!targetId || processed.has(targetId)) continue;

      const flight = await this.flightRepository.findOne({
        where: { id: targetId },
        relations: ['avion'],
      });

      if (!flight || flight.statut === FlightStatus.CANCELLED) continue;

      const alternatives = await this.availabilityService.findAvailable(
        flight.heureDepart,
        flight.heureArrivee,
        flight.aeroportDepart,
        flight.aeroportArrivee,
        flight.id,
      );

      const replacement = alternatives.find(
        (aircraft) => aircraft.id !== flight.avionId,
      );

      if (!replacement) {
        details.push({
          flightNumber: flight.numeroVol,
          status: 'UNRESOLVED',
          from: flight.avion?.immatriculation ?? 'NON ASSIGNÉ',
          reason: conflict.reason,
        });
        processed.add(targetId);
        continue;
      }

      const from = flight.avion?.immatriculation ?? 'NON ASSIGNÉ';
      flight.avionId = replacement.id;
      flight.avion = replacement;
      await this.flightRepository.save(flight);

      details.push({
        flightNumber: flight.numeroVol,
        status: 'REASSIGNED',
        from,
        to: replacement.immatriculation,
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
