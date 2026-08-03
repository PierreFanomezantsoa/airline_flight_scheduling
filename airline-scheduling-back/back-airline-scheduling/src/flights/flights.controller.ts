import { 
  Controller, 
  Get, 
  Post, 
  Patch,
  Delete,
  Param, 
  Body, 
  ParseUUIDPipe, 
  HttpCode, 
  HttpStatus 
} from '@nestjs/common';
import { FlightsService } from './flights.service';
import { Flight } from './entities/flight.entity';
import { CreateFlightDto } from './dto/create-flight.dto';
import { UpdateFlightDto } from './dto/update-flight.dto';

@Controller('flights')
export class FlightsController {
  constructor(private readonly flightsService: FlightsService) {}

  /**
   * Récupère la liste de tous les vols
   */
  @Get()
  async findAll(): Promise<Flight[]> {
    return this.flightsService.findAll();
  }

  /**
   * Lance l'optimisation automatique et la résolution de conflits
   * ⚠️ Placé avant ':id' pour éviter les conflits de routage Express/Nest
   */
  @Post('optimize')
  @HttpCode(HttpStatus.OK)
  async triggerOptimization() {
    return this.flightsService.runAutoOptimization();
  }

  /**
   * Récupère un vol spécifique par son UUID
   */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Flight> {
    return this.flightsService.findOne(id);
  }

  /**
   * Crée un nouveau vol avec détection préventive de conflits
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createFlightDto: CreateFlightDto): Promise<Flight> {
    return this.flightsService.create(createFlightDto);
  }

  /**
   * Met à jour un vol existant
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateFlightDto: UpdateFlightDto,
  ): Promise<Flight> {
    return this.flightsService.update(id, updateFlightDto);
  }

  /**
   * Supprime un vol de la base de données
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.flightsService.remove(id);
  }
}