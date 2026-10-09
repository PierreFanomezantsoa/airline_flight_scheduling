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
  depAirportCode!: string;

  @IsOptional()
  @IsString()
  @Length(3, 100)
  stopoverCodes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stopoverMins?: number;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  arrAirportCode!: string;

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
