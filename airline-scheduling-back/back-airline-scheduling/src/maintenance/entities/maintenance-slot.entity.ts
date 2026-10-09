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
import {
  MaintenanceStatus,
  MaintenanceType,
} from '../../common/enums/airline.enums';
import { Aircraft } from '../../fleet/entities/aircraft.entity';

@Entity('maintenance_slots')
@Index(['refAircraft', 'startTime', 'endTime'])
@Index(['maintStatus', 'startTime'])
// Index used by the scheduled job that closes maintenance slots.
@Index(['maintStatus', 'autoCloseAt'])
export class MaintenanceSlot {
  @PrimaryGeneratedColumn('uuid', { name: 'ref_maintenance_slot' })
  refMaintSlot!: string;

  @Column({ name: 'ref_aircraft', type: 'uuid' })
  refAircraft!: string;

  @ManyToOne(() => Aircraft, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ref_aircraft' })
  aircraft!: Aircraft;

  @Column({ name: 'maintenanceType', type: 'enum', enum: MaintenanceType })
  maintType!: MaintenanceType;

  @Column({
    name: 'maintenance_status',
    type: 'enum',
    enum: MaintenanceStatus,
    default: MaintenanceStatus.PLANNED,
  })
  maintStatus!: MaintenanceStatus;

  @Column({ type: 'timestamptz' })
  startTime!: Date;

  @Column({ type: 'timestamptz' })
  endTime!: Date;

  @Column({ type: 'text', nullable: true })
  description!: string | null;
  @Column({ name: 'pendingReviewSince', type: 'timestamptz', nullable: true })
  reviewPendingAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  autoCloseAt!: Date | null;
  @Column({ type: 'int', default: 0 })
  extensionCount!: number;
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}