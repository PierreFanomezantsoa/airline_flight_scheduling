import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { FlightStatus } from '../../common/enums/airline.enums';

export class CreateFlightDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 20)
  flightNumber!: string;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  departureAirportCode!: string;

  @IsOptional()
  @IsString()
  @Length(3, 100)
  stopoverAirportCodes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stopoverDurationMinutes?: number;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  arrivalAirportCode!: string;

  @IsDateString()
  departureTime!: string;

  @IsDateString()
  arrivalTime!: string;

  @IsOptional()
  @IsEnum(FlightStatus)
  flightStatus?: FlightStatus;

  @IsOptional()
  @IsUUID()
  refAircraft?: string;
}
