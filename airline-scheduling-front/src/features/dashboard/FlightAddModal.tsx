import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  X, 
  Calendar, 
  Plane, 
  MapPin, 
  Sun, 
  CloudRain, 
  CloudLightning, 
  Clock, 
  AlertCircle, 
  GitFork, 
  Wrench, 
  ArrowRightLeft, 
  CheckCircle2,
  Plus,
  Trash2
} from 'lucide-react';

// ==========================================
// TYPES & INTERFACES
// ==========================================

// src/features/dashboard/FlightAddModal.tsx

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

export interface MaintenanceSlot {
  id?: string;
  aircraftId?: string;
  avionId?: string;
  immatriculation?: string;
  registration?: string;
  aircraft?: { 
    id?: string; 
    model?: string; 
    modele?: string;
    immatriculation?: string;
    registration?: string;
  };
  startTime: string;
  endTime: string;
  maintenanceType?: string;
}

export interface AircraftData {
  id: string;
  model?: string;
  modele?: string;
  registration?: string;
  immatriculation?: string;
  status?: string;
  statut?: string;
}

export interface AirportOption {
  iata: string;
  name: string;
  gmtOffset: number;
}

interface FlightAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: FlightFormData) => Promise<void>;
  fleetAircrafts: AircraftData[];
  isLoadingFleet: boolean;
  maintenanceSlots?: MaintenanceSlot[];
  initialData?: FlightFormData;
}

// ==========================================
// CONSTANTES & CONFIGURATIONS
// ==========================================

const AIRPORTS_LIST: readonly AirportOption[] = [
  { iata: 'TNR', name: 'Antananarivo (Ivato)', gmtOffset: 3 },
  { iata: 'CDG', name: 'Paris (Charles de Gaulle)', gmtOffset: 2 },
  { iata: 'JFK', name: 'New York (JFK)', gmtOffset: -4 },
  { iata: 'DXB', name: 'Dubai International', gmtOffset: 4 },
  { iata: 'RUN', name: 'La Réunion (Roland Garros)', gmtOffset: 4 },
  { iata: 'MRU', name: 'Maurice (Sir Seewoosagur)', gmtOffset: 4 }
];

const DIRECT_ROUTES_AND_STOPS: Record<string, Record<string, number>> = {
  TNR: { CDG: 11, DXB: 6.5, RUN: 1.5, MRU: 1.75 },
  CDG: { TNR: 11, JFK: 8, DXB: 7, RUN: 11, MRU: 11.5 },
  JFK: { CDG: 7.5, DXB: 12.5 },
  DXB: { TNR: 6.5, CDG: 7, JFK: 14, RUN: 6, MRU: 6.5 },
  RUN: { TNR: 1.5, CDG: 11, DXB: 6, MRU: 0.75 },
  MRU: { TNR: 1.75, CDG: 11.5, DXB: 6.5, RUN: 0.75 }
};

const INITIAL_FORM_STATE: FlightFormData = {
  numeroVol: '',
  aeroportDepart: '',
  aeroportEscale: '',
  dureeEscale: 120,
  aeroportArrivee: '',
  heureDepart: '',
  heureArrivee: '',
  avionId: '',
  status: 'Planifié',
  motifAnnulation: '',
  legs: []
};

// ==========================================
// FONCTIONS UTILITAIRES PURS
// ==========================================

const formatFlightDuration = (hoursDecimal: number): string => {
  const h = Math.floor(hoursDecimal);
  const m = Math.round((hoursDecimal - h) * 60);
  return `${h}h${m > 0 ? ` ${m}m` : ''}`;
};

const normalizeAircraft = (ac: AircraftData) => {
  const registration = ac.immatriculation || ac.registration || '';
  const model = ac.modele || ac.model || 'Modèle inconnu';
  const status = ac.statut || ac.status || '';
  const id = ac.id || registration;
  return { id, registration, model, status };
};

