import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AircraftAvailabilityService } from '../../src/scheduling/services/aircraft-availability.service';
import { ScheduleConflictService } from '../../src/scheduling/services/schedule-conflict.service';
import { ScheduleOptimizationService } from '../../src/scheduling/services/schedule-optimization.service';
import { SchedulingService } from '../../src/scheduling/services/scheduling.service';

describe('SchedulingService (unit)', () => {
  let service: SchedulingService;

  const conflictService = {
    validateCandidate: jest.fn(),
    detectAll: jest.fn(),
  };
  const availabilityService = { findAvailable: jest.fn() };
  const optimizationService = { optimize: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: ScheduleConflictService, useValue: conflictService },
        { provide: AircraftAvailabilityService, useValue: availabilityService },
        { provide: ScheduleOptimizationService, useValue: optimizationService },
      ],
    }).compile();

    service = moduleRef.get(SchedulingService);
    jest.clearAllMocks();
  });

  it('refuse une fenêtre de disponibilité invalide', async () => {
    await expect(
      service.findAvailableAircraft({
        start: '2026-08-20T10:00:00+03:00',
        end: '2026-08-20T09:00:00+03:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(availabilityService.findAvailable).not.toHaveBeenCalled();
  });

  it('normalise les codes IATA avant la recherche de disponibilité', async () => {
    availabilityService.findAvailable.mockResolvedValue([{ id: 'A1' }]);

    const result = await service.findAvailableAircraft({
      start: '2026-08-20T10:00:00+03:00',
      end: '2026-08-20T12:00:00+03:00',
      origin: 'tnr',
      destination: 'cdg',
    });

    expect(availabilityService.findAvailable).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
      'TNR',
      'CDG',
    );
    expect(result).toEqual([{ id: 'A1' }]);
  });
});
