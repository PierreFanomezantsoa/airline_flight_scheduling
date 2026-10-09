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

export class CreateMaintenanceSlotDto {
  @IsUUID()
  refAircraft!: string;

  @IsEnum(MaintenanceType)
  maintType!: MaintenanceType;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(MaintenanceStatus)
  maintStatus?: MaintenanceStatus;
}
