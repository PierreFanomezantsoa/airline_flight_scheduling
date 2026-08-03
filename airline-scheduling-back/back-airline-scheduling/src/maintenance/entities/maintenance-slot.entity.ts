import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Aircraft } from '../../fleet/entities/aircraft.entity';

@Entity('maintenance_slots')
@Index(['aircraftId', 'startTime', 'endTime']) 
export class MaintenanceSlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // AJUSTEMENT CRUCIAL : On place la colonne physique AVANT la relation
  @Column({ type: 'uuid' }) // On spécifie explicitement le type 'uuid' pour correspondre à l'appareil
  aircraftId!: string;

  // La relation vient se greffer par-dessus la colonne physique déclarée plus haut
  @ManyToOne(() => Aircraft, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'aircraftId' }) 
  aircraft!: Aircraft;

  @Column({
    type: 'enum',
    enum: ['Type A', 'Type C', 'Aircraft On Ground'],
  })
  maintenanceType!: 'Type A' | 'Type C' | 'Aircraft On Ground';

  @Column({ type: 'timestamp with time zone' })
  startTime!: Date;

  @Column({ type: 'timestamp with time zone' })
  endTime!: Date;

  @Column({ type: 'text', nullable: true })
  description!: string;
}