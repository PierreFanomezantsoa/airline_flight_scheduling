import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CrewRole } from '../../common/enums/airline.enums';

export class CreateCrewAssignmentDto {
  @IsUUID()
  volId!: string;

  @IsUUID()
  utilisateurId!: string;

  @IsOptional()
  @IsEnum(CrewRole)
  fonction?: CrewRole;
}
