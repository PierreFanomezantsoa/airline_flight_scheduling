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
      Number.isNaN(candidate.heureDepart.getTime()) ||
      Number.isNaN(candidate.heureArrivee.getTime()) ||
      candidate.heureArrivee <= candidate.heureDepart
    ) {
      conflicts.push({
        id: `INVALID_WINDOW:${candidate.numeroVol}`,
        type: ScheduleConflictType.INVALID_TIME_WINDOW,
        severity: ConflictSeverity.CRITICAL,
        blocking: true,
        reason: "L'heure d'arrivée doit être postérieure à l'heure de départ.",
        recommendation: 'Corriger la fenêtre horaire.',
        flightNumber: candidate.numeroVol,
      });
      return this.toValidationResult(conflicts);
    }

    if (!candidate.avionId) {
      conflicts.push({
        id: `UNASSIGNED:${candidate.numeroVol}`,
        type: ScheduleConflictType.UNASSIGNED_AIRCRAFT,
        severity: ConflictSeverity.HIGH,
        blocking: false,
        reason: `Le vol ${candidate.numeroVol} n'a pas encore d'appareil assigné.`,
        recommendation: 'Affecter un appareil avant publication opérationnelle.',
        flightNumber: candidate.numeroVol,
      });
      return this.toValidationResult(conflicts);
    }

    const aircraft = await this.aircraftRepository.findOne({
      where: { id: candidate.avionId },
      relations: ['type'],
    });

    if (!aircraft) {
      conflicts.push({
        id: `AIRCRAFT_NOT_FOUND:${candidate.avionId}`,
        type: ScheduleConflictType.AIRCRAFT_UNAVAILABLE,
        severity: ConflictSeverity.CRITICAL,
        blocking: true,
        reason: `L'appareil ${candidate.avionId} est introuvable.`,
        recommendation: 'Sélectionner un appareil existant.',
        flightNumber: candidate.numeroVol,
        aircraftId: candidate.avionId,
      });
      return this.toValidationResult(conflicts);
    }

    if (aircraft.statut !== AircraftStatus.ACTIVE) {
      conflicts.push({
        id: `AIRCRAFT_STATUS:${candidate.numeroVol}:${aircraft.id}`,
        type: ScheduleConflictType.AIRCRAFT_UNAVAILABLE,
        severity: ConflictSeverity.CRITICAL,
        blocking: true,
        reason: `${aircraft.immatriculation} est au statut "${aircraft.statut}".`,
        recommendation: 'Choisir un appareil actif.',
        flightNumber: candidate.numeroVol,
        aircraftId: aircraft.id,
        aircraftRegistration: aircraft.immatriculation,
      });
    }

    conflicts.push(
      ...(await this.detectAircraftOverlap(candidate, aircraft, excludeFlightId)),
      ...(await this.detectTurnaroundAndPositioning(candidate, aircraft, excludeFlightId)),
      ...(await this.detectMaintenanceOverlap(candidate, aircraft)),
      ...this.detectMaintenanceDue(candidate, aircraft),
    );

    return this.toValidationResult(conflicts);
  }

  async detectAll(): Promise<ScheduleConflict[]> {
    const flights = await this.flightRepository.find({
      where: { statut: Not(FlightStatus.CANCELLED) },
      relations: ['avion', 'avion.type'],
      order: { heureDepart: 'ASC' },
    });

    const conflicts: ScheduleConflict[] = [];
    const byAircraft = new Map<string, Flight[]>();

    for (const flight of flights) {
      if (!flight.avionId || !flight.avion) {
        conflicts.push({
          id: `UNASSIGNED:${flight.id}`,
          type: ScheduleConflictType.UNASSIGNED_AIRCRAFT,
          severity: ConflictSeverity.HIGH,
          blocking: false,
          reason: `Le vol ${flight.numeroVol} n'a aucun appareil assigné.`,
          recommendation: 'Affecter un appareil avant publication opérationnelle.',
          flightId: flight.id,
          flightNumber: flight.numeroVol,
        });
        continue;
      }

      const list = byAircraft.get(flight.avionId) ?? [];
      list.push(flight);
      byAircraft.set(flight.avionId, list);

      if (flight.avion.statut !== AircraftStatus.ACTIVE) {
        conflicts.push({
          id: `AIRCRAFT_STATUS:${flight.id}`,
          type: ScheduleConflictType.AIRCRAFT_UNAVAILABLE,
          severity: ConflictSeverity.CRITICAL,
          blocking: true,
          reason: `${flight.numeroVol} utilise ${flight.avion.immatriculation}, au statut "${flight.avion.statut}".`,
          recommendation: 'Réaffecter le vol à un appareil actif.',
          flightId: flight.id,
          flightNumber: flight.numeroVol,
          aircraftId: flight.avionId,
          aircraftRegistration: flight.avion.immatriculation,
        });
      }

      conflicts.push(
        ...(await this.detectMaintenanceOverlap(
          this.toCandidate(flight),
          flight.avion,
        )),
        ...this.detectMaintenanceDue(this.toCandidate(flight), flight.avion),
      );
    }

    for (const [aircraftId, rotations] of byAircraft.entries()) {
      rotations.sort((a, b) => a.heureDepart.getTime() - b.heureDepart.getTime());
      for (let i = 0; i < rotations.length - 1; i += 1) {
        conflicts.push(...this.compareConsecutiveFlights(rotations[i], rotations[i + 1], aircraftId));
      }
    }

    conflicts.push(...(await this.detectCrewConflicts()));

    return this.deduplicate(conflicts);
  }

  private compareConsecutiveFlights(
    current: Flight,
    next: Flight,
    aircraftId: string,
  ): ScheduleConflict[] {
    const aircraftRegistration = current.avion?.immatriculation ?? next.avion?.immatriculation ?? aircraftId;
    const gapMinutes = (next.heureDepart.getTime() - current.heureArrivee.getTime()) / 60_000;
    const conflicts: ScheduleConflict[] = [];

    if (gapMinutes < 0) {
      conflicts.push({
        id: `OVERLAP:${current.id}:${next.id}`,
        type: ScheduleConflictType.AIRCRAFT_OVERLAP,
        severity: ConflictSeverity.CRITICAL,
        blocking: true,
        reason: `${current.numeroVol} et ${next.numeroVol} se chevauchent de ${Math.round(Math.abs(gapMinutes))} min sur ${aircraftRegistration}.`,
        recommendation: 'Décaler un vol ou réaffecter un appareil.',
        flightId: current.id,
        relatedFlightId: next.id,
        flightNumber: current.numeroVol,
        relatedFlightNumber: next.numeroVol,
        aircraftId,
        aircraftRegistration,
        overlapMinutes: Math.abs(gapMinutes),
      });
      return conflicts;
    }

    if (gapMinutes < this.policy.minimumTurnaroundMinutes) {
      conflicts.push({
        id: `TURNAROUND:${current.id}:${next.id}`,
        type: ScheduleConflictType.TURNAROUND_TOO_SHORT,
        severity: ConflictSeverity.HIGH,
        blocking: true,
        reason: `Rotation ${current.numeroVol} → ${next.numeroVol}: ${Math.round(gapMinutes)} min au sol.`,
        recommendation: `Respecter la politique de turnaround configurée (${this.policy.minimumTurnaroundMinutes} min) ou changer d'appareil.`,
        flightId: current.id,
        relatedFlightId: next.id,
        flightNumber: current.numeroVol,
        relatedFlightNumber: next.numeroVol,
        aircraftId,
        aircraftRegistration,
        gapMinutes,
      });
    }

    if (
      current.aeroportArrivee !== next.aeroportDepart &&
      gapMinutes < this.policy.positioningBufferMinutes
    ) {
      conflicts.push({
        id: `POSITION:${current.id}:${next.id}`,
        type: ScheduleConflictType.AIRCRAFT_POSITIONING,
        severity: ConflictSeverity.HIGH,
        blocking: true,
        reason: `${aircraftRegistration} termine ${current.numeroVol} à ${current.aeroportArrivee}, mais ${next.numeroVol} repart de ${next.aeroportDepart}.`,
        recommendation: 'Insérer un vol de repositionnement ou réaffecter le vol suivant.',
        flightId: current.id,
        relatedFlightId: next.id,
        flightNumber: current.numeroVol,
        relatedFlightNumber: next.numeroVol,
        aircraftId,
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
      .where('flight.avionId = :aircraftId', { aircraftId: aircraft.id })
      .andWhere('flight.statut != :cancelled', { cancelled: FlightStatus.CANCELLED })
      .andWhere('flight.heureDepart < :arrival', { arrival: candidate.heureArrivee })
      .andWhere('flight.heureArrivee > :departure', { departure: candidate.heureDepart });
    if (excludeFlightId) qb.andWhere('flight.id != :excludeFlightId', { excludeFlightId });

    const overlaps = await qb.getMany();
    return overlaps.map((other) => {
      const start = Math.max(candidate.heureDepart.getTime(), other.heureDepart.getTime());
      const end = Math.min(candidate.heureArrivee.getTime(), other.heureArrivee.getTime());
      return {
        id: `OVERLAP:${candidate.numeroVol}:${other.id}`,
        type: ScheduleConflictType.AIRCRAFT_OVERLAP,
        severity: ConflictSeverity.CRITICAL,
        blocking: true,
        reason: `${aircraft.immatriculation} est déjà affecté au vol ${other.numeroVol} sur ce créneau.`,
        recommendation: 'Décaler le vol ou choisir un autre appareil.',
        relatedFlightId: other.id,
        flightNumber: candidate.numeroVol,
        relatedFlightNumber: other.numeroVol,
        aircraftId: aircraft.id,
        aircraftRegistration: aircraft.immatriculation,
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
      .where('flight.avionId = :aircraftId', { aircraftId: aircraft.id })
      .andWhere('flight.statut != :cancelled', { cancelled: FlightStatus.CANCELLED });
    if (excludeFlightId) qb.andWhere('flight.id != :excludeFlightId', { excludeFlightId });

    const rotations = await qb.orderBy('flight.heureDepart', 'ASC').getMany();
    const previous = rotations
      .filter((f) => f.heureArrivee <= candidate.heureDepart)
      .sort((a, b) => b.heureArrivee.getTime() - a.heureArrivee.getTime())[0];
    const next = rotations
      .filter((f) => f.heureDepart >= candidate.heureArrivee)
      .sort((a, b) => a.heureDepart.getTime() - b.heureDepart.getTime())[0];

    const conflicts: ScheduleConflict[] = [];

    if (previous) {
      const virtual = this.candidateAsVirtualFlight(candidate, aircraft);
      conflicts.push(...this.compareConsecutiveFlights(previous, virtual, aircraft.id));
    }
    if (next) {
      const virtual = this.candidateAsVirtualFlight(candidate, aircraft);
      conflicts.push(...this.compareConsecutiveFlights(virtual, next, aircraft.id));
    }

    return conflicts;
  }

  private async detectMaintenanceOverlap(
    candidate: FlightCandidate,
    aircraft: Aircraft,
  ): Promise<ScheduleConflict[]> {
    const slots = await this.maintenanceRepository
      .createQueryBuilder('slot')
      .where('slot.aircraftId = :aircraftId', { aircraftId: aircraft.id })
      .andWhere('slot.status NOT IN (:...ignored)', {
        ignored: [MaintenanceStatus.CANCELLED, MaintenanceStatus.COMPLETED],
      })
      .andWhere('slot.startTime < :arrival', { arrival: candidate.heureArrivee })
      .andWhere('slot.endTime > :departure', { departure: candidate.heureDepart })
      .getMany();

    return slots.map((slot) => ({
      id: `MAINTENANCE:${candidate.numeroVol}:${slot.id}`,
      type: ScheduleConflictType.AIRCRAFT_MAINTENANCE,
      severity: ConflictSeverity.CRITICAL,
      blocking: true,
      reason: `${aircraft.immatriculation} est indisponible pour maintenance sur ce créneau.`,
      recommendation: 'Changer d’appareil ou revoir le créneau de maintenance.',
      flightNumber: candidate.numeroVol,
      aircraftId: aircraft.id,
      aircraftRegistration: aircraft.immatriculation,
      metadata: { maintenanceSlotId: slot.id, maintenanceType: slot.maintenanceType },
    }));
  }

  private detectMaintenanceDue(candidate: FlightCandidate, aircraft: Aircraft): ScheduleConflict[] {
    const durationHours = Math.max(
      0,
      (candidate.heureArrivee.getTime() - candidate.heureDepart.getTime()) / 3_600_000,
    );
    const projected = aircraft.heuresDepuisDerniereMaintenance + durationHours;
    const remaining = aircraft.limiteHeuresMaintenance - projected;

    if (remaining <= 0) {
      return [{
        id: `MAINTENANCE_DUE:${candidate.numeroVol}:${aircraft.id}`,
        type: ScheduleConflictType.MAINTENANCE_DUE,
        severity: ConflictSeverity.HIGH,
        blocking: true,
        reason: `${aircraft.immatriculation} dépasserait sa limite de maintenance après ce vol.`,
        recommendation: 'Planifier une maintenance ou utiliser un autre appareil.',
        flightNumber: candidate.numeroVol,
        aircraftId: aircraft.id,
        aircraftRegistration: aircraft.immatriculation,
        metadata: { projectedHours: projected, limitHours: aircraft.limiteHeuresMaintenance },
      }];
    }

    if (remaining <= this.policy.maintenanceWarningHours) {
      return [{
        id: `MAINTENANCE_WARNING:${candidate.numeroVol}:${aircraft.id}`,
        type: ScheduleConflictType.MAINTENANCE_DUE,
        severity: ConflictSeverity.MEDIUM,
        blocking: false,
        reason: `${aircraft.immatriculation} ne disposerait plus que de ${remaining.toFixed(1)} h avant maintenance.`,
        recommendation: 'Anticiper l’immobilisation de maintenance.',
        flightNumber: candidate.numeroVol,
        aircraftId: aircraft.id,
        aircraftRegistration: aircraft.immatriculation,
      }];
    }

    return [];
  }

  private async detectCrewConflicts(): Promise<ScheduleConflict[]> {
    const assignments = await this.crewAssignmentRepository.find({
      relations: ['vol', 'utilisateur'],
    });
    const byUser = new Map<string, CrewAssignment[]>();

    for (const assignment of assignments) {
      if (assignment.vol.statut === FlightStatus.CANCELLED) continue;
      const list = byUser.get(assignment.utilisateurId) ?? [];
      list.push(assignment);
      byUser.set(assignment.utilisateurId, list);
    }

    const conflicts: ScheduleConflict[] = [];
    for (const [, userAssignments] of byUser) {
      userAssignments.sort((a, b) => a.vol.heureDepart.getTime() - b.vol.heureDepart.getTime());
      for (let i = 0; i < userAssignments.length - 1; i += 1) {
        const current = userAssignments[i];
        const next = userAssignments[i + 1];
        const gapHours = (next.vol.heureDepart.getTime() - current.vol.heureArrivee.getTime()) / 3_600_000;

        if (gapHours < 0) {
          conflicts.push({
            id: `CREW_OVERLAP:${current.id}:${next.id}`,
            type: ScheduleConflictType.CREW_OVERLAP,
            severity: ConflictSeverity.CRITICAL,
            blocking: true,
            reason: `${current.utilisateur.nom} est affecté simultanément à ${current.vol.numeroVol} et ${next.vol.numeroVol}.`,
            recommendation: 'Réaffecter un membre d’équipage.',
            flightId: current.vol.id,
            relatedFlightId: next.vol.id,
            flightNumber: current.vol.numeroVol,
            relatedFlightNumber: next.vol.numeroVol,
            metadata: { userId: current.utilisateurId },
          });
        } else if (gapHours < this.policy.minimumCrewRestHours) {
          conflicts.push({
            id: `CREW_REST:${current.id}:${next.id}`,
            type: ScheduleConflictType.CREW_REST,
            severity: ConflictSeverity.HIGH,
            blocking: true,
            reason: `${current.utilisateur.nom} dispose de ${gapHours.toFixed(1)} h de repos entre ${current.vol.numeroVol} et ${next.vol.numeroVol}.`,
            recommendation: `Respecter la politique de repos configurée (${this.policy.minimumCrewRestHours} h) ou réaffecter l'équipage.`,
            flightId: current.vol.id,
            relatedFlightId: next.vol.id,
            flightNumber: current.vol.numeroVol,
            relatedFlightNumber: next.vol.numeroVol,
            metadata: { userId: current.utilisateurId, gapHours },
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
      numeroVol: flight.numeroVol,
      aeroportDepart: flight.aeroportDepart,
      aeroportArrivee: flight.aeroportArrivee,
      heureDepart: flight.heureDepart,
      heureArrivee: flight.heureArrivee,
      avionId: flight.avionId,
    };
  }

  private candidateAsVirtualFlight(candidate: FlightCandidate, aircraft: Aircraft): Flight {
    return {
      id: `candidate:${candidate.numeroVol}`,
      numeroVol: candidate.numeroVol,
      aeroportDepart: candidate.aeroportDepart,
      aeroportEscale: null,
      dureeEscale: null,
      aeroportArrivee: candidate.aeroportArrivee,
      heureDepart: candidate.heureDepart,
      heureArrivee: candidate.heureArrivee,
      statut: FlightStatus.SCHEDULED,
      avionId: aircraft.id,
      avion: aircraft,
      affectationsEquipage: [],
      version: 0,
      creeA: new Date(0),
      misAJourA: new Date(0),
      supprimeA: null,
    };
  }

  private deduplicate(conflicts: ScheduleConflict[]): ScheduleConflict[] {
    const unique = new Map<string, ScheduleConflict>();
    for (const conflict of conflicts) unique.set(conflict.id, conflict);
    return [...unique.values()];
  }
}
