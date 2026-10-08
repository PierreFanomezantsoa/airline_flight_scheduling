import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateAirportDto {
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'refAirport doit contenir exactement 3 lettres.' })
  refAirport!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(3, 80)
  timezone!: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  country?: string;
}
