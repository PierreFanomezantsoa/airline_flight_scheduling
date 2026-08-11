import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Aircraft } from './aircraft.entity';

@Entity('aircraft_types')
export class AircraftType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  nomModele!: string;

  @Column({ type: 'varchar', length: 80 })
  fabricant!: string;

  @Column({ type: 'int' })
  capaciteMax!: number;

  /** km/h */
  @Column({ type: 'double precision' })
  vitesseCroisiere!: number;

  /** km */
  @Column({ type: 'double precision' })
  autonomieMax!: number;

  /** Unité à définir dans votre référentiel métier, ex. kg/h ou L/h. */
  @Column({ type: 'double precision' })
  consommationCarburant!: number;

  @Column({ type: 'double precision' })
  intervalleMaintenanceHeures!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  creeA!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  misAJourA!: Date;

  @OneToMany(() => Aircraft, (aircraft) => aircraft.type)
  avions!: Aircraft[];
}
