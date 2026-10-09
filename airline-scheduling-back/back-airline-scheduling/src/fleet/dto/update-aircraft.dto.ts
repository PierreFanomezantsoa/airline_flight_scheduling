import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { AircraftStatus } from '../../common/enums/airline.enums';

export class UpdateAircraftDto {
  @IsOptional()
  @IsString()
  @Length(2, 20)
  registration?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  maintLimitHrs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalFlightHrs?: number;

  @IsOptional()
  @IsEnum(AircraftStatus)
  aircraftStatus?: AircraftStatus;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  homeBase?: string | null;

  @IsOptional()
  @IsUUID()
  refAircraftType?: string | null;
}
