import {
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Airport } from '../airports/entities/airport.entity';
import { SchedulingPolicy } from '../common/constants/scheduling-policy';
import { UpdateNetworkConfigurationDto } from './dto/update-network-configuration.dto';
import { NetworkConfiguration } from './entities/network-configuration.entity';

export interface NetworkOperationalPolicy {
  minimumTurnaroundMinutes: number;
  mediumHaulTurnaroundMinutes: number;
  longHaulTurnaroundMinutes: number;
  positioningBufferMinutes: number;
  minimumCrewRestHours: number;
  maximumContinuousFlightHours: number;
  maintenanceWarningHours: number;
}

const DEFAULT_ID = 'default';

@Injectable()
export class NetworkConfigurationService implements OnModuleInit {
  private currentPolicy: NetworkOperationalPolicy = {
    minimumTurnaroundMinutes: SchedulingPolicy.minimumTurnaroundMinutes,
    mediumHaulTurnaroundMinutes: SchedulingPolicy.minimumTurnaroundMinutes,
    longHaulTurnaroundMinutes: Number(process.env.LONG_HAUL_TURNAROUND_MINUTES ?? 90),
    positioningBufferMinutes: SchedulingPolicy.positioningBufferMinutes,
    minimumCrewRestHours: SchedulingPolicy.minimumCrewRestHours,
    maximumContinuousFlightHours: Number(process.env.MAX_CONTINUOUS_FLIGHT_HOURS ?? 8),
    maintenanceWarningHours: SchedulingPolicy.maintenanceWarningHours,
  };

  constructor(
    @InjectRepository(NetworkConfiguration)
    private readonly configRepository: Repository<NetworkConfiguration>,
    @InjectRepository(Airport)
    private readonly airportRepository: Repository<Airport>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureConfiguration();
  }

  getPolicy(): NetworkOperationalPolicy {
    return { ...this.currentPolicy };
  }

  async getConfiguration() {
    const config = await this.ensureConfiguration();
    const hubCodes = this.normalizeHubCodes(config.hubIataCodes);

    const airports = hubCodes.length
      ? await this.airportRepository.find({
          where: { iata: In(hubCodes) },
        })
      : [];

    const airportByIata = new Map(
      airports.map((airport) => [airport.iata.toUpperCase(), airport]),
    );

    return {
      ...config,
      hubIataCodes: hubCodes,
      hubs: hubCodes.map((iata) => {
        const airport = airportByIata.get(iata);
        return airport
          ? {
              iata: airport.iata,
              name: airport.name,
              city: airport.city,
              country: airport.country,
              timezone: airport.timezone,
              active: airport.active,
            }
          : {
              iata,
              name: null,
              city: null,
              country: null,
              timezone: null,
              active: false,
              warning: 'Aéroport absent du référentiel.',
            };
      }),
    };
  }

  async update(dto: UpdateNetworkConfigurationDto) {
    const config = await this.ensureConfiguration();

    if (dto.hubIataCodes !== undefined) {
      const hubCodes = this.normalizeHubCodes(dto.hubIataCodes);
      await this.assertAirportsExist(hubCodes);
      config.hubIataCodes = hubCodes;
    }

    if (dto.mediumHaulTurnaroundMinutes !== undefined) {
      config.mediumHaulTurnaroundMinutes = dto.mediumHaulTurnaroundMinutes;
    }
    if (dto.longHaulTurnaroundMinutes !== undefined) {
      config.longHaulTurnaroundMinutes = dto.longHaulTurnaroundMinutes;
    }
    if (dto.positioningBufferMinutes !== undefined) {
      config.positioningBufferMinutes = dto.positioningBufferMinutes;
    }
    if (dto.minimumCrewRestHours !== undefined) {
      config.minimumCrewRestHours = dto.minimumCrewRestHours;
    }
    if (dto.maximumContinuousFlightHours !== undefined) {
      config.maximumContinuousFlightHours = dto.maximumContinuousFlightHours;
    }
    if (dto.maintenanceWarningHours !== undefined) {
      config.maintenanceWarningHours = dto.maintenanceWarningHours;
    }

    const saved = await this.configRepository.save(config);
    this.applyToCache(saved);

    return this.getConfiguration();
  }

  private async ensureConfiguration(): Promise<NetworkConfiguration> {
    let config = await this.configRepository.findOne({
      where: { id: DEFAULT_ID },
    });

    if (!config) {
      config = this.configRepository.create({
        id: DEFAULT_ID,
        mediumHaulTurnaroundMinutes: SchedulingPolicy.minimumTurnaroundMinutes,
        longHaulTurnaroundMinutes: Number(process.env.LONG_HAUL_TURNAROUND_MINUTES ?? 90),
        positioningBufferMinutes: SchedulingPolicy.positioningBufferMinutes,
        minimumCrewRestHours: SchedulingPolicy.minimumCrewRestHours,
        maximumContinuousFlightHours: Number(process.env.MAX_CONTINUOUS_FLIGHT_HOURS ?? 8),
        maintenanceWarningHours: SchedulingPolicy.maintenanceWarningHours,
        hubIataCodes: ['TNR', 'WFI', 'CDG'],
      });
      config = await this.configRepository.save(config);
    }

    this.applyToCache(config);
    return config;
  }

  private applyToCache(config: NetworkConfiguration): void {
    this.currentPolicy = {
      minimumTurnaroundMinutes: config.mediumHaulTurnaroundMinutes,
      mediumHaulTurnaroundMinutes: config.mediumHaulTurnaroundMinutes,
      longHaulTurnaroundMinutes: config.longHaulTurnaroundMinutes,
      positioningBufferMinutes: config.positioningBufferMinutes,
      minimumCrewRestHours: config.minimumCrewRestHours,
      maximumContinuousFlightHours: config.maximumContinuousFlightHours,
      maintenanceWarningHours: config.maintenanceWarningHours,
    };
  }

  private normalizeHubCodes(values: string[] | null | undefined): string[] {
    return [...new Set((values ?? []).map((value) => value.trim().toUpperCase()))];
  }

  private async assertAirportsExist(iataCodes: string[]): Promise<void> {
    if (iataCodes.length === 0) return;

    const airports = await this.airportRepository.find({
      where: { iata: In(iataCodes) },
    });
    const found = new Set(airports.map((airport) => airport.iata.toUpperCase()));
    const missing = iataCodes.filter((iata) => !found.has(iata));

    if (missing.length > 0) {
      throw new NotFoundException(
        `Hub(s) absent(s) du référentiel aéroports : ${missing.join(', ')}.`,
      );
    }
  }
}
