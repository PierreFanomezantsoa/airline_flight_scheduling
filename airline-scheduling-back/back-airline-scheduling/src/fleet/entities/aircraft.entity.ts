import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AircraftStatus } from '../../common/enums/airline.enums';
import { AircraftType } from './aircraft-type.entity';

@Entity('aircrafts')
@Index(['registration'], { unique: true })
@Index(['aircraftStatus'])
@Index(['homeBase'])
@Index(['refAircraftType'])
export class Aircraft {
  @PrimaryGeneratedColumn('uuid', { name: 'ref_aircraft' })
  refAircraft!: string;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  registration!: string | null;

  /** Readable model copy, synchronized with aircraftType.modelName when linked. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  model!: string | null;

  @Column({ type: 'int' })
  capacity!: number;

  @Column({ type: 'double precision', default: 0 })
  totalFlightHours!: number;

  @Column({ type: 'double precision' })
  maintenanceHoursLimit!: number;

  @Column({ type: 'double precision', default: 0 })
  hoursSinceMaintenance!: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastMaintenanceAt!: Date | null;

  @Column({
    name: 'aircraft_status',
    type: 'enum',
    enum: AircraftStatus,
    default: AircraftStatus.ACTIVE,
  })
  aircraftStatus!: AircraftStatus;

  @Column({ type: 'varchar', length: 3, nullable: true })
  homeBase!: string | null;

  @Column({ name: 'ref_aircraft_type', type: 'uuid', nullable: true })
  refAircraftType!: string | null;

  @ManyToOne(() => AircraftType, (aircraftType) => aircraftType.aircraft, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'ref_aircraft_type' })
  aircraftType!: AircraftType | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
