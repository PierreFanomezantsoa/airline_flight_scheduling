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
@Index(['numeroVol', 'heureDepart'], { unique: true })
@Index(['avionId', 'heureDepart', 'heureArrivee'])
@Index(['heureDepart'])
@Index(['statut'])
export class Flight {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  numeroVol!: string;

  @Column({ type: 'varchar', length: 3 })
  aeroportDepart!: string;

  /** Codes IATA séparés par virgule pour compatibilité avec l'IHM actuelle. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  aeroportEscale!: string | null;

  @Column({ type: 'integer', nullable: true })
  dureeEscale!: number | null;

  @Column({ type: 'varchar', length: 3 })
  aeroportArrivee!: string;

  @Column({ type: 'timestamptz' })
  heureDepart!: Date;

  @Column({ type: 'timestamptz' })
  heureArrivee!: Date;

  @Column({ type: 'enum', enum: FlightStatus, default: FlightStatus.SCHEDULED })
  statut!: FlightStatus;

  @Column({ type: 'uuid', nullable: true })
  avionId!: string | null;

  @ManyToOne(() => Aircraft, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'avionId' })
  avion!: Aircraft | null;

  /**
   * Empêche de créditer plusieurs fois les mêmes heures de vol.
   * La valeur passe à true uniquement lorsque le vol est réellement terminé.
   */
  @Column({ type: 'boolean', default: false })
  heuresComptabilisees!: boolean;

  /** Nombre d'heures effectivement créditées à l'appareil pour ce vol. */
  @Column({ type: 'double precision', nullable: true })
  heuresCreditees!: number | null;

  /** Date de l'écriture des heures dans le compteur de flotte. */
  @Column({ type: 'timestamptz', nullable: true })
  heuresComptabiliseesAt!: Date | null;

  @OneToMany(() => CrewAssignment, (assignment) => assignment.vol)
  affectationsEquipage!: CrewAssignment[];

  @VersionColumn({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  creeA!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  misAJourA!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  supprimeA!: Date | null;
}
