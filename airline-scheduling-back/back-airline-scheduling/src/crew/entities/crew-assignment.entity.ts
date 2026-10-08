import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CrewRole } from '../../common/enums/airline.enums';
import { Flight } from '../../flights/entities/flight.entity';
import { User } from '../../users/entities/user.entity';

@Entity('crew_assignments')
@Unique(['refFlight', 'refUser'])
@Index(['refFlight'])
@Index(['refUser'])
export class CrewAssignment {
  @PrimaryGeneratedColumn('uuid', { name: 'ref_crew_assignment' })
  refCrewAssignment!: string;

  @Column({ name: 'ref_flight', type: 'uuid' })
  refFlight!: string;

  @ManyToOne(() => Flight, (flight) => flight.crewAssignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ref_flight' })
  flight!: Flight;

  @Column({ name: 'ref_user', type: 'uuid' })
  refUser!: string;

  @ManyToOne(() => User, (user) => user.crewAssignments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'ref_user' })
  user!: User;

  @Column({ type: 'enum', enum: CrewRole, default: CrewRole.OTHER })
  crewRole!: CrewRole;

  @Column({ type: 'double precision', nullable: true })
  priorRestHours!: number | null;
}
