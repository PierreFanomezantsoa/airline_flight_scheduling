import { Test, TestingModule } from '@nestjs/testing';
import { FleetService } from './fleet.service';
import { FleetController } from './fleet.controller';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Aircraft } from './entities/aircraft.entity';
import { AircraftType } from './entities/aircraft-type.entity';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('FleetModule', () => {
  let service: FleetService;
  let controller: FleetController;
  let aircraftRepository: jest.Mocked<Repository<Aircraft>>;
  let typeRepository: jest.Mocked<Repository<AircraftType>>;

  const mockAircraftRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockTypeRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FleetController],
      providers: [
        FleetService,
        {
          provide: getRepositoryToken(Aircraft),
          useValue: mockAircraftRepository,
        },
        {
          provide: getRepositoryToken(AircraftType),
          useValue: mockTypeRepository,
        },
      ],
    }).compile();

    service = module.get<FleetService>(FleetService);
    controller = module.get<FleetController>(FleetController);
    aircraftRepository = module.get<Repository<Aircraft>>(
      getRepositoryToken(Aircraft),
    ) as jest.Mocked<Repository<Aircraft>>;
    typeRepository = module.get<Repository<AircraftType>>(
      getRepositoryToken(AircraftType),
    ) as jest.Mocked<Repository<AircraftType>>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('FleetService', () => {
    describe('Operations Avions', () => {
      it('doit trouver tous les avions', async () => {
        const mockAvions = [
          {
            id: '1',
            immatriculation: '5R-MFT',
            modele: 'Boeing 737-800',
            capacite: 189,
            heuresDeVolTotales: 1000,
            limiteHeuresMaintenance: 5000,
            statut: 'Active',
            baseAttache: 'TNR',
            heuresDepuisDerniereMaintenance: 100,
            dateDerniereMaintenance: new Date(),
            creeA: new Date(),
            misAJourA: new Date(),
            type: null,
          },
        ];
        mockAircraftRepository.find.mockResolvedValue(mockAvions as any);

        const resultat = await service.trouverTous();

        expect(resultat).toEqual(mockAvions);
        expect(mockAircraftRepository.find).toHaveBeenCalledWith({
          relations: ['type'],
          order: { creeA: 'DESC' },
        });
      });

      it('doit trouver un avion par son immatriculation', async () => {
        const mockAvion = {
          id: '1',
          immatriculation: '5R-MFT',
          modele: 'Boeing 737-800',
          capacite: 189,
        };
        mockAircraftRepository.findOne.mockResolvedValue(mockAvion as any);

        const resultat = await service.trouverParImmatriculation('5R-MFT');

        expect(resultat).toEqual(mockAvion);
        expect(mockAircraftRepository.findOne).toHaveBeenCalledWith({
          where: { immatriculation: '5R-MFT' },
          relations: ['type'],
        });
      });

      it('doit lever une exception NotFoundException si l immatriculation n existe pas', async () => {
        mockAircraftRepository.findOne.mockResolvedValue(null);

        await expect(service.trouverParImmatriculation('INVALIDE')).rejects.toThrow(
          NotFoundException,
        );
      });

      it('doit creer un avion', async () => {
        const dtoCreation = {
          immatriculation: '5R-MFT',
          modele: 'Boeing 737-800',
          capacite: 189,
          limiteHeuresMaintenance: 5000,
        };
        const mockAvion = { id: '1', ...dtoCreation, statut: 'Active' };

        mockAircraftRepository.findOne.mockResolvedValue(null);
        mockAircraftRepository.create.mockReturnValue(mockAvion as any);
        mockAircraftRepository.save.mockResolvedValue(mockAvion as any);

        const resultat = await service.creer(dtoCreation);

        expect(resultat).toEqual(mockAvion);
        expect(mockAircraftRepository.save).toHaveBeenCalledWith(mockAvion);
      });

      it('doit lever une exception BadRequestException si l immatriculation existe deja', async () => {
        const dtoCreation = {
          immatriculation: '5R-MFT',
          modele: 'Boeing 737-800',
          capacite: 189,
          limiteHeuresMaintenance: 5000,
        };
        const avionExistant = { id: '1', ...dtoCreation };

        mockAircraftRepository.findOne.mockResolvedValue(avionExistant as any);

        await expect(service.creer(dtoCreation)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('doit modifier un avion', async () => {
        const id = '1';
        const mockAvion = {
          id,
          immatriculation: '5R-MFT',
          modele: 'Boeing 737-800',
          capacite: 189,
        };
        const dtoModification = { capacite: 200 };
        const avionModifie = { ...mockAvion, ...dtoModification };

        mockAircraftRepository.findOne.mockResolvedValue(mockAvion as any);
        mockAircraftRepository.save.mockResolvedValue(avionModifie as any);

        const resultat = await service.modifier(id, dtoModification);

        expect(resultat.capacite).toBe(200);
        expect(mockAircraftRepository.save).toHaveBeenCalled();
      });

      it('doit supprimer un avion', async () => {
        const id = '1';
        const mockAvion = { id, immatriculation: '5R-MFT' };

        mockAircraftRepository.findOne.mockResolvedValue(mockAvion as any);
        mockAircraftRepository.remove.mockResolvedValue(mockAvion as any);

        const resultat = await service.supprimer(id);

        expect(resultat.supprime).toBe(true);
        expect(resultat.id).toBe(id);
        expect(mockAircraftRepository.remove).toHaveBeenCalledWith(mockAvion);
      });
    });

    describe('Operations Types d Avion', () => {
      it('doit creer un type d avion', async () => {
        const dtoCreation = {
          nomModele: 'Boeing 737-800',
          fabricant: 'Boeing',
          capaciteMax: 189,
          vitesseCroisiere: 490,
          autonomieMax: 5400,
          consommationCarburant: 5000,
          intervalleMaintenanceHeures: 5000,
        };
        const mockType = { id: '1', ...dtoCreation };

        mockTypeRepository.findOne.mockResolvedValue(null);
        mockTypeRepository.create.mockReturnValue(mockType as any);
        mockTypeRepository.save.mockResolvedValue(mockType as any);

        const resultat = await service.creerType(dtoCreation);

        expect(resultat).toEqual(mockType);
        expect(mockTypeRepository.save).toHaveBeenCalledWith(mockType);
      });

      it('doit trouver tous les types d avion', async () => {
        const mockTypes = [
          {
            id: '1',
            nomModele: 'Boeing 737-800',
            fabricant: 'Boeing',
            avions: [],
          },
        ];
        typeRepository.find.mockResolvedValue(mockTypes as any);

        const resultat = await service.trouverTousLesTypes();

        expect(resultat).toEqual(mockTypes);
        expect(mockTypeRepository.find).toHaveBeenCalledWith({
          relations: ['avions'],
          order: { creeA: 'DESC' },
        });
      });
    });

    describe('Statistiques de la Flotte', () => {
      it('doit retourner les statistiques de la flotte', async () => {
        const mockAvions = [
          {
            id: '1',
            statut: 'Active',
            capacite: 189,
            heuresDeVolTotales: 1000,
            immatriculation: '5R-MFT',
          },
          {
            id: '2',
            statut: 'Maintenance',
            capacite: 189,
            heuresDeVolTotales: 500,
            immatriculation: '5R-MFF',
          },
        ];
        mockAircraftRepository.find.mockResolvedValue(mockAvions as any);

        const resultat = await service.obtenirStatistiquesFlotte();

        expect(resultat.totalAvions).toBe(2);
        expect(resultat.avionsActifs).toBe(1);
        expect(resultat.avionsEnMaintenance).toBe(1);
        expect(resultat.heuresDeVolTotales).toBe(1500);
      });
    });
  });

  describe('FleetController', () => {
    it('doit appeler trouverTousLesAvions', async () => {
      const mockAvions: any[] = [];
      jest.spyOn(service, 'trouverTous').mockResolvedValue(mockAvions);

      const resultat = await controller.trouverTousLesAvions();

      expect(resultat).toEqual(mockAvions);
    });

    it('doit appeler obtenirStatistiquesFlotte', async () => {
      const mockStats = {
        totalAvions: 5,
        avionsActifs: 4,
        avionsEnMaintenance: 1,
        avionsHorsService: 0,
        avionsRetires: 0,
        heuresDeVolTotales: 10000,
        moyenneHeuresDeVol: 2000,
        capaciteMoyenne: 189,
      };
      jest.spyOn(service, 'obtenirStatistiquesFlotte').mockResolvedValue(mockStats);

      const resultat = await controller.obtenirStatistiquesFlotte();

      expect(resultat).toEqual(mockStats);
    });
  });
});