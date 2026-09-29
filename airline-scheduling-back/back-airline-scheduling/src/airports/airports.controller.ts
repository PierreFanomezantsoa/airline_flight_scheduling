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

  @Get(':iata')
  findOne(@Param('iata') iata: string) {
    return this.airportsService.findOne(iata);
  }

  @Post()
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.REGULATOR)
  create(@Body() dto: CreateAirportDto) {
    return this.airportsService.create(dto);
  }

  @Patch(':iata')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.REGULATOR)
  update(@Param('iata') iata: string, @Body() dto: UpdateAirportDto) {
    return this.airportsService.update(iata, dto);
  }

  @Delete(':iata')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.REGULATOR)
  remove(@Param('iata') iata: string) {
    return this.airportsService.remove(iata);
  }
}
