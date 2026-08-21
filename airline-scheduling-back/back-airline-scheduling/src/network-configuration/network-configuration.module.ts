import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Airport } from '../airports/entities/airport.entity';
import { NetworkConfiguration } from './entities/network-configuration.entity';
import { NetworkConfigurationController } from './network-configuration.controller';
import { NetworkConfigurationService } from './network-configuration.service';

@Module({
  imports: [TypeOrmModule.forFeature([NetworkConfiguration, Airport])],
  controllers: [NetworkConfigurationController],
  providers: [NetworkConfigurationService],
  exports: [NetworkConfigurationService],
})
export class NetworkConfigurationModule {}
