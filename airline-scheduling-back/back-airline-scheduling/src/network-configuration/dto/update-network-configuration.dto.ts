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
  mediumTurnMins?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(360)
  longTurnMins?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  posBufferMins?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(72)
  minCrewRestHrs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  maxContFlightHrs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  maintWarnHrs?: number;

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
