import {
  ConflictException,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulingPolicy } from '../common/constants/scheduling-policy';
import { NetworkConfigurationService } from '../network-configuration/network-configuration.service';
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
    @Optional()
    private readonly networkConfigurationService?: NetworkConfigurationService,
  ) {}

  private get minCrewRestHrs(): number {
    return (
      this.networkConfigurationService?.getPolicy().minCrewRestHrs ??
      SchedulingPolicy.minCrewRestHrs
    );
  }

  async create(dto: CreateCrewAssignmentDto): Promise<CrewAssignment> {
    const flight = await this.getFlight(dto.refFlight);
    const user = await this.getUser(dto.refUser);

    await this.assertNotDuplicate(flight.refFlight, user.refUser);
    const restHours = await this.assertAvailability(user.refUser, flight);

    return this.assignmentRepository.save(
      this.assignmentRepository.create({
        refFlight: flight.refFlight,
        flight: flight,
        refUser: user.refUser,
        user: user,
        crewRole: dto.crewRole,
        restBeforeHrs: restHours,
      }),
    );
  }

  findAll(): Promise<CrewAssignment[]> {
    return this.assignmentRepository.find({
      relations: ['flight', 'user'],
      order: { refFlight: 'ASC' },
    });
  }

  async findOne(id: string): Promise<CrewAssignment> {
    const assignment = await this.assignmentRepository.findOne({
      where: { refCrewAssign: id },
      relations: ['flight', 'user'],
    });
    if (!assignment) throw new NotFoundException(`Affectation "${id}" introuvable.`);
    return assignment;
  }

  findByFlight(refFlight: string): Promise<CrewAssignment[]> {
    return this.assignmentRepository.find({
      where: { refFlight },
      relations: ['user'],
    });
  }

  findByUser(refUser: string): Promise<CrewAssignment[]> {
    return this.assignmentRepository.find({
      where: { refUser },
      relations: ['flight'],
    });
  }

  async update(id: string, dto: UpdateCrewAssignmentDto): Promise<CrewAssignment> {
    const assignment = await this.findOne(id);
    const flight = dto.refFlight ? await this.getFlight(dto.refFlight) : assignment.flight;
    const user = dto.refUser ? await this.getUser(dto.refUser) : assignment.user;

    if (flight.refFlight !== assignment.refFlight || user.refUser !== assignment.refUser) {
      await this.assertNotDuplicate(flight.refFlight, user.refUser, id);
    }

    const restHours = await this.assertAvailability(user.refUser, flight, id);

    assignment.refFlight = flight.refFlight;
    assignment.flight = flight;
    assignment.refUser = user.refUser;
    assignment.user = user;
    assignment.restBeforeHrs = restHours;
    if (dto.crewRole !== undefined) assignment.crewRole = dto.crewRole;

    return this.assignmentRepository.save(assignment);
  }

  async remove(id: string): Promise<{ deleted: true; id: string }> {
    const assignment = await this.findOne(id);
    await this.assignmentRepository.remove(assignment);
    return { deleted: true, id };
  }

  private async getFlight(id: string): Promise<Flight> {
    const flight = await this.flightRepository.findOne({ where: { refFlight: id } });
    if (!flight) throw new NotFoundException(`Vol "${id}" introuvable.`);
    if (flight.flightStatus === FlightStatus.CANCELLED) {
      throw new ConflictException('Impossible d’affecter un équipage à un flight annulé.');
    }
    return flight;
  }

  private async getUser(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { refUser: id } });
    if (!user || !user.isActive) throw new NotFoundException(`Utilisateur "${id}" introuvable ou inactif.`);
    return user;
  }

  private async assertNotDuplicate(refFlight: string, refUser: string, excludeId?: string): Promise<void> {
    const qb = this.assignmentRepository
      .createQueryBuilder('assignment')
      .where('assignment.refFlight = :refFlight', { refFlight })
      .andWhere('assignment.refUser = :refUser', { refUser });
    if (excludeId) qb.andWhere('assignment.refCrewAssign != :excludeId', { excludeId });
    if (await qb.getExists()) {
      throw new ConflictException('Ce membre d’équipage est déjà affecté à ce flight.');
    }
  }

  private async assertAvailability(
    refUser: string,
    target: Flight,
    excludeAssignmentId?: string,
  ): Promise<number | null> {
    const qb = this.assignmentRepository
      .createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.flight', 'flight')
      .where('assignment.refUser = :refUser', { refUser })
      .andWhere('flight.flightStatus != :cancelled', { cancelled: FlightStatus.CANCELLED });

    if (excludeAssignmentId) {
      qb.andWhere('assignment.refCrewAssign != :excludeAssignmentId', { excludeAssignmentId });
    }

    const assignments = await qb.getMany();

    for (const assignment of assignments) {
      const other = assignment.flight;
      const overlap = target.departureTime < other.arrivalTime && target.arrivalTime > other.departureTime;
      if (overlap) {
        throw new ConflictException({
          code: 'CREW_OVERLAP',
          message: `Conflit équipage avec le flight ${other.flightNumber}.`,
          conflictingFlightId: other.refFlight,
        });
      }
    }

    const previous = assignments
      .filter((a) => a.flight.arrivalTime <= target.departureTime)
      .sort((a, b) => b.flight.arrivalTime.getTime() - a.flight.arrivalTime.getTime())[0];

    if (!previous) return null;

    const restHours = (target.departureTime.getTime() - previous.flight.arrivalTime.getTime()) / 3_600_000;
    if (restHours < this.minCrewRestHrs) {
      throw new ConflictException({
        code: 'CREW_REST',
        message: `Repos de ${restHours.toFixed(1)} h seulement; politique configurée: ${this.minCrewRestHrs} h.`,
        previousFlightId: previous.flight.refFlight,
      });
    }

    return Math.max(0, restHours);
  }
}
