import { Controller, Get } from '@nestjs/common';
import { IaService } from './ia.service';

@Controller('ia')
export class IaController {
  constructor(private readonly iaService: IaService) {}

  @Get('conflicts')
  analyzeConflicts() {
    return this.iaService.analyzeConflicts();
  }
}
