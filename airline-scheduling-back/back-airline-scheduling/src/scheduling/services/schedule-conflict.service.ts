import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { SchedulingPolicy } from '../../common/constants/scheduling-policy';
import { NetworkConfigurationService } from '../../network-configuration/network-configuration.service';
import {
  AircraftStatus,
  ConflictSeverity,
  FlightStatus,
  MaintenanceStatus,
  ScheduleConflictType,
} from '../../common/enums/airline.enums';
import { CrewAssignment } from '../../crew/entities/crew-assignment.entity';
import { Aircraft } from '../../fleet/entities/aircraft.entity';
import { Flight } from '../../flights/entities/flight.entity';
import { MaintenanceSlot } from '../../maintenance/entities/maintenance-slot.entity';
import {
  FlightCandidate,
  ScheduleConflict,
  ScheduleValidationResult,
} from '../interfaces/scheduling.interfaces';

@Injectable()
export class ScheduleConflictService {
  constructor(
    @InjectRepository(Flight)
    private readonly flightRepository: Repository<Flight>,
    @InjectRepository(Aircraft)
    private readonly aircraftRepository: Repository<Aircraft>,
    @InjectRepository(MaintenanceSlot)
    private readonly maintenanceRepository: Repository<MaintenanceSlot>,
    @InjectRepository(CrewAssignment)
    private readonly crewAssignmentRepository: Repository<CrewAssignment>,
    @Optional()
    private readonly networkConfigurationService?: NetworkConfigurationService,
  ) {}

  private get policy() {
    return this.networkConfigurationService?.getPolicy() ?? {
      minimumTurnaroundMinutes: SchedulingPolicy.minimumTurnaroundMinutes,
      mediumHaulTurnaroundMinutes: SchedulingPolicy.minimumTurnaroundMinutes,
      longHaulTurnaroundMinutes: Number(process.env.LONG_HAUL_TURNAROUND_MINUTES ?? 90),
      positioningBufferMinutes: SchedulingPolicy.positioningBufferMinutes,
      minimumCrewRestHours: SchedulingPolicy.minimumCrewRestHours,
      maximumContinuousFlightHours: Number(process.env.MAX_CONTINUOUS_FLIGHT_HOURS ?? 8),
      maintenanceWarningHours: SchedulingPolicy.maintenanceWarningHours,
    };
  }

  async validateCandidate(
    candidate: FlightCandidate,
    excludeFlightId?: string,
  ): Promise<ScheduleValidationResult> {
    const conflicts: ScheduleConflict[] = [];

    if (
      Number.isNaN(candidate.departureTime.getTime()) ||
      Number.isNaN(candidate.arrivalTime.getTime()) ||
      candidate.arrivalTime <= candidate.departureTime
    ) {
      conflicts.push({
        id: `INVALID_WINDOW:${candidate.flightNumber}`,
        type: ScheduleConflictType.INVALID_TIME_WINDOW,
        severity: ConflictSeverity.CRITICAL,
        blocking: true,
        reason: "L'heure d'arrivée doit être postérieure à l'heure de départ.",
        recommendation: 'Corriger la fenêtre horaire.',
        flightNumber: candidate.flightNumber,
      });
      return this.toValidationResult(conflicts);
    }

    if (!candidate.refAircraft) {
      conflicts.push({
        id: `UNASSIGNED:${candidate.flightNumber}`,
        type: ScheduleConflictType.UNASSIGNED_AIRCRAFT,
        severity: ConflictSeverity.HIGH,
        blocking: false,
        reason: `Le flight ${candidate.flightNumber} n'a pas encore d'appareil assigné.`,
        recommendation: 'Affecter un appareil avant publication opérationnelle.',
        flightNumber: candidate.flightNumber,
      });
      return this.toValidationResult(conflicts);
    }

    const aircraft = await this.aircraftRepository.findOne({
      where: { refAircraft: candidate.refAircraft },
      relations: ['aircraftType'],
    });

    if (!aircraft) {
      conflicts.push({
        id: `AIRCRAFT_NOT_FOUND:${candidate.refAircraft}`,
        type: ScheduleConflictType.AIRCRAFT_UNAVAILABLE,
        severity: ConflictSeverity.CRITICAL,
        blocking: true,
        reason: `L'appareil ${candidate.refAircraft} est introuvable.`,
        recommendation: 'Sélectionner un appareil existant.',
        flightNumber: candidate.flightNumber,
        refAircraft: candidate.refAircraft,
      });
      return this.toValidationResult(conflicts);
    }

    if (aircraft.status !== AircraftStatus.ACTIVE) {
      conflicts.push({
        id: `AIRCRAFT_STATUS:${candidate.flightNumber}:${aircraft.refAircraft}`,
        type: ScheduleConflictType.AIRCRAFT_UNAVAILABLE,
        severity: ConflictSeverity.CRITICAL,
        blocking: true,
        reason: `${aircraft.registration} est au status "${aircraft.status}".`,
        recommendation: 'Choisir un appareil isActive.',
        flightNumber: candidate.flightNumber,
        refAircraft: aircraft.refAircraft,
        aircraftRegistration: aircraft.registration,
      });
    }

    conflicts.push(
      ...(await this.detectAircraftOverlap(candidate, aircraft, excludeFlightId)),
      ...(await this.detectTurnaroundAndPositioning(candidate, aircraft, excludeFlightId)),
      ...(await this.detectMaintenanceOverlap(candidate, aircraft)),
      ...(await this.detectMaintenanceDue(candidate, aircraft, excludeFlightId)),
    );

    return this.toValidationResult(conflicts);
  }

