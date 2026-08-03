import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique } from 'typeorm';
import { Flight } from './flight.entity';
import { User } from '../../users/entities/user.entity';

@Entity('crew_assignments')
@Unique(['vol', 'utilisateur']) // Évite d'affecter deux fois la même personne sur le même vol
export class CrewAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // CORRECTION : On pointe vers 'affectationsEquipage' et on renomme la propriete en 'vol'
  @ManyToOne(() => Flight, (flight) => flight.affectationsEquipage, { onDelete: 'CASCADE' })
  vol!: Flight;

  // CORRECTION : Adaptation en français sans accent pour l'utilisateur
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  utilisateur!: User;

  @Column({ type: 'double precision', default: 0.0 })
  heuresReposAvant!: number;
}