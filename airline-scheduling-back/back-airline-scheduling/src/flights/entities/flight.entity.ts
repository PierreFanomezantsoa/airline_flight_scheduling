import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { FlightStatus } from '../../common/enums/airline.enums';
import { CrewAssignment } from '../../crew/entities/crew-assignment.entity';
import { Aircraft } from '../../fleet/entities/aircraft.entity';

@Entity('flights')
@Index(['flightNumber', 'departureTime'], { unique: true })
@Index(['refAircraft', 'departureTime', 'arrivalTime'])
@Index(['departureTime'])
@Index(['status'])
export class Flight {
  @PrimaryGeneratedColumn('uuid', { name: 'ref_flight' })
  refFlight!: string;

  @Column({ type: 'varchar', length: 20 })
  flightNumber!: string;

  @Column({ type: 'varchar', length: 3 })
  departureAirportCode!: string;

  /** Comma-separated IATA codes for compatibility with the current UI. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  stopoverAirportCodes!: string | null;

  @Column({ type: 'integer', nullable: true })
  stopoverDurationMinutes!: number | null;

  @Column({ type: 'varchar', length: 3 })
  arrivalAirportCode!: string;

  @Column({ type: 'timestamptz' })
  departureTime!: Date;

  @Column({ type: 'timestamptz' })
  arrivalTime!: Date;

  @Column({ type: 'enum', enum: FlightStatus, default: FlightStatus.SCHEDULED })
  status!: FlightStatus;

  @Column({ name: 'ref_aircraft', type: 'uuid', nullable: true })
  refAircraft!: string | null;

  @ManyToOne(() => Aircraft, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ref_aircraft' })
  aircraft!: Aircraft | null;

  /**
   * Empêche de créditer plusieurs fois les mêmes heures de flight.
   * La valeur passe à true uniquement lorsque le flight est réellement terminé.
   */
  @Column({ type: 'boolean', default: false })
  flightHoursRecorded!: boolean;

  /** Nombre d'heures effectivement créditées à l'appareil pour ce flight. */
  @Column({ type: 'double precision', nullable: true })
  creditedFlightHours!: number | null;

  /** Date de l'écriture des heures dans le compteur de flotte. */
  @Column({ type: 'timestamptz', nullable: true })
  flightHoursRecordedAt!: Date | null;

  @OneToMany(() => CrewAssignment, (assignment) => assignment.flight)
  crewAssignments!: CrewAssignment[];

  @VersionColumn({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
