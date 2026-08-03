import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, Index } from 'typeorm';
import { Aircraft } from '../../fleet/entities/aircraft.entity';
import { CrewAssignment } from './crew-assignment.entity';

@Entity('flights')
@Index(['avion', 'heureDepart', 'heureArrivee']) // Index PostgreSQL pour optimiser le Gantt
export class Flight {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  numeroVol!: string;

  @Column({ type: 'varchar', length: 10 })
  aeroportDepart!: string;

  @Column({ type: 'varchar', length: 10 })
  aeroportArrivee!: string;

  @Column({ type: 'timestamp with time zone' })
  heureDepart!: Date;

  @Column({ type: 'timestamp with time zone' })
  heureArrivee!: Date;

  @Column({
    type: 'enum',
    enum: ['Scheduled', 'Delayed', 'Cancelled', 'In-Flight','Effectué'],
    default: 'Scheduled',
  })
  statut!: 'Scheduled' | 'Delayed' | 'Cancelled' | 'In-Flight' | 'Effectué';

  // CORRECTION: La relation est maintenant unidirectionnelle (sans le second argument)
  @ManyToOne(() => Aircraft, { nullable: true, onDelete: 'SET NULL' })
  avion!: Aircraft;

  @OneToMany(() => CrewAssignment, (assignment) => assignment.vol)
  affectationsEquipage!: CrewAssignment[];
}