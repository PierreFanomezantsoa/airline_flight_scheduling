import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const isEnabled = (
  value: string | undefined,
  defaultValue = false,
): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  return value.trim().toLowerCase() === 'true';
};

export const buildDatabaseConfig = (
  config: ConfigService,
): TypeOrmModuleOptions => {
  const synchronize = isEnabled(
    config.get<string>('DB_SYNCHRONIZE'),
    false,
  );

  return {
    type: 'postgres',

    host: config.get<string>('DB_HOST', 'localhost'),
    port: Number(config.get<string>('DB_PORT', '5432')),

    username: config.get<string>('DB_USERNAME', 'postgres'),
    password: config.get<string>('DB_PASSWORD', ''),
    database: config.get<string>('DB_NAME', 'airline_ops_db'),

    autoLoadEntities: true,
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsRun: synchronize,

    /**
     * À utiliser seulement en développement.
     *
     * Les migrations en attente sont appliquées avant la synchronisation afin
     * de préserver et renommer les colonnes existantes.
     */
    synchronize,

    logging: isEnabled(
      config.get<string>('DB_LOGGING'),
      false,
    ),

    retryAttempts: Number(
      config.get<string>('DB_RETRY_ATTEMPTS', '3'),
    ),
    retryDelay: Number(
      config.get<string>('DB_RETRY_DELAY_MS', '2000'),
    ),

    extra: {
      max: Number(
        config.get<string>('DB_POOL_MAX', '10'),
      ),
    },
  };
};
