import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Airport } from './entities/airport.entity';
import { normalizeIata } from '../common/utils/normalizers';

@Injectable()
export class AirportsSeederService implements OnModuleInit {
  private readonly logger = new Logger(AirportsSeederService.name);

  constructor(
    @InjectRepository(Airport)
    private readonly airportRepository: Repository<Airport>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    if ((await this.airportRepository.count()) > 0) return;

    const filePath = path.join(process.cwd(), 'src', 'config', 'airports-seed.json');
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Seed aéroports introuvable: ${filePath}`);
      return;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Array<Partial<Airport>>;

      await this.dataSource.transaction(async (manager) => {
        const rows = parsed
          .filter((row): row is Partial<Airport> & { iata: string; name: string; timezone: string } =>
            Boolean(row.iata && row.name && row.timezone),
          )
          .map((row) =>
            manager.create(Airport, {
              iata: normalizeIata(row.iata),
              name: row.name,
              timezone: row.timezone,
              city: row.city ?? null,
              country: row.country ?? null,
              active: row.active ?? true,
            }),
          );

        if (rows.length > 0) await manager.save(Airport, rows);
      });

      this.logger.log(`Aéroports initialisés: ${await this.airportRepository.count()}`);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : 'Erreur de seed aéroports');
    }
  }
}
