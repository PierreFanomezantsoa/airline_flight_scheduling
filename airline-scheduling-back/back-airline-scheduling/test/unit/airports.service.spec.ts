import 'reflect-metadata';
import { Repository } from 'typeorm';
import { ROLES_KEY } from '../../src/auth/decorators/roles.decorator';
import { UserRole } from '../../src/users/enums/user-role.enum';
import { AirportsController } from '../../src/airports/airports.controller';
import { AirportsService } from '../../src/airports/airports.service';
import { Airport } from '../../src/airports/entities/airport.entity';

describe('Airports CRUD', () => {
  const repository = {
    create: jest.fn(),
    exists: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<Repository<Airport>>;
  let service: AirportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AirportsService(repository);
  });

  it('limits airport mutations to planners and OCC regulators', () => {
    const allowedRoles = [UserRole.PLANIFICATEUR, UserRole.REGULATOR];
    const readHandlers = [
      AirportsController.prototype.findAll,
      AirportsController.prototype.findOne,
    ];
    const mutationHandlers = [
      AirportsController.prototype.create,
      AirportsController.prototype.update,
      AirportsController.prototype.remove,
    ];

    for (const handler of readHandlers) {
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
    }
    for (const handler of mutationHandlers) {
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(allowedRoles);
    }
  });

  it('normalizes and stores a new airport', async () => {
    const airport = {
      refAirport: 'CDG',
      airportName: 'Charles de Gaulle',
      timezone: 'Europe/Paris',
      city: 'Paris',
      country: 'France',
      active: true,
    } as Airport;
    repository.exists.mockResolvedValue(false);
    repository.create.mockReturnValue(airport);
    repository.save.mockResolvedValue(airport);

    const result = await service.create({
      refAirport: ' cdg ',
      airportName: ' Charles de Gaulle ',
      timezone: ' Europe/Paris ',
      city: ' Paris ',
      country: ' France ',
    });

    expect(repository.create).toHaveBeenCalledWith({
      refAirport: 'CDG',
      airportName: 'Charles de Gaulle',
      timezone: 'Europe/Paris',
      city: 'Paris',
      country: 'France',
    });
    expect(result).toBe(airport);
  });

  it('updates airport details and activation state', async () => {
    const airport = {
      refAirport: 'CDG',
      airportName: 'Charles de Gaulle',
      timezone: 'Europe/Paris',
      city: 'Paris',
      country: 'France',
      active: true,
    } as Airport;
    repository.findOne.mockResolvedValue(airport);
    repository.save.mockImplementation(async (value) => value as Airport);

    await service.update('cdg', {
      airportName: ' Roissy Charles de Gaulle ',
      city: null,
      active: false,
    });

    expect(airport.airportName).toBe('Roissy Charles de Gaulle');
    expect(airport.city).toBeNull();
    expect(airport.active).toBe(false);
    expect(repository.save).toHaveBeenCalledWith(airport);
  });

  it('soft-deletes airports and excludes inactive ones from flight validation', async () => {
    const airport = {
      refAirport: 'CDG',
      airportName: 'Charles de Gaulle',
      timezone: 'Europe/Paris',
      city: 'Paris',
      country: 'France',
      active: true,
    } as Airport;
    repository.findOne.mockResolvedValue(airport);
    repository.save.mockImplementation(async (value) => value as Airport);

    await service.remove('CDG');
    expect(airport.active).toBe(false);
    await expect(service.assertExists('CDG')).rejects.toThrow('est inactif');
  });
});