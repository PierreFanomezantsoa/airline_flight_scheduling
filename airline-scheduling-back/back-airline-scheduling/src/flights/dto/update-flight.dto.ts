import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { FlightStatus } from '../../common/enums/airline.enums';

export class UpdateFlightDto {
  @IsOptional()
  @IsString()
  @Length(2, 20)
  flightNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  departureAirportCode?: string;

  @IsOptional()
  @IsString()
  @Length(3, 100)
  stopoverAirportCodes?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  stopoverDurationMinutes?: number | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  arrivalAirportCode?: string;

  @IsOptional()
  @IsDateString()
  departureTime?: string;

  @IsOptional()
  @IsDateString()
  arrivalTime?: string;

  @IsOptional()
  @IsEnum(FlightStatus)
  flightStatus?: FlightStatus;

  @IsOptional()
  @IsUUID()
  refAircraft?: string | null;
}
