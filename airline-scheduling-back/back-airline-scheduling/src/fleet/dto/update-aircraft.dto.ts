import { IsNumber, IsOptional, IsString, Length, IsEnum } from 'class-validator';

export class UpdateAircraftDto {
  @IsOptional()
  @IsString()
  @Length(1, 20)
  immatriculation?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  modele?: string;

  @IsOptional()
  @IsNumber()
  capacite?: number;

  @IsOptional()
  @IsNumber()
  limiteHeuresMaintenance?: number;

  @IsOptional()
  @IsNumber()
  heuresDeVolTotales?: number;

  @IsOptional()
  @IsEnum(['Active', 'Maintenance', 'Out of Service', 'Retired'])
  statut?: 'Active' | 'Maintenance' | 'Out of Service' | 'Retired';

  @IsOptional()
  @IsString()
  @Length(1, 50)
  baseAttache?: string;

  @IsOptional()
  @IsNumber()
  heuresDepuisDerniereMaintenance?: number;

  @IsOptional()
  @IsString()
  typeId?: string;
}