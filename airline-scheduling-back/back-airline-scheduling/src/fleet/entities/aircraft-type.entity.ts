import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Aircraft } from './aircraft.entity';

@Entity('aircraft_types')
export class AircraftType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  nomModele!: string;

  @Column({ type: 'varchar', length: 50 })
  fabricant!: string;

  @Column({ type: 'int' })
  capaciteMax!: number;

  @Column({ type: 'double precision' })
  vitesseCroisiere!: number;

  @Column({ type: 'double precision' })
  autonomieMax!: number;

  @Column({ type: 'double precision' })
  consommationCarburant!: number;

  @Column({ type: 'double precision' })
  intervalleMaintenanceHeures!: number;

  @Column({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  creeA!: Date;

  @Column({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  misAJourA!: Date;

  @OneToMany(() => Aircraft, (aircraft) => aircraft.type)
  avions!: Aircraft[];
}