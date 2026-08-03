import { useState, useEffect, useCallback } from 'react';

// Structure d'un Vol
export interface FlightOption {
  id: string;
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart?: string;
  heureArrivee?: string;
  statut?: string;
}

// Structure d'un Utilisateur / Membre d'équipage
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

// Structure complète d'une affectation (DTO retourné par GET /crew-assignments)
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

const API_BASE_URL = 'http://localhost:3001'; // Ajuster selon votre port NestJS

export const useCrewAssignments = () => {
  const [flights, setFlights] = useState<FlightOption[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [assignments, setAssignments] = useState<CrewAssignmentDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Charger les vols, les utilisateurs et les affectations existantes
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [flightsRes, usersRes, assignmentsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/flights`),
        fetch(`${API_BASE_URL}/users`),
        fetch(`${API_BASE_URL}/crew-assignments`),
      ]);

      if (!flightsRes.ok || !usersRes.ok || !assignmentsRes.ok) {
        throw new Error('Erreur lors du chargement des données depuis le serveur.');
      }

      const flightsData: FlightOption[] = await flightsRes.json();
      const usersData: any[] = await usersRes.json();
      const assignmentsData: CrewAssignmentDTO[] = await assignmentsRes.json();

      // 1. Normalisation de la liste des vols
      const formattedFlights: FlightOption[] = flightsData.map((f: any) => ({
        id: f.id,
        numeroVol: f.numeroVol || f.flightNumber || f.code || 'N/A',
        aeroportDepart: f.aeroportDepart || f.origin || 'TNR',
        aeroportArrivee: f.aeroportArrivee || f.destination || 'WHE',
        heureDepart: f.heureDepart,
        heureArrivee: f.heureArrivee,
        statut: f.statut || 'Scheduled',
      }));

      // 2. Mappage des utilisateurs avec leurs affectations NestJS et heures de repos
      const formattedCrew: CrewMember[] = usersData.map((u: any) => {
        // Trouver la dernière affectation active pour cet utilisateur
        const activeAssignment = assignmentsData.find(
          (a) => a.utilisateur?.id === u.id
        );

        return {
          id: u.id,
          email: u.email || '',
          nom: u.nom || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
          role: u.role || 'Membre d\'équipage',
          niveauTechnique: u.niveauTechnique,
          niveauMetier: u.niveauMetier,
          // Récupère la valeur depuis l'affectation, sinon depuis l'utilisateur, sinon 12h par défaut
          heuresReposAvant: activeAssignment?.heuresReposAvant ?? u.heuresReposAvant ?? u.restTimeHours ?? 12,
          volAssigne: activeAssignment?.vol ? {
            id: activeAssignment.vol.id,
            numeroVol: activeAssignment.vol.numeroVol,
            aeroportDepart: activeAssignment.vol.aeroportDepart,
            aeroportArrivee: activeAssignment.vol.aeroportArrivee,
            heureDepart: activeAssignment.vol.heureDepart,
            heureArrivee: activeAssignment.vol.heureArrivee,
            statut: activeAssignment.vol.statut,
          } : null,
        };
      });

      setFlights(formattedFlights);
      setCrew(formattedCrew);
      setAssignments(assignmentsData);
    } catch (err: any) {
      setError(err.message || 'Impossible de contacter le serveur NestJS.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Créer ou mettre à jour une affectation (POST /crew-assignments)
  const assignCrewMember = async (volId: string, utilisateurId: string, heuresReposAvant: number) => {
    const response = await fetch(`${API_BASE_URL}/crew-assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        volId,
        utilisateurId,
        heuresReposAvant,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        Array.isArray(errorData.message)
          ? errorData.message.join(', ')
          : errorData.message || "Erreur lors de l'affectation du membre."
      );
    }

    // Synchronisation automatique après création
    await fetchData();
  };

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