import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CrewRole } from '../../common/enums/airline.enums';

export class CreateCrewAssignmentDto {
  @IsUUID()
  refFlight!: string;

  @IsUUID()
  refUser!: string;

  @IsOptional()
  @IsEnum(CrewRole)
  crewRole?: CrewRole;
}
