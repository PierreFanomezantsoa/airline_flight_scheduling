import { ConflictException } from '@nestjs/common';
import { FlightStatus } from '../../src/common/enums/airline.enums';
import { FlightsService } from '../../src/flights/flights.service';

describe('Flights + Scheduling (integration)', () => {
  const aircraftId = '11111111-1111-4111-8111-111111111111';

  function makeRepository() {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(false),
    };

    return {
      createQueryBuilder: jest.fn(() => qb),
      find: jest.fn(),
      findOne: jest.fn(),
      softRemove: jest.fn(),
      qb,
    };
  }

  function makeDataSource(repository: ReturnType<typeof makeRepository>) {
    const manager = {
      create: jest.fn((_entity, value) => ({
        ...value,
      })),

      save: jest.fn(async (_entity, value) => {
        const savedFlight = {
          id: 'flight-1',
          ...value,
        };

        /*
         * FlightsService.create() appelle this.findOne(savedFlightId)
         * après la transaction. On prépare donc le repository pour
         * qu'il retrouve le vol qui vient d'être sauvegardé.
         */
        repository.findOne.mockResolvedValue(savedFlight);

        return savedFlight;
      }),

      findOne: jest.fn(),
    };

    const dataSource = {
      transaction: jest.fn(
        async (callback: (entityManager: typeof manager) => Promise<unknown>) =>
          callback(manager),
      ),
    };

    return {
      dataSource,
      manager,
    };
  }

  it(
    'crée un vol après validation coordonnée des aéroports, ' +
      'de l’avion et du planning',
    async () => {
      const repository = makeRepository();

      const airportsService = {
        assertExists: jest.fn().mockResolvedValue(undefined),
      };

      const aircraft = {
        id: aircraftId,
        immatriculation: '5R-MAD',
      };

      const fleetService = {
        findOne: jest.fn().mockResolvedValue(aircraft),
        addFlightHours: jest.fn(),
      };

      const schedulingService = {
        validateCandidate: jest.fn().mockResolvedValue({
          valid: true,
          operationallyReady: true,
          conflicts: [],
        }),
      };

      const { dataSource, manager } = makeDataSource(repository);

      const service = new FlightsService(
        repository as any,
        airportsService as any,
        fleetService as any,
        schedulingService as any,
        dataSource as any,
      );

      const created = await service.create({
        numeroVol: ' afk-412 ',
        aeroportDepart: 'tnr',
        aeroportArrivee: 'cdg',
        heureDepart: '2026-08-20T14:05:00+03:00',
        heureArrivee: '2026-08-20T20:30:00+03:00',
        avionId: aircraftId,
        statut: FlightStatus.SCHEDULED,
      });

      expect(airportsService.assertExists).toHaveBeenCalledWith('TNR');
      expect(airportsService.assertExists).toHaveBeenCalledWith('CDG');

      expect(schedulingService.validateCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          numeroVol: 'AFK-412',
          aeroportDepart: 'TNR',
          aeroportArrivee: 'CDG',
          avionId: aircraftId,
        }),
      );

      expect(fleetService.findOne).toHaveBeenCalledWith(aircraftId);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);

      expect(manager.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          numeroVol: 'AFK-412',
          aeroportDepart: 'TNR',
          aeroportArrivee: 'CDG',
          avionId: aircraftId,
          statut: FlightStatus.SCHEDULED,
        }),
      );

      expect(manager.save).toHaveBeenCalledTimes(1);

      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'flight-1',
          },
        }),
      );

      expect(created).toBeDefined();
      expect(created.id).toBe('flight-1');
      expect(created.numeroVol).toBe('AFK-412');
      expect(created.aeroportDepart).toBe('TNR');
      expect(created.aeroportArrivee).toBe('CDG');
      expect(created.avionId).toBe(aircraftId);

      /*
       * Le vol est seulement SCHEDULED.
       * Il ne doit donc pas encore créditer les heures de l'appareil.
       */
      expect(fleetService.addFlightHours).not.toHaveBeenCalled();
    },
  );

  it(
    'empêche l’enregistrement quand le moteur de planning ' +
      'détecte un chevauchement avion',
    async () => {
      const repository = makeRepository();

      const airportsService = {
        assertExists: jest.fn().mockResolvedValue(undefined),
      };

      const fleetService = {
        findOne: jest.fn(),
        addFlightHours: jest.fn(),
      };

      const schedulingService = {
        validateCandidate: jest.fn().mockResolvedValue({
          valid: false,
          operationallyReady: false,
          conflicts: [
            {
              type: 'AIRCRAFT_OVERLAP',
              blocking: true,
              reason: '5R-MAD est déjà affecté sur ce créneau.',
            },
          ],
        }),
      };

      const { dataSource, manager } = makeDataSource(repository);

      const service = new FlightsService(
        repository as any,
        airportsService as any,
        fleetService as any,
        schedulingService as any,
        dataSource as any,
      );

      await expect(
        service.create({
          numeroVol: 'AFK-413',
          aeroportDepart: 'TNR',
          aeroportArrivee: 'CDG',
          heureDepart: '2026-08-20T17:05:00+03:00',
          heureArrivee: '2026-08-21T07:30:00+03:00',
          avionId: aircraftId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(fleetService.findOne).not.toHaveBeenCalled();

      /*
       * Le conflit est détecté avant la transaction.
       */
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(manager.create).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
      expect(repository.findOne).not.toHaveBeenCalled();
    },
  );
});