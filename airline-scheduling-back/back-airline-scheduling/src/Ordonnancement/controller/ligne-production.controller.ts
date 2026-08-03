import { Controller, Get, Patch, Param } from '@nestjs/common';
import { LigneProductionService } from '../ligne-production.service';

// Le chemin doit être 'lignes-production'
@Controller('lignes-production') 
export class LigneProductionController {
  constructor(private readonly service: LigneProductionService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Patch(':id/toggle')
  toggleActive(@Param('id') id: number) {
    return this.service.toggleActive(id);
  }
}