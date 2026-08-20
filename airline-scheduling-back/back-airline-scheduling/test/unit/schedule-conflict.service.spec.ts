import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';

import {
  ConflictSeverity,
  ScheduleConflictType,
} from '../../src/common/enums/airline.enums';

import { CrewAssignment } from '../../src/crew/entities/crew-assignment.entity';
import { Aircraft } from '../../src/fleet/entities/aircraft.entity';
import { Flight } from '../../src/flights/entities/flight.entity';
import { MaintenanceSlot } from '../../src/maintenance/entities/maintenance-slot.entity';

import { ScheduleConflictService } from '../../src/scheduling/services/schedule-conflict.service';

describe('ScheduleConflictService (unit)', () => {
  let service: ScheduleConflictService;

  const repoMock = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<any>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ScheduleConflictService,

        {
          provide: getRepositoryToken(Flight),
          useValue: repoMock,
        },

        {
          provide: getRepositoryToken(Aircraft),
          useValue: repoMock,
        },

        {
          provide: getRepositoryToken(MaintenanceSlot),
          useValue: repoMock,
        },

        {
          provide: getRepositoryToken(CrewAssignment),
          useValue: repoMock,
        },
      ],
    }).compile();

    service =
      moduleRef.get<ScheduleConflictService>(
        ScheduleConflictService,
      );

    jest.clearAllMocks();
  });

  it(
    'bloque un vol dont l’arrivée est antérieure au départ',
    async () => {
      const result =
        await service.validateCandidate({
          numeroVol: 'AFK412',
          aeroportDepart: 'TNR',
          aeroportArrivee: 'CDG',
          heureDepart:new Date(  '2026-08-19T14:05:00+03:00',),
          heureArrivee:new Date(  '2026-08-19T13:05:00+03:00',),
          avionId:'11111111-1111-4111-8111-111111111111',
        });
      expect(result.valid,).toBe(false,);
      expect(result.conflicts,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type:  ScheduleConflictType.INVALID_TIME_WINDOW,
            severity:  ConflictSeverity.CRITICAL,
            blocking:
              true,
          }),
        ]),
      );
    },
  );
  it(
    'signale un avion non affecté sans bloquer la saisie',
    async () => {
      const result =
        await service.validateCandidate({
          numeroVol:'MD045',
          aeroportDepart:'TNR',
          aeroportArrivee:'NOS',
          heureDepart:  new Date('2026-08-20T08:00:00+03:00',  ),
          heureArrivee:  new Date(  '2026-08-20T09:30:00+03:00',),
          avionId:   null,
        });
      expect(  result.valid,).toBe(  true,);
      expect(  result.operationallyReady,).toBe(  false,);
      expect(  result.conflicts[0],).toEqual(
        expect.objectContaining({
          type:  ScheduleConflictType.UNASSIGNED_AIRCRAFT,
          severity:  ConflictSeverity.HIGH,
          blocking:  false,
        }),
      );
    },
  );
});