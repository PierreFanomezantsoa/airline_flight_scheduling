import { Body, Controller, Post } from '@nestjs/common';
import { IaService } from './ia.service';
import { FlightSchema } from './dto/flight-schema.dto';
import { OptimizationRequestDto } from './dto/optimization-request.dto';

@Controller('ia')
export class IaController {
  constructor(private readonly iaService: IaService) {}

  @Post('optimize')
   optimize(@Body() request: OptimizationRequestDto) {
    return  this.iaService.optimizeSchedule(request);
  }
}