  async detectAll(): Promise<ScheduleConflict[]> {
    const flights = await this.flightRepository.find({
      where: { status: Not(FlightStatus.CANCELLED) },
      relations: ['aircraft', 'aircraft.type'],
      order: { departureTime: 'ASC' },
    });

    const conflicts: ScheduleConflict[] = [];
    const byAircraft = new Map<string, Flight[]>();

    for (const flight of flights) {
      if (!flight.refAircraft || !flight.aircraft) {
        conflicts.push({
          id: `UNASSIGNED:${flight.refFlight}`,
          type: ScheduleConflictType.UNASSIGNED_AIRCRAFT,
          severity: ConflictSeverity.HIGH,
          blocking: false,
          reason: `Le flight ${flight.flightNumber} n'a aucun appareil assigné.`,
          recommendation: 'Affecter un appareil avant publication opérationnelle.',
          refFlight: flight.refFlight,
          flightNumber: flight.flightNumber,
        });
        continue;
      }

      const list = byAircraft.get(flight.refAircraft) ?? [];
      list.push(flight);
      byAircraft.set(flight.refAircraft, list);

      if (flight.aircraft.status !== AircraftStatus.ACTIVE) {
        conflicts.push({
          id: `AIRCRAFT_STATUS:${flight.refFlight}`,
          type: ScheduleConflictType.AIRCRAFT_UNAVAILABLE,
          severity: ConflictSeverity.CRITICAL,
          blocking: true,
          reason: `${flight.flightNumber} utilise ${flight.aircraft.registration}, au status "${flight.aircraft.status}".`,
          recommendation: 'Réaffecter le flight à un appareil isActive.',
          refFlight: flight.refFlight,
          flightNumber: flight.flightNumber,
          refAircraft: flight.refAircraft,
          aircraftRegistration: flight.aircraft.registration,
        });
      }

      conflicts.push(
        ...(await this.detectMaintenanceOverlap(
          this.toCandidate(flight),
          flight.aircraft,
        )),
      );

      if (!flight.flightHoursRecorded) {
        conflicts.push(
          ...(await this.detectMaintenanceDue(
            this.toCandidate(flight),
            flight.aircraft,
            flight.refFlight,
          )),
        );
      }
    }

    for (const [refAircraft, rotations] of byAircraft.entries()) {
      rotations.sort((a, b) => a.departureTime.getTime() - b.departureTime.getTime());
      for (let i = 0; i < rotations.length - 1; i += 1) {
        conflicts.push(...this.compareConsecutiveFlights(rotations[i], rotations[i + 1], refAircraft));
      }
    }

    conflicts.push(...(await this.detectCrewConflicts()));

    return this.deduplicate(conflicts);
  }

