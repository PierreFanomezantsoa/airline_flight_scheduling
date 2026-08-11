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
  numeroVol?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  aeroportDepart?: string;

  @IsOptional()
  @IsString()
  @Length(3, 100)
  aeroportEscale?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  dureeEscale?: number | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  aeroportArrivee?: string;

  @IsOptional()
  @IsDateString()
  heureDepart?: string;

  @IsOptional()
  @IsDateString()
  heureArrivee?: string;

  @IsOptional()
  @IsEnum(FlightStatus)
  statut?: FlightStatus;

  @IsOptional()
  @IsUUID()
  avionId?: string | null;
}
