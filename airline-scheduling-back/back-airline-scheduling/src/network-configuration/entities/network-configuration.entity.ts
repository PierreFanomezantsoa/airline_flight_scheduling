import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('network_configuration')
export class NetworkConfiguration {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  @Column({ type: 'integer', default: 45 })
  mediumHaulTurnaroundMinutes!: number;

  @Column({ type: 'integer', default: 90 })
  longHaulTurnaroundMinutes!: number;

  @Column({ type: 'integer', default: 180 })
  positioningBufferMinutes!: number;

  @Column({ type: 'integer', default: 10 })
  minimumCrewRestHours!: number;

  @Column({ type: 'integer', default: 8 })
  maximumContinuousFlightHours!: number;

  @Column({ type: 'integer', default: 10 })
  maintenanceWarningHours!: number;

  /** Codes IATA des plateformes affichées comme hubs dans l'IHM. */
  @Column({ type: 'simple-json', nullable: false })
  hubIataCodes!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