  private compareConsecutiveFlights(
    current: Flight,
    next: Flight,
    refAircraft: string,
  ): ScheduleConflict[] {
    const aircraftRegistration = current.aircraft?.registration ?? next.aircraft?.registration ?? refAircraft;
    const gapMinutes = (next.departureTime.getTime() - current.arrivalTime.getTime()) / 60_000;
    const conflicts: ScheduleConflict[] = [];

    if (gapMinutes < 0) {
      conflicts.push({
        id: `OVERLAP:${current.refFlight}:${next.refFlight}`,
        type: ScheduleConflictType.AIRCRAFT_OVERLAP,
        severity: ConflictSeverity.CRITICAL,
        blocking: true,
        reason: `${current.flightNumber} et ${next.flightNumber} se chevauchent de ${Math.round(Math.abs(gapMinutes))} min sur ${aircraftRegistration}.`,
        recommendation: 'Décaler un flight ou réaffecter un appareil.',
        refFlight: current.refFlight,
        relatedRefFlight: next.refFlight,
        flightNumber: current.flightNumber,
        relatedFlightNumber: next.flightNumber,
        refAircraft,
        aircraftRegistration,
        overlapMinutes: Math.abs(gapMinutes),
      });
      return conflicts;
    }

    if (gapMinutes < this.policy.minimumTurnaroundMinutes) {
      conflicts.push({
        id: `TURNAROUND:${current.refFlight}:${next.refFlight}`,
        type: ScheduleConflictType.TURNAROUND_TOO_SHORT,
        severity: ConflictSeverity.HIGH,
        blocking: true,
        reason: `Rotation ${current.flightNumber} → ${next.flightNumber}: ${Math.round(gapMinutes)} min au sol.`,
        recommendation: `Respecter la politique de turnaround configurée (${this.policy.minimumTurnaroundMinutes} min) ou changer d'appareil.`,
        refFlight: current.refFlight,
        relatedRefFlight: next.refFlight,
        flightNumber: current.flightNumber,
        relatedFlightNumber: next.flightNumber,
        refAircraft,
        aircraftRegistration,
        gapMinutes,
      });
    }

    if (
      current.arrivalAirportCode !== next.departureAirportCode &&
      gapMinutes < this.policy.positioningBufferMinutes
    ) {
      conflicts.push({
        id: `POSITION:${current.refFlight}:${next.refFlight}`,
        type: ScheduleConflictType.AIRCRAFT_POSITIONING,
        severity: ConflictSeverity.HIGH,
        blocking: true,
        reason: `${aircraftRegistration} termine ${current.flightNumber} à ${current.arrivalAirportCode}, mais ${next.flightNumber} repart de ${next.departureAirportCode}.`,
        recommendation: 'Insérer un flight de repositionnement ou réaffecter le flight suivant.',
        refFlight: current.refFlight,
        relatedRefFlight: next.refFlight,
        flightNumber: current.flightNumber,
        relatedFlightNumber: next.flightNumber,
        refAircraft,
        aircraftRegistration,
        gapMinutes,
      });
    }

    return conflicts;
  }

  private async detectAircraftOverlap(
    candidate: FlightCandidate,
    aircraft: Aircraft,
    excludeFlightId?: string,
  ): Promise<ScheduleConflict[]> {
    const qb = this.flightRepository
      .createQueryBuilder('flight')
      .where('flight.refAircraft = :refAircraft', { refAircraft: aircraft.refAircraft })
      .andWhere('flight.status != :cancelled', { cancelled: FlightStatus.CANCELLED })
      .andWhere('flight.departureTime < :arrival', { arrival: candidate.arrivalTime })
      .andWhere('flight.arrivalTime > :departure', { departure: candidate.departureTime });
    if (excludeFlightId) qb.andWhere('flight.refFlight != :excludeFlightId', { excludeFlightId });

    const overlaps = await qb.getMany();
    return overlaps.map((other) => {
      const start = Math.max(candidate.departureTime.getTime(), other.departureTime.getTime());
      const end = Math.min(candidate.arrivalTime.getTime(), other.arrivalTime.getTime());
      return {
        id: `OVERLAP:${candidate.flightNumber}:${other.refFlight}`,
        type: ScheduleConflictType.AIRCRAFT_OVERLAP,
        severity: ConflictSeverity.CRITICAL,
        blocking: true,
        reason: `${aircraft.registration} est déjà affecté au flight ${other.flightNumber} sur ce créneau.`,
        recommendation: 'Décaler le flight ou choisir un autre appareil.',
        relatedRefFlight: other.refFlight,
        flightNumber: candidate.flightNumber,
        relatedFlightNumber: other.flightNumber,
        refAircraft: aircraft.refAircraft,
        aircraftRegistration: aircraft.registration,
        overlapMinutes: Math.max(0, (end - start) / 60_000),
      };
    });
  }

