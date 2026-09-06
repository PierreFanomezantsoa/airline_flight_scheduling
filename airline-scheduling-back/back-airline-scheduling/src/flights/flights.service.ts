import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AirportsService } from '../airports/airports.service';
import { FlightStatus } from '../common/enums/airline.enums';
import { normalizeFlightNumber, normalizeIata } from '../common/utils/normalizers';
import { FleetService } from '../fleet/fleet.service';
import { AircraftAvailabilityQueryDto } from '../scheduling/dto/aircraft-availability-query.dto';
import { SchedulingService } from '../scheduling/services/scheduling.service';
import { CreateFlightDto } from './dto/create-flight.dto';
import { UpdateFlightDto } from './dto/update-flight.dto';
import { Flight } from './entities/flight.entity';
import type { CompletedFlightsSyncResult } from './interfaces/completed-flights-sync-result.interface';

@Injectable()
export class FlightsService {
  constructor(
    @InjectRepository(Flight)
    private readonly flightRepository: Repository<Flight>,
    private readonly airportsService: AirportsService,
    private readonly fleetService: FleetService,
    private readonly schedulingService: SchedulingService,
    private readonly dataSource: DataSource,
  ) {}

  findAll(): Promise<Flight[]> {
    return this.flightRepository.find({
      relations: [
        'avion',
        'avion.type',
        'affectationsEquipage',
        'affectationsEquipage.utilisateur',
      ],
      order: { heureDepart: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Flight> {
    const flight = await this.flightRepository.findOne({
      where: { id },
      relations: [
        'avion',
        'avion.type',
        'affectationsEquipage',
        'affectationsEquipage.utilisateur',
      ],
    });

    if (!flight) {
      throw new NotFoundException(`Vol "${id}" introuvable.`);
    }

    return flight;
  }

  async create(dto: CreateFlightDto): Promise<Flight> {
    const candidate = await this.prepareCandidate(dto);
    await this.assertUniqueOccurrence(
      candidate.numeroVol,
      candidate.heureDepart,
    );

    const validation = await this.schedulingService.validateCandidate(candidate);
    if (!validation.valid) {
      throw new ConflictException({
        code: 'FLIGHT_SCHEDULING_CONFLICT',
        message: 'Le vol ne peut pas être planifié avec les ressources proposées.',
        conflicts: validation.conflicts,
      });
    }

    const aircraft = candidate.avionId
      ? await this.fleetService.findOne(candidate.avionId)
      : null;

    const savedFlightId = await this.dataSource.transaction(async (manager) => {
      const flight = manager.create(Flight, {
        numeroVol: candidate.numeroVol,
        aeroportDepart: candidate.aeroportDepart,
        aeroportEscale: dto.aeroportEscale
          ? this.normalizeStopovers(dto.aeroportEscale)
          : null,
        dureeEscale: dto.dureeEscale ?? null,
        aeroportArrivee: candidate.aeroportArrivee,
        heureDepart: candidate.heureDepart,
        heureArrivee: candidate.heureArrivee,
        statut: dto.statut ?? FlightStatus.SCHEDULED,
        avionId: aircraft?.id ?? null,
        heuresComptabilisees: false,
        heuresCreditees: null,
        heuresComptabiliseesAt: null,
      });

      const saved = await manager.save(Flight, flight);

      await this.creditFlightHoursIfEligible(manager, saved);

      return saved.id;
    });

    return this.findOne(savedFlightId);
  }

  async update(id: string, dto: UpdateFlightDto): Promise<Flight> {
    const flight = await this.findOne(id);

    const candidate = {
      numeroVol: normalizeFlightNumber(dto.numeroVol ?? flight.numeroVol),
      aeroportDepart: normalizeIata(
        dto.aeroportDepart ?? flight.aeroportDepart,
      ),
      aeroportArrivee: normalizeIata(
        dto.aeroportArrivee ?? flight.aeroportArrivee,
      ),
      heureDepart: dto.heureDepart
        ? new Date(dto.heureDepart)
        : flight.heureDepart,
      heureArrivee: dto.heureArrivee
        ? new Date(dto.heureArrivee)
        : flight.heureArrivee,
      avionId: dto.avionId === undefined ? flight.avionId : dto.avionId,
      dureeEscaleMinutes:
        dto.dureeEscale === undefined ? flight.dureeEscale : dto.dureeEscale,
    };

    await this.validateAirports(
      candidate.aeroportDepart,
      candidate.aeroportArrivee,
      dto.aeroportEscale ?? flight.aeroportEscale,
    );

    await this.assertUniqueOccurrence(
      candidate.numeroVol,
      candidate.heureDepart,
      id,
    );

    const targetStatus = dto.statut ?? flight.statut;
    this.assertCreditedFlightIsNotRewritten(flight, candidate, targetStatus);

    /*
     * Un vol déjà effectué n'est plus une ressource à replanifier.
     * On autorise uniquement les corrections administratives qui ne changent
     * ni l'appareil, ni les horaires, ni le statut terminé.
     */
    if (!flight.heuresComptabilisees) {
      const validation = await this.schedulingService.validateCandidate(
        candidate,
        id,
      );

      if (!validation.valid) {
        throw new ConflictException({
          code: 'FLIGHT_SCHEDULING_CONFLICT',
          message: 'La modification crée un conflit opérationnel.',
          conflicts: validation.conflicts,
        });
      }
    }

    const aircraft = candidate.avionId
      ? await this.fleetService.findOne(candidate.avionId)
      : null;

    await this.dataSource.transaction(async (manager) => {
      const lockedFlight = await this.findOneForUpdate(manager, id);

      lockedFlight.numeroVol = candidate.numeroVol;
      lockedFlight.aeroportDepart = candidate.aeroportDepart;
      lockedFlight.aeroportArrivee = candidate.aeroportArrivee;
      lockedFlight.heureDepart = candidate.heureDepart;
      lockedFlight.heureArrivee = candidate.heureArrivee;
      lockedFlight.avionId = aircraft?.id ?? null;

      if (dto.statut !== undefined) {
        lockedFlight.statut = dto.statut;
      }

      if (dto.aeroportEscale !== undefined) {
        lockedFlight.aeroportEscale = dto.aeroportEscale
          ? this.normalizeStopovers(dto.aeroportEscale)
          : null;
      }

      if (dto.dureeEscale !== undefined) {
        lockedFlight.dureeEscale = dto.dureeEscale;
      }

      await manager.save(Flight, lockedFlight);
      await this.creditFlightHoursIfEligible(manager, lockedFlight);
    });

    return this.findOne(id);
  }

  /**
   * Termine explicitement un vol et crédite ses heures à l'appareil.
   *
   * Sécurités :
   * - un vol annulé ne peut pas être terminé ;
   * - un vol dont l'heure d'arrivée n'est pas encore atteinte ne peut pas
   *   alimenter le compteur réel ;
   * - l'opération est idempotente grâce à heuresComptabilisees.
   */
  async complete(id: string): Promise<Flight> {
    await this.completeAt(id, new Date());
    return this.findOne(id);
  }

  /**
   * Version interne utilisée aussi par la synchronisation batch.
   * Retourne true uniquement si CET appel a réellement crédité les heures.
   */
  private async completeAt(
    id: string,
    referenceTime: Date,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const flight = await this.findOneForUpdate(manager, id);

      this.assertFlightCanBeCompleted(flight, referenceTime);

      const wasAlreadyCredited = flight.heuresComptabilisees;

      if (!this.isCompletedStatus(flight.statut)) {
        flight.statut = FlightStatus.EFFECTUE;
        await manager.save(Flight, flight);
      }

      await this.creditFlightHoursIfEligible(
        manager,
        flight,
        referenceTime,
      );

      return !wasAlreadyCredited && flight.heuresComptabilisees;
    });
  }

  /**
   * Synchronise les vols dont l'heure d'arrivée est déjà dépassée.
   * Utile depuis une tâche planifiée, un bouton d'administration ou Cloud Scheduler.
   *
   * Les vols annulés sont ignorés. Les heures déjà comptabilisées ne sont jamais
   * ajoutées une seconde fois.
   */
  async syncCompletedFlights(
    now = new Date(),
  ): Promise<CompletedFlightsSyncResult> {
    const candidates = await this.flightRepository
      .createQueryBuilder('flight')
      .select([
        'flight.id',
        'flight.statut',
        'flight.heuresComptabilisees',
        'flight.heureArrivee',
      ])
      .where('flight.heureArrivee <= :now', { now })
      .andWhere('flight.statut != :cancelled', {
        cancelled: FlightStatus.CANCELLED,
      })
      .andWhere(
        `(flight.statut NOT IN (:...completedStatuses)
          OR flight.heuresComptabilisees = FALSE)`,
        {
          completedStatuses: [
            FlightStatus.COMPLETED,
            FlightStatus.EFFECTUE,
          ],
        },
      )
      .orderBy('flight.heureArrivee', 'ASC')
      .getMany();

    const result: CompletedFlightsSyncResult = {
      scanned: candidates.length,
      completed: 0,
      credited: 0,
      skipped: 0,
      errors: [],
    };

    for (const candidate of candidates) {
      try {
        const creditedNow = await this.completeAt(candidate.id, now);
        result.completed += 1;

        if (creditedNow) {
          result.credited += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error: unknown) {
        result.errors.push({
          flightId: candidate.id,
          message:
            error instanceof Error
              ? error.message
              : 'Erreur inconnue pendant la synchronisation.',
        });
      }
    }

    return result;
  }

  async remove(id: string): Promise<void> {
    const flight = await this.findOne(id);

    if (flight.heuresComptabilisees) {
      throw new ConflictException({
        code: 'FLIGHT_HOURS_ALREADY_CREDITED',
        message:
          'Ce vol a déjà alimenté le compteur d’heures de l’appareil. ' +
          'Il ne peut pas être supprimé sans opération de régularisation.',
        creditedHours: flight.heuresCreditees,
      });
    }

    await this.flightRepository.softRemove(flight);
  }

  detectConflicts() {
    return this.schedulingService.detectAll();
  }

  optimize() {
    return this.schedulingService.optimize();
  }

  availableAircraft(query: AircraftAvailabilityQueryDto) {
    return this.schedulingService.findAvailableAircraft(query);
  }

  async validate(dto: CreateFlightDto) {
    const candidate = await this.prepareCandidate(dto);
    return this.schedulingService.validateCandidate(candidate);
  }

  private async prepareCandidate(dto: CreateFlightDto) {
    const candidate = {
      numeroVol: normalizeFlightNumber(dto.numeroVol),
      aeroportDepart: normalizeIata(dto.aeroportDepart),
      aeroportArrivee: normalizeIata(dto.aeroportArrivee),
      heureDepart: new Date(dto.heureDepart),
      heureArrivee: new Date(dto.heureArrivee),
      avionId: dto.avionId ?? null,
      dureeEscaleMinutes: dto.dureeEscale ?? 0,
    };

    await this.validateAirports(
      candidate.aeroportDepart,
      candidate.aeroportArrivee,
      dto.aeroportEscale,
    );

    return candidate;
  }

  private async creditFlightHoursIfEligible(
    manager: EntityManager,
    flight: Flight,
    referenceTime = new Date(),
  ): Promise<void> {
    if (!this.isCompletedStatus(flight.statut)) {
      return;
    }

    if (flight.heuresComptabilisees) {
      return;
    }

    /*
     * Un statut « Effectué » ne suffit pas à lui seul : l'heure d'arrivée
     * doit réellement être atteinte. Cela empêche un statut saisi par erreur
     * sur un vol futur d'augmenter les compteurs de cellule/maintenance.
     */
    this.assertFlightCanBeCompleted(flight, referenceTime);

    if (!flight.avionId) {
      throw new ConflictException({
        code: 'COMPLETED_FLIGHT_WITHOUT_AIRCRAFT',
        message:
          'Impossible de comptabiliser les heures : aucun appareil n’est affecté au vol.',
        flightId: flight.id,
      });
    }

    const flightHours = this.calculateFlightHours(flight);

    await this.fleetService.addFlightHours(
      flight.avionId,
      flightHours,
      manager,
    );

    flight.heuresComptabilisees = true;
    flight.heuresCreditees = flightHours;
    flight.heuresComptabiliseesAt = new Date();

    await manager.save(Flight, flight);
  }

  private assertFlightCanBeCompleted(
    flight: Flight,
    referenceTime: Date,
  ): void {
    if (flight.statut === FlightStatus.CANCELLED) {
      throw new ConflictException({
        code: 'CANCELLED_FLIGHT_CANNOT_BE_COMPLETED',
        message: 'Un vol annulé ne peut pas être déclaré effectué.',
        flightId: flight.id,
      });
    }

    if (Number.isNaN(flight.heureArrivee.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_FLIGHT_ARRIVAL_TIME',
        message: "L'heure d'arrivée du vol est invalide.",
        flightId: flight.id,
      });
    }

    if (flight.heureArrivee.getTime() > referenceTime.getTime()) {
      throw new ConflictException({
        code: 'FLIGHT_NOT_FINISHED',
        message:
          "Les heures ne peuvent être comptabilisées qu'après l'heure réelle d'arrivée du vol.",
        flightId: flight.id,
        arrivalTime: flight.heureArrivee.toISOString(),
        referenceTime: referenceTime.toISOString(),
      });
    }
  }

  private calculateFlightHours(flight: Flight): number {
    const elapsedHours =
      (flight.heureArrivee.getTime() - flight.heureDepart.getTime()) /
      3_600_000;

    const layoverHours = Math.max(0, Number(flight.dureeEscale || 0)) / 60;
    const airborneHours = elapsedHours - layoverHours;

    if (!Number.isFinite(airborneHours) || airborneHours <= 0) {
      throw new BadRequestException(
        'La durée réellement volée doit être strictement positive.',
      );
    }

    // Les escales sont du temps au sol : elles ne doivent pas augmenter
    // les heures de vol de la cellule. Précision 1/1000 h (~3,6 secondes).
    return Math.round(airborneHours * 1000) / 1000;
  }

  private isCompletedStatus(status: FlightStatus): boolean {
    return (
      status === FlightStatus.COMPLETED ||
      status === FlightStatus.EFFECTUE
    );
  }

  private assertCreditedFlightIsNotRewritten(
    flight: Flight,
    candidate: {
      heureDepart: Date;
      heureArrivee: Date;
      avionId: string | null;
    },
    targetStatus: FlightStatus,
  ): void {
    if (!flight.heuresComptabilisees) {
      return;
    }

    const accountingBasisChanged =
      flight.avionId !== candidate.avionId ||
      flight.heureDepart.getTime() !== candidate.heureDepart.getTime() ||
      flight.heureArrivee.getTime() !== candidate.heureArrivee.getTime();

    if (accountingBasisChanged || !this.isCompletedStatus(targetStatus)) {
      throw new ConflictException({
        code: 'CREDITED_FLIGHT_IMMUTABLE',
        message:
          'Les heures de ce vol ont déjà été comptabilisées. ' +
          'L’appareil, les horaires et le statut terminé ne peuvent plus être modifiés directement.',
        creditedHours: flight.heuresCreditees,
      });
    }
  }

  private async findOneForUpdate(
    manager: EntityManager,
    id: string,
  ): Promise<Flight> {
    const flight = await manager.findOne(Flight, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });

    if (!flight) {
      throw new NotFoundException(`Vol "${id}" introuvable.`);
    }

    return flight;
  }

  private async validateAirports(
    departure: string,
    arrival: string,
    stopovers?: string | null,
  ): Promise<void> {
    await Promise.all([
      this.airportsService.assertExists(departure),
      this.airportsService.assertExists(arrival),
      ...this.parseStopovers(stopovers).map((iata) =>
        this.airportsService.assertExists(iata),
      ),
    ]);
  }

  private parseStopovers(value?: string | null): string[] {
    if (!value) {
      return [];
    }

    return value
      .split(',')
      .map(normalizeIata)
      .filter(Boolean);
  }

  private normalizeStopovers(value: string): string {
    return this.parseStopovers(value).join(',');
  }

  private async assertUniqueOccurrence(
    numeroVol: string,
    heureDepart: Date,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.flightRepository
      .createQueryBuilder('flight')
      .where('flight.numeroVol = :numeroVol', { numeroVol })
      .andWhere('flight.heureDepart = :heureDepart', { heureDepart });

    if (excludeId) {
      qb.andWhere('flight.id != :excludeId', { excludeId });
    }

    if (await qb.getExists()) {
      throw new ConflictException(
        `Le vol ${numeroVol} existe déjà à cette date/heure.`,
      );
    }
  }
}
