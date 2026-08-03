import { 
  Injectable, 
  NotFoundException, 
  BadRequestException, 
  ConflictException 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Flight } from './entities/flight.entity';
import { Aircraft } from '../fleet/entities/aircraft.entity';
import { CreateFlightDto } from './dto/create-flight.dto';
import { UpdateFlightDto } from './dto/update-flight.dto';

@Injectable()
export class FlightsService {
  constructor(
    @InjectRepository(Flight)
    private readonly flightsRepository: Repository<Flight>,

    @InjectRepository(Aircraft)
    private readonly aircraftRepository: Repository<Aircraft>,
  ) {}

  /**
   * 1. Récupérer tous les vols
   */
  async findAll(): Promise<Flight[]> {
    return this.flightsRepository.find({
      relations: ['avion', 'affectationsEquipage'],
      order: { heureDepart: 'ASC' },
    });
  }

  /**
   * 2. Récupérer un vol unique par son ID
   */
  async findOne(id: string): Promise<Flight> {
    const flight = await this.flightsRepository.findOne({
      where: { id },
      relations: ['avion', 'affectationsEquipage'],
    });

    if (!flight) {
      throw new NotFoundException(`Le vol avec l'ID "${id}" n'a pas été trouvé.`);
    }

    return flight;
  }

  /**
   * 3. Créer un vol avec contrôle d'intégrité et de conflit
   */
  async create(dto: CreateFlightDto): Promise<Flight> {
    const heureDepart = new Date(dto.heureDepart);
    const heureArrivee = new Date(dto.heureArrivee);

    if (heureArrivee <= heureDepart) {
      throw new BadRequestException("L'heure d'arrivée doit être postérieure à l'heure de départ.");
    }

    const existingFlight = await this.flightsRepository.findOne({
      where: { numeroVol: dto.numeroVol },
    });
    if (existingFlight) {
      throw new ConflictException(`Le numéro de vol "${dto.numeroVol}" existe déjà.`);
    }

    let aircraft: Aircraft | null = null;

    if (dto.avionId) {
      aircraft = await this.aircraftRepository.findOne({
        where: [{ id: dto.avionId }, { immatriculation: dto.avionId }],
      });

      if (!aircraft) {
        throw new NotFoundException(`Aucun appareil trouvé pour "${dto.avionId}".`);
      }

      // Vérification du chevauchement horaire
      const overlapCount = await this.flightsRepository
        .createQueryBuilder('f')
        .where('f.avionId = :aircraftId', { aircraftId: aircraft.id })
        .andWhere('f.statut != :cancelled', { cancelled: 'Cancelled' })
        .andWhere('f.heureDepart < :heureArrivee', { heureArrivee })
        .andWhere('f.heureArrivee > :heureDepart', { heureDepart })
        .getCount();

      if (overlapCount > 0) {
        throw new ConflictException(`L'appareil "${aircraft.immatriculation || aircraft.id}" est déjà en vol sur ce créneau.`);
      }
    }

    const flight = this.flightsRepository.create({
      numeroVol: dto.numeroVol,
      aeroportDepart: dto.aeroportDepart,
      aeroportArrivee: dto.aeroportArrivee,
      heureDepart,
      heureArrivee,
      statut: dto.statut || 'Scheduled',
      avion: aircraft || undefined,
    });

    return this.flightsRepository.save(flight);
  }

  /**
   * 4. Mettre à jour un vol
   */
  async update(id: string, updateFlightDto: UpdateFlightDto): Promise<Flight> {
    const flight = await this.findOne(id);

    if (updateFlightDto.avionId) {
      const aircraft = await this.aircraftRepository.findOne({
        where: [{ id: updateFlightDto.avionId }, { immatriculation: updateFlightDto.avionId }],
      });
      if (!aircraft) {
        throw new NotFoundException(`Appareil "${updateFlightDto.avionId}" non trouvé.`);
      }
      flight.avion = aircraft;
    }

    Object.assign(flight, {
      ...updateFlightDto,
      heureDepart: updateFlightDto.heureDepart ? new Date(updateFlightDto.heureDepart) : flight.heureDepart,
      heureArrivee: updateFlightDto.heureArrivee ? new Date(updateFlightDto.heureArrivee) : flight.heureArrivee,
    });

    return this.flightsRepository.save(flight);
  }

  /**
   * 5. Supprimer un vol
   */
  async remove(id: string): Promise<void> {
    const flight = await this.findOne(id);
    await this.flightsRepository.remove(flight);
  }

  /**
   * 6. Algorithme d'optimisation automatique et résolution des conflits
   */
  async runAutoOptimization(): Promise<{
    timestamp: Date;
    resolvedConflicts: number;
    unresolvedConflicts: number;
    details: any[];
  }> {
    const flights = await this.findAll();
    const allAircraft = await this.aircraftRepository.find();

    let resolvedCount = 0;
    let unresolvedCount = 0;
    const details: any[] = [];

    for (const flight of flights) {
      if (!flight.avion || flight.statut === 'Cancelled') continue;

      // Détection des chevauchements
      const hasConflict = flights.some(
        (other) =>
          other.id !== flight.id &&
          other.avion?.id === flight.avion?.id &&
          other.statut !== 'Cancelled' &&
          new Date(flight.heureDepart) < new Date(other.heureArrivee) &&
          new Date(flight.heureArrivee) > new Date(other.heureDepart),
      );

      if (hasConflict) {
        // Chercher un avion alternatif libre sur ce créneau
        const freeAircraft = allAircraft.find((candidate) => {
          const isBusy = flights.some(
            (f) =>
              f.id !== flight.id &&
              f.avion?.id === candidate.id &&
              f.statut !== 'Cancelled' &&
              new Date(flight.heureDepart) < new Date(f.heureArrivee) &&
              new Date(flight.heureArrivee) > new Date(f.heureDepart),
          );
          return !isBusy;
        });

        if (freeAircraft) {
          const oldAircraftId = flight.avion.id;
          flight.avion = freeAircraft;
          await this.flightsRepository.save(flight);

          resolvedCount++;
          details.push({
            flightNumber: flight.numeroVol,
            status: 'REASSIGNED',
            from: oldAircraftId,
            to: freeAircraft.id,
          });
        } else {
          unresolvedCount++;
          details.push({
            flightNumber: flight.numeroVol,
            status: 'UNRESOLVED',
            reason: 'Aucun appareil libre.',
          });
        }
      }
    }

    return {
      timestamp: new Date(),
      resolvedConflicts: resolvedCount,
      unresolvedConflicts: unresolvedCount,
      details,
    };
  }
}