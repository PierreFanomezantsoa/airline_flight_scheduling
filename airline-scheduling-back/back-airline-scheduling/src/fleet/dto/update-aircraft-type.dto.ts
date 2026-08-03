import { IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class UpdateAircraftTypeDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  nomModele?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  fabricant?: string;

  @IsOptional()
  @IsNumber()
  capaciteMax?: number;

  @IsOptional()
  @IsNumber()
  vitesseCroisiere?: number;

  @IsOptional()
  @IsNumber()
  autonomieMax?: number;

  @IsOptional()
  @IsNumber()
  consommationCarburant?: number;

  @IsOptional()
  @IsNumber()
  intervalleMaintenanceHeures?: number;
}