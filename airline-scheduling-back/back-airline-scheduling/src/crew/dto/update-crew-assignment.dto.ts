import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CrewRole } from '../../common/enums/airline.enums';

export class UpdateCrewAssignmentDto {
  @IsOptional()
  @IsUUID()
  volId?: string;

  @IsOptional()
  @IsUUID()
  utilisateurId?: string;

  @IsOptional()
  @IsEnum(CrewRole)
  fonction?: CrewRole;
}
