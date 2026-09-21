// src/features/crew/useCrewAssignments.ts

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ApiError,
  authFetch,
} from '../Api/apiService';

// =============================================================================
// TYPES
// =============================================================================

export interface FlightOption {
  id: string;
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart?: string;
  heureArrivee?: string;
  statut?: string;
}

export interface CrewMember {
  id: string;
  nom: string;
  email: string;
  role: string;
  niveauTechnique?: string;
  niveauMetier?: string;
  heuresReposAvant: number;
  volAssigne: FlightOption | null;
}

export interface CrewAssignmentDTO {
  id: string;
  vol: FlightOption;
  utilisateur: {
    id: string;
    email: string;
    nom: string;
    role: string;
    niveauTechnique?: string;
    niveauMetier?: string;
  };
  heuresReposAvant: number;
}

// =============================================================================
// TYPES INTERNES (payload brut de l'API)
// =============================================================================

interface RawFlight {
  id: string;
  numeroVol?: string;
  flightNumber?: string;
  code?: string;
  aeroportDepart?: string;
  origin?: string;
  aeroportArrivee?: string;
  destination?: string;
  heureDepart?: string;
  heureArrivee?: string;
  statut?: string;
}

interface RawUser {
  id: string;
  email?: string;
  nom?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  niveauTechnique?: string;
  niveauMetier?: string;
  heuresReposAvant?: number;
  restTimeHours?: number;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Transforme une erreur quelconque en message utilisateur lisible.
 */
function getFriendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0:
        return 'Impossible de contacter le serveur. Vérifiez votre connexion.';
      case 401:
        return 'Votre session a expiré. Veuillez vous reconnecter.';
      case 403:
        return "Vous n'avez pas l'autorisation d'accéder à ces données.";
      case 404:
        return 'Ressource introuvable.';
      case 500:
      case 502:
      case 503:
        return 'Le serveur rencontre un problème. Veuillez réessayer plus tard.';
      default:
        return error.message || 'Erreur lors du chargement des données.';
    }
  }

  if (error instanceof Error) {
    return error.message || 'Une erreur inattendue est survenue.';
  }

  return 'Une erreur inattendue est survenue.';
}

/**
 * Lit une réponse JSON de manière sécurisée.
 */
async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    return undefined as T;
  }
}

/**
 * Extrait le message d'erreur d'une réponse NestJS.
 */
async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json();
    if (Array.isArray(payload?.message)) {
      return payload.message.join(', ');
    }
    if (typeof payload?.message === 'string') {
      return payload.message;
    }
    if (typeof payload?.error === 'string') {
      return payload.error;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Normalise un vol brut en `FlightOption`.
 */
function normalizeFlight(raw: RawFlight): FlightOption {
  return {
    id: raw.id,
    numeroVol: raw.numeroVol || raw.flightNumber || raw.code || 'N/A',
    aeroportDepart: raw.aeroportDepart || raw.origin || '—',
    aeroportArrivee: raw.aeroportArrivee || raw.destination || '—',
    heureDepart: raw.heureDepart,
    heureArrivee: raw.heureArrivee,
    statut: raw.statut || 'Scheduled',
  };
}

/**
 * Normalise un utilisateur brut + son affectation éventuelle en `CrewMember`.
 */
function normalizeCrewMember(
  raw: RawUser,
  assignment: CrewAssignmentDTO | undefined,
): CrewMember {
  const fallbackName =
    `${raw.firstName || ''} ${raw.lastName || ''}`.trim() || raw.email || 'Utilisateur';

  return {
    id: raw.id,
    email: raw.email || '',
    nom: raw.nom || fallbackName,
    role: raw.role || "Membre d'équipage",
    niveauTechnique: raw.niveauTechnique,
    niveauMetier: raw.niveauMetier,
    heuresReposAvant:
      assignment?.heuresReposAvant ??
      raw.heuresReposAvant ??
      raw.restTimeHours ??
      12,
    volAssigne: assignment?.vol
      ? normalizeFlight(assignment.vol as RawFlight)
      : null,
  };
}

// =============================================================================
// HOOK
// =============================================================================

export const useCrewAssignments = () => {
  const [flights, setFlights] = useState<FlightOption[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [assignments, setAssignments] = useState<CrewAssignmentDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Permet d'annuler les requêtes en cours si démontage
  const abortRef = useRef<AbortController | null>(null);

  // ===========================================================================
  // CHARGEMENT
  // ===========================================================================

  const fetchData = useCallback(async () => {
    // Annule la requête précédente si elle est encore en cours
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const signal = abortRef.current.signal;

      // ✅ Utilise authFetch : gère l'URL (/api en prod) + le token JWT
      const [flightsRes, usersRes, assignmentsRes] = await Promise.all([
        authFetch('/flights', { method: 'GET', signal }),
        authFetch('/users', { method: 'GET', signal }),
        authFetch('/crew-assignments', { method: 'GET', signal }),
      ]);

      if (!flightsRes.ok) {
        throw new ApiError(
          await extractErrorMessage(flightsRes, 'Impossible de charger les vols.'),
          flightsRes.status,
        );
      }

      if (!usersRes.ok) {
        throw new ApiError(
          await extractErrorMessage(usersRes, 'Impossible de charger les utilisateurs.'),
          usersRes.status,
        );
      }

      if (!assignmentsRes.ok) {
        throw new ApiError(
          await extractErrorMessage(
            assignmentsRes,
            'Impossible de charger les affectations.',
          ),
          assignmentsRes.status,
        );
      }

      const flightsData = (await readJson<RawFlight[]>(flightsRes)) ?? [];
      const usersData = (await readJson<RawUser[]>(usersRes)) ?? [];
      const assignmentsData =
        (await readJson<CrewAssignmentDTO[]>(assignmentsRes)) ?? [];

      // Normalisation
      const formattedFlights = flightsData.map(normalizeFlight);

      const formattedCrew = usersData.map((raw) => {
        const activeAssignment = assignmentsData.find(
          (a) => a.utilisateur?.id === raw.id,
        );
        return normalizeCrewMember(raw, activeAssignment);
      });

      setFlights(formattedFlights);
      setCrew(formattedCrew);
      setAssignments(assignmentsData);
    } catch (err: unknown) {
      // Ignore les erreurs d'annulation
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // ===========================================================================
  // CYCLE DE VIE
  // ===========================================================================

  useEffect(() => {
    void fetchData();

    return () => {
      // Annule la requête au démontage
      abortRef.current?.abort();
    };
  }, [fetchData]);

  // ===========================================================================
  // CRÉATION D'UNE AFFECTATION
  // ===========================================================================

  const assignCrewMember = useCallback(
    async (
      volId: string,
      utilisateurId: string,
      heuresReposAvant: number,
    ): Promise<void> => {
      // ✅ authFetch gère automatiquement l'URL et le token
      const response = await authFetch('/crew-assignments', {
        method: 'POST',
        body: JSON.stringify({
          volId,
          utilisateurId,
          heuresReposAvant,
        }),
      });

      if (!response.ok) {
        const message = await extractErrorMessage(
          response,
          "Erreur lors de l'affectation du membre.",
        );
        throw new ApiError(message, response.status);
      }

      // Synchronisation après succès
      await fetchData();
    },
    [fetchData],
  );

  // ===========================================================================
  // RETURN
  // ===========================================================================

  return {
    flights,
    crew,
    assignments,
    loading,
    error,
    assignCrewMember,
    refresh: fetchData,
  };
};