import { IsString, Length, Matches } from 'class-validator';

export class CreateAirportDto {
  @IsString()
  @Length(3, 3, { message: 'Le code IATA doit comporter exactement 3 caractères.' })
  @Matches(/^[A-Z]{3}$/, { message: 'Le code IATA doit être composé de 3 lettres majuscules.' })
  iata!: string;

  @IsString()
  @Length(3, 100)
  name!: string;

  @IsString()
  @Length(3, 50)
  timezone!: string;
}