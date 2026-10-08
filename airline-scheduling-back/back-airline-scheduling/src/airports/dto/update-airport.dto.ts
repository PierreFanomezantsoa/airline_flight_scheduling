import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class UpdateAirportDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  airportName?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  city?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  country?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}