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
@Index(['immatriculation'], { unique: true })
@Index(['statut'])
@Index(['baseAttache'])
@Index(['typeId'])
export class Aircraft {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  immatriculation!: string;

  /** Copie lisible du modèle, synchronisée avec type.nomModele si typeId existe. */
  @Column({ type: 'varchar', length: 100 })
  modele!: string;

  @Column({ type: 'int' })
  capacite!: number;

  @Column({ type: 'double precision', default: 0 })
  heuresDeVolTotales!: number;

  @Column({ type: 'double precision' })
  limiteHeuresMaintenance!: number;

  @Column({ type: 'double precision', default: 0 })
  heuresDepuisDerniereMaintenance!: number;

  @Column({ type: 'timestamptz', nullable: true })
  dateDerniereMaintenance!: Date | null;

  @Column({ type: 'enum', enum: AircraftStatus, default: AircraftStatus.ACTIVE })
  statut!: AircraftStatus;

  @Column({ type: 'varchar', length: 3, nullable: true })
  baseAttache!: string | null;

  @Column({ type: 'uuid', nullable: true })
  typeId!: string | null;

  @ManyToOne(() => AircraftType, (type) => type.avions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'typeId' })
  type!: AircraftType | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creeA!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  misAJourA!: Date;
}
