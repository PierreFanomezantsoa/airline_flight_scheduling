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
  @PrimaryGeneratedColumn('uuid', { name: 'ref_aircraft_type' })
  refAircraftType!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  modelName!: string;

  @Column({ type: 'varchar', length: 80 })
  manufacturer!: string;

  @Column({ type: 'int' })
  maxCapacity!: number;

  /** km/h */
  @Column({ type: 'double precision' })
  cruiseSpeed!: number;

  /** km */
  @Column({ type: 'double precision' })
  maxRange!: number;

  /** Unité à définir dans votre référentiel métier, ex. kg/h ou L/h. */
  @Column({ type: 'double precision' })
  fuelConsumption!: number;

  @Column({ name: 'maintenanceIntervalHours', type: 'double precision' })
  maintIntervalHrs!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Aircraft, (aircraft) => aircraft.aircraftType)
  aircraft!: Aircraft[];
}
