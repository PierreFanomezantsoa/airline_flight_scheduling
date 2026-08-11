import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AircraftStatus } from '../../common/enums/airline.enums';
import { normalizeIata } from '../../common/utils/normalizers';
import { Aircraft } from '../../fleet/entities/aircraft.entity';
import { ScheduleConflictService } from './schedule-conflict.service';

@Injectable()
export class AircraftAvailabilityService {
  constructor(
    @InjectRepository(Aircraft)
    private readonly aircraftRepository: Repository<Aircraft>,
    private readonly conflictService: ScheduleConflictService,
  ) {}

  async findAvailable(
    start: Date,
    end: Date,
    origin?: string,
    destination?: string,
    excludeFlightId?: string,
  ): Promise<Aircraft[]> {
    const aircrafts = await this.aircraftRepository.find({
      where: { statut: AircraftStatus.ACTIVE },
      relations: ['type'],
      order: { immatriculation: 'ASC' },
    });

    const available: Aircraft[] = [];

    for (const aircraft of aircrafts) {
      const departure = origin
        ? normalizeIata(origin)
        : aircraft.baseAttache ?? 'XXX';
      const arrival = destination
        ? normalizeIata(destination)
        : departure;

      const validation = await this.conflictService.validateCandidate(
        {
          numeroVol: 'AVAILABILITY-CHECK',
          aeroportDepart: departure,
          aeroportArrivee: arrival,
          heureDepart: start,
          heureArrivee: end,
          avionId: aircraft.id,
        },
        excludeFlightId,
      );

      if (validation.valid) available.push(aircraft);
    }

    return available;
  }
}
