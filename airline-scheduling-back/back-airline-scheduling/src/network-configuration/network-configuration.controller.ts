import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { UpdateNetworkConfigurationDto } from './dto/update-network-configuration.dto';
import { NetworkConfigurationService } from './network-configuration.service';
import { AuthenticatedRoles } from '../auth/decorators/authenticated-roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@Controller('network-configuration')
@UseGuards(SessionAuthGuard)
export class NetworkConfigurationController {
  constructor(
    private readonly networkConfigurationService: NetworkConfigurationService,
  ) {}

  @Get()
  getConfiguration() {
    return this.networkConfigurationService.getConfiguration();
  }

  @Put()
  @AuthenticatedRoles(UserRole.REGULATOR, UserRole.PRODUCT_OWNER)
  updateConfiguration(@Body() dto: UpdateNetworkConfigurationDto) {
    return this.networkConfigurationService.update(dto);
  }
}
