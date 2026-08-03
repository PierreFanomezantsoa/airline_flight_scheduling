import { IsString, IsNotEmpty, IsDateString, IsEnum, IsOptional, Length } from 'class-validator';

export class CreateFlightDto {
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de vol est obligatoire.' })
  @Length(2, 50, { message: 'Le numéro de vol doit contenir entre 2 et 50 caractères.' })
  numeroVol!: string;

  @IsString()
  @IsNotEmpty({ message: "L'aéroport de départ est obligatoire." })
  @Length(3, 10, { message: "Le code de l'aéroport de départ est invalide (ex: CDG, TNR)." })
  aeroportDepart!: string;

  @IsString()
  @IsNotEmpty({ message: "L'aéroport d'arrivée est obligatoire." })
  @Length(3, 10, { message: "Le code de l'aéroport d'arrivée est invalide (ex: JFK, ORY)." })
  aeroportArrivee!: string;

  @IsDateString({}, { message: "L'heure de départ doit être une date ISO 8601 valide (ex: 2026-07-28T08:00:00Z)." })
  @IsNotEmpty({ message: "L'heure de départ est obligatoire." })
  heureDepart!: string;

  @IsDateString({}, { message: "L'heure d'arrivée doit être une date ISO 8601 valide (ex: 2026-07-28T10:30:00Z)." })
  @IsNotEmpty({ message: "L'heure d'arrivée est obligatoire." })
  heureArrivee!: string;

  @IsOptional()
  @IsEnum(['Scheduled', 'Delayed', 'Cancelled', 'In-Flight', 'Effectué'], {
    message: 'Le statut fourni doit être : Scheduled, Delayed, Cancelled, In-Flight ou Effectué.',
  })
  statut?: 'Scheduled' | 'Delayed' | 'Cancelled' | 'In-Flight' | 'Effectué';

  @IsString()
  @IsOptional()
  avionId?: string; // UUID ou ID de l'avion lié
}