  private async detectTurnaroundAndPositioning(
    candidate: FlightCandidate,
    aircraft: Aircraft,
    excludeFlightId?: string,
  ): Promise<ScheduleConflict[]> {
    const qb = this.flightRepository
      .createQueryBuilder('flight')
      .where('flight.refAircraft = :refAircraft', { refAircraft: aircraft.refAircraft })
      .andWhere('flight.status != :cancelled', { cancelled: FlightStatus.CANCELLED });
    if (excludeFlightId) qb.andWhere('flight.refFlight != :excludeFlightId', { excludeFlightId });

    const rotations = await qb.orderBy('flight.departureTime', 'ASC').getMany();
    const previous = rotations
      .filter((f) => f.arrivalTime <= candidate.departureTime)
      .sort((a, b) => b.arrivalTime.getTime() - a.arrivalTime.getTime())[0];
    const next = rotations
      .filter((f) => f.departureTime >= candidate.arrivalTime)
      .sort((a, b) => a.departureTime.getTime() - b.departureTime.getTime())[0];

    const conflicts: ScheduleConflict[] = [];

    if (previous) {
      const virtual = this.candidateAsVirtualFlight(candidate, aircraft);
      conflicts.push(...this.compareConsecutiveFlights(previous, virtual, aircraft.refAircraft));
    }
    if (next) {
      const virtual = this.candidateAsVirtualFlight(candidate, aircraft);
      conflicts.push(...this.compareConsecutiveFlights(virtual, next, aircraft.refAircraft));
    }

    return conflicts;
  }

  private async detectMaintenanceOverlap(
    candidate: FlightCandidate,
    aircraft: Aircraft,
  ): Promise<ScheduleConflict[]> {
    const slots = await this.maintenanceRepository
      .createQueryBuilder('slot')
      .where('slot.refAircraft = :refAircraft', { refAircraft: aircraft.refAircraft })
      .andWhere('slot.status NOT IN (:...ignored)', {
        ignored: [MaintenanceStatus.CANCELLED, MaintenanceStatus.COMPLETED],
      })
      .andWhere('slot.startTime < :arrival', { arrival: candidate.arrivalTime })
      .andWhere('slot.endTime > :departure', { departure: candidate.departureTime })
      .getMany();

    return slots.map((slot) => ({
      id: `MAINTENANCE:${candidate.flightNumber}:${slot.refMaintenanceSlot}`,
      type: ScheduleConflictType.AIRCRAFT_MAINTENANCE,
      severity: ConflictSeverity.CRITICAL,
      blocking: true,
      reason: `${aircraft.registration} est indisponible pour maintenance sur ce créneau.`,
      recommendation: 'Changer d’appareil ou revoir le créneau de maintenance.',
      flightNumber: candidate.flightNumber,
      refAircraft: aircraft.refAircraft,
      aircraftRegistration: aircraft.registration,
      metadata: { maintenanceSlotId: slot.refMaintenanceSlot, maintenanceType: slot.maintenanceType },
    }));
  }

