import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AircraftStatus, FlightStatus } from '../common/enums/airline.enums';
import { Aircraft } from '../fleet/entities/aircraft.entity';
import { Flight } from '../flights/entities/flight.entity';
import { SchedulingService } from '../scheduling/services/scheduling.service';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Flight)
    private readonly flightRepository: Repository<Flight>,
    @InjectRepository(Aircraft)
    private readonly aircraftRepository: Repository<Aircraft>,
    private readonly schedulingService: SchedulingService,
  ) {}

  async overview() {
    const [flights, aircrafts, conflictResult] = await Promise.all([
      this.flightRepository.find({ relations: ['aircraft'] }),
      this.aircraftRepository.find(),
      this.schedulingService.detectAll(),
    ]);

    const plannedBlockHours = flights.reduce((sum, flight) => {
      if (flight.status === FlightStatus.CANCELLED) return sum;
      return sum + Math.max(
        0,
        (flight.arrivalTime.getTime() - flight.departureTime.getTime()) / 3_600_000,
      );
    }, 0);

    const assignedFlights = flights.filter((flight) => Boolean(flight.refAircraft)).length;

    return {
      generatedAt: new Date().toISOString(),
      flights: {
        total: flights.length,
        scheduled: flights.filter((f) => f.status === FlightStatus.SCHEDULED).length,
        delayed: flights.filter((f) => f.status === FlightStatus.DELAYED).length,
        cancelled: flights.filter((f) => f.status === FlightStatus.CANCELLED).length,
        inFlight: flights.filter((f) => f.status === FlightStatus.IN_FLIGHT).length,
        completed: flights.filter(
          (f) => f.status === FlightStatus.COMPLETED || f.status === FlightStatus.EFFECTUE,
        ).length,
        assigned: assignedFlights,
        unassigned: flights.length - assignedFlights,
        plannedBlockHours: Number(plannedBlockHours.toFixed(2)),
      },
      fleet: {
        total: aircrafts.length,
        active: aircrafts.filter((a) => a.status === AircraftStatus.ACTIVE).length,
        maintenance: aircrafts.filter((a) => a.status === AircraftStatus.MAINTENANCE).length,
        outOfService: aircrafts.filter((a) => a.status === AircraftStatus.OUT_OF_SERVICE).length,
        retired: aircrafts.filter((a) => a.status === AircraftStatus.RETIRED).length,
      },
      conflicts: {
        total: conflictResult.totalConflicts,
        critical: conflictResult.criticalConflicts,
        high: conflictResult.highConflicts,
        medium: conflictResult.mediumConflicts,
      },
    };
  }
}