const getSlotAircraftRef = (slot: MaintenanceSlot): string | undefined => {
  return (
    slot.immatriculation ||
    slot.registration ||
    slot.aircraft?.immatriculation ||
    slot.aircraft?.registration ||
    slot.aircraftId ||
    slot.avionId ||
    slot.aircraft?.id
  );
};

const isAircraftInMaintenanceStatus = (status?: string): boolean => {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s.includes('mainten') || s.includes('immobilis') || s === 'out_of_service';
};

const checkOverlap = (startA: string, endA: string, startB: string, endB: string): boolean => {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();
  return aStart < bEnd && aEnd > bStart;
};

const formatDateToIsoInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const calculateArrivalGMT = (
  originIata: string,
  destinationIata: string,
  departureIsoString: string
): string => {
  if (!originIata || !destinationIata || !departureIsoString) return '';

  const originAirport = AIRPORTS_LIST.find((a) => a.iata === originIata);
  const destAirport = AIRPORTS_LIST.find((a) => a.iata === destinationIata);

  if (!originAirport || !destAirport || originIata === destinationIata) return '';

  const durationHours = DIRECT_ROUTES_AND_STOPS[originIata]?.[destinationIata];
  if (durationHours === undefined) return '';

  const departureDate = new Date(departureIsoString);
  if (isNaN(departureDate.getTime())) return '';

  const gmtDiffHours = destAirport.gmtOffset - originAirport.gmtOffset;
  const totalDurationMinutes = (durationHours + gmtDiffHours) * 60;
  
  const arrivalDate = new Date(departureDate.getTime() + totalDurationMinutes * 60 * 1000);
  return formatDateToIsoInput(arrivalDate);
};

// ==========================================
// COMPOSANT PRINCIPAL
// ==========================================

