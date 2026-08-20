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

  const makeAircraft = (overrides: Partial<Aircraft> = {}): Aircraft =>
    ({
      id: 'aircraft-1',
      immatriculation: 'AFK-412',
      statut: AircraftStatus.ACTIVE,
      baseAttache: 'TNR',
      heuresDepuisDerniereMaintenance: 20,
      limiteHeuresMaintenance: 100,
      ...overrides,
    }) as Aircraft;

  const makeFlight = (
    id: string,
    numeroVol: string,
    depart: string,
    arrivee: string,
    aeroportDepart = 'TNR',
    aeroportArrivee = 'TNR',
    aircraft = makeAircraft(),
  ): Flight =>
    ({
      id,
      numeroVol,
      aeroportDepart,
      aeroportArrivee,
      aeroportEscale: null,
      dureeEscale: null,
      heureDepart: new Date(depart),
      heureArrivee: new Date(arrivee),
      statut: FlightStatus.SCHEDULED,
      avionId: aircraft.id,
      avion: aircraft,
      affectationsEquipage: [],
      version: 0,
      creeA: new Date(),
      misAJourA: new Date(),
      supprimeA: null,
    }) as Flight;

  const maintenanceQb = (slots: MaintenanceSlot[] = []) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(slots),
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ScheduleConflictService,
        { provide: getRepositoryToken(Flight), useValue: flightRepository },
        { provide: getRepositoryToken(Aircraft), useValue: aircraftRepository },
        { provide: getRepositoryToken(MaintenanceSlot), useValue: maintenanceRepository },
        { provide: getRepositoryToken(CrewAssignment), useValue: crewRepository },
      ],
    }).compile();

    service = moduleRef.get(ScheduleConflictService);
    jest.clearAllMocks();

    (flightRepository.find as jest.Mock).mockResolvedValue([]);
    (crewRepository.find as jest.Mock).mockResolvedValue([]);
    (maintenanceRepository.createQueryBuilder as jest.Mock).mockImplementation(() => maintenanceQb());
  });

  it('RG01 - interdit deux vols qui se chevauchent avec le même avion', async () => {
    const aircraft = makeAircraft();
    const flights = [
      makeFlight('f1', 'AFK101', '2026-08-20T11:00:00+03:00', '2026-08-20T14:00:00+03:00', 'TNR', 'NOS', aircraft),
      makeFlight('f2', 'AFK102', '2026-08-20T13:00:00+03:00', '2026-08-20T16:00:00+03:00', 'NOS', 'TNR', aircraft),
    ];
    (flightRepository.find as jest.Mock).mockResolvedValue(flights);

    const conflicts = await service.detectAll();

    expect(conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: ScheduleConflictType.AIRCRAFT_OVERLAP,
          blocking: true,
          aircraftId: aircraft.id,
        }),
      ]),
    );
  });

  it('RG02 - impose le turnaround minimal entre deux rotations du même avion', async () => {
    const aircraft = makeAircraft();
    const flights = [
      makeFlight('f1', 'AFK201', '2026-08-20T08:00:00+03:00', '2026-08-20T10:00:00+03:00', 'TNR', 'NOS', aircraft),
      makeFlight('f2', 'AFK202', '2026-08-20T10:30:00+03:00', '2026-08-20T12:00:00+03:00', 'NOS', 'TNR', aircraft),
    ];
    (flightRepository.find as jest.Mock).mockResolvedValue(flights);

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
  });

  it('RG03 - détecte un problème de positionnement si l’avion repart d’un autre aéroport trop tôt', async () => {
    const aircraft = makeAircraft();
    const flights = [
      makeFlight('f1', 'AFK301', '2026-08-20T06:00:00+03:00', '2026-08-20T08:00:00+03:00', 'TNR', 'NOS', aircraft),
      makeFlight('f2', 'AFK302', '2026-08-20T10:00:00+03:00', '2026-08-20T12:00:00+03:00', 'TNR', 'DIE', aircraft),
    ];
    (flightRepository.find as jest.Mock).mockResolvedValue(flights);

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
  });

  it('RG04 - bloque un avion déjà indisponible ou en maintenance', async () => {
    const aircraft = makeAircraft({ statut: AircraftStatus.MAINTENANCE });
    (flightRepository.find as jest.Mock).mockResolvedValue([
      makeFlight('f1', 'AFK401', '2026-08-20T12:00:00+03:00', '2026-08-20T14:00:00+03:00', 'TNR', 'NOS', aircraft),
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
  });

  it('RG05 - bloque un vol qui ferait dépasser la limite horaire avant maintenance', async () => {
    const aircraft = makeAircraft({
      heuresDepuisDerniereMaintenance: 99,
      limiteHeuresMaintenance: 100,
    });
    (flightRepository.find as jest.Mock).mockResolvedValue([
      makeFlight('f1', 'AFK501', '2026-08-20T12:00:00+03:00', '2026-08-20T14:00:00+03:00', 'TNR', 'NOS', aircraft),
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
  });

  it('RG06 - interdit un vol pendant un créneau de maintenance planifié', async () => {
    const aircraft = makeAircraft();
    const slot = {
      id: 'maintenance-1',
      aircraftId: aircraft.id,
      maintenanceType: MaintenanceType.TYPE_A,
      status: MaintenanceStatus.PLANNED,
      startTime: new Date('2026-08-20T11:00:00+03:00'),
      endTime: new Date('2026-08-20T15:00:00+03:00'),
    } as MaintenanceSlot;

    (flightRepository.find as jest.Mock).mockResolvedValue([
      makeFlight('f1', 'AFK601', '2026-08-20T12:00:00+03:00', '2026-08-20T14:00:00+03:00', 'TNR', 'NOS', aircraft),
    ]);
    (maintenanceRepository.createQueryBuilder as jest.Mock).mockImplementation(() => maintenanceQb([slot]));

    const conflicts = await service.detectAll();

    expect(conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: ScheduleConflictType.AIRCRAFT_MAINTENANCE,
          blocking: true,
        }),
      ]),
    );
  });

  it('RG07 - interdit qu’un membre d’équipage soit sur deux vols simultanément', async () => {
    const aircraft1 = makeAircraft({ id: 'aircraft-1', immatriculation: 'AFK-411' });
    const aircraft2 = makeAircraft({ id: 'aircraft-2', immatriculation: 'AFK-412' });
    const f1 = makeFlight('f1', 'AFK701', '2026-08-20T08:00:00+03:00', '2026-08-20T11:00:00+03:00', 'TNR', 'NOS', aircraft1);
    const f2 = makeFlight('f2', 'AFK702', '2026-08-20T10:00:00+03:00', '2026-08-20T13:00:00+03:00', 'TNR', 'DIE', aircraft2);

    (flightRepository.find as jest.Mock).mockResolvedValue([f1, f2]);
    (crewRepository.find as jest.Mock).mockResolvedValue([
      { id: 'ca1', utilisateurId: 'user-1', vol: f1, utilisateur: { nom: 'Rakoto' } },
      { id: 'ca2', utilisateurId: 'user-1', vol: f2, utilisateur: { nom: 'Rakoto' } },
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
  });

  it('RG08 - impose le repos minimal d’un membre d’équipage entre deux vols', async () => {
    const aircraft1 = makeAircraft({ id: 'aircraft-1', immatriculation: 'AFK-411' });
    const aircraft2 = makeAircraft({ id: 'aircraft-2', immatriculation: 'AFK-412' });
    const f1 = makeFlight('f1', 'AFK801', '2026-08-20T04:00:00+03:00', '2026-08-20T08:00:00+03:00', 'TNR', 'NOS', aircraft1);
    const f2 = makeFlight('f2', 'AFK802', '2026-08-20T14:00:00+03:00', '2026-08-20T16:00:00+03:00', 'NOS', 'TNR', aircraft2);

    (flightRepository.find as jest.Mock).mockResolvedValue([f1, f2]);
    (crewRepository.find as jest.Mock).mockResolvedValue([
      { id: 'ca1', utilisateurId: 'user-1', vol: f1, utilisateur: { nom: 'Rakoto' } },
      { id: 'ca2', utilisateurId: 'user-1', vol: f2, utilisateur: { nom: 'Rakoto' } },
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
  });
});
