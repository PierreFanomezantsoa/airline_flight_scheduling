// dto/create-crew-assignment.dto.ts
import { IsUUID, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateCrewAssignmentDto {
  @IsUUID()
  volId!: string;

  @IsUUID()
  utilisateurId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heuresReposAvant?: number;
}