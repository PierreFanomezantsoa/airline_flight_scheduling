import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AircraftAvailabilityQueryDto } from '../scheduling/dto/aircraft-availability-query.dto';
import { CreateFlightDto } from './dto/create-flight.dto';
import { UpdateFlightDto } from './dto/update-flight.dto';
import { FlightsService } from './flights.service';

@Controller('flights')
export class FlightsController {
  constructor(private readonly flightsService: FlightsService) {}

  @Get()
  findAll() { return this.flightsService.findAll(); }

  @Get('conflicts')
  detectConflicts() { return this.flightsService.detectConflicts(); }

  @Post('optimize')
  @HttpCode(HttpStatus.OK)
  optimize() { return this.flightsService.optimize(); }

  @Get('availability/aircraft')
  availableAircraft(@Query() query: AircraftAvailabilityQueryDto) {
    return this.flightsService.availableAircraft(query);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validate(@Body() dto: CreateFlightDto) { return this.flightsService.validate(dto); }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.flightsService.findOne(id); }

  @Post()
  create(@Body() dto: CreateFlightDto) { return this.flightsService.create(dto); }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFlightDto) {
    return this.flightsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.flightsService.remove(id); }
}
