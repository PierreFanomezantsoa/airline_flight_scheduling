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
  refCrewAssign!: string;

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

  @Column({ name: 'priorRestHours', type: 'double precision', nullable: true })
  restBeforeHrs!: number | null;


  @Column({
    name: 'notification_status',
    type: 'varchar',
    length: 16,
    default: 'PENDING',
  })
  notificationStatus!: 'PENDING' | 'SENT' | 'FAILED' | 'DISABLED';

  @Column({ name: 'assignment_notified_at', type: 'timestamptz', nullable: true })
  assignmentNotifiedAt!: Date | null;

  @Column({ name: 'reminder_2h_sent_at', type: 'timestamptz', nullable: true })
  reminder2hSentAt!: Date | null;

  @Column({ name: 'reminder_1h_sent_at', type: 'timestamptz', nullable: true })
  reminder1hSentAt!: Date | null;

  @Column({ name: 'last_notification_error', type: 'varchar', length: 500, nullable: true })
  lastNotificationError!: string | null;
}
