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
  minTurnMins: number;
  mediumTurnMins: number;
  longTurnMins: number;
  posBufferMins: number;
  minCrewRestHrs: number;
  maxContFlightHrs: number;
  maintWarnHrs: number;
}

const DEFAULT_ID = 'default';

@Injectable()
export class NetworkConfigurationService implements OnModuleInit {
  private currentPolicy: NetworkOperationalPolicy = {
    minTurnMins: SchedulingPolicy.minTurnMins,
    mediumTurnMins: SchedulingPolicy.minTurnMins,
    longTurnMins: Number(process.env.LONG_HAUL_TURNAROUND_MINUTES ?? 90),
    posBufferMins: SchedulingPolicy.posBufferMins,
    minCrewRestHrs: SchedulingPolicy.minCrewRestHrs,
    maxContFlightHrs: Number(process.env.MAX_CONTINUOUS_FLIGHT_HOURS ?? 8),
    maintWarnHrs: SchedulingPolicy.maintWarnHrs,
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
          where: { refAirport: In(hubCodes) },
        })
      : [];

    const airportByIata = new Map(
      airports.map((airport) => [airport.refAirport.toUpperCase(), airport]),
    );

    return {
      ...config,
      hubIataCodes: hubCodes,
      hubs: hubCodes.map((refAirport) => {
        const airport = airportByIata.get(refAirport);
        return airport
          ? {
              refAirport: airport.refAirport,
              airportName: airport.airportName,
              city: airport.city,
              country: airport.country,
              timezone: airport.timezone,
              active: airport.active,
            }
          : {
              refAirport,
              airportName: null,
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

    if (dto.mediumTurnMins !== undefined) {
      config.mediumTurnMins = dto.mediumTurnMins;
    }
    if (dto.longTurnMins !== undefined) {
      config.longTurnMins = dto.longTurnMins;
    }
    if (dto.posBufferMins !== undefined) {
      config.posBufferMins = dto.posBufferMins;
    }
    if (dto.minCrewRestHrs !== undefined) {
      config.minCrewRestHrs = dto.minCrewRestHrs;
    }
    if (dto.maxContFlightHrs !== undefined) {
      config.maxContFlightHrs = dto.maxContFlightHrs;
    }
    if (dto.maintWarnHrs !== undefined) {
      config.maintWarnHrs = dto.maintWarnHrs;
    }

    const saved = await this.configRepository.save(config);
    this.applyToCache(saved);

    return this.getConfiguration();
  }

  private async ensureConfiguration(): Promise<NetworkConfiguration> {
    let config = await this.configRepository.findOne({
      where: { refNetworkConfig: DEFAULT_ID },
    });

    if (!config) {
      config = this.configRepository.create({
        refNetworkConfig: DEFAULT_ID,
        mediumTurnMins: SchedulingPolicy.minTurnMins,
        longTurnMins: Number(process.env.LONG_HAUL_TURNAROUND_MINUTES ?? 90),
        posBufferMins: SchedulingPolicy.posBufferMins,
        minCrewRestHrs: SchedulingPolicy.minCrewRestHrs,
        maxContFlightHrs: Number(process.env.MAX_CONTINUOUS_FLIGHT_HOURS ?? 8),
        maintWarnHrs: SchedulingPolicy.maintWarnHrs,
        hubIataCodes: ['TNR', 'WFI', 'CDG'],
      });
      config = await this.configRepository.save(config);
    }

    this.applyToCache(config);
    return config;
  }

  private applyToCache(config: NetworkConfiguration): void {
    this.currentPolicy = {
      minTurnMins: config.mediumTurnMins,
      mediumTurnMins: config.mediumTurnMins,
      longTurnMins: config.longTurnMins,
      posBufferMins: config.posBufferMins,
      minCrewRestHrs: config.minCrewRestHrs,
      maxContFlightHrs: config.maxContFlightHrs,
      maintWarnHrs: config.maintWarnHrs,
    };
  }

  private normalizeHubCodes(values: string[] | null | undefined): string[] {
    return [...new Set((values ?? []).map((value) => value.trim().toUpperCase()))];
  }

  private async assertAirportsExist(iataCodes: string[]): Promise<void> {
    if (iataCodes.length === 0) return;

    const airports = await this.airportRepository.find({
      where: { refAirport: In(iataCodes) },
    });
    const found = new Set(airports.map((airport) => airport.refAirport.toUpperCase()));
    const missing = iataCodes.filter((refAirport) => !found.has(refAirport));

    if (missing.length > 0) {
      throw new NotFoundException(
        `Hub(s) absent(s) du référentiel aéroports : ${missing.join(', ')}.`,
      );
    }
  }
}
