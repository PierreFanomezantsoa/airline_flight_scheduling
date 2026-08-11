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

export class CreateAircraftDto {
  @IsString()
  @Length(2, 20)
  immatriculation!: string;

  @IsString()
  @Length(1, 100)
  modele!: string;

  @IsInt()
  @Min(1)
  capacite!: number;

  @IsNumber()
  @IsPositive()
  limiteHeuresMaintenance!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heuresDeVolTotales?: number;

  @IsOptional()
  @IsEnum(AircraftStatus)
  statut?: AircraftStatus;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  baseAttache?: string;

  @IsOptional()
  @IsUUID()
  typeId?: string;
}
