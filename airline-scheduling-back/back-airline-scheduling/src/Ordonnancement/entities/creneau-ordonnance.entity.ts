import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToOne, JoinColumn } from 'typeorm';
import { LigneProduction } from './ligne-production.entity';
import { TacheProduction } from './tache-production.entity';

@Entity('creneaux_ordonnancement')
export class CreneauOrdonnance {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => LigneProduction, (ligne) => ligne.creneaux, { onDelete: 'CASCADE' })
  ligne!: LigneProduction;

  @OneToOne(() => TacheProduction, (tache) => tache.creneau, { onDelete: 'CASCADE' })
  @JoinColumn()
  tache!: TacheProduction;

  @Column('timestamp')
  dateDebut!: Date;

  @Column('timestamp')
  dateFin!: Date;

  @Column('int', { default: 1 })
  ordreSequence!: number;

  @CreateDateColumn()
  dateCreation!: Date;

  @UpdateDateColumn()
  dateModification!: Date;
}