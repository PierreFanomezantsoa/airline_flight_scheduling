import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Airport } from './airport.entity';
import { CreateAirportDto } from './create-airport.dto';

@Injectable()
export class AirportsService {
  constructor(
    @InjectRepository(Airport)
    private readonly airportRepository: Repository<Airport>,
  ) {}

  // Récupérer la liste complète ordonnée par code IATA
  async findAll(): Promise<Airport[]> {
    return this.airportRepository.find({ order: { iata: 'ASC' } });
  }

  // Trouver un aéroport par son code IATA
  async findOne(iata: string): Promise<Airport> {
    const airport = await this.airportRepository.findOneBy({ iata: iata.toUpperCase() });
    if (!airport) {
      throw new NotFoundException(`L'aéroport avec le code IATA ${iata.toUpperCase()} est introuvable.`);
    }
    return airport;
  }

  // Créer manuellement un aéroport
  async create(createAirportDto: CreateAirportDto): Promise<Airport> {
    const iataUpper = createAirportDto.iata.toUpperCase();
    const existing = await this.airportRepository.findOneBy({ iata: iataUpper });
    
    if (existing) {
      throw new ConflictException(`L'aéroport ${iataUpper} existe déjà.`);
    }

    const airport = this.airportRepository.create({
      ...createAirportDto,
      iata: iataUpper,
    });
    return this.airportRepository.save(airport);
  }
}