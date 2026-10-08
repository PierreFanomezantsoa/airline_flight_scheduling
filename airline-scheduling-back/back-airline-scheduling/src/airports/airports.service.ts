import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeIata } from '../common/utils/normalizers';
import { CreateAirportDto } from './dto/create-airport.dto';
import { UpdateAirportDto } from './dto/update-airport.dto';
import { Airport } from './entities/airport.entity';

@Injectable()
export class AirportsService {
  constructor(
    @InjectRepository(Airport)
    private readonly airportRepository: Repository<Airport>,
  ) {}

  findAll(): Promise<Airport[]> {
    return this.airportRepository.find({ order: { refAirport: 'ASC' } });
  }

  async findOne(refAirport: string): Promise<Airport> {
    const code = normalizeIata(refAirport);
    const airport = await this.airportRepository.findOne({ where: { refAirport: code } });
    if (!airport) throw new NotFoundException(`Aéroport ${code} introuvable.`);
    return airport;
  }

  async assertExists(refAirport: string): Promise<void> {
    const airport = await this.findOne(refAirport);
    if (!airport.active) {
      throw new NotFoundException(`L'aéroport ${airport.refAirport} est inactif.`);
    }
  }

  async create(dto: CreateAirportDto): Promise<Airport> {
    const refAirport = normalizeIata(dto.refAirport);
    if (await this.airportRepository.exists({ where: { refAirport } })) {
      throw new ConflictException(`L'aéroport ${refAirport} existe déjà.`);
    }

    return this.airportRepository.save(
      this.airportRepository.create({
        refAirport,
        name: dto.name.trim(),
        timezone: dto.timezone.trim(),
        city: dto.city?.trim() ?? null,
        country: dto.country?.trim() ?? null,
      }),
    );
  }

  async update(refAirport: string, dto: UpdateAirportDto): Promise<Airport> {
    const airport = await this.findOne(refAirport);

    if (dto.name !== undefined) airport.name = dto.name.trim();
    if (dto.timezone !== undefined) airport.timezone = dto.timezone.trim();
    if (dto.city !== undefined) airport.city = dto.city?.trim() || null;
    if (dto.country !== undefined) airport.country = dto.country?.trim() || null;
    if (dto.active !== undefined) airport.active = dto.active;

    return this.airportRepository.save(airport);
  }

  async remove(refAirport: string): Promise<Airport> {
    const airport = await this.findOne(refAirport);
    airport.active = false;
    return this.airportRepository.save(airport);
  }
}
