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

    /**
     * À utiliser seulement en développement.
     *
     * Pour une base contenant déjà des données, préférer les migrations.
     * Le défaut reste volontairement false.
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
