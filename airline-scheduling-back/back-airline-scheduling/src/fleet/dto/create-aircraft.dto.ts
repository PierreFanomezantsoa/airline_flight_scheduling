import { IsNumber, IsOptional, IsString, Length, IsEnum } from 'class-validator';

export class CreateAircraftDto {
  @IsString()
  @Length(1, 20)
  immatriculation!: string;

  @IsString()
  @Length(1, 100)
  modele!: string;

  @IsNumber()
  capacite!: number;

  @IsNumber()
  limiteHeuresMaintenance!: number;

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
  @IsString()
  typeId?: string;
}