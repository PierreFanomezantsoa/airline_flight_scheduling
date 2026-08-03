// dto/update-crew-assignment.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateCrewAssignmentDto } from './create-crew-assignment.dto';

export class UpdateCrewAssignmentDto extends PartialType(CreateCrewAssignmentDto) {}