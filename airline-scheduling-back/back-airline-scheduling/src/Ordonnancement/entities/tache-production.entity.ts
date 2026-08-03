import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne } from 'typeorm';
import { CreneauOrdonnance } from './creneau-ordonnance.entity';

export enum StatutTache {
  EN_ATTENTE = 'EN_ATTENTE',
  PLANIFIE = 'PLANIFIE',
  EN_COURS = 'EN_COURS',
  TERMINE = 'TERMINE',
  ANNULE = 'ANNULE',
}

@Entity('taches_production')
export class TacheProduction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 50 })
  referenceCommande!: string;

  @Column({ length: 100 })
  nomProduit!: string;

  @Column('int')
  quantiteAProduire!: number;

  @Column('decimal', { precision: 6, scale: 2 })
  dureeEstimeeHeures!: number;

  @Column('date')
  dateLimite!: Date;

  @Column({
    type: 'enum',
    enum: StatutTache,
    default: StatutTache.EN_ATTENTE,
  })
  statut!: StatutTache;

  @OneToOne(() => CreneauOrdonnance, (creneau) => creneau.tache, { onDelete: 'CASCADE' })
  creneau!: CreneauOrdonnance;

  @CreateDateColumn()
  dateCreation!: Date;
}