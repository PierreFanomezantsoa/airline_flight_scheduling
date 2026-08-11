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
import { UserRole } from '../enums/user-role.enum';

@Entity('users')
@Index(['email'], { unique: true })
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

  @Column({ type: 'boolean', default: true })
  actif!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  creeA!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  misAJourA!: Date;

  @OneToMany(() => CrewAssignment, (assignment) => assignment.utilisateur)
  affectationsEquipage!: CrewAssignment[];
}
