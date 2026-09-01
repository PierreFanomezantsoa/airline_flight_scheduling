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
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 180, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, select: false })
  motDePasse!: string;

  @Column({ type: 'varchar', length: 150 })
  nom!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CREW_MEMBER })
  role!: UserRole;

  @Column({ type: 'varchar', length: 50, default: 'Intermediate' })
  niveauTechnique!: string;

  @Column({ type: 'varchar', length: 50, default: 'Intermediate' })
  niveauMetier!: string;

  /**
   * Suspension administrative indépendante de la validation initiale.
   * Un compte APPROVED mais actif=false reste bloqué.
   */
  @Column({ type: 'boolean', default: true })
  actif!: boolean;

  /**
   * Cycle de validation : PENDING -> APPROVED ou REJECTED.
   * Les inscriptions publiques sont toujours créées en PENDING.
   */
  @Column({
    type: 'enum',
    enum: UserAccountStatus,
    default: UserAccountStatus.PENDING,
  })
  accountStatus!: UserAccountStatus;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  rejectedBy!: string | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creeA!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  misAJourA!: Date;

  @OneToMany(() => CrewAssignment, (assignment) => assignment.utilisateur)
  affectationsEquipage!: CrewAssignment[];
}
