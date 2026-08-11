import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AirportsService } from '../airports/airports.service';
import { FlightStatus } from '../common/enums/airline.enums';
import { normalizeFlightNumber, normalizeIata } from '../common/utils/normalizers';
import { FleetService } from '../fleet/fleet.service';
import { AircraftAvailabilityQueryDto } from '../scheduling/dto/aircraft-availability-query.dto';
import { SchedulingService } from '../scheduling/services/scheduling.service';
import { CreateFlightDto } from './dto/create-flight.dto';
import { UpdateFlightDto } from './dto/update-flight.dto';
import { Flight } from './entities/flight.entity';

@Injectable()
export class FlightsService {
  constructor(
    @InjectRepository(Flight)
    private readonly flightRepository: Repository<Flight>,
    private readonly airportsService: AirportsService,
    private readonly fleetService: FleetService,
    private readonly schedulingService: SchedulingService,
  ) {}

  findAll(): Promise<Flight[]> {
    return this.flightRepository.find({
      relations: ['avion', 'avion.type', 'affectationsEquipage', 'affectationsEquipage.utilisateur'],
      order: { heureDepart: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Flight> {
    const flight = await this.flightRepository.findOne({
      where: { id },
      relations: ['avion', 'avion.type', 'affectationsEquipage', 'affectationsEquipage.utilisateur'],
    });
    if (!flight) throw new NotFoundException(`Vol "${id}" introuvable.`);
    return flight;
  }

  async create(dto: CreateFlightDto): Promise<Flight> {
    const candidate = await this.prepareCandidate(dto);
    await this.assertUniqueOccurrence(candidate.numeroVol, candidate.heureDepart);

    const validation = await this.schedulingService.validateCandidate(candidate);
    if (!validation.valid) {
      throw new ConflictException({
        code: 'FLIGHT_SCHEDULING_CONFLICT',
        message: 'Le vol ne peut pas être planifié avec les ressources proposées.',
        conflicts: validation.conflicts,
      });
    }

    const aircraft = candidate.avionId ? await this.fleetService.findOne(candidate.avionId) : null;

    const flight = this.flightRepository.create({
      numeroVol: candidate.numeroVol,
      aeroportDepart: candidate.aeroportDepart,
      aeroportEscale: dto.aeroportEscale ? this.normalizeStopovers(dto.aeroportEscale) : null,
      dureeEscale: dto.dureeEscale ?? null,
      aeroportArrivee: candidate.aeroportArrivee,
      heureDepart: candidate.heureDepart,
      heureArrivee: candidate.heureArrivee,
      statut: dto.statut ?? FlightStatus.SCHEDULED,
      avionId: aircraft?.id ?? null,
      avion: aircraft,
    });

    return this.flightRepository.save(flight);
  }

  async update(id: string, dto: UpdateFlightDto): Promise<Flight> {
    const flight = await this.findOne(id);

    const candidate = {
      numeroVol: normalizeFlightNumber(dto.numeroVol ?? flight.numeroVol),
      aeroportDepart: normalizeIata(dto.aeroportDepart ?? flight.aeroportDepart),
      aeroportArrivee: normalizeIata(dto.aeroportArrivee ?? flight.aeroportArrivee),
      heureDepart: dto.heureDepart ? new Date(dto.heureDepart) : flight.heureDepart,
      heureArrivee: dto.heureArrivee ? new Date(dto.heureArrivee) : flight.heureArrivee,
      avionId: dto.avionId === undefined ? flight.avionId : dto.avionId,
    };

    await this.validateAirports(candidate.aeroportDepart, candidate.aeroportArrivee, dto.aeroportEscale ?? flight.aeroportEscale);
    await this.assertUniqueOccurrence(candidate.numeroVol, candidate.heureDepart, id);

    const validation = await this.schedulingService.validateCandidate(candidate, id);
    if (!validation.valid) {
      throw new ConflictException({
        code: 'FLIGHT_SCHEDULING_CONFLICT',
        message: 'La modification crée un conflit opérationnel.',
        conflicts: validation.conflicts,
      });
    }

    const aircraft = candidate.avionId ? await this.fleetService.findOne(candidate.avionId) : null;

    flight.numeroVol = candidate.numeroVol;
    flight.aeroportDepart = candidate.aeroportDepart;
    flight.aeroportArrivee = candidate.aeroportArrivee;
    flight.heureDepart = candidate.heureDepart;
    flight.heureArrivee = candidate.heureArrivee;
    flight.avionId = aircraft?.id ?? null;
    flight.avion = aircraft;
    if (dto.statut !== undefined) flight.statut = dto.statut;
    if (dto.aeroportEscale !== undefined) flight.aeroportEscale = dto.aeroportEscale ? this.normalizeStopovers(dto.aeroportEscale) : null;
    if (dto.dureeEscale !== undefined) flight.dureeEscale = dto.dureeEscale;

    return this.flightRepository.save(flight);
  }

  async remove(id: string): Promise<void> {
    const flight = await this.findOne(id);
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
    };

    await this.validateAirports(candidate.aeroportDepart, candidate.aeroportArrivee, dto.aeroportEscale);
    return candidate;
  }

  private async validateAirports(departure: string, arrival: string, stopovers?: string | null): Promise<void> {
    await Promise.all([
      this.airportsService.assertExists(departure),
      this.airportsService.assertExists(arrival),
      ...this.parseStopovers(stopovers).map((iata) => this.airportsService.assertExists(iata)),
    ]);
  }

  private parseStopovers(value?: string | null): string[] {
    if (!value) return [];
    return value.split(',').map(normalizeIata).filter(Boolean);
  }

  private normalizeStopovers(value: string): string {
    return this.parseStopovers(value).join(',');
  }

  private async assertUniqueOccurrence(numeroVol: string, heureDepart: Date, excludeId?: string): Promise<void> {
    const qb = this.flightRepository
      .createQueryBuilder('flight')
      .where('flight.numeroVol = :numeroVol', { numeroVol })
      .andWhere('flight.heureDepart = :heureDepart', { heureDepart });
    if (excludeId) qb.andWhere('flight.id != :excludeId', { excludeId });
    if (await qb.getExists()) {
      throw new ConflictException(`Le vol ${numeroVol} existe déjà à cette date/heure.`);
    }
  }
}
