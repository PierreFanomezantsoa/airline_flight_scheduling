import { IsISO8601, IsString } from 'class-validator';

export class FlightSchema {
  @IsString()
  id!: string;

  @IsString()
  aircraft_id!: string;

  @IsISO8601()
  departure_time!: string;

  @IsISO8601()
  arrival_time!: string;

  @IsString()
  status!: string;
}
