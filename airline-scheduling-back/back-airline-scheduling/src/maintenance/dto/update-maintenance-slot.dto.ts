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
  refAircraft?: string;

  @IsOptional()
  @IsEnum(MaintenanceType)
  maintType?: MaintenanceType;

  @IsOptional()
  @IsEnum(MaintenanceStatus)
  maintStatus?: MaintenanceStatus;

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
