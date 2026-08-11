import { Controller, Get, Post, Query } from '@nestjs/common';
import { AircraftAvailabilityQueryDto } from './dto/aircraft-availability-query.dto';
import { SchedulingService } from './services/scheduling.service';

@Controller('scheduling')
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
  optimize() {
    return this.schedulingService.optimize();
  }
}
