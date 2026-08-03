import { IsNumber, IsString, Length } from 'class-validator';

export class CreateAircraftTypeDto {
  @IsString()
  @Length(1, 100)
  nomModele!: string;

  @IsString()
  @Length(1, 50)
  fabricant!: string;

  @IsNumber()
  capaciteMax!: number;

  @IsNumber()
  vitesseCroisiere!: number;

  @IsNumber()
  autonomieMax!: number;

  @IsNumber()
  consommationCarburant!: number;

  @IsNumber()
  intervalleMaintenanceHeures!: number;
}