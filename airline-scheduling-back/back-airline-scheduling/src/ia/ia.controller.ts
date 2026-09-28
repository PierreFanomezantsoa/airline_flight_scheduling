import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { IaService } from './ia.service';

@Controller('ia')
@UseGuards(SessionAuthGuard)
export class IaController {
  constructor(private readonly iaService: IaService) {}

  @Get('conflicts')
  analyzeConflicts() {
    return this.iaService.analyzeConflicts();
  }
}
