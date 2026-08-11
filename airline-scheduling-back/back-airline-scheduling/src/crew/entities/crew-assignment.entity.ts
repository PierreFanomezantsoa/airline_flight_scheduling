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
@Unique(['volId', 'utilisateurId'])
@Index(['volId'])
@Index(['utilisateurId'])
export class CrewAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  volId!: string;

  @ManyToOne(() => Flight, (flight) => flight.affectationsEquipage, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'volId' })
  vol!: Flight;

  @Column({ type: 'uuid' })
  utilisateurId!: string;

  @ManyToOne(() => User, (user) => user.affectationsEquipage, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'utilisateurId' })
  utilisateur!: User;

  @Column({ type: 'enum', enum: CrewRole, default: CrewRole.OTHER })
  fonction!: CrewRole;

  @Column({ type: 'double precision', nullable: true })
  heuresReposAvant!: number | null;
}
