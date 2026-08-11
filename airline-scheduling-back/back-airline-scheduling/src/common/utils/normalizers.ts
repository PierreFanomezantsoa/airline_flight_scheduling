export const normalizeIata = (value: string): string => value.trim().toUpperCase();

export const normalizeFlightNumber = (value: string): string =>
  value.trim().toUpperCase();

export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export const normalizeRegistration = (value: string): string =>
  value.trim().toUpperCase();
