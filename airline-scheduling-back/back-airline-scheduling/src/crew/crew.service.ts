import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulingPolicy } from '../common/constants/scheduling-policy';
import { FlightStatus } from '../common/enums/airline.enums';
import { Flight } from '../flights/entities/flight.entity';
import { User } from '../users/entities/user.entity';
import { CreateCrewAssignmentDto } from './dto/create-crew-assignment.dto';
import { UpdateCrewAssignmentDto } from './dto/update-crew-assignment.dto';
import { CrewAssignment } from './entities/crew-assignment.entity';

@Injectable()
export class CrewService {
  constructor(
    @InjectRepository(CrewAssignment)
    private readonly assignmentRepository: Repository<CrewAssignment>,
    @InjectRepository(Flight)
    private readonly flightRepository: Repository<Flight>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: CreateCrewAssignmentDto): Promise<CrewAssignment> {
    const flight = await this.getFlight(dto.volId);
    const user = await this.getUser(dto.utilisateurId);

    await this.assertNotDuplicate(flight.id, user.id);
    const restHours = await this.assertAvailability(user.id, flight);

    return this.assignmentRepository.save(
      this.assignmentRepository.create({
        volId: flight.id,
        vol: flight,
        utilisateurId: user.id,
        utilisateur: user,
        fonction: dto.fonction,
        heuresReposAvant: restHours,
      }),
    );
  }

  findAll(): Promise<CrewAssignment[]> {
    return this.assignmentRepository.find({
      relations: ['vol', 'utilisateur'],
      order: { volId: 'ASC' },
    });
  }

  async findOne(id: string): Promise<CrewAssignment> {
    const assignment = await this.assignmentRepository.findOne({
      where: { id },
      relations: ['vol', 'utilisateur'],
    });
    if (!assignment) throw new NotFoundException(`Affectation "${id}" introuvable.`);
    return assignment;
  }

  findByFlight(volId: string): Promise<CrewAssignment[]> {
    return this.assignmentRepository.find({
      where: { volId },
      relations: ['utilisateur'],
    });
  }

  findByUser(utilisateurId: string): Promise<CrewAssignment[]> {
    return this.assignmentRepository.find({
      where: { utilisateurId },
      relations: ['vol'],
    });
  }

  async update(id: string, dto: UpdateCrewAssignmentDto): Promise<CrewAssignment> {
    const assignment = await this.findOne(id);
    const flight = dto.volId ? await this.getFlight(dto.volId) : assignment.vol;
    const user = dto.utilisateurId ? await this.getUser(dto.utilisateurId) : assignment.utilisateur;

    if (flight.id !== assignment.volId || user.id !== assignment.utilisateurId) {
      await this.assertNotDuplicate(flight.id, user.id, id);
    }

    const restHours = await this.assertAvailability(user.id, flight, id);

    assignment.volId = flight.id;
    assignment.vol = flight;
    assignment.utilisateurId = user.id;
    assignment.utilisateur = user;
    assignment.heuresReposAvant = restHours;
    if (dto.fonction !== undefined) assignment.fonction = dto.fonction;

    return this.assignmentRepository.save(assignment);
  }

  async remove(id: string): Promise<{ deleted: true; id: string }> {
    const assignment = await this.findOne(id);
    await this.assignmentRepository.remove(assignment);
    return { deleted: true, id };
  }

  private async getFlight(id: string): Promise<Flight> {
    const flight = await this.flightRepository.findOne({ where: { id } });
    if (!flight) throw new NotFoundException(`Vol "${id}" introuvable.`);
    if (flight.statut === FlightStatus.CANCELLED) {
      throw new ConflictException('Impossible d’affecter un équipage à un vol annulé.');
    }
    return flight;
  }

  private async getUser(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user || !user.actif) throw new NotFoundException(`Utilisateur "${id}" introuvable ou inactif.`);
    return user;
  }

  private async assertNotDuplicate(volId: string, utilisateurId: string, excludeId?: string): Promise<void> {
    const qb = this.assignmentRepository
      .createQueryBuilder('assignment')
      .where('assignment.volId = :volId', { volId })
      .andWhere('assignment.utilisateurId = :utilisateurId', { utilisateurId });
    if (excludeId) qb.andWhere('assignment.id != :excludeId', { excludeId });
    if (await qb.getExists()) {
      throw new ConflictException('Ce membre d’équipage est déjà affecté à ce vol.');
    }
  }

  private async assertAvailability(
    utilisateurId: string,
    target: Flight,
    excludeAssignmentId?: string,
  ): Promise<number | null> {
    const qb = this.assignmentRepository
      .createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.vol', 'flight')
      .where('assignment.utilisateurId = :utilisateurId', { utilisateurId })
      .andWhere('flight.statut != :cancelled', { cancelled: FlightStatus.CANCELLED });

    if (excludeAssignmentId) {
      qb.andWhere('assignment.id != :excludeAssignmentId', { excludeAssignmentId });
    }

    const assignments = await qb.getMany();

    for (const assignment of assignments) {
      const other = assignment.vol;
      const overlap = target.heureDepart < other.heureArrivee && target.heureArrivee > other.heureDepart;
      if (overlap) {
        throw new ConflictException({
          code: 'CREW_OVERLAP',
          message: `Conflit équipage avec le vol ${other.numeroVol}.`,
          conflictingFlightId: other.id,
        });
      }
    }

    const previous = assignments
      .filter((a) => a.vol.heureArrivee <= target.heureDepart)
      .sort((a, b) => b.vol.heureArrivee.getTime() - a.vol.heureArrivee.getTime())[0];

    if (!previous) return null;

    const restHours = (target.heureDepart.getTime() - previous.vol.heureArrivee.getTime()) / 3_600_000;
    if (restHours < SchedulingPolicy.minimumCrewRestHours) {
      throw new ConflictException({
        code: 'CREW_REST',
        message: `Repos de ${restHours.toFixed(1)} h seulement; politique configurée: ${SchedulingPolicy.minimumCrewRestHours} h.`,
        previousFlightId: previous.vol.id,
      });
    }

    return Math.max(0, restHours);
  }
}
