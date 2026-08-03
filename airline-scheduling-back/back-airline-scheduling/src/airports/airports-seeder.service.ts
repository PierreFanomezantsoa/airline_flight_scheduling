import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Airport } from './airport.entity';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AirportsSeederService implements OnModuleInit {
  private readonly logger = new Logger(AirportsSeederService.name);

  constructor(
    @InjectRepository(Airport)
    private readonly airportRepository: Repository<Airport>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    const count = await this.airportRepository.count();
    if (count > 0) {
      this.logger.log('✅ Base de données des aéroports déjà initialisée.');
      return;
    }

    const filePath = path.join(process.cwd(), 'src', 'config', 'airports-seed.json');
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`⚠️ Fichier de seed introuvable : ${filePath}`);
      return;
    }

    try {
      const rawData = fs.readFileSync(filePath, 'utf-8');
      const airportsData: Airport[] = JSON.parse(rawData);

      this.logger.log(`🌱 Lancement du peuplement dynamique (${airportsData.length} aéroports)...`);

      // Transaction sécurisée
      await this.dataSource.transaction(async (manager) => {
        for (const data of airportsData) {
          const airport = manager.create(Airport, {
            ...data,
            iata: data.iata.toUpperCase(),
          });
          await manager.save(Airport, airport);
        }
      });

      this.logger.log('✨ Table des aéroports initialisée avec succès !');
    } catch (error) {
      // Gestion propre de l'erreur typée comme 'unknown' par TypeScript
      const errorMessage = error instanceof Error ? error.message : 'Une erreur inconnue est survenue';
      this.logger.error(`❌ Échec critique lors du seeding : ${errorMessage}`);
    }
  }
}