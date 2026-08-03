import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { CrewAssignment } from '../../flights/entities/crew-assignment.entity';

// Definition de l'enum avec toutes les valeurs demandees
export enum UserRole {
  ADMIN = 'Admin',
  PLANIFICATEUR = 'Planificateur',
  REGULATOR = 'Regulator',
  CREW_MEMBER = 'Crew_Member',
  MAINTENANCE_ENGINEER = 'Maintenance_Engineer',
  PRODUCT_OWNER = 'Product_Owner',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255 })
  motDePasse?: string;

  @Column({ type: 'varchar', length: 150 })
  nom!: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.CREW_MEMBER, // Optionnel : valeur par defaut si besoin
  })
  role!: UserRole;

  @Column({ type: 'varchar', length: 50, default: 'Intermediate' })
  niveauTechnique!: string;

  @Column({ type: 'varchar', length: 50, default: 'Expert' })
  niveauMetier!: string;

  @OneToMany(() => CrewAssignment, (assignment) => assignment.utilisateur)
  affectationsEquipage!: CrewAssignment[];
}