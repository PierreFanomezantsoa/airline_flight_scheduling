import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
