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
  modelName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  manufacturer?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCapacity?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  cruiseSpeed?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxRange?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fuelConsumption?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  maintIntervalHrs?: number;
}