  private async detectMaintenanceDue(
    candidate: FlightCandidate,
    aircraft: Aircraft,
    excludeFlightId?: string,
  ): Promise<ScheduleConflict[]> {
    const candidateHours = this.calculateCandidateFlightHours(candidate);

    /*
     * Le compteur de l'aircraft contient uniquement les heures réellement flightées.
     * Pour décider si un NOUVEAU flight peut être planifié, on ajoute aussi les
     * vols déjà planifiés avant ce candidat et qui ne sont pas encore crédités.
     */
    const qb = this.flightRepository
      .createQueryBuilder('flight')
      .where('flight.refAircraft = :refAircraft', { refAircraft: aircraft.refAircraft })
      .andWhere('flight.status != :cancelled', {
        cancelled: FlightStatus.CANCELLED,
      })
      .andWhere('flight.flightHoursRecorded = FALSE')
      .andWhere('flight.departureTime < :candidateDeparture', {
        candidateDeparture: candidate.departureTime,
      });

    if (excludeFlightId) {
      qb.andWhere('flight.refFlight != :excludeFlightId', { excludeFlightId });
    }

    const earlierPlannedFlights = await qb.getMany();

    const earlierPlannedHours = earlierPlannedFlights.reduce(
      (sum, flight) => sum + this.calculateStoredFlightHours(flight),
      0,
    );

    const projected =
      Number(aircraft.hoursSinceMaintenance || 0) +
      earlierPlannedHours +
      candidateHours;

    const remaining = aircraft.maintenanceHoursLimit - projected;

    if (remaining <= 0) {
      return [
        {
          id: `MAINTENANCE_DUE:${candidate.flightNumber}:${aircraft.refAircraft}`,
          type: ScheduleConflictType.MAINTENANCE_DUE,
          severity: ConflictSeverity.HIGH,
          blocking: true,
          reason:
            `${aircraft.registration} dépasserait sa limite de maintenance ` +
            `en tenant compte des vols déjà planifiés.`,
          recommendation: 'Planifier une maintenance ou utiliser un autre appareil.',
          flightNumber: candidate.flightNumber,
          refAircraft: aircraft.refAircraft,
          aircraftRegistration: aircraft.registration,
          metadata: {
            actualHoursSinceMaintenance:
              aircraft.hoursSinceMaintenance,
            earlierPlannedHours,
            candidateHours,
            projectedHours: projected,
            limitHours: aircraft.maintenanceHoursLimit,
          },
        },
      ];
    }

    if (remaining <= this.policy.maintenanceWarningHours) {
      return [
        {
          id: `MAINTENANCE_WARNING:${candidate.flightNumber}:${aircraft.refAircraft}`,
          type: ScheduleConflictType.MAINTENANCE_DUE,
          severity: ConflictSeverity.MEDIUM,
          blocking: false,
          reason:
            `${aircraft.registration} ne disposerait plus que de ` +
            `${remaining.toFixed(1)} h avant maintenance après les rotations planifiées.`,
          recommendation: 'Anticiper l’immobilisation de maintenance.',
          flightNumber: candidate.flightNumber,
          refAircraft: aircraft.refAircraft,
          aircraftRegistration: aircraft.registration,
          metadata: {
            actualHoursSinceMaintenance:
              aircraft.hoursSinceMaintenance,
            earlierPlannedHours,
            candidateHours,
            projectedHours: projected,
            limitHours: aircraft.maintenanceHoursLimit,
          },
        },
      ];
    }

    return [];
  }

  private calculateCandidateFlightHours(candidate: FlightCandidate): number {
    return this.calculateFlightHours(
      candidate.departureTime,
      candidate.arrivalTime,
      candidate.stopoverAirportCodes,
      candidate.stopoverDurationMinutes,
    );
  }

  private calculateStoredFlightHours(flight: Flight): number {
    return this.calculateFlightHours(
      flight.departureTime,
      flight.arrivalTime,
      flight.stopoverAirportCodes,
      flight.stopoverDurationMinutes,
    );
  }

  private calculateFlightHours(
    departure: Date,
    arrival: Date,
    stopoverAirports?: string | null,
    stopoverDurationMinutes?: number | null,
  ): number {
    const elapsedHours = Math.max(
      0,
      (arrival.getTime() - departure.getTime()) / 3_600_000,
    );
    const hasStopover = (stopoverAirports ?? '')
      .split(',')
      .some((airport) => airport.trim().length > 0);

    if (!hasStopover) return elapsedHours;

    const rawStopoverMinutes = Number(stopoverDurationMinutes ?? 0);
    const stopoverHours = Number.isFinite(rawStopoverMinutes)
      ? Math.min(elapsedHours, Math.max(0, rawStopoverMinutes) / 60)
      : 0;

    return Math.max(0, elapsedHours - stopoverHours);
  }

