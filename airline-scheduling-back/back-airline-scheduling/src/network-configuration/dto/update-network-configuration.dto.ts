import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdateNetworkConfigurationDto {
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  mediumHaulTurnaroundMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(360)
  longHaulTurnaroundMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  positioningBufferMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(72)
  minimumCrewRestHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  maximumContinuousFlightHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  maintenanceWarningHours?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(/^[A-Za-z]{3}$/, {
    each: true,
    message: 'Chaque hub doit être un code IATA de 3 lettres.',
  })
  hubIataCodes?: string[];
}
