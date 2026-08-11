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
  numeroVol!: string;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  aeroportDepart!: string;

  @IsOptional()
  @IsString()
  @Length(3, 100)
  aeroportEscale?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  dureeEscale?: number;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  aeroportArrivee!: string;

  @IsDateString()
  heureDepart!: string;

  @IsDateString()
  heureArrivee!: string;

  @IsOptional()
  @IsEnum(FlightStatus)
  statut?: FlightStatus;

  @IsOptional()
  @IsUUID()
  avionId?: string;
}
