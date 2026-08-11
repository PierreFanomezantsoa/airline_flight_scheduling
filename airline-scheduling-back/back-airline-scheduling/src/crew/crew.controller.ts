import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CrewService } from './crew.service';
import { CreateCrewAssignmentDto } from './dto/create-crew-assignment.dto';
import { UpdateCrewAssignmentDto } from './dto/update-crew-assignment.dto';

@Controller('crew-assignments')
export class CrewController {
  constructor(private readonly crewService: CrewService) {}

  @Post()
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
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCrewAssignmentDto) {
    return this.crewService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.crewService.remove(id); }
}
