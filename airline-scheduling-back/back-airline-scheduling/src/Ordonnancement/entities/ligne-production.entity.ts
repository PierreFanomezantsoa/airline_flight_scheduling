import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { CreneauOrdonnance } from './creneau-ordonnance.entity';

@Entity('lignes_production')
export class LigneProduction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 100 })
  nom!: string;

  @Column({ length: 20, unique: true })
  code!: string;

  @Column('decimal', { precision: 10, scale: 2 })
  capaciteParHeure!: number;

  @Column({ default: true })
  estActif!: boolean;

  @OneToMany(() => CreneauOrdonnance, (creneau) => creneau.ligne)
  creneaux!: CreneauOrdonnance[];

  @CreateDateColumn()
  dateCreation!: Date;

  @UpdateDateColumn()
  dateModification!: Date;
}