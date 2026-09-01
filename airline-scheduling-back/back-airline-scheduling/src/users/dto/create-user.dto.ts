import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { UserRole } from '../enums/user-role.enum';

export const SELF_REGISTRATION_ROLES = [
  UserRole.PLANIFICATEUR,
  UserRole.REGULATOR,
  UserRole.CREW_MEMBER,
  UserRole.MAINTENANCE_ENGINEER,
] as const;

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 150)
  nom!: string;

  @IsIn(SELF_REGISTRATION_ROLES, {
    message:
      "Ce rôle ne peut pas être demandé depuis l'inscription publique.",
  })
  role!:
    | UserRole.PLANIFICATEUR
    | UserRole.REGULATOR
    | UserRole.CREW_MEMBER
    | UserRole.MAINTENANCE_ENGINEER;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  niveauTechnique?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  niveauMetier?: string;
}
