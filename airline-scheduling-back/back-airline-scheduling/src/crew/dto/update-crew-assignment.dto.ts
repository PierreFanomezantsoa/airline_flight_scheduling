import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CrewRole } from '../../common/enums/airline.enums';

export class UpdateCrewAssignmentDto {
  @IsOptional()
  @IsUUID()
  refFlight?: string;

  @IsOptional()
  @IsUUID()
  refUser?: string;

  @IsOptional()
  @IsEnum(CrewRole)
  crewRole?: CrewRole;
}
