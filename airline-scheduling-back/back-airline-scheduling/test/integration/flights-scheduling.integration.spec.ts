import { ConflictException } from '@nestjs/common';
import { FlightStatus } from '../../src/common/enums/airline.enums';
import { FlightsService } from '../../src/flights/flights.service';

describe('Flights + Scheduling (integration)', () => {
  const refAircraft = '11111111-1111-4111-8111-111111111111';

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
          refFlight: 'flight-1',
          ...value,
        };

        /*
         * FlightsService.create() appelle this.findOne(savedFlightId)
         * après la transaction. On prépare donc le repository pour
         * qu'il retrouve le flight qui vient d'être sauvegardé.
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
    'crée un flight après validation coordonnée des aéroports, ' +
      'de l’aircraft et du planning',
    async () => {
      const repository = makeRepository();

      const airportsService = {
        assertExists: jest.fn().mockResolvedValue(undefined),
      };

      const aircraft = {
        refAircraft,
        registration: '5R-MAD',
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
        flightNumber: ' afk-412 ',
        departureAirportCode: 'tnr',
        arrivalAirportCode: 'cdg',
        departureTime: '2026-08-20T14:05:00+03:00',
        arrivalTime: '2026-08-20T20:30:00+03:00',
        refAircraft: refAircraft,
        flightStatus: FlightStatus.SCHEDULED,
      });

      expect(airportsService.assertExists).toHaveBeenCalledWith('TNR');
      expect(airportsService.assertExists).toHaveBeenCalledWith('CDG');

      expect(schedulingService.validateCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          flightNumber: 'AFK-412',
          departureAirportCode: 'TNR',
          arrivalAirportCode: 'CDG',
          refAircraft: refAircraft,
        }),
      );

      expect(fleetService.findOne).toHaveBeenCalledWith(refAircraft);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);

      expect(manager.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          flightNumber: 'AFK-412',
          departureAirportCode: 'TNR',
          arrivalAirportCode: 'CDG',
          refAircraft: refAircraft,
          flightStatus: FlightStatus.SCHEDULED,
        }),
      );

      expect(manager.save).toHaveBeenCalledTimes(1);

      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            refFlight: 'flight-1',
          },
        }),
      );

      expect(created).toBeDefined();
      expect(created.refFlight).toBe('flight-1');
      expect(created.flightNumber).toBe('AFK-412');
      expect(created.departureAirportCode).toBe('TNR');
      expect(created.arrivalAirportCode).toBe('CDG');
      expect(created.refAircraft).toBe(refAircraft);

      /*
       * Le flight est seulement SCHEDULED.
       * Il ne doit donc pas encore créditer les heures de l'appareil.
       */
      expect(fleetService.addFlightHours).not.toHaveBeenCalled();
    },
  );

  it(
    'empêche l’enregistrement quand le moteur de planning ' +
      'détecte un chevauchement aircraft',
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
          flightNumber: 'AFK-413',
          departureAirportCode: 'TNR',
          arrivalAirportCode: 'CDG',
          departureTime: '2026-08-20T17:05:00+03:00',
          arrivalTime: '2026-08-21T07:30:00+03:00',
          refAircraft: refAircraft,
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

  it(
    'crédite les compteurs aircraft pour un flight effectué, en retirant le temps d’escale',
    async () => {
      const repository = makeRepository();
      const arrival = new Date('2026-08-20T12:00:00.000Z');
      const flight = {
        refFlight: 'flight-completed',
        flightStatus: FlightStatus.EFFECTUE,
        refAircraft: refAircraft,
        departureTime: new Date('2026-08-20T10:00:00.000Z'),
        arrivalTime: arrival,
        stopoverDurationMinutes: 30,
        flightHoursRecorded: false,
        creditedFlightHours: null,
        flightHoursRecordedAt: null,
      };

      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([flight]),
      };
      repository.createQueryBuilder.mockReturnValue(queryBuilder as any);
      repository.findOne.mockResolvedValue(flight as any);

      const manager = {
        findOne: jest.fn().mockResolvedValue(flight),
        save: jest.fn().mockImplementation(async (_entity, value) => value),
      };
      const dataSource = {
        transaction: jest.fn(async (callback) => callback(manager)),
      };
      const aircraft = {
        totalFlightHours: 10,
        hoursSinceMaintenance: 20,
      };
      const fleetService = {
        addFlightHours: jest.fn().mockImplementation(
          async (_aircraftId, flightHours) => {
            aircraft.totalFlightHours += flightHours;
            aircraft.hoursSinceMaintenance += flightHours;
            return aircraft;
          },
        ),
      };

      const service = new FlightsService(
        repository as any,
        { assertExists: jest.fn() } as any,
        fleetService as any,
        {} as any,
        dataSource as any,
      );

      const result = await service.syncCompletedFlights(
        new Date('2026-08-20T13:00:00.000Z'),
      );

      expect(result).toMatchObject({
        scanned: 1,
        completed: 1,
        credited: 1,
        skipped: 0,
        errors: [],
      });
      expect(fleetService.addFlightHours).toHaveBeenCalledWith(
        refAircraft,
        1.5,
        manager,
      );
      expect(flight.flightHoursRecorded).toBe(true);
      expect(flight.creditedFlightHours).toBe(1.5);
      expect(aircraft.totalFlightHours).toBe(11.5);
      expect(aircraft.hoursSinceMaintenance).toBe(21.5);
      expect(manager.save).toHaveBeenCalledWith(expect.anything(), flight);
    },
  );
});