  private async detectCrewConflicts(): Promise<ScheduleConflict[]> {
    const assignments = await this.crewAssignmentRepository.find({
      relations: ['flight', 'user'],
    });
    const byUser = new Map<string, CrewAssignment[]>();

    for (const assignment of assignments) {
      if (assignment.flight.status === FlightStatus.CANCELLED) continue;
      const list = byUser.get(assignment.refUser) ?? [];
      list.push(assignment);
      byUser.set(assignment.refUser, list);
    }

    const conflicts: ScheduleConflict[] = [];
    for (const [, userAssignments] of byUser) {
      userAssignments.sort((a, b) => a.flight.departureTime.getTime() - b.flight.departureTime.getTime());
      for (let i = 0; i < userAssignments.length - 1; i += 1) {
        const current = userAssignments[i];
        const next = userAssignments[i + 1];
        const gapHours = (next.flight.departureTime.getTime() - current.flight.arrivalTime.getTime()) / 3_600_000;

        if (gapHours < 0) {
          conflicts.push({
            id: `CREW_OVERLAP:${current.refCrewAssignment}:${next.refCrewAssignment}`,
            type: ScheduleConflictType.CREW_OVERLAP,
            severity: ConflictSeverity.CRITICAL,
            blocking: true,
            reason: `${current.user.name} est affecté simultanément à ${current.flight.flightNumber} et ${next.flight.flightNumber}.`,
            recommendation: 'Réaffecter un membre d’équipage.',
            refFlight: current.flight.refFlight,
            relatedRefFlight: next.flight.refFlight,
            flightNumber: current.flight.flightNumber,
            relatedFlightNumber: next.flight.flightNumber,
            metadata: { userId: current.refUser },
          });
        } else if (gapHours < this.policy.minimumCrewRestHours) {
          conflicts.push({
            id: `CREW_REST:${current.refCrewAssignment}:${next.refCrewAssignment}`,
            type: ScheduleConflictType.CREW_REST,
            severity: ConflictSeverity.HIGH,
            blocking: true,
            reason: `${current.user.name} dispose de ${gapHours.toFixed(1)} h de repos entre ${current.flight.flightNumber} et ${next.flight.flightNumber}.`,
            recommendation: `Respecter la politique de repos configurée (${this.policy.minimumCrewRestHours} h) ou réaffecter l'équipage.`,
            refFlight: current.flight.refFlight,
            relatedRefFlight: next.flight.refFlight,
            flightNumber: current.flight.flightNumber,
            relatedFlightNumber: next.flight.flightNumber,
            metadata: { userId: current.refUser, gapHours },
          });
        }
      }
    }

    return conflicts;
  }

  private toValidationResult(conflicts: ScheduleConflict[]): ScheduleValidationResult {
    return {
      valid: !conflicts.some((conflict) => conflict.blocking),
      operationallyReady: conflicts.length === 0,
      conflicts: this.deduplicate(conflicts),
    };
  }

  private toCandidate(flight: Flight): FlightCandidate {
    return {
      flightNumber: flight.flightNumber,
      departureAirportCode: flight.departureAirportCode,
      stopoverAirportCodes: flight.stopoverAirportCodes,
      arrivalAirportCode: flight.arrivalAirportCode,
      departureTime: flight.departureTime,
      arrivalTime: flight.arrivalTime,
      refAircraft: flight.refAircraft,
      stopoverDurationMinutes: flight.stopoverDurationMinutes,
    };
  }

  private candidateAsVirtualFlight(candidate: FlightCandidate, aircraft: Aircraft): Flight {
    return {
      refFlight: `candidate:${candidate.flightNumber}`,
      flightNumber: candidate.flightNumber,
      departureAirportCode: candidate.departureAirportCode,
      stopoverAirportCodes: candidate.stopoverAirportCodes ?? null,
      stopoverDurationMinutes: candidate.stopoverDurationMinutes ?? null,
      arrivalAirportCode: candidate.arrivalAirportCode,
      departureTime: candidate.departureTime,
      arrivalTime: candidate.arrivalTime,
      status: FlightStatus.SCHEDULED,
      refAircraft: aircraft.refAircraft,
      aircraft: aircraft,
      flightHoursRecorded: false,
      creditedFlightHours: null,
      flightHoursRecordedAt: null,
      crewAssignments: [],
      version: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      deletedAt: null,
    };
  }

  private deduplicate(conflicts: ScheduleConflict[]): ScheduleConflict[] {
    const unique = new Map<string, ScheduleConflict>();
    for (const conflict of conflicts) unique.set(conflict.id, conflict);
    return [...unique.values()];
  }
}
