// src/maintenance/dto/extend-maintenance-slot.dto.ts
import { IsInt, Max, Min } from 'class-validator';

export class ExtendMaintenanceSlotDto {
  @IsInt()
  @Min(1)
  @Max(90)
  additionalDays!: number;
}