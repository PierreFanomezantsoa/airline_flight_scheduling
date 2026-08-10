// src/features/dashboard/types/flight.ts

export interface FlightLegData {
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart: string;
  heureArrivee: string;
}

export interface FlightFormData {
  numeroVol: string;
  aeroportDepart: string;
  aeroportEscale?: string | string[];
  dureeEscale?: number;
  aeroportArrivee: string;
  heureDepart: string;
  heureArrivee: string;
  avionId: string;
  status?: 'Planifié' | 'Retardé' | 'En Vol' | 'Annulé' | 'Effectué';
  motifAnnulation?: string;
  legs?: FlightLegData[];
}