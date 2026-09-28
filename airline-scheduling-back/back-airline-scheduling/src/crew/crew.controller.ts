import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CrewService } from './crew.service';
import { CreateCrewAssignmentDto } from './dto/create-crew-assignment.dto';
import { UpdateCrewAssignmentDto } from './dto/update-crew-assignment.dto';
import { AuthenticatedRoles } from '../auth/decorators/authenticated-roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

@Controller('crew-assignments')
@UseGuards(SessionAuthGuard)
export class CrewController {
  constructor(private readonly crewService: CrewService) {}

  @Post()
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.REGULATOR)
  create(@Body() dto: CreateCrewAssignmentDto) { return this.crewService.create(dto); }

  @Get()
  findAll() { return this.crewService.findAll(); }

  @Get('flight/:flightId')
  findByFlight(@Param('flightId', ParseUUIDPipe) flightId: string) {
    return this.crewService.findByFlight(flightId);
  }

  @Get('user/:userId')
  findByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.crewService.findByUser(userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.crewService.findOne(id); }

  @Patch(':id')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.REGULATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCrewAssignmentDto) {
    return this.crewService.update(id, dto);
  }

  @Delete(':id')
  @AuthenticatedRoles(UserRole.PLANIFICATEUR, UserRole.REGULATOR)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.crewService.remove(id); }
}
