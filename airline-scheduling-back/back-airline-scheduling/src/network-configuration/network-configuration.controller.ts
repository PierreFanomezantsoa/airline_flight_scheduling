import { Body, Controller, Get, Put } from '@nestjs/common';
import { UpdateNetworkConfigurationDto } from './dto/update-network-configuration.dto';
import { NetworkConfigurationService } from './network-configuration.service';

@Controller('network-configuration')
export class NetworkConfigurationController {
  constructor(
    private readonly networkConfigurationService: NetworkConfigurationService,
  ) {}

  @Get()
  getConfiguration() {
    return this.networkConfigurationService.getConfiguration();
  }

  @Put()
  updateConfiguration(@Body() dto: UpdateNetworkConfigurationDto) {
    return this.networkConfigurationService.update(dto);
  }
}
