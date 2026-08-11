import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AirportsService } from './airports.service';
import { CreateAirportDto } from './dto/create-airport.dto';

@Controller('airports')
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
  create(@Body() dto: CreateAirportDto) {
    return this.airportsService.create(dto);
  }
}
