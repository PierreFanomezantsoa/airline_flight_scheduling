import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { AirportsService } from './airports.service';
import { CreateAirportDto } from './dto/create-airport.dto';
import { UpdateAirportDto } from './dto/update-airport.dto';
import { AuthenticatedRoles } from '../auth/decorators/authenticated-roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@Controller('airports')
@UseGuards(SessionAuthGuard)
export class AirportsController {
  constructor(private readonly airportsService: AirportsService) {}

  @Get()
  findAll() {
    return this.airportsService.findAll();
  }

  @Get(':refAirport')
  findOne(@Param('refAirport') refAirport: string) {
    return this.airportsService.findOne(refAirport);
  }

  @Post()
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.REGULATOR)
  create(@Body() dto: CreateAirportDto) {
    return this.airportsService.create(dto);
  }

  @Patch(':refAirport')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.REGULATOR)
  update(@Param('refAirport') refAirport: string, @Body() dto: UpdateAirportDto) {
    return this.airportsService.update(refAirport, dto);
  }

  @Delete(':refAirport')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.REGULATOR)
  remove(@Param('refAirport') refAirport: string) {
    return this.airportsService.remove(refAirport);
  }
}
