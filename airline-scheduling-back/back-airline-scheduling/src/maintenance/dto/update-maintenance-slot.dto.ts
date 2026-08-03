import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';

export class UpdateMaintenanceSlotDto {
  @IsOptional()
  @IsString()
  aircraftId?: string;

  @IsOptional()
  @IsEnum(['Type A', 'Type C', 'Aircraft On Ground'])
  maintenanceType?: 'Type A' | 'Type C' | 'Aircraft On Ground';

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