export const FlightAddModal: React.FC<FlightAddModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  fleetAircrafts,
  isLoadingFleet,
  maintenanceSlots = [],
  initialData,
}) => {
  const [newFlight, setNewFlight] = useState<FlightFormData>(INITIAL_FORM_STATE);
  const [selectedStop, setSelectedStop] = useState<string>('');
  const [layoverHours, setLayoverHours] = useState<number>(2);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdition = !!initialData;

  // Réinitialisation du formulaire à l'ouverture
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setNewFlight({ ...initialData });
        const stopStr = Array.isArray(initialData.aeroportEscale) 
          ? initialData.aeroportEscale[0] 
          : initialData.aeroportEscale || '';
        setSelectedStop(stopStr);
        if (initialData.dureeEscale) {
          setLayoverHours(Math.max(1, Math.round(initialData.dureeEscale / 60)));
        }
      } else {
        setNewFlight({ ...INITIAL_FORM_STATE });
        setSelectedStop('');
        setLayoverHours(2);
      }
    }
  }, [isOpen, initialData]);

  // Fermeture par la touche Échap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Détection de route directe
  const directDurationHours = useMemo(() => {
    if (!newFlight.aeroportDepart || !newFlight.aeroportArrivee) return null;
    return DIRECT_ROUTES_AND_STOPS[newFlight.aeroportDepart]?.[newFlight.aeroportArrivee] ?? null;
  }, [newFlight.aeroportDepart, newFlight.aeroportArrivee]);

  const isDirectRoute = directDurationHours !== null;

  // Hubs d'escale suggérés
  const suggestedStops = useMemo(() => {
    if (newFlight.aeroportDepart && newFlight.aeroportArrivee) {
      const origin = newFlight.aeroportDepart;
      const destination = newFlight.aeroportArrivee;
      
      return AIRPORTS_LIST
        .map(a => a.iata)
        .filter(hub => hub !== origin && hub !== destination)
        .filter(hub => 
          DIRECT_ROUTES_AND_STOPS[origin]?.[hub] !== undefined && 
          DIRECT_ROUTES_AND_STOPS[hub]?.[destination] !== undefined
        );
    }
    return [];
  }, [newFlight.aeroportDepart, newFlight.aeroportArrivee]);

  // Calcul réactif de l'Heure d'arrivée finale et des Tronçons (Legs)
  const routeCalculation = useMemo(() => {
    const { aeroportDepart, aeroportArrivee, heureDepart, numeroVol } = newFlight;
    if (!aeroportDepart || !aeroportArrivee || !heureDepart) {
      return { calculatedArrival: '', generatedLegs: [] };
    }

    if (!selectedStop) {
      if (isDirectRoute) {
        const calculatedArrival = calculateArrivalGMT(aeroportDepart, aeroportArrivee, heureDepart);
        return { calculatedArrival, generatedLegs: [] };
      }
      return { calculatedArrival: '', generatedLegs: [] };
    } 
    
    // Traitement avec Escale sélectionnée
    const leg1Arrival = calculateArrivalGMT(aeroportDepart, selectedStop, heureDepart);
    if (!leg1Arrival) return { calculatedArrival: '', generatedLegs: [] };

    const leg1ArrDate = new Date(leg1Arrival);
    const leg2DepDate = new Date(leg1ArrDate.getTime() + layoverHours * 3600 * 1000);
    const leg2DepartStr = formatDateToIsoInput(leg2DepDate);

    const leg2Arrival = calculateArrivalGMT(selectedStop, aeroportArrivee, leg2DepartStr);
    const baseFlightNum = numeroVol || 'FL';

    const generatedLegs: FlightLegData[] = [
      {
        numeroVol: `${baseFlightNum}-A`,
        aeroportDepart,
        aeroportArrivee: selectedStop,
        heureDepart,
        heureArrivee: leg1Arrival
      },
      {
        numeroVol: `${baseFlightNum}-B`,
        aeroportDepart: selectedStop,
        aeroportArrivee,
        heureDepart: leg2DepartStr,
        heureArrivee: leg2Arrival
      }
    ];

    return { calculatedArrival: leg2Arrival, generatedLegs };
  }, [
    newFlight.aeroportDepart, 
    newFlight.aeroportArrivee, 
    newFlight.heureDepart, 
    newFlight.numeroVol, 
    isDirectRoute, 
    selectedStop, 
    layoverHours
  ]);

  // Synchronisation de l'heure d'arrivée calculée et des escales
  useEffect(() => {
    setNewFlight(prev => {
      const isArrivalSame = prev.heureArrivee === routeCalculation.calculatedArrival;
      const areLegsSame = JSON.stringify(prev.legs) === JSON.stringify(routeCalculation.generatedLegs);
      const isStopSame = prev.aeroportEscale === selectedStop;
      const isDurationSame = prev.dureeEscale === layoverHours * 60;

      if (isArrivalSame && areLegsSame && isStopSame && isDurationSame) {
        return prev;
      }

      return {
        ...prev,
        aeroportEscale: selectedStop || undefined,
        dureeEscale: selectedStop ? layoverHours * 60 : undefined,
        heureArrivee: routeCalculation.calculatedArrival,
        legs: routeCalculation.generatedLegs
      };
    });
  }, [routeCalculation, selectedStop, layoverHours]);

  const isPastDate = useMemo(() => {
    if (!newFlight.heureDepart) return false;
    return new Date(newFlight.heureDepart) < new Date();
  }, [newFlight.heureDepart]);

  const simulatedSeverity = useMemo(() => {
    if (!newFlight.aeroportDepart || !newFlight.heureDepart) return null;
    const seed = newFlight.aeroportDepart.charCodeAt(0) + new Date(newFlight.heureDepart).getDate();
    return (seed % 100) / 100;
  }, [newFlight.aeroportDepart, newFlight.heureDepart]);

  const handleSwapAirports = useCallback(() => {
    setNewFlight((prev) => ({
      ...prev,
      aeroportDepart: prev.aeroportArrivee,
      aeroportArrivee: prev.aeroportDepart,
    }));
    setSelectedStop('');
  }, []);

  // Évaluation de la disponibilité des appareils dans la flotte
  const fleetWithStatus = useMemo(() => {
    const { heureDepart, heureArrivee } = newFlight;
    const hasValidDates = Boolean(heureDepart && heureArrivee);

    return fleetAircrafts.map((rawAc) => {
      const ac = normalizeAircraft(rawAc);
      const isGlobalMaint = isAircraftInMaintenanceStatus(ac.status);

      let slotConflict: MaintenanceSlot | undefined;

      if (hasValidDates) {
        slotConflict = maintenanceSlots.find((slot) => {
          const slotRef = getSlotAircraftRef(slot);
          const isMatch = Boolean(
            (ac.registration && slotRef === ac.registration) ||
            (ac.id && slotRef === ac.id)
          );

          return isMatch && checkOverlap(heureDepart, heureArrivee, slot.startTime, slot.endTime);
        });
      }

      const isSlotMaint = Boolean(slotConflict);
      const isDisabled = isGlobalMaint || isSlotMaint;

      let labelSuffix = '';
      if (isGlobalMaint) {
        labelSuffix = ` 🛠️ (EN MAINTENANCE - ${ac.status || 'Immobilisé'})`;
      } else if (isSlotMaint) {
        labelSuffix = ' ⚠️ (Créneau réservé pour maintenance)';
      }

      return {
        ...ac,
        isGlobalMaint,
        isSlotMaint,
        isDisabled,
        labelSuffix,
        slotConflict
      };
    });
  }, [fleetAircrafts, maintenanceSlots, newFlight.heureDepart, newFlight.heureArrivee]);

  // Réinitialisation de l'avion sélectionné si indisponible
  useEffect(() => {
    if (newFlight.avionId) {
      const selected = fleetWithStatus.find(
        (ac) => ac.id === newFlight.avionId || ac.registration === newFlight.avionId
      );
      if (selected && selected.isDisabled) {
        setNewFlight((prev) => ({ ...prev, avionId: '' }));
      }
    }
  }, [fleetWithStatus, newFlight.avionId]);

  // Contrôles de validation métier
  const validationError = useMemo(() => {
    if (!isDirectRoute && !selectedStop && newFlight.aeroportDepart && newFlight.aeroportArrivee) {
      return `Absence de liaison directe entre ${newFlight.aeroportDepart} et ${newFlight.aeroportArrivee}. Veuillez sélectionner une escale.`;
    }

    if (newFlight.heureDepart && newFlight.heureArrivee) {
      const dep = new Date(newFlight.heureDepart);
      const arr = new Date(newFlight.heureArrivee);
      if (arr <= dep) {
        return "L'heure d'arrivée doit être strictement postérieure au départ.";
      }
    }

    if (newFlight.avionId) {
      const selectedAircraft = fleetWithStatus.find(
        (ac) => ac.id === newFlight.avionId || ac.registration === newFlight.avionId
      );

      if (selectedAircraft) {
        if (selectedAircraft.isGlobalMaint) {
          const name = selectedAircraft.registration || selectedAircraft.model || 'Appareil';
          return `Immobilisation technique : L'appareil ${name} est actuellement en maintenance (${selectedAircraft.status}).`;
        }

        if (selectedAircraft.slotConflict) {
          const conflict = selectedAircraft.slotConflict;
          const typeStr = conflict.maintenanceType ? ` (${conflict.maintenanceType})` : '';
          return `Conflit de calendrier : Cet appareil est réservé pour maintenance${typeStr} du ${new Date(conflict.startTime).toLocaleString('fr-FR')} au ${new Date(conflict.endTime).toLocaleString('fr-FR')}.`;
        }
      }
    }

    return null;
  }, [
    newFlight.aeroportDepart,
    newFlight.aeroportArrivee,
    newFlight.heureDepart,
    newFlight.heureArrivee,
    newFlight.avionId,
    isDirectRoute,
    selectedStop,
    fleetWithStatus
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const finalFlightData: FlightFormData = {
        ...newFlight,
        status: isPastDate ? 'Annulé' : (newFlight.status || 'Planifié'),
        motifAnnulation: isPastDate ? 'Date de départ dépassée à la création' : newFlight.motifAnnulation
      };
      await onSubmit(finalFlightData);
      setNewFlight(INITIAL_FORM_STATE);
      setSelectedStop('');
      onClose();
    } catch (err) {
      console.error("Erreur lors de la soumission du vol :", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getWeatherSimulationInfo = (severity: number) => {
    if (severity >= 0.8) {
      return {
        icon: <CloudLightning className="h-4 w-4 text-rose-600 animate-pulse" />,
        text: "ALERTE CRITIQUE : Risque météo élevé (Seuil ≥ 0.80)",
        bg: "bg-rose-50 border-rose-200 text-rose-950"
      };
    }
    if (severity >= 0.4) {
      return {
        icon: <CloudRain className="h-4 w-4 text-amber-600" />,
        text: "Météo instable : Risque de perturbation modéré",
        bg: "bg-amber-50 border-amber-200 text-amber-900"
      };
    }
    return {
      icon: <Sun className="h-4 w-4 text-emerald-600" />,
      text: "Conditions nominales optimales",
      bg: "bg-emerald-50 border-emerald-200 text-emerald-900"
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm transition-opacity">
      <div 
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden transform transition-all max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between  px-6 py-4 text-black shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5  rounded-lg">
              <Plane className="h-4 w-4 text-teal-400 rotate-45" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider">
                {isEdition ? 'Modifier la rotation' : 'Créer une rotation'}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">Planification des vols & itinéraire avec escales</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
            aria-label="Fermer la modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Formulaire principal */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          
          {/* Numéro de vol */}
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-[10px]">
              Identifiant / Numéro de Vol
            </label>
            <input
              type="text"
              required
              placeholder="ex: MD050"
              value={newFlight.numeroVol}
              onChange={(e) => setNewFlight({ ...newFlight, numeroVol: e.target.value.toUpperCase() })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none transition uppercase font-mono"
            />
          </div>

          {/* Origine & Destination */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                Itinéraire de la Rotation
              </label>
              {newFlight.aeroportDepart && newFlight.aeroportArrivee && (
                <button
                  type="button"
                  onClick={handleSwapAirports}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-700 hover:text-teal-900 hover:underline transition cursor-pointer"
                >
                  <ArrowRightLeft className="h-3 w-3" /> Intervertir
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <select
                    required
                    value={newFlight.aeroportDepart}
                    onChange={(e) => {
                      setNewFlight({ ...newFlight, aeroportDepart: e.target.value });
                      setSelectedStop('');
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2.5 text-xs font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition appearance-none cursor-pointer"
                  >
                    <option value="">Départ (Origine)</option>
                    {AIRPORTS_LIST.map((ap) => (
                      <option key={ap.iata} value={ap.iata}>
                        {ap.iata} - {ap.name} (GMT{ap.gmtOffset >= 0 ? `+${ap.gmtOffset}` : ap.gmtOffset})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <select
                    required
                    value={newFlight.aeroportArrivee}
                    onChange={(e) => {
                      setNewFlight({ ...newFlight, aeroportArrivee: e.target.value });
                      setSelectedStop('');
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2.5 text-xs font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition appearance-none cursor-pointer"
                  >
                    <option value="">Arrivée (Destination)</option>
                    {AIRPORTS_LIST.map((ap) => (
                      ap.iata !== newFlight.aeroportDepart && (
                        <option key={ap.iata} value={ap.iata}>
                          {ap.iata} - {ap.name} (GMT{ap.gmtOffset >= 0 ? `+${ap.gmtOffset}` : ap.gmtOffset})
                        </option>
                      )
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Indicateur Route Directe & Option d'ajouter une Escale */}
          {isDirectRoute && directDurationHours !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-teal-50/80 border border-teal-200 px-3.5 py-2 rounded-xl text-teal-950">
                <span className="flex items-center gap-1.5 font-bold text-[11px]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" /> Route Directe Optimale
                </span>
                <span className="font-mono text-[11px] font-black bg-teal-100 text-teal-900 px-2 py-0.5 rounded-md">
                  {formatFlightDuration(directDurationHours)} de vol
                </span>
              </div>

              {!selectedStop ? (
                <button
                  type="button"
                  onClick={() => setSelectedStop(suggestedStops[0] || '')}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-slate-900 hover:underline cursor-pointer"
                >
                  <Plus className="h-3 w-3" /> Ajouter une escale facultative
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedStop('')}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" /> Supprimer l'escale optionnelle
                </button>
              )}
            </div>
          )}

          {/* Panneau de Gestion de l'Escale (Obligatoire ou Optionnelle) */}
          {(selectedStop || (!isDirectRoute && newFlight.aeroportDepart && newFlight.aeroportArrivee)) && (
            <div className={`p-3.5 rounded-xl space-y-3 border ${
              !isDirectRoute ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50'
            }`}>
              {!isDirectRoute && (
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-[11px] uppercase text-amber-900">
                      Liaison directe indisponible
                    </p>
                    <p className="text-[11px] font-medium text-amber-800">
                      Aucune ligne directe entre <span className="font-bold font-mono">{newFlight.aeroportDepart}</span> et <span className="font-bold font-mono">{newFlight.aeroportArrivee}</span>. Sélection d'une escale obligatoire.
                    </p>
                  </div>
                </div>
              )}

              {/* Sélection du Hub d'Escale */}
              <div>
                <label className="block font-bold text-slate-700 uppercase text-[9px] mb-1">
                  Sélectionner l'Escale Intermédiaire (Hub)
                </label>
                {suggestedStops.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {suggestedStops.map((stopIata) => {
                      const stopAirport = AIRPORTS_LIST.find((a) => a.iata === stopIata);
                      const active = selectedStop === stopIata;
                      return (
                        <button
                          key={stopIata}
                          type="button"
                          onClick={() => setSelectedStop(stopIata)}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left transition cursor-pointer ${
                            active
                              ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-800 hover:border-slate-400'
                          }`}
                        >
                          <div>
                            <span className={`font-mono font-bold text-xs ${active ? 'text-teal-300' : 'text-slate-900'}`}>
                              {stopIata}
                            </span>
                            <p className="text-[9px] opacity-80 truncate">{stopAirport?.name.split(' ')[0]}</p>
                          </div>
                          {active && <CheckCircle2 className="h-4 w-4 text-teal-400" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] italic text-rose-600 font-semibold">
                    Aucun hub d'escale compatible trouvé pour relier ces deux aéroports.
                  </p>
                )}
              </div>

              {/* Durée de l'escale */}
              {selectedStop && (
                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-3">
                  <label className="font-bold text-slate-700 text-[10px]">
                    Durée de l'Escale à Terre (Layover) :
                  </label>
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={layoverHours}
                      onChange={(e) => setLayoverHours(Math.max(1, Number(e.target.value)))}
                      className="w-10 text-center font-bold text-xs text-slate-900 focus:outline-none"
                    />
                    <span className="text-[10px] font-bold text-slate-500">heure(s)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Affichage synthétique des Tronçons (Legs) générés */}
          {newFlight.legs && newFlight.legs.length > 0 && (
            <div className="bg-slate-900 text-white rounded-xl p-3 space-y-2">
              <span className="text-[9px] font-black uppercase tracking-wider text-teal-400 flex items-center gap-1">
                <GitFork className="h-3 w-3" /> Tronçons de Vol Générés ({newFlight.legs.length})
              </span>
              <div className="space-y-1.5">
                {newFlight.legs.map((leg, idx) => (
                  <div key={idx} className="bg-slate-800/80 rounded-lg p-2 text-[10px] flex items-center justify-between font-mono">
                    <div className="flex items-center gap-2">
                      <span className="bg-teal-900/60 text-teal-300 font-bold px-1.5 py-0.5 rounded">
                        {leg.numeroVol}
                      </span>
                      <span>{leg.aeroportDepart} ➔ {leg.aeroportArrivee}</span>
                    </div>
                    <div className="text-right text-slate-300 text-[9px]">
                      <div>Dép: {leg.heureDepart.split('T')[1]}</div>
                      <div>Arr: {leg.heureArrivee.split('T')[1]}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Horaires Départ & Arrivée */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-[10px]">
                Heure Bloc Départ
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="datetime-local"
                  required
                  value={newFlight.heureDepart}
                  onChange={(e) => setNewFlight({ ...newFlight, heureDepart: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2.5 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-[10px]">
                Heure Arrivée Finale (Calculée)
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="datetime-local"
                  required
                  readOnly
                  disabled={!isDirectRoute && !selectedStop}
                  value={newFlight.heureArrivee}
                  className="w-full rounded-xl border border-slate-200 bg-slate-100/70 pl-9 pr-3 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none transition disabled:opacity-50 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Appareil Assigné */}
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-[10px]">
              Appareil Assigné à la Rotation
            </label>
            <select
              value={newFlight.avionId}
              onChange={(e) => setNewFlight({ ...newFlight, avionId: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-xs font-bold text-slate-900 transition focus:border-slate-900 focus:bg-white focus:outline-none cursor-pointer disabled:opacity-50"
              disabled={isLoadingFleet || (!isDirectRoute && !selectedStop)}
            >
              <option value="">{isLoadingFleet ? 'Chargement de la flotte...' : '-- Sélectionner un avion --'}</option>
              {fleetWithStatus.map((ac) => (
                <option key={ac.id} value={ac.id} disabled={ac.isDisabled}>
                  {ac.registration ? `${ac.registration} (${ac.model})` : ac.model} {ac.labelSuffix}
                </option>
              ))}
            </select>
          </div>

          {/* Erreur de validation */}
          {validationError && (
            <div className="flex items-start gap-2.5 border border-rose-200 bg-rose-50/90 p-3 rounded-xl text-rose-900">
              <Wrench className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="font-semibold text-[11px] leading-snug">{validationError}</p>
            </div>
          )}

          {/* Date passée */}
          {isPastDate && !validationError && (
            <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 p-3 rounded-xl text-amber-950">
              <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <span className="text-[9px] font-black tracking-wider uppercase text-amber-600">Avis d'ordonnancement</span>
                <p className="font-bold text-[11px] leading-tight">La date de départ est dépassée. Le vol sera enregistré sous le statut 'Annulé'.</p>
              </div>
            </div>
          )}

          {/* Widget Météo Simulée */}
          {simulatedSeverity !== null && !isPastDate && !validationError && (
            <div className={`flex items-start gap-3 border p-3 rounded-xl transition-all ${getWeatherSimulationInfo(simulatedSeverity).bg}`}>
              <div className="mt-0.5 p-1 bg-white rounded-lg border border-inherit">
                {getWeatherSimulationInfo(simulatedSeverity).icon}
              </div>
              <div>
                <span className="text-[9px] font-black tracking-wider uppercase opacity-80">Prévision Météo Route</span>
                <p className="font-bold text-[11px] leading-tight">{getWeatherSimulationInfo(simulatedSeverity).text}</p>
              </div>
            </div>
          )}

          {/* Actions modal */}
          <div className="pt-2 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer text-xs"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={Boolean(validationError) || isSubmitting || (!isDirectRoute && !selectedStop)}
              className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer text-xs shadow-md"
            >
              {isSubmitting ? 'Enregistrement...' : isEdition ? 'Mettre à jour' : 'Enregistrer le vol'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};