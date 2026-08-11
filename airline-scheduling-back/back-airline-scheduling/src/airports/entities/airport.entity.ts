import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('airports')
export class Airport {
  @PrimaryColumn({ type: 'varchar', length: 3 })
  iata!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** Fuseau IANA, ex. Indian/Antananarivo, Europe/Paris. */
  @Column({ type: 'varchar', length: 80 })
  timezone!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  country!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}
