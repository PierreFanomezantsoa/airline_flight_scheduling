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
    return this.airportRepository.find({ order: { iata: 'ASC' } });
  }

  async findOne(iata: string): Promise<Airport> {
    const code = normalizeIata(iata);
    const airport = await this.airportRepository.findOne({ where: { iata: code } });
    if (!airport) throw new NotFoundException(`Aéroport ${code} introuvable.`);
    return airport;
  }

  async assertExists(iata: string): Promise<void> {
    const airport = await this.findOne(iata);
    if (!airport.active) {
      throw new NotFoundException(`L'aéroport ${airport.iata} est inactif.`);
    }
  }

  async create(dto: CreateAirportDto): Promise<Airport> {
    const iata = normalizeIata(dto.iata);
    if (await this.airportRepository.exists({ where: { iata } })) {
      throw new ConflictException(`L'aéroport ${iata} existe déjà.`);
    }

    return this.airportRepository.save(
      this.airportRepository.create({
        iata,
        name: dto.name.trim(),
        timezone: dto.timezone.trim(),
        city: dto.city?.trim() ?? null,
        country: dto.country?.trim() ?? null,
      }),
    );
  }

  async update(iata: string, dto: UpdateAirportDto): Promise<Airport> {
    const airport = await this.findOne(iata);

    if (dto.name !== undefined) airport.name = dto.name.trim();
    if (dto.timezone !== undefined) airport.timezone = dto.timezone.trim();
    if (dto.city !== undefined) airport.city = dto.city?.trim() || null;
    if (dto.country !== undefined) airport.country = dto.country?.trim() || null;
    if (dto.active !== undefined) airport.active = dto.active;

    return this.airportRepository.save(airport);
  }

  async remove(iata: string): Promise<Airport> {
    const airport = await this.findOne(iata);
    airport.active = false;
    return this.airportRepository.save(airport);
  }
}
