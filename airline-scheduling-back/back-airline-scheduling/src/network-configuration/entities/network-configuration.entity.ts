import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('network_configuration')
export class NetworkConfiguration {
  @PrimaryColumn({ name: 'ref_network_configuration', type: 'varchar', length: 40 })
  refNetworkConfig!: string;

  @Column({ name: 'mediumHaulTurnaroundMinutes', type: 'integer', default: 45 })
  mediumTurnMins!: number;

  @Column({ name: 'longHaulTurnaroundMinutes', type: 'integer', default: 90 })
  longTurnMins!: number;

  @Column({ name: 'positioningBufferMinutes', type: 'integer', default: 180 })
  posBufferMins!: number;

  @Column({ name: 'minimumCrewRestHours', type: 'integer', default: 10 })
  minCrewRestHrs!: number;

  @Column({ name: 'maximumContinuousFlightHours', type: 'integer', default: 8 })
  maxContFlightHrs!: number;

  @Column({ name: 'maintenanceWarningHours', type: 'integer', default: 10 })
  maintWarnHrs!: number;

  /** Codes IATA des plateformes affichées comme hubs dans l'IHM. */
  @Column({ type: 'simple-json', nullable: false })
  hubIataCodes!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
