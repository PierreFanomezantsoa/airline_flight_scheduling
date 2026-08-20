import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { FlightsController } from '../../src/flights/flights.controller';
import { FlightsService } from '../../src/flights/flights.service';

describe('FlightsController (e2e)', () => {
  let app: INestApplication;

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
      providers: [{ provide: FlightsService, useValue: flightsService }],
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
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('GET /flights retourne les vols', async () => {
    flightsService.findAll.mockResolvedValue([
      { id: 'f1', numeroVol: 'AFK412', aeroportDepart: 'TNR', aeroportArrivee: 'CDG' },
    ]);

    const response = await request(app.getHttpServer())
      .get('/flights')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].numeroVol).toBe('AFK412');
  });

  it('POST /flights accepte un DTO valide', async () => {
    const payload = {
      numeroVol: 'AFK412',
      aeroportDepart: 'TNR',
      aeroportArrivee: 'CDG',
      heureDepart: '2026-08-20T14:05:00+03:00',
      heureArrivee: '2026-08-20T20:30:00+03:00',
      avionId: '11111111-1111-4111-8111-111111111111',
    };
    flightsService.create.mockResolvedValue({ id: 'f1', ...payload });

    const response = await request(app.getHttpServer())
      .post('/flights')
      .send(payload)
      .expect(201);

    expect(response.body.numeroVol).toBe('AFK412');
    expect(flightsService.create).toHaveBeenCalledWith(expect.objectContaining(payload));
  });

  it('POST /flights rejette un code IATA invalide avant le service', async () => {
    const payload = {
      numeroVol: 'AFK412',
      aeroportDepart: 'TN',
      aeroportArrivee: 'CDG',
      heureDepart: '2026-08-20T14:05:00+03:00',
      heureArrivee: '2026-08-20T20:30:00+03:00',
    };

    await request(app.getHttpServer())
      .post('/flights')
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
      .expect(200);

    expect(response.body.totalConflicts).toBe(1);
    expect(response.body.conflicts[0].type).toBe('AIRCRAFT_OVERLAP');
  });
});
