import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CrewAssignment } from '../../crew/entities/crew-assignment.entity';
import { UserAccountStatus } from '../enums/user-account-status.enum';
import { UserRole } from '../enums/user-role.enum';

@Entity('users')
@Index(['email'], { unique: true })
@Index(['accountStatus'])
@Index(['role'])
export class User {
  @PrimaryGeneratedColumn('uuid', { name: 'ref_user' })
  refUser!: string;

  @Column({ type: 'varchar', length: 180, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ name: 'user_name', type: 'varchar', length: 150 })
  userName!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CREW_MEMBER })
  role!: UserRole;

  @Column({ type: 'varchar', length: 50, default: 'Intermediate' })
  technicalLevel!: string;

  @Column({ type: 'varchar', length: 50, default: 'Intermediate' })
  professionalLevel!: string;

  /**
   * Administrative suspension is independent of initial approval.
   * An APPROVED account with isActive=false remains blocked.
   */
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /**
   * Approval lifecycle: PENDING -> APPROVED or REJECTED.
   * Public sign-ups always start in PENDING.
   */
  @Column({
    type: 'enum',
    enum: UserAccountStatus,
    default: UserAccountStatus.PENDING,
  })
  accountStatus!: UserAccountStatus;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'ref_user_approver', type: 'uuid', nullable: true })
  refUserApprover!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: 'ref_user_rejector', type: 'uuid', nullable: true })
  refUserRejector!: string | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => CrewAssignment, (assignment) => assignment.user)
  crewAssignments!: CrewAssignment[];
}
