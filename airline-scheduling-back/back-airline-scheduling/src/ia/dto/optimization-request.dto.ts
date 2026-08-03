import { IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FlightSchema } from './flight-schema.dto';

export class OptimizationRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlightSchema)
  flights!: FlightSchema[];

  @IsOptional()
  @IsInt()
  turnaround_minutes?: number;
}
