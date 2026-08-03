// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Import de tous vos modules métier
import { UsersModule } from './users/users.module';
import { FleetModule } from './fleet/fleet.module';
import { FlightsModule } from './flights/flights.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { IaModule } from './ia/ia.module';
import { AirportsModule } from './airports/airports.module';
import { OrdonnancementModule } from './Ordonnancement/ordonnancement.module';

@Module({
  imports: [
    // 1. Gestion globale des variables d'environnement (.env)
    ConfigModule.forRoot({ 
      isGlobal: true 
    }),

    // 2. Connexion asynchrone sécurisée à PostgreSQL via TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: parseInt(configService.get<string>('DB_PORT') || '5432', 10),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        autoLoadEntities: true, // Injecte automatiquement User, Aircraft, Flight, CrewAssignment, MaintenanceSlot
        synchronize: true,     // Crée et met à jour automatiquement le schéma de base de données en dev
      }),
    }),

    // 3. Activation de vos fonctionnalités métier
    UsersModule,
    FleetModule,
    FlightsModule,
    MaintenanceModule,
    IaModule,
    AirportsModule,
    OrdonnancementModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}