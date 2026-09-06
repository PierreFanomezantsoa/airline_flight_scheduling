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
import type { Aircraft } from '../fleet/entities/aircraft.entity';
import { AircraftAvailabilityQueryDto } from '../scheduling/dto/aircraft-availability-query.dto';
import type { ScheduleValidationResult } from '../scheduling/interfaces/scheduling.interfaces';
import { CreateFlightDto } from './dto/create-flight.dto';
import { UpdateFlightDto } from './dto/update-flight.dto';
import type { Flight } from './entities/flight.entity';
import type { CompletedFlightsSyncResult } from './interfaces/completed-flights-sync-result.interface';
import { FlightsService } from './flights.service';

@Controller('flights')
export class FlightsController {
  constructor(private readonly flightsService: FlightsService) {}

  // ==========================================================================
  // ROUTES STATIQUES
  // IMPORTANT : elles restent avant /:id pour éviter toute ambiguïté de routage.
  // ==========================================================================

  @Get()
  findAll(): Promise<Flight[]> {
    return this.flightsService.findAll();
  }

  @Get('conflicts')
  detectConflicts() {
    return this.flightsService.detectConflicts();
  }

  @Post('optimize')
  @HttpCode(HttpStatus.OK)
  optimize() {
    return this.flightsService.optimize();
  }

  @Get('availability/aircraft')
  availableAircraft(
    @Query() query: AircraftAvailabilityQueryDto,
  ): Promise<Aircraft[]> {
    return this.flightsService.availableAircraft(query);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validate(
    @Body() dto: CreateFlightDto,
  ): Promise<ScheduleValidationResult> {
    return this.flightsService.validate(dto);
  }

  /**
   * Synchronise les vols dont l'arrivée est réellement dépassée.
   * Le type de retour est public/exporté afin de permettre la génération
   * correcte des déclarations TypeScript (.d.ts).
   */
  @Patch('sync/completed')
  @HttpCode(HttpStatus.OK)
  syncCompletedFlights(): Promise<CompletedFlightsSyncResult> {
    return this.flightsService.syncCompletedFlights();
  }

  // ==========================================================================
  // ROUTES PARAMÉTRÉES
  // ==========================================================================

  /**
   * Termine explicitement un vol déjà arrivé.
   * L'opération est idempotente : les heures ne sont créditées qu'une fois.
   */
  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Flight> {
    return this.flightsService.complete(id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Flight> {
    return this.flightsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateFlightDto,
  ): Promise<Flight> {
    return this.flightsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFlightDto,
  ): Promise<Flight> {
    return this.flightsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.flightsService.remove(id);
  }
}
