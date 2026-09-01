import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app =
    await NestFactory.create(
      AppModule,
    );

  const config =
    app.get(
      ConfigService,
    );

  // ===========================================================================
  // VALIDATION GLOBALE
  // ===========================================================================

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:
        true,

      forbidNonWhitelisted:
        true,

      transform:
        true,

      transformOptions: {
        enableImplicitConversion:
          true,
      },
    }),
  );

  // ===========================================================================
  // CORS
  // ===========================================================================

  const configuredFrontendUrl =
    config.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );

  const allowedOrigins = [
    configuredFrontendUrl,

    'http://localhost:5173',
    'http://127.0.0.1:5173',

    'http://localhost:5174',
    'http://127.0.0.1:5174',

    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter(
    (
      value,
      index,
      array,
    ) =>
      Boolean(value) &&
      array.indexOf(value) ===
        index,
  );

  app.enableCors({
    origin: (
      origin,
      callback,
    ) => {
      // Requêtes sans Origin :
      // Postman, curl, backend interne, etc.
      if (
        !origin
      ) {
        callback(
          null,
          true,
        );

        return;
      }

      if (
        allowedOrigins.includes(
          origin,
        )
      ) {
        callback(
          null,
          true,
        );

        return;
      }

      console.warn(
        `[CORS] Origine refusée : ${origin}`,
      );

      console.warn(
        '[CORS] Origines autorisées :',
        allowedOrigins,
      );

      callback(
        new Error(
          `Origine CORS non autorisée : ${origin}`,
        ),
        false,
      );
    },

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Accept',
      'Content-Type',
      'Authorization',
    ],

    exposedHeaders: [
      'Authorization',
    ],

    credentials:
      true,

    optionsSuccessStatus:
      204,
  });

  // ===========================================================================
  // PORT
  // ===========================================================================

  const port =
    Number(
      config.get<string>(
        'PORT',
        '3001',
      ),
    );

  await app.listen(
    port,
  );

  console.log(
    `Backend démarré sur http://localhost:${port}`,
  );

  console.log(
    'Origines frontend autorisées :',
    allowedOrigins,
  );
}

void bootstrap();