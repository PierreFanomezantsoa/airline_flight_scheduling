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
@Index(['flightStatus'])
export class Flight {
  @PrimaryGeneratedColumn('uuid', { name: 'ref_flight' })
  refFlight!: string;

  @Column({ type: 'varchar', length: 20 })
  flightNumber!: string;

  @Column({ name: 'departureAirportCode', type: 'varchar', length: 3 })
  depAirportCode!: string;

  /** Codes IATA des escales, séparés par des virgules. */
  @Column({ name: 'stopoverAirportCodes', type: 'varchar', length: 100, nullable: true })
  stopoverCodes!: string | null;

  @Column({ name: 'stopoverDurationMinutes', type: 'integer', nullable: true })
  stopoverMins!: number | null;

  @Column({ name: 'arrivalAirportCode', type: 'varchar', length: 3 })
  arrAirportCode!: string;

  @Column({ type: 'timestamptz' })
  departureTime!: Date;

  @Column({ type: 'timestamptz' })
  arrivalTime!: Date;

  @Column({
    name: 'flight_status',
    type: 'enum',
    enum: FlightStatus,
    default: FlightStatus.SCHEDULED,
  })
  flightStatus!: FlightStatus;

  @Column({ name: 'ref_aircraft', type: 'uuid', nullable: true })
  refAircraft!: string | null;

  @ManyToOne(() => Aircraft, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ref_aircraft' })
  aircraft!: Aircraft | null;

  /**
   * Empêche de créditer plusieurs fois les mêmes heures de flight.
   * La valeur passe à true uniquement lorsque le flight est réellement terminé.
   */
  @Column({ name: 'flightHoursRecorded', type: 'boolean', default: false })
  hoursRecorded!: boolean;

  /** Nombre d'heures effectivement créditées à l'appareil pour ce flight. */
  @Column({ name: 'creditedFlightHours', type: 'double precision', nullable: true })
  creditedHours!: number | null;

  /** Date de l'écriture des heures dans le compteur de flotte. */
  @Column({ name: 'flightHoursRecordedAt', type: 'timestamptz', nullable: true })
  hoursRecordedAt!: Date | null;

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
