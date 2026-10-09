import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { FlightsController } from '../../src/flights/flights.controller';
import { FlightsService } from '../../src/flights/flights.service';

describe('FlightsController (e2e)', () => {
  let app: INestApplication;
  const authSecret = 'e2e-only-secret';

  const createToken = (role = 'Planificateur') => {
    const encoded = Buffer.from(JSON.stringify({
      sub: 'e2e-user',
      role,
      exp: Date.now() + 60_000,
    })).toString('base64url');
    const signature = createHmac('sha256', authSecret)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  };

  const authHeader = { Authorization: `Bearer ${createToken()}` };

  const flightsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    detectConflicts: jest.fn(),
    optimize: jest.fn(),
    availableAircraft: jest.fn(),
    validate: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FlightsController],
      providers: [
        { provide: FlightsService, useValue: flightsService },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => key === 'AUTH_SECRET' ? authSecret : undefined },
        },
        RolesGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('GET /flights retourne les vols', async () => {
    flightsService.findAll.mockResolvedValue([
      { refFlight: 'f1', flightNumber: 'AFK412', depAirportCode: 'TNR', arrAirportCode: 'CDG' },
    ]);

    const response = await request(app.getHttpServer())
      .get('/flights')
      .set(authHeader)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].flightNumber).toBe('AFK412');
  });

  it('GET /flights refuse une requête sans session', async () => {
    await request(app.getHttpServer())
      .get('/flights')
      .expect(401);
  });

  it('POST /flights accepte un DTO valide', async () => {
    const payload = {
      flightNumber: 'AFK412',
      depAirportCode: 'TNR',
      arrAirportCode: 'CDG',
      departureTime: '2026-08-20T14:05:00+03:00',
      arrivalTime: '2026-08-20T20:30:00+03:00',
      refAircraft: '11111111-1111-4111-8111-111111111111',
    };
    flightsService.create.mockResolvedValue({ refFlight: 'f1', ...payload });

    const response = await request(app.getHttpServer())
      .post('/flights')
      .set(authHeader)
      .send(payload)
      .expect(201);

    expect(response.body.flightNumber).toBe('AFK412');
    expect(flightsService.create).toHaveBeenCalledWith(expect.objectContaining(payload));
  });

  it('POST /flights rejette un code IATA invalide avant le service', async () => {
    const payload = {
      flightNumber: 'AFK412',
      depAirportCode: 'TN',
      arrAirportCode: 'CDG',
      departureTime: '2026-08-20T14:05:00+03:00',
      arrivalTime: '2026-08-20T20:30:00+03:00',
    };

    await request(app.getHttpServer())
      .post('/flights')
      .set(authHeader)
      .send(payload)
      .expect(400);

    expect(flightsService.create).not.toHaveBeenCalled();
  });

  it('GET /flights/conflicts expose la détection globale des conflits', async () => {
    flightsService.detectConflicts.mockResolvedValue({
      totalConflicts: 1,
      criticalConflicts: 1,
      highConflicts: 0,
      mediumConflicts: 0,
      conflicts: [{ type: 'AIRCRAFT_OVERLAP', blocking: true }],
    });

    const response = await request(app.getHttpServer())
      .get('/flights/conflicts')
      .set(authHeader)
      .expect(200);

    expect(response.body.totalConflicts).toBe(1);
    expect(response.body.conflicts[0].type).toBe('AIRCRAFT_OVERLAP');
  });
});
