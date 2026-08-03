import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('airports')
export class Airport {
  @PrimaryColumn({ type: 'varchar', length: 3 })
  iata!: string; // ex: TNR, CDG

  @Column({ type: 'varchar', length: 100 })
  name!: string; // ex: Antananarivo (Ivato)

  @Column({ type: 'varchar', length: 50 })
  timezone!: string; // ex: Indian/Antananarivo
}