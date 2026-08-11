import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  MaintenanceStatus,
  MaintenanceType,
} from '../../common/enums/airline.enums';

export class UpdateMaintenanceSlotDto {
  @IsOptional()
  @IsUUID()
  aircraftId?: string;

  @IsOptional()
  @IsEnum(MaintenanceType)
  maintenanceType?: MaintenanceType;

  @IsOptional()
  @IsEnum(MaintenanceStatus)
  status?: MaintenanceStatus;

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
