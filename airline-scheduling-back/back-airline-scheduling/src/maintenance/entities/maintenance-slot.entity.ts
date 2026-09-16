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
// ⭐ NOUVEAU : index pour le cron qui cherche les créneaux à clôturer
@Index(['status', 'autoCloseAt'])
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

  // ─────────────────────────────────────────────────────────────
  // ⭐ NOUVELLES COLONNES — fenêtre de décision 12 h
  // ─────────────────────────────────────────────────────────────

  /**
   * Date à laquelle le créneau est passé en PENDING_REVIEW
   * (c'est-à-dire quand endTime a été atteint).
   *
   * Sert de point de départ pour la fenêtre de 12 h.
   */
  @Column({ type: 'timestamptz', nullable: true })
  pendingReviewSince!: Date | null;

  /**
   * Date limite avant auto-clôture du créneau.
   *
   * Calculée automatiquement = pendingReviewSince + 12 h.
   * Quand le cron détecte que autoCloseAt <= now :
   *   - le créneau passe en COMPLETED ;
   *   - l'avion repasse en ACTIVE.
   */
  @Column({ type: 'timestamptz', nullable: true })
  autoCloseAt!: Date | null;

  /**
   * Nombre de prolongations effectuées sur ce créneau.
   * Utilisé pour l'audit et l'affichage.
   */
  @Column({ type: 'int', default: 0 })
  extensionCount!: number;

  // ─────────────────────────────────────────────────────────────

  @CreateDateColumn({ type: 'timestamptz' })
  creeA!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  misAJourA!: Date;
}