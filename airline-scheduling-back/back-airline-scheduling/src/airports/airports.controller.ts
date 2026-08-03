import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { AirportsService } from './airports.service';
import { CreateAirportDto } from './create-airport.dto';
import { Airport } from './airport.entity';

@Controller('airports')
export class AirportsController {
  constructor(private readonly airportsService: AirportsService) {}

  @Get()
  async findAll(): Promise<Airport[]> {
    return this.airportsService.findAll();
  }

  @Get(':iata')
  async findOne(@Param('iata') iata: string): Promise<Airport> {
    return this.airportsService.findOne(iata);
  }

  @Post()
  async create(@Body() createAirportDto: CreateAirportDto): Promise<Airport> {
    return this.airportsService.create(createAirportDto);
  }
}