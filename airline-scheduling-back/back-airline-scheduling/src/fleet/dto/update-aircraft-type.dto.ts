import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class UpdateAircraftTypeDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  nomModele?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  fabricant?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capaciteMax?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  vitesseCroisiere?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  autonomieMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  consommationCarburant?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  intervalleMaintenanceHeures?: number;
}
