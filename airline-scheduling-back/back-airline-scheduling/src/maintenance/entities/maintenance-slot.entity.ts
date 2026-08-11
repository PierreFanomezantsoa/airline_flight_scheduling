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
@Index(['aircraftId', 'startTime', 'endTime'])
@Index(['status', 'startTime'])
export class MaintenanceSlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  aircraftId!: string;

  @ManyToOne(() => Aircraft, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'aircraftId' })
  aircraft!: Aircraft;

  @Column({ type: 'enum', enum: MaintenanceType })
  maintenanceType!: MaintenanceType;

  @Column({
    type: 'enum',
    enum: MaintenanceStatus,
    default: MaintenanceStatus.PLANNED,
  })
  status!: MaintenanceStatus;

  @Column({ type: 'timestamptz' })
  startTime!: Date;

  @Column({ type: 'timestamptz' })
  endTime!: Date;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creeA!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  misAJourA!: Date;
}
