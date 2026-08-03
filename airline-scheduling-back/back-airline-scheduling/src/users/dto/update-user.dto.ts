import { IsEmail, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { UserRole } from '../entities/user.entity'; // Ajustez le chemin selon votre structure

export class UpdateUserDto {
  @IsOptional()
  @IsEmail({}, { message: 'Adresse email invalide' })
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Rôle invalide' })
  role?: UserRole;

  @IsOptional()
  @IsString()
  techLevel?: string;

  @IsOptional()
  @IsString()
  businessLevel?: string;

  @IsOptional()
  @IsString()
  password?: string;
}