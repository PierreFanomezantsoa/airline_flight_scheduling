import { IsInt, IsNumber, IsPositive, IsString, Length, Min } from 'class-validator';

export class CreateAircraftTypeDto {
  @IsString()
  @Length(1, 100)
  modelName!: string;

  @IsString()
  @Length(1, 80)
  manufacturer!: string;

  @IsInt()
  @Min(1)
  maxCapacity!: number;

  @IsNumber()
  @IsPositive()
  cruiseSpeed!: number;

  @IsNumber()
  @IsPositive()
  maxRange!: number;

  @IsNumber()
  @Min(0)
  fuelConsumption!: number;

  @IsNumber()
  @IsPositive()
  maintenanceIntervalHours!: number;
}
