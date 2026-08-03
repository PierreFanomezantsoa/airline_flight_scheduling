import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';

// Import de votre AppModule
import { AppModule } from '../src/app.module';

describe('Flights (E2E - PostgreSQL)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // Augmentation du délai d'attente pour la connexion BDD
  jest.setTimeout(30000);

  beforeAll(async () => {
    // Optionnel : On peut surcharger ici le nom de la BDD si vous avez une BDD dédiée aux tests
    // process.env.DB_NAME = 'airline_test_db';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    // Récupération de la connexion TypeORM active
    dataSource = app.get<DataSource>(DataSource);
  });

  // Nettoyage de la table avant chaque test pour repartir sur un état propre
  beforeEach(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.query('TRUNCATE TABLE "flights" CASCADE;');
    }
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
    if (app) {
      await app.close();
    }
  });

  // --- 1. TEST LISTE VIDE ---
  it('GET /flights - Doit retourner un tableau vide au démarrage', async () => {
    const res = await request(app.getHttpServer()).get('/flights').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  // --- 2. TEST CRÉATION D'UN VOL ---
  it('POST /flights - Doit créer et persister un vol en BDD', async () => {
    const newFlightPayload = {
      numeroVol: 'MD050',
      aeroportDepart: 'TNR',
      aeroportArrivee: 'CDG',
      heureDepart: '2026-08-01T10:00:00Z',
      heureArrivee: '2026-08-01T20:00:00Z',
      statut: 'Scheduled',
    };

    const response = await request(app.getHttpServer())
      .post('/flights')
      .send(newFlightPayload)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.numeroVol).toBe('MD050');

    // Vérification de la persistance réelle en BDD via GET
    const checkGet = await request(app.getHttpServer()).get('/flights').expect(200);
    expect(checkGet.body.length).toBe(1);
    expect(checkGet.body[0].numeroVol).toBe('MD050');
  });

  // --- 3. TEST OPTIMISATION IA ---
  it('POST /flights/optimize - Doit retourner le message d’orientation', async () => {
    const response = await request(app.getHttpServer())
      .post('/flights/optimize')
      .expect(201);

    expect(response.body).toHaveProperty('message');
  });
});