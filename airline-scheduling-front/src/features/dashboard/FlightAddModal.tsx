import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Calendar, 
  Plane, 
  MapPin, 
  Sun, 
  CloudRain, 
  CloudLightning, 
  Sparkles, 
  Clock, 
  AlertCircle, 
  GitFork 
} from 'lucide-react';

export interface FlightFormData {
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart: string;
  heureArrivee: string;
  avionId: string;
  status?: 'Planifié' | 'Retardé' | 'En Vol' | 'Annulé' | 'Effectué';
  motifAnnulation?: string;
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

interface AirportOption {
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

const AIRPORTS_LIST: AirportOption[] = [
  { iata: 'TNR', name: 'Antananarivo (Ivato)', gmtOffset: 3 },
  { iata: 'CDG', name: 'Paris (Charles de Gaulle)', gmtOffset: 2 },
  { iata: 'JFK', name: 'New York (JFK)', gmtOffset: -4 },
  { iata: 'DXB', name: 'Dubai International', gmtOffset: 4 },
  { iata: 'RUN', name: 'La Réunion (Roland Garros)', gmtOffset: 4 },
  { iata: 'MRU', name: 'Maurice (Sir Seewoosagur Ramgoolam)', gmtOffset: 4 }
];

const DIRECT_ROUTES_AND_STOPS: Record<string, Record<string, number>> = {
  TNR: { CDG: 11, DXB: 6.5, RUN: 1.5, MRU: 1.75 },
  CDG: { TNR: 11, JFK: 8, DXB: 7, RUN: 11, MRU: 11.5 },
  JFK: { CDG: 7.5, DXB: 12.5 },
  DXB: { TNR: 6.5, CDG: 7, JFK: 14, RUN: 6, MRU: 6.5 },
  RUN: { TNR: 1.5, CDG: 11, DXB: 6, MRU: 0.75 },
  MRU: { TNR: 1.75, CDG: 11.5, DXB: 6.5, RUN: 0.75 }
};

const initialFormState: FlightFormData = {
  numeroVol: '',
  aeroportDepart: '',
  aeroportArrivee: '',
  heureDepart: '',
  heureArrivee: '',
  avionId: '',
  status: 'Planifié',
  motifAnnulation: ''
};

// Helper : Extrait proprement l'immatriculation ou l'ID de l'avion depuis un slot de maintenance
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

// Helper : Vérifie si l'appareil est déclaré en maintenance globale
const isAircraftInMaintenanceStatus = (status?: string): boolean => {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s.includes('mainten') || s.includes('immobilis') || s === 'out_of_service';
};

// Helper : Contrôle du chevauchement des plages horaires
const checkOverlap = (startA: string, endA: string, startB: string, endB: string): boolean => {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();

  return aStart < bEnd && aEnd > bStart;
};

const calculateSuggestedStops = (origin: string, destination: string): string[] => {
  if (!origin || !destination || origin === destination) return [];

  return AIRPORTS_LIST
    .map(a => a.iata)
    .filter(hub => hub !== origin && hub !== destination)
    .filter(hub => 
      DIRECT_ROUTES_AND_STOPS[origin]?.[hub] !== undefined && 
      DIRECT_ROUTES_AND_STOPS[hub]?.[destination] !== undefined
    );
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
  if (!durationHours) return '';

  const departureDate = new Date(departureIsoString);
  if (isNaN(departureDate.getTime())) return '';

  const gmtDiffHours = destAirport.gmtOffset - originAirport.gmtOffset;
  const totalOffsetMinutes = (durationHours + gmtDiffHours) * 60;
  const arrivalDate = new Date(departureDate.getTime() + totalOffsetMinutes * 60 * 1000);

  const tzOffset = arrivalDate.getTimezoneOffset() * 60000;
  return new Date(arrivalDate.getTime() - tzOffset).toISOString().slice(0, 16);
};

export const FlightAddModal: React.FC<FlightAddModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  fleetAircrafts,
  isLoadingFleet,
  maintenanceSlots = [],
  initialData,
}) => {
  const [newFlight, setNewFlight] = useState<FlightFormData>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdition = !!initialData;

  // Réinitialisation de l'état du formulaire
  useEffect(() => {
    if (isOpen) {
      setNewFlight(initialData ? { ...initialData } : { ...initialFormState });
    }
  }, [isOpen, initialData]);

  // Écoute de la touche Échap pour fermer le modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Recalcul ciblé de l'heure d'arrivée estimée sans boucle de rendu
  useEffect(() => {
    const { aeroportDepart, aeroportArrivee, heureDepart } = newFlight;
    if (aeroportDepart && aeroportArrivee && heureDepart) {
      const calculatedArrival = calculateArrivalGMT(aeroportDepart, aeroportArrivee, heureDepart);
      if (calculatedArrival && calculatedArrival !== newFlight.heureArrivee) {
        setNewFlight((prev) => ({ ...prev, heureArrivee: calculatedArrival }));
      }
    }
  }, [newFlight.aeroportDepart, newFlight.aeroportArrivee, newFlight.heureDepart]);

  // Calcul d'itinéraire et d'escales
  const isDirectRoute = useMemo(() => {
    return Boolean(
      newFlight.aeroportDepart &&
      newFlight.aeroportArrivee &&
      DIRECT_ROUTES_AND_STOPS[newFlight.aeroportDepart]?.[newFlight.aeroportArrivee] !== undefined
    );
  }, [newFlight.aeroportDepart, newFlight.aeroportArrivee]);

  const suggestedStops = useMemo(() => {
    if (!isDirectRoute && newFlight.aeroportDepart && newFlight.aeroportArrivee) {
      return calculateSuggestedStops(newFlight.aeroportDepart, newFlight.aeroportArrivee);
    }
    return [];
  }, [isDirectRoute, newFlight.aeroportDepart, newFlight.aeroportArrivee]);

  // Évaluation de la date passée
  const isPastDate = useMemo(() => {
    if (!newFlight.heureDepart) return false;
    return new Date(newFlight.heureDepart) < new Date();
  }, [newFlight.heureDepart]);

  // Météo simulée
  const simulatedSeverity = useMemo(() => {
    if (!newFlight.aeroportDepart || !newFlight.heureDepart) return null;
    const seed = newFlight.aeroportDepart.charCodeAt(0) + new Date(newFlight.heureDepart).getDate();
    return (seed % 100) / 100;
  }, [newFlight.aeroportDepart, newFlight.heureDepart]);

  // Validations Métiers en temps réel
  const validationError = useMemo(() => {
    if (!isDirectRoute && newFlight.aeroportDepart && newFlight.aeroportArrivee) {
      return `Absence de liaison directe entre ${newFlight.aeroportDepart} et ${newFlight.aeroportArrivee}.`;
    }

    if (newFlight.heureDepart && newFlight.heureArrivee) {
      const dep = new Date(newFlight.heureDepart);
      const arr = new Date(newFlight.heureArrivee);
      if (arr <= dep) {
        return "L'arrivée doit être strictly postérieure au départ.";
      }
    }

    if (newFlight.avionId) {
      const selectedAircraft = fleetAircrafts.find(
        (ac) => ac.id === newFlight.avionId || (ac.immatriculation || ac.registration) === newFlight.avionId
      );

      if (selectedAircraft) {
        const currentStatus = selectedAircraft.statut || selectedAircraft.status;
        const currentRegistration = selectedAircraft.immatriculation || selectedAircraft.registration || selectedAircraft.modele || selectedAircraft.model || 'Appareil';

        if (isAircraftInMaintenanceStatus(currentStatus)) {
          return `Immobilisation technique : L'appareil ${currentRegistration} est en maintenance (${currentStatus}).`;
        }
      }

      if (newFlight.heureDepart && newFlight.heureArrivee) {
        const maintenanceConflict = maintenanceSlots.find((slot) => {
          const slotRef = getSlotAircraftRef(slot);
          const acReg = selectedAircraft?.immatriculation || selectedAircraft?.registration;
          const acId = selectedAircraft?.id;

          const isMatch = Boolean(
            (acReg && slotRef === acReg) ||
            (acId && slotRef === acId) ||
            slotRef === newFlight.avionId
          );

          return isMatch && checkOverlap(
            newFlight.heureDepart,
            newFlight.heureArrivee,
            slot.startTime,
            slot.endTime
          );
        });

        if (maintenanceConflict) {
          const typeStr = maintenanceConflict.maintenanceType ? ` (${maintenanceConflict.maintenanceType})` : '';
          return `Conflit de calendrier : Cet appareil est en maintenance${typeStr} du ${new Date(maintenanceConflict.startTime).toLocaleString('fr-FR')} au ${new Date(maintenanceConflict.endTime).toLocaleString('fr-FR')}.`;
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
    fleetAircrafts,
    maintenanceSlots
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isDirectRoute || validationError) return;

    setIsSubmitting(true);
    try {
      const finalFlightData: FlightFormData = {
        ...newFlight,
        status: isPastDate ? 'Annulé' : (newFlight.status || 'Planifié'),
        motifAnnulation: isPastDate ? 'Date de départ dépassée à la création' : newFlight.motifAnnulation
      };
      await onSubmit(finalFlightData);
      setNewFlight(initialFormState);
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
        text: "ALERTE CRITIddffdffgbggbgbfgGUE : Risque météo élevé (Seuil ≥ 0.80)",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden transform transition-all max-h-[90vh] flex flex-col">
        
        {/* En-tête */}
        <div className="flex items-center justify-between bg-slate-50 px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-slate-500 rotate-45" />
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              {isEdition ? 'Modifier la rotation' : 'Créer une rotation'}
            </h3>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Formulaire avec défilement si écran court */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          
          {/* Numéro de vol */}
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-[10px]">
              Identifiant Vol
            </label>
            <input
              type="text"
              required
              placeholder="ex: MD050"
              value={newFlight.numeroVol}
              onChange={(e) => setNewFlight({ ...newFlight, numeroVol: e.target.value.toUpperCase() })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/30 px-3 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none transition"
            />
          </div>

          {/* Origine & Destination */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-[10px]">
                Origine
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <select
                  required
                  value={newFlight.aeroportDepart}
                  onChange={(e) => setNewFlight({ ...newFlight, aeroportDepart: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/30 pl-9 pr-3 py-2.5 text-sm font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition appearance-none cursor-pointer"
                >
                  <option value="">Départ</option>
                  {AIRPORTS_LIST.map((ap) => (
                    <option key={ap.iata} value={ap.iata}>
                      {ap.iata} (GMT{ap.gmtOffset >= 0 ? `+${ap.gmtOffset}` : ap.gmtOffset})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-[10px]">
                Destination
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <select
                  required
                  value={newFlight.aeroportArrivee}
                  onChange={(e) => setNewFlight({ ...newFlight, aeroportArrivee: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/30 pl-9 pr-3 py-2.5 text-sm font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition appearance-none cursor-pointer"
                >
                  <option value="">Arrivée</option>
                  {AIRPORTS_LIST.map((ap) => (
                    ap.iata !== newFlight.aeroportDepart && (
                      <option key={ap.iata} value={ap.iata}>
                        {ap.iata} (GMT{ap.gmtOffset >= 0 ? `+${ap.gmtOffset}` : ap.gmtOffset})
                      </option>
                    )
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Proposition d'escales si route directe absente */}
          {!isDirectRoute && newFlight.aeroportDepart && newFlight.aeroportArrivee && (
            <div className="border border-rose-200 bg-rose-50/90 p-3.5 rounded-xl text-rose-950 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-[11px] leading-tight uppercase text-rose-700">
                    Liaison directe indisponible
                  </p>
                  <p className="text-[11px] font-semibold text-rose-900 mt-0.5">
                    Aucune route directe enregistrée entre {newFlight.aeroportDepart} et {newFlight.aeroportArrivee}.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-rose-200">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1 mb-1.5">
                  <GitFork className="h-3 w-3 text-slate-500" /> Escale(s) suggérée(s) :
                </span>
                {suggestedStops.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedStops.map((stopIata) => {
                      const stopAirport = AIRPORTS_LIST.find((a) => a.iata === stopIata);
                      return (
                        <div key={stopIata} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-[10px] font-bold text-slate-800 shadow-sm">
                          <span className="text-rose-600 font-mono">{stopIata}</span>
                          <span className="text-slate-500 text-[9px]">- {stopAirport?.name}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] italic text-rose-600">
                    Aucun hub d'escale disponible dans la base actuelle.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Horaires Départ & Arrivée */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-[10px]">
                Bloc Départ
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="datetime-local"
                  required
                  value={newFlight.heureDepart}
                  onChange={(e) => setNewFlight({ ...newFlight, heureDepart: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/30 pl-9 pr-3 py-2.5 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-[10px]">
                Bloc Arrivée (GMT)
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="datetime-local"
                  required
                  disabled={!isDirectRoute}
                  value={newFlight.heureArrivee}
                  onChange={(e) => setNewFlight({ ...newFlight, heureArrivee: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/30 pl-9 pr-3 py-2.5 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Sélection d'aéronef */}
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-[10px]">
              Appareil Assigné
            </label>
            <select
              value={newFlight.avionId}
              onChange={(e) => setNewFlight({ ...newFlight, avionId: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm font-semibold text-slate-800 transition focus:border-slate-900 focus:bg-white focus:outline-none cursor-pointer disabled:opacity-50"
              disabled={isLoadingFleet || !isDirectRoute}
            >
              <option value="">{isLoadingFleet ? 'Chargement de la flotte...' : 'Laisser SANS ASSIGNATION'}</option>
              {fleetAircrafts.map((ac) => {
                const currentStatus = ac.statut || ac.status;
                const registration = ac.immatriculation || ac.registration;
                const model = ac.modele || ac.model || 'Modèle inconnu';

                const isGlobalMaint = isAircraftInMaintenanceStatus(currentStatus);

                // CORRECTION : Correspondance sur l'immatriculation de l'avion
                const isSlotMaint = Boolean(
                  newFlight.heureDepart &&
                  newFlight.heureArrivee &&
                  maintenanceSlots.some((slot) => {
                    const slotRef = getSlotAircraftRef(slot);
                    
                    const matchRegistration = Boolean(
                      registration && (
                        slotRef === registration ||
                        slot.aircraft?.immatriculation === registration ||
                        slot.aircraft?.registration === registration
                      )
                    );

                    return matchRegistration && checkOverlap(
                      newFlight.heureDepart,
                      newFlight.heureArrivee,
                      slot.startTime,
                      slot.endTime
                    );
                  })
                );

                const isDisabled = isGlobalMaint || isSlotMaint;

                let labelSuffix = '';
                if (isGlobalMaint) {
                  labelSuffix = ` 🛠️ (EN MAINTENANCE - ${currentStatus || 'Immobilisé'})`;
                } else if (isSlotMaint) {
                  labelSuffix = ' ⚠️ (Maintenance sur cette plage horaire)';
                }

                return (
                  <option key={ac.id || registration} value={ac.id || registration} disabled={isDisabled}>
                    {registration ? `${registration} (${model})` : model} {labelSuffix}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Affichage explicite des erreurs de validation */}
          {validationError && isDirectRoute && (
            <div className="flex items-start gap-2 border border-rose-200 bg-rose-50/80 p-3 rounded-xl text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <p className="font-semibold text-[11px] leading-snug">{validationError}</p>
            </div>
          )}

          {/* Notification si la date est dépassée */}
          {isPastDate && !validationError && isDirectRoute && (
            <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 p-3 rounded-xl text-amber-950">
              <Clock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[9px] font-black tracking-wider uppercase text-amber-600">Avis d'ordonnancement</span>
                <p className="font-bold text-[11px] leading-tight">La date de départ est passée. Le vol sera créé avec le statut 'Annulé'.</p>
              </div>
            </div>
          )}

          {/* Analyse prédictive météo */}
          {simulatedSeverity !== null && !isPastDate && !validationError && isDirectRoute && (
            <div className={`flex items-start gap-3 border p-3 rounded-xl transition-all ${getWeatherSimulationInfo(simulatedSeverity).bg}`}>
              <div className="mt-0.5 p-1 bg-white rounded-lg border border-inherit">
                {getWeatherSimulationInfo(simulatedSeverity).icon}
              </div>
              <div className="flex-1">
                <span className="text-[9px] font-black tracking-wider uppercase text-slate-400 flex items-center gap-1 mb-0.5">
                  <Sparkles className="h-2.5 w-2.5 text-teal-600 fill-teal-600" /> Analyse Prédictive Météo
                </span>
                <p className="font-bold text-[11px] leading-tight">{getWeatherSimulationInfo(simulatedSeverity).text}</p>
                <span className="text-[10px] font-mono font-medium opacity-80">Indice : {simulatedSeverity.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Choix du statut (Mode Édition) */}
          {isEdition && (
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-[10px]">Statut Opérationnel</label>
              <select
                value={newFlight.status || 'Planifié'}
                disabled={!isDirectRoute}
                onChange={(e) => setNewFlight({ ...newFlight, status: e.target.value as FlightFormData['status'] })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm font-semibold text-slate-800 transition focus:border-slate-900 focus:bg-white focus:outline-none cursor-pointer disabled:opacity-50"
              >
                <option value="Planifié">Planifié</option>
                <option value="Retardé">Retardé</option>
                <option value="En Vol">En Vol</option>
                <option value="Annulé">Annulé</option>
                <option value="Effectué">Effectué</option>
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 font-bold uppercase text-slate-500 hover:bg-slate-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isDirectRoute || Boolean(validationError)}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-5 py-2.5 font-bold uppercase text-white transition shadow-sm cursor-pointer"
            >
              {isSubmitting ? 'Traitement...' : isEdition ? 'Enregistrer' : 'Confirmer la rotation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};