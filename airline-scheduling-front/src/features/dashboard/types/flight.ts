// src/features/dashboard/types/flight.ts

export interface FlightLegData {
  flightNumber: string;
  departureAirportCode: string;
  arrivalAirportCode: string;
  departureTime: string;
  arrivalTime: string;
}

export interface FlightFormData {
  flightNumber: string;
  departureAirportCode: string;
  stopoverAirportCodes?: string | string[];
  stopoverDurationMinutes?: number;
  arrivalAirportCode: string;
  departureTime: string;
  arrivalTime: string;
  refAircraft: string;
  flightStatus?: 'Planifié' | 'Retardé' | 'En Vol' | 'Annulé' | 'Effectué';
  motifAnnulation?: string;
  legs?: FlightLegData[];
}