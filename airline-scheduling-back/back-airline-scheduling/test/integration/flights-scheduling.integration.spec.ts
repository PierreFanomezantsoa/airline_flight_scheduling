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
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'flight-1', ...value })),
      find: jest.fn(),
      findOne: jest.fn(),
      softRemove: jest.fn(),
      qb,
    };
  }

  it('crée un vol après validation coordonnée des aéroports, de l’avion et du planning', async () => {
    const repository = makeRepository();
    const airportsService = { assertExists: jest.fn().mockResolvedValue(undefined) };
    const aircraft = { id: aircraftId, immatriculation: '5R-MAD' };
    const fleetService = { findOne: jest.fn().mockResolvedValue(aircraft) };
    const schedulingService = {
      validateCandidate: jest.fn().mockResolvedValue({
        valid: true,
        operationallyReady: true,
        conflicts: [],
      }),
    };

    const service = new FlightsService(
      repository as any,
      airportsService as any,
      fleetService as any,
      schedulingService as any,
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
    expect(repository.save).toHaveBeenCalled();
    expect(created.numeroVol).toBe('AFK-412');
  });

  it('empêche l’enregistrement quand le moteur de planning détecte un chevauchement avion', async () => {
    const repository = makeRepository();
    const airportsService = { assertExists: jest.fn().mockResolvedValue(undefined) };
    const fleetService = { findOne: jest.fn() };
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

    const service = new FlightsService(
      repository as any,
      airportsService as any,
      fleetService as any,
      schedulingService as any,
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

    expect(repository.save).not.toHaveBeenCalled();
    expect(fleetService.findOne).not.toHaveBeenCalled();
  });
});
