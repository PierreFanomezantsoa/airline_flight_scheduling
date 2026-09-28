import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AircraftAvailabilityQueryDto } from './dto/aircraft-availability-query.dto';
import { SchedulingService } from './services/scheduling.service';
import { AuthenticatedRoles } from '../auth/decorators/authenticated-roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

@Controller('scheduling')
@UseGuards(SessionAuthGuard)
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get('conflicts')
  detectConflicts() {
    return this.schedulingService.detectAll();
  }

  @Get('aircraft-availability')
  availableAircraft(@Query() query: AircraftAvailabilityQueryDto) {
    return this.schedulingService.findAvailableAircraft(query);
  }

  @Post('optimize')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.REGULATOR)
  optimize() {
    return this.schedulingService.optimize();
  }
}
