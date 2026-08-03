import { IsNotEmpty, IsNumber, IsDateString, IsOptional, IsInt, Min } from 'class-validator';

export class CreerLigneDto {
  @IsNotEmpty()
  nom!: string; // Le "!" indique à TypeScript que la propriété sera définie par le framework (via class-validator)

  @IsNotEmpty()
  code!: string;

  @IsNumber()
  @Min(0.1)
  capaciteParHeure!: number;
}

export class AssignerTacheDto {
  @IsInt()
  @IsNotEmpty()
  ligneId!: number;

  @IsInt()
  @IsNotEmpty()
  tacheId!: number;

  @IsDateString()
  @IsNotEmpty()
  dateDebut!: string; // "!" au lieu de "?" pour garantir que ce n'est pas "undefined"

  @IsDateString()
  @IsNotEmpty()
  dateFin!: string;
}

export class DeplacerCreneauDto {
  @IsOptional()
  @IsInt()
  ligneId?: number; // Ici, "?" est correct car le champ est optionnel (@IsOptional)

  @IsDateString()
  @IsNotEmpty()
  dateDebut!: string;

  @IsDateString()
  @IsNotEmpty()
  dateFin!: string;
}