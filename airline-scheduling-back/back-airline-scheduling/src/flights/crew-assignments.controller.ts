import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  ParseUUIDPipe, 
  HttpCode, 
  HttpStatus 
} from '@nestjs/common';
import { CrewAssignmentsService } from './crew-assignments.service';
import { CreateCrewAssignmentDto } from './dto/create-crew-assignment.dto';
import { UpdateCrewAssignmentDto } from './dto/update-crew-assignment.dto';

@Controller('crew-assignments')
export class CrewAssignmentsController {
  constructor(private readonly crewAssignmentsService: CrewAssignmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createDto: CreateCrewAssignmentDto) {
    return this.crewAssignmentsService.create(createDto);
  }

  @Get()
  findAll() {
    return this.crewAssignmentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.crewAssignmentsService.findOne(id);
  }

  @Get('vol/:volId')
  findByVol(@Param('volId', ParseUUIDPipe) volId: string) {
    return this.crewAssignmentsService.findByVol(volId);
  }

  @Get('utilisateur/:utilisateurId')
  findByUtilisateur(@Param('utilisateurId', ParseUUIDPipe) utilisateurId: string) {
    return this.crewAssignmentsService.findByUtilisateur(utilisateurId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateDto: UpdateCrewAssignmentDto
  ) {
    return this.crewAssignmentsService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.crewAssignmentsService.remove(id);
  }
}