import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

export class AircraftAvailabilityQueryDto {
  @IsDateString()
  start!: string;

  @IsDateString()
  end!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  origin?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  destination?: string;
}
