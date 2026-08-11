import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeIata } from '../common/utils/normalizers';
import { CreateAirportDto } from './dto/create-airport.dto';
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
    await this.findOne(iata);
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
}
