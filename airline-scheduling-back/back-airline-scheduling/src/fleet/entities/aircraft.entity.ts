import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index } from 'typeorm';
import { AircraftType } from './aircraft-type.entity';

@Entity('aircrafts')
@Index(['immatriculation'])
@Index(['type'])
export class Aircraft {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  immatriculation!: string;

  @Column({ type: 'varchar', length: 100 })
  modele!: string;

  @Column({ type: 'int' })
  capacite!: number;

  @Column({ type: 'double precision', default: 0.0 })
  heuresDeVolTotales!: number;

  @Column({ type: 'double precision' })
  limiteHeuresMaintenance!: number;

  @Column({ type: 'varchar', length: 50, default: 'Active' })
  statut!: 'Active' | 'Maintenance' | 'Out of Service' | 'Retired';

  @Column({ type: 'timestamp with time zone', nullable: true })
  dateDerniereMaintenance!: Date | null;

  @Column({ type: 'double precision', default: 0.0 })
  heuresDepuisDerniereMaintenance!: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  baseAttache!: string | null;

  @Column({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  creeA!: Date;

  @Column({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  misAJourA!: Date;

  @ManyToOne(() => AircraftType, (type) => type.avions, { nullable: true })
  type!: AircraftType | null;
}