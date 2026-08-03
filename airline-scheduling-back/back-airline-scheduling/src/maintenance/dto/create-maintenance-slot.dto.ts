import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';

export class CreateMaintenanceSlotDto {
  @IsString()
  aircraftId!: string;

  @IsEnum(['Type A', 'Type C', 'Aircraft On Ground'])
  maintenanceType!: 'Type A' | 'Type C' | 'Aircraft On Ground';

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
