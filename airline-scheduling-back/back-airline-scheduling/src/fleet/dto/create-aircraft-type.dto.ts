import { IsInt, IsNumber, IsPositive, IsString, Length, Min } from 'class-validator';

export class CreateAircraftTypeDto {
  @IsString()
  @Length(1, 100)
  nomModele!: string;

  @IsString()
  @Length(1, 80)
  fabricant!: string;

  @IsInt()
  @Min(1)
  capaciteMax!: number;

  @IsNumber()
  @IsPositive()
  vitesseCroisiere!: number;

  @IsNumber()
  @IsPositive()
  autonomieMax!: number;

  @IsNumber()
  @Min(0)
  consommationCarburant!: number;

  @IsNumber()
  @IsPositive()
  intervalleMaintenanceHeures!: number;
}
