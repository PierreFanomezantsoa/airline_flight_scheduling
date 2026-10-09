// src/features/dashboard/types/flight.ts

export interface FlightLegData {
  flightNumber: string;
  depAirportCode: string;
  arrAirportCode: string;
  departureTime: string;
  arrivalTime: string;
}

export interface FlightFormData {
  flightNumber: string;
  depAirportCode: string;
  stopoverCodes?: string | string[];
  stopoverMins?: number;
  arrAirportCode: string;
  departureTime: string;
  arrivalTime: string;
  refAircraft: string;
  flightStatus?: 'Planifié' | 'Retardé' | 'En Vol' | 'Annulé' | 'Effectué';
  motifAnnulation?: string;
  legs?: FlightLegData[];
}