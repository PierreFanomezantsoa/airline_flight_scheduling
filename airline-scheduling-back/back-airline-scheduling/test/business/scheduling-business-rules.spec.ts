import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import {
  AircraftStatus,
  FlightStatus,
  MaintenanceStatus,
  MaintenanceType,
  ScheduleConflictType,
} from '../../src/common/enums/airline.enums';
import { CrewAssignment } from '../../src/crew/entities/crew-assignment.entity';
import { Aircraft } from '../../src/fleet/entities/aircraft.entity';
import { Flight } from '../../src/flights/entities/flight.entity';
import { MaintenanceSlot } from '../../src/maintenance/entities/maintenance-slot.entity';
import { ScheduleConflictService } from '../../src/scheduling/services/schedule-conflict.service';

describe('Règles métier OCC - planification des vols', () => {
  let service: ScheduleConflictService;

  const flightRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<Flight>;

  const aircraftRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<Aircraft>;

  const maintenanceRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<MaintenanceSlot>;

  const crewRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<CrewAssignment>;

  /*
   * QueryBuilder générique.
   *
   * Important :
   * ScheduleConflictService utilise maintenant createQueryBuilder()
   * notamment dans detectMaintenanceDue().
   *
   * Sans ce mock, createQueryBuilder() retourne undefined et provoque :
   *
   * Cannot read properties of undefined (reading 'where')
   */
  const makeQueryBuilder = <T>(results: T[] = []) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),

    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),

    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),

    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),

    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),

    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),

    setParameter: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),

    getMany: jest.fn().mockResolvedValue(results),
    getOne: jest.fn().mockResolvedValue(null),
    getExists: jest.fn().mockResolvedValue(false),
    getCount: jest.fn().mockResolvedValue(0),

    getRawOne: jest.fn().mockResolvedValue(null),
    getRawMany: jest.fn().mockResolvedValue([]),
  });

  const makeAircraft = (
    overrides: Partial<Aircraft> = {},
  ): Aircraft =>
    ({
      id: 'aircraft-1',
      registration: 'AFK-412',
      status: AircraftStatus.ACTIVE,
      homeBase: 'TNR',
      hoursSinceMaintenance: 20,
      maintenanceHoursLimit: 100,
      ...overrides,
    }) as Aircraft;

  const makeFlight = (
    id: string,
    flightNumber: string,
    depart: string,
    arrivee: string,
    departureAirportCode = 'TNR',
    arrivalAirportCode = 'TNR',
    aircraft = makeAircraft(),
  ): Flight =>
    ({
      id,
      flightNumber,
      departureAirportCode,
      arrivalAirportCode,

      stopoverAirportCodes: null,
      stopoverDurationMinutes: null,

      departureTime: new Date(depart),
      arrivalTime: new Date(arrivee),

      status: FlightStatus.SCHEDULED,

      refAircraft: aircraft.refAircraft,
      aircraft: aircraft,

      crewAssignments: [],

      /*
       * Nouveaux champs de Flight.
       *
       * Ils doivent être présents dans les objets de test maintenant
       * que la comptabilisation réelle des heures de flight existe.
       */
      flightHoursRecorded: false,
      creditedFlightHours: null,
      flightHoursRecordedAt: null,

      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }) as Flight;

  beforeEach(async () => {
    jest.clearAllMocks();

    /*
     * Valeurs par défaut.
     *
     * Chaque règle pourra ensuite remplacer find() ou
     * createQueryBuilder() seulement lorsqu'elle en a besoin.
     */
    (flightRepository.find as jest.Mock).mockResolvedValue([]);
    (flightRepository.findOne as jest.Mock).mockResolvedValue(null);

    /*
     * CORRECTION PRINCIPALE :
     *
     * detectMaintenanceDue() appelle maintenant :
     *
     * this.flightRepository
     *   .createQueryBuilder('flight')
     *   .where(...)
     *
     * Il faut donc toujours retourner un QueryBuilder.
     */
    (
      flightRepository.createQueryBuilder as jest.Mock
    ).mockImplementation(() => makeQueryBuilder<Flight>());

    (aircraftRepository.find as jest.Mock).mockResolvedValue([]);
    (aircraftRepository.findOne as jest.Mock).mockResolvedValue(null);

    (
      aircraftRepository.createQueryBuilder as jest.Mock
    ).mockImplementation(() => makeQueryBuilder<Aircraft>());

    (crewRepository.find as jest.Mock).mockResolvedValue([]);
    (crewRepository.findOne as jest.Mock).mockResolvedValue(null);

    (
      crewRepository.createQueryBuilder as jest.Mock
    ).mockImplementation(() => makeQueryBuilder<CrewAssignment>());

    (maintenanceRepository.find as jest.Mock).mockResolvedValue([]);
    (maintenanceRepository.findOne as jest.Mock).mockResolvedValue(null);

    (
      maintenanceRepository.createQueryBuilder as jest.Mock
    ).mockImplementation(() => makeQueryBuilder<MaintenanceSlot>());

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScheduleConflictService,

        {
          provide: getRepositoryToken(Flight),
          useValue: flightRepository,
        },

        {
          provide: getRepositoryToken(Aircraft),
          useValue: aircraftRepository,
        },

        {
          provide: getRepositoryToken(MaintenanceSlot),
          useValue: maintenanceRepository,
        },

        {
          provide: getRepositoryToken(CrewAssignment),
          useValue: crewRepository,
        },
      ],
    }).compile();

    service = moduleRef.get<ScheduleConflictService>(
      ScheduleConflictService,
    );
  });

  it(
    'RG01 - interdit deux vols qui se chevauchent avec le même aircraft',
    async () => {
      const aircraft = makeAircraft();

      const flights = [
        makeFlight(
          'f1',
          'AFK101',
          '2026-08-20T11:00:00+03:00',
          '2026-08-20T14:00:00+03:00',
          'TNR',
          'NOS',
          aircraft,
        ),

        makeFlight(
          'f2',
          'AFK102',
          '2026-08-20T13:00:00+03:00',
          '2026-08-20T16:00:00+03:00',
          'NOS',
          'TNR',
          aircraft,
        ),
      ];

      (flightRepository.find as jest.Mock).mockResolvedValue(
        flights,
      );

      const conflicts = await service.detectAll();

      expect(conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: ScheduleConflictType.AIRCRAFT_OVERLAP,
            blocking: true,
            refAircraft: aircraft.refAircraft,
          }),
        ]),
      );
    },
  );

  it(
    'RG02 - impose le turnaround minimal entre deux rotations du même aircraft',
    async () => {
      const aircraft = makeAircraft();

      const flights = [
        makeFlight(
          'f1',
          'AFK201',
          '2026-08-20T08:00:00+03:00',
          '2026-08-20T10:00:00+03:00',
          'TNR',
          'NOS',
          aircraft,
        ),

        makeFlight(
          'f2',
          'AFK202',
          '2026-08-20T10:30:00+03:00',
          '2026-08-20T12:00:00+03:00',
          'NOS',
          'TNR',
          aircraft,
        ),
      ];

      (flightRepository.find as jest.Mock).mockResolvedValue(
        flights,
      );

      const conflicts = await service.detectAll();

      expect(conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: ScheduleConflictType.TURNAROUND_TOO_SHORT,
            blocking: true,
            gapMinutes: 30,
          }),
        ]),
      );
    },
  );

  it(
    'RG03 - détecte un problème de positionnement si l’aircraft repart ' +
      'd’un autre aéroport trop tôt',
    async () => {
      const aircraft = makeAircraft();

      const flights = [
        makeFlight(
          'f1',
          'AFK301',
          '2026-08-20T06:00:00+03:00',
          '2026-08-20T08:00:00+03:00',
          'TNR',
          'NOS',
          aircraft,
        ),

        makeFlight(
          'f2',
          'AFK302',
          '2026-08-20T10:00:00+03:00',
          '2026-08-20T12:00:00+03:00',
          'TNR',
          'DIE',
          aircraft,
        ),
      ];

      (flightRepository.find as jest.Mock).mockResolvedValue(
        flights,
      );

      const conflicts = await service.detectAll();

      expect(conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: ScheduleConflictType.AIRCRAFT_POSITIONING,
            blocking: true,
            gapMinutes: 120,
          }),
        ]),
      );
    },
  );

  it(
    'RG04 - bloque un aircraft déjà indisponible ou en maintenance',
    async () => {
      const aircraft = makeAircraft({
        status: AircraftStatus.MAINTENANCE,
      });

      (flightRepository.find as jest.Mock).mockResolvedValue([
        makeFlight(
          'f1',
          'AFK401',
          '2026-08-20T12:00:00+03:00',
          '2026-08-20T14:00:00+03:00',
          'TNR',
          'NOS',
          aircraft,
        ),
      ]);

      const conflicts = await service.detectAll();

      expect(conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: ScheduleConflictType.AIRCRAFT_UNAVAILABLE,
            blocking: true,
          }),
        ]),
      );
    },
  );

  it(
    'RG05 - bloque un flight qui ferait dépasser la limite horaire avant maintenance',
    async () => {
      const aircraft = makeAircraft({
        hoursSinceMaintenance: 99,
        maintenanceHoursLimit: 100,
      });

      (flightRepository.find as jest.Mock).mockResolvedValue([
        makeFlight(
          'f1',
          'AFK501',
          '2026-08-20T12:00:00+03:00',
          '2026-08-20T14:00:00+03:00',
          'TNR',
          'NOS',
          aircraft,
        ),
      ]);

      const conflicts = await service.detectAll();

      expect(conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: ScheduleConflictType.MAINTENANCE_DUE,
            blocking: true,
          }),
        ]),
      );
    },
  );

  it(
    'RG05a - compte toute la durée d’un flight sans escale même si une durée d’escale est renseignée',
    async () => {
      const aircraft = makeAircraft({
        hoursSinceMaintenance: 97,
        maintenanceHoursLimit: 100,
      });
      const flight = makeFlight(
        'f-direct',
        'AFK502',
        '2026-08-20T08:00:00+03:00',
        '2026-08-20T12:00:00+03:00',
        'TNR',
        'CDG',
        aircraft,
      );
      flight.stopoverDurationMinutes = 120;

      (flightRepository.find as jest.Mock).mockResolvedValue([flight]);

      const conflicts = await service.detectAll();
      const maintenanceConflict = conflicts.find(
        (conflict) => conflict.type === ScheduleConflictType.MAINTENANCE_DUE,
      );

      expect(maintenanceConflict).toEqual(
        expect.objectContaining({
          blocking: true,
          metadata: expect.objectContaining({ candidateHours: 4 }),
        }),
      );
    },
  );

  it(
    'RG05c - bloque un flight qui atteint exactement la limite de maintenance',
    async () => {
      const aircraft = makeAircraft({
        hoursSinceMaintenance: 99,
        maintenanceHoursLimit: 100,
      });
      const flight = makeFlight(
        'f-exact-limit',
        'AFK504',
        '2026-08-20T08:00:00+03:00',
        '2026-08-20T09:00:00+03:00',
        'TNR',
        'CDG',
        aircraft,
      );

      (flightRepository.find as jest.Mock).mockResolvedValue([flight]);

      const conflicts = await service.detectAll();

      expect(conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: ScheduleConflictType.MAINTENANCE_DUE,
            blocking: true,
            metadata: expect.objectContaining({
              projectedHours: 100,
              limitHours: 100,
            }),
          }),
        ]),
      );
    },
  );

  it(
    'RG05b - retire le temps au sol uniquement pour un flight avec escale',
    async () => {
      const aircraft = makeAircraft({
        hoursSinceMaintenance: 97,
        maintenanceHoursLimit: 100,
      });
      const flight = makeFlight(
        'f-stopover',
        'AFK503',
        '2026-08-20T08:00:00+03:00',
        '2026-08-20T12:00:00+03:00',
        'TNR',
        'CDG',
        aircraft,
      );
      flight.stopoverAirportCodes = 'RUN';
      flight.stopoverDurationMinutes = 120;

      (flightRepository.find as jest.Mock).mockResolvedValue([flight]);

      const conflicts = await service.detectAll();
      const maintenanceWarning = conflicts.find(
        (conflict) =>
          conflict.type === ScheduleConflictType.MAINTENANCE_DUE &&
          !conflict.blocking,
      );

      expect(maintenanceWarning).toEqual(
        expect.objectContaining({
          metadata: expect.objectContaining({ candidateHours: 2 }),
        }),
      );
      expect(
        conflicts.some(
          (conflict) =>
            conflict.type === ScheduleConflictType.MAINTENANCE_DUE &&
            conflict.blocking,
        ),
      ).toBe(false);
    },
  );

  it(
    'RG06 - interdit un flight pendant un créneau de maintenance planifié',
    async () => {
      const aircraft = makeAircraft();

      const slot = {
        id: 'maintenance-1',
        refAircraft: aircraft.refAircraft,
        maintenanceType: MaintenanceType.TYPE_A,
        status: MaintenanceStatus.PLANNED,
        startTime: new Date(
          '2026-08-20T11:00:00+03:00',
        ),
        endTime: new Date(
          '2026-08-20T15:00:00+03:00',
        ),
      } as MaintenanceSlot;

      (flightRepository.find as jest.Mock).mockResolvedValue([
        makeFlight(
          'f1',
          'AFK601',
          '2026-08-20T12:00:00+03:00',
          '2026-08-20T14:00:00+03:00',
          'TNR',
          'NOS',
          aircraft,
        ),
      ]);

      /*
       * Pour RG06, on remplace seulement le QueryBuilder du repository
       * maintenance afin de retourner le créneau qui chevauche le flight.
       */
      (
        maintenanceRepository.createQueryBuilder as jest.Mock
      ).mockImplementation(() =>
        makeQueryBuilder<MaintenanceSlot>([slot]),
      );

      const conflicts = await service.detectAll();

      expect(conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: ScheduleConflictType.AIRCRAFT_MAINTENANCE,
            blocking: true,
          }),
        ]),
      );
    },
  );

  it(
    'RG07 - interdit qu’un membre d’équipage soit sur deux vols simultanément',
    async () => {
      const aircraft1 = makeAircraft({
        id: 'aircraft-1',
        registration: 'AFK-411',
      });

      const aircraft2 = makeAircraft({
        id: 'aircraft-2',
        registration: 'AFK-412',
      });

      const f1 = makeFlight(
        'f1',
        'AFK701',
        '2026-08-20T08:00:00+03:00',
        '2026-08-20T11:00:00+03:00',
        'TNR',
        'NOS',
        aircraft1,
      );

      const f2 = makeFlight(
        'f2',
        'AFK702',
        '2026-08-20T10:00:00+03:00',
        '2026-08-20T13:00:00+03:00',
        'TNR',
        'DIE',
        aircraft2,
      );

      (flightRepository.find as jest.Mock).mockResolvedValue([
        f1,
        f2,
      ]);

      (crewRepository.find as jest.Mock).mockResolvedValue([
        {
          id: 'ca1',
          refUser: 'user-1',
          flight: f1,
          user: {
            name: 'Rakoto',
          },
        },
        {
          id: 'ca2',
          refUser: 'user-1',
          flight: f2,
          user: {
            name: 'Rakoto',
          },
        },
      ] as CrewAssignment[]);

      const conflicts = await service.detectAll();

      expect(conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: ScheduleConflictType.CREW_OVERLAP,
            blocking: true,
          }),
        ]),
      );
    },
  );

  it(
    'RG08 - impose le repos minimal d’un membre d’équipage entre deux vols',
    async () => {
      const aircraft1 = makeAircraft({
        id: 'aircraft-1',
        registration: 'AFK-411',
      });

      const aircraft2 = makeAircraft({
        id: 'aircraft-2',
        registration: 'AFK-412',
      });

      const f1 = makeFlight(
        'f1',
        'AFK801',
        '2026-08-20T04:00:00+03:00',
        '2026-08-20T08:00:00+03:00',
        'TNR',
        'NOS',
        aircraft1,
      );

      const f2 = makeFlight(
        'f2',
        'AFK802',
        '2026-08-20T14:00:00+03:00',
        '2026-08-20T16:00:00+03:00',
        'NOS',
        'TNR',
        aircraft2,
      );

      (flightRepository.find as jest.Mock).mockResolvedValue([
        f1,
        f2,
      ]);

      (crewRepository.find as jest.Mock).mockResolvedValue([
        {
          id: 'ca1',
          refUser: 'user-1',
          flight: f1,
          user: {
            name: 'Rakoto',
          },
        },
        {
          id: 'ca2',
          refUser: 'user-1',
          flight: f2,
          user: {
            name: 'Rakoto',
          },
        },
      ] as CrewAssignment[]);

      const conflicts = await service.detectAll();

      expect(conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: ScheduleConflictType.CREW_REST,
            blocking: true,
          }),
        ]),
      );
    },
  );
});