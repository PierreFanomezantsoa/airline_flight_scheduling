import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { buildDatabaseConfig } from './config/database.config';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FlightsModule } from './flights/flights.module';
import { FleetModule } from './fleet/fleet.module';
import { CrewModule } from './crew/crew.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { AirportsModule } from './airports/airports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildDatabaseConfig,
    }),

    AuthModule,
    UsersModule,
    FlightsModule,
    FleetModule,
    CrewModule,
    MaintenanceModule,
    AirportsModule,
  ],
})
export class AppModule {}