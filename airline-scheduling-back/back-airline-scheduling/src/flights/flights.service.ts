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
        'aircraft',
        'aircraft.aircraftType',
        'crewAssignments',
        'crewAssignments.user',
      ],
      order: { departureTime: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Flight> {
    const flight = await this.flightRepository.findOne({
      where: { refFlight: id },
      relations: [
        'aircraft',
        'aircraft.aircraftType',
        'crewAssignments',
        'crewAssignments.user',
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
      candidate.flightNumber,
      candidate.departureTime,
    );

    const validation = await this.schedulingService.validateCandidate(candidate);
    if (!validation.valid) {
      throw new ConflictException({
        code: 'FLIGHT_SCHEDULING_CONFLICT',
        message: 'Le flight ne peut pas être planifié avec les ressources proposées.',
        conflicts: validation.conflicts,
      });
    }

    const aircraft = candidate.refAircraft
      ? await this.fleetService.findOne(candidate.refAircraft)
      : null;

    const savedFlightId = await this.dataSource.transaction(async (manager) => {
      const flight = manager.create(Flight, {
        flightNumber: candidate.flightNumber,
        departureAirportCode: candidate.departureAirportCode,
        stopoverAirportCodes: dto.stopoverAirportCodes
          ? this.normalizeStopovers(dto.stopoverAirportCodes)
          : null,
        stopoverDurationMinutes: dto.stopoverDurationMinutes ?? null,
        arrivalAirportCode: candidate.arrivalAirportCode,
        departureTime: candidate.departureTime,
        arrivalTime: candidate.arrivalTime,
        status: dto.status ?? FlightStatus.SCHEDULED,
        refAircraft: aircraft?.refAircraft ?? null,
        flightHoursRecorded: false,
        creditedFlightHours: null,
        flightHoursRecordedAt: null,
      });

      const saved = await manager.save(Flight, flight);

      await this.creditFlightHoursIfEligible(manager, saved);

      return saved.refFlight;
    });

    return this.findOne(savedFlightId);
  }

  async update(id: string, dto: UpdateFlightDto): Promise<Flight> {
    const flight = await this.findOne(id);

    const candidate = {
      flightNumber: normalizeFlightNumber(dto.flightNumber ?? flight.flightNumber),
      departureAirportCode: normalizeIata(
        dto.departureAirportCode ?? flight.departureAirportCode,
      ),
      arrivalAirportCode: normalizeIata(
        dto.arrivalAirportCode ?? flight.arrivalAirportCode,
      ),
      departureTime: dto.departureTime
        ? new Date(dto.departureTime)
        : flight.departureTime,
      arrivalTime: dto.arrivalTime
        ? new Date(dto.arrivalTime)
        : flight.arrivalTime,
      refAircraft: dto.refAircraft === undefined ? flight.refAircraft : dto.refAircraft,
      stopoverDurationMinutes:
        dto.stopoverDurationMinutes === undefined ? flight.stopoverDurationMinutes : dto.stopoverDurationMinutes,
    };

    await this.validateAirports(
      candidate.departureAirportCode,
      candidate.arrivalAirportCode,
      dto.stopoverAirportCodes ?? flight.stopoverAirportCodes,
    );

    await this.assertUniqueOccurrence(
      candidate.flightNumber,
      candidate.departureTime,
      id,
    );

    const targetStatus = dto.status ?? flight.status;
    this.assertCreditedFlightIsNotRewritten(flight, candidate, targetStatus);

    /*
     * Un flight déjà effectué n'est plus une ressource à replanifier.
     * On autorise uniquement les corrections administratives qui ne changent
     * ni l'appareil, ni les horaires, ni le status terminé.
     */
    if (!flight.flightHoursRecorded) {
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

    const aircraft = candidate.refAircraft
      ? await this.fleetService.findOne(candidate.refAircraft)
      : null;

    await this.dataSource.transaction(async (manager) => {
      const lockedFlight = await this.findOneForUpdate(manager, id);

      lockedFlight.flightNumber = candidate.flightNumber;
      lockedFlight.departureAirportCode = candidate.departureAirportCode;
      lockedFlight.arrivalAirportCode = candidate.arrivalAirportCode;
      lockedFlight.departureTime = candidate.departureTime;
      lockedFlight.arrivalTime = candidate.arrivalTime;
      lockedFlight.refAircraft = aircraft?.refAircraft ?? null;

      if (dto.status !== undefined) {
        lockedFlight.status = dto.status;
      }

      if (dto.stopoverAirportCodes !== undefined) {
        lockedFlight.stopoverAirportCodes = dto.stopoverAirportCodes
          ? this.normalizeStopovers(dto.stopoverAirportCodes)
          : null;
      }

      if (dto.stopoverDurationMinutes !== undefined) {
        lockedFlight.stopoverDurationMinutes = dto.stopoverDurationMinutes;
      }

      await manager.save(Flight, lockedFlight);
      await this.creditFlightHoursIfEligible(manager, lockedFlight);
    });

    return this.findOne(id);
  }

  /**
   * Termine explicitement un flight et crédite ses heures à l'appareil.
   *
   * Sécurités :
   * - un flight annulé ne peut pas être terminé ;
   * - un flight dont l'heure d'arrivée n'est pas encore atteinte ne peut pas
   *   alimenter le compteur réel ;
   * - l'opération est idempotente grâce à flightHoursRecorded.
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

      const wasAlreadyCredited = flight.flightHoursRecorded;

      if (!this.isCompletedStatus(flight.status)) {
        flight.status = FlightStatus.EFFECTUE;
        await manager.save(Flight, flight);
      }

      await this.creditFlightHoursIfEligible(
        manager,
        flight,
        referenceTime,
      );

      return !wasAlreadyCredited && flight.flightHoursRecorded;
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
        'flight.refFlight',
        'flight.status',
        'flight.flightHoursRecorded',
        'flight.arrivalTime',
      ])
      .where('flight.arrivalTime <= :now', { now })
      .andWhere('flight.status != :cancelled', {
        cancelled: FlightStatus.CANCELLED,
      })
      .andWhere(
        `(flight.status NOT IN (:...completedStatuses)
          OR flight.flightHoursRecorded = FALSE)`,
        {
          completedStatuses: [
            FlightStatus.COMPLETED,
            FlightStatus.EFFECTUE,
          ],
        },
      )
      .orderBy('flight.arrivalTime', 'ASC')
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
        const creditedNow = await this.completeAt(candidate.refFlight, now);
        result.completed += 1;

        if (creditedNow) {
          result.credited += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error: unknown) {
        result.errors.push({
          refFlight: candidate.refFlight,
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

    if (flight.flightHoursRecorded) {
      throw new ConflictException({
        code: 'FLIGHT_HOURS_ALREADY_CREDITED',
        message:
          'Ce flight a déjà alimenté le compteur d’heures de l’appareil. ' +
          'Il ne peut pas être supprimé sans opération de régularisation.',
        creditedHours: flight.creditedFlightHours,
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
      flightNumber: normalizeFlightNumber(dto.flightNumber),
      departureAirportCode: normalizeIata(dto.departureAirportCode),
      arrivalAirportCode: normalizeIata(dto.arrivalAirportCode),
      departureTime: new Date(dto.departureTime),
      arrivalTime: new Date(dto.arrivalTime),
      refAircraft: dto.refAircraft ?? null,
      dureeEscaleMinutes: dto.stopoverDurationMinutes ?? 0,
    };

    await this.validateAirports(
      candidate.departureAirportCode,
      candidate.arrivalAirportCode,
      dto.stopoverAirportCodes,
    );

    return candidate;
  }

  private async creditFlightHoursIfEligible(
    manager: EntityManager,
    flight: Flight,
    referenceTime = new Date(),
  ): Promise<void> {
    if (!this.isCompletedStatus(flight.status)) {
      return;
    }

    if (flight.flightHoursRecorded) {
      return;
    }

    /*
     * Un status « Effectué » ne suffit pas à lui seul : l'heure d'arrivée
     * doit réellement être atteinte. Cela empêche un status saisi par erreur
     * sur un flight futur d'augmenter les compteurs de cellule/maintenance.
     */
    this.assertFlightCanBeCompleted(flight, referenceTime);

    if (!flight.refAircraft) {
      throw new ConflictException({
        code: 'COMPLETED_FLIGHT_WITHOUT_AIRCRAFT',
        message:
          'Impossible de comptabiliser les heures : aucun appareil n’est affecté au flight.',
        refFlight: flight.refFlight,
      });
    }

    const flightHours = this.calculateFlightHours(flight);

    await this.fleetService.addFlightHours(
      flight.refAircraft,
      flightHours,
      manager,
    );

    flight.flightHoursRecorded = true;
    flight.creditedFlightHours = flightHours;
    flight.flightHoursRecordedAt = new Date();

    await manager.save(Flight, flight);
  }

  private assertFlightCanBeCompleted(
    flight: Flight,
    referenceTime: Date,
  ): void {
    if (flight.status === FlightStatus.CANCELLED) {
      throw new ConflictException({
        code: 'CANCELLED_FLIGHT_CANNOT_BE_COMPLETED',
        message: 'Un flight annulé ne peut pas être déclaré effectué.',
        refFlight: flight.refFlight,
      });
    }

    if (Number.isNaN(flight.arrivalTime.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_FLIGHT_ARRIVAL_TIME',
        message: "L'heure d'arrivée du flight est invalide.",
        refFlight: flight.refFlight,
      });
    }

    if (flight.arrivalTime.getTime() > referenceTime.getTime()) {
      throw new ConflictException({
        code: 'FLIGHT_NOT_FINISHED',
        message:
          "Les heures ne peuvent être comptabilisées qu'après l'heure réelle d'arrivée du flight.",
        refFlight: flight.refFlight,
        arrivalTime: flight.arrivalTime.toISOString(),
        referenceTime: referenceTime.toISOString(),
      });
    }
  }

  private calculateFlightHours(flight: Flight): number {
    const elapsedHours =
      (flight.arrivalTime.getTime() - flight.departureTime.getTime()) /
      3_600_000;

    const layoverHours = Math.max(0, Number(flight.stopoverDurationMinutes || 0)) / 60;
    const airborneHours = elapsedHours - layoverHours;

    if (!Number.isFinite(airborneHours) || airborneHours <= 0) {
      throw new BadRequestException(
        'La durée réellement flightée doit être strictement positive.',
      );
    }

    // Les escales sont du temps au sol : elles ne doivent pas augmenter
    // les heures de flight de la cellule. Précision 1/1000 h (~3,6 secondes).
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
      departureTime: Date;
      arrivalTime: Date;
      refAircraft: string | null;
    },
    targetStatus: FlightStatus,
  ): void {
    if (!flight.flightHoursRecorded) {
      return;
    }

    const accountingBasisChanged =
      flight.refAircraft !== candidate.refAircraft ||
      flight.departureTime.getTime() !== candidate.departureTime.getTime() ||
      flight.arrivalTime.getTime() !== candidate.arrivalTime.getTime();

    if (accountingBasisChanged || !this.isCompletedStatus(targetStatus)) {
      throw new ConflictException({
        code: 'CREDITED_FLIGHT_IMMUTABLE',
        message:
          'Les heures de ce flight ont déjà été comptabilisées. ' +
          'L’appareil, les horaires et le status terminé ne peuvent plus être modifiés directement.',
        creditedHours: flight.creditedFlightHours,
      });
    }
  }

  private async findOneForUpdate(
    manager: EntityManager,
    id: string,
  ): Promise<Flight> {
    const flight = await manager.findOne(Flight, {
      where: { refFlight: id },
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
      ...this.parseStopovers(stopovers).map((refAirport) =>
        this.airportsService.assertExists(refAirport),
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
    flightNumber: string,
    departureTime: Date,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.flightRepository
      .createQueryBuilder('flight')
      .where('flight.flightNumber = :flightNumber', { flightNumber })
      .andWhere('flight.departureTime = :departureTime', { departureTime });

    if (excludeId) {
      qb.andWhere('flight.refFlight != :excludeId', { excludeId });
    }

    if (await qb.getExists()) {
      throw new ConflictException(
        `Le flight ${flightNumber} existe déjà à cette date/heure.`,
      );
    }
  }
}
