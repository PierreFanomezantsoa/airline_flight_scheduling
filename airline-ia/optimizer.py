from datetime import datetime, timedelta
from typing import List, Dict, Any
import math

class AirlineNeuralNetwork:
    """
    Simulateur de Réseau de Neurones Artificiels (Multi-Layer Perceptron).
    Prédit le retard additionnel à l'arrivée (en minutes) selon des facteurs exogènes.
    """
    def __init__(self):
        # Poids synaptiques simplifiés et biais pré-entraînés pour la démonstration
        self.weights = {
            "traffic_density": 12.5,  # Un trafic dense sature l'aéroport d'arrivée
            "weather_severity": 25.0, # Mauvaise météo (orages, brouillard)
            "is_weekend": 5.0         # Augmentation des flux passagers le week-end
        }
        self.bias = 2.0

    def predict_delay(self, features: Dict[str, float]) -> float:
        """
        Calcule la combinaison linéaire combinée à une fonction d'activation (ReLU).
        """
        # Somme pondérée : Z = sum(X_i * W_i) + b
        z = (
            features.get("traffic_density", 0.0) * self.weights["traffic_density"] +
            features.get("weather_severity", 0.0) * self.weights["weather_severity"] +
            features.get("is_weekend", 0.0) * self.weights["is_weekend"] +
            self.bias
        )
        # Fonction d'activation ReLU (le retard ne peut pas être négatif)
        return max(0.0, z)


class AirlineOptimizer:
    @staticmethod
    def detect_and_resolve_conflicts(flights: List[Dict[str, Any]], turnaround_min: int = 45) -> Dict[str, Any]:
        """
        Analyse un planning de vols, utilise un réseau de neurones pour anticiper 
        les retards prédictifs, détecte les conflits et ajuste le planning.
        """
        conflicts = []
        nn = AirlineNeuralNetwork()
        
        # Tri chronologique initial pour le balayage
        resolved_flights = sorted(flights, key=lambda x: x['departure_time'])
        
        # Étape préliminaire IA : Injection des prédictions du réseau de neurones
        for flight in resolved_flights:
            # Extraction des caractéristiques contextuelles (reçues du Backend ou APIs météo)
            features = flight.get("ai_features", {"traffic_density": 0.2, "weather_severity": 0.1, "is_weekend": 0.0})
            
            # Prédiction du retard par le réseau de neurones
            predicted_delay_min = nn.predict_delay(features)
            flight["predicted_delay_minutes"] = round(predicted_delay_min, 1)
            
            # Si un retard est prédit, on ajuste immédiatement l'heure d'arrivée estimée
            if predicted_delay_min > 0:
                original_arr = datetime.fromisoformat(flight['arrival_time'].replace("Z", "+00:00"))
                ai_adjusted_arr = original_arr + timedelta(minutes=predicted_delay_min)
                flight['arrival_time'] = ai_adjusted_arr.isoformat()
        
        # Parcours des vols pour détecter et propager les retards de rotation (Effet domino)
        for i in range(len(resolved_flights) - 1):
            current_flight = resolved_flights[i]
            
            # Balayage des vols suivants pour trouver le prochain vol du MÊME avion
            for j in range(i + 1, len(resolved_flights)):
                next_flight = resolved_flights[j]
                
                if current_flight['aircraft_id'] == next_flight['aircraft_id']:
                    # Conversion des chaînes ISO en objets datetime
                    arr_time = datetime.fromisoformat(current_flight['arrival_time'].replace("Z", "+00:00"))
                    dep_time = datetime.fromisoformat(next_flight['departure_time'].replace("Z", "+00:00"))
                    
                    # Calcul du temps au sol disponible en minutes
                    ground_time = (dep_time - arr_time).total_seconds() / 60
                    
                    # Règle de gestion : Si le temps au sol est insuffisant à cause du retard prédit par l'IA
                    if ground_time < turnaround_min:
                        conflict_desc = (
                            f"Conflit IA sur l'appareil {current_flight['aircraft_id']}. "
                            f"Le retard initial estimé par le Réseau de Neurones ({current_flight['predicted_delay_minutes']} min) "
                            f"réduit le temps au sol à {int(ground_time)} min (Minimum requis : {turnaround_min} min)."
                        )
                        
                        conflicts.append({
                            "type": "AI_TURNAROUND_VIOLATION",
                            "flight_id": next_flight['id'],
                            "aircraft_id": next_flight['aircraft_id'],
                            "description": conflict_desc
                        })
                        
                        # Résolution : Calcul du décalage requis pour absorber la contrainte au sol
                        new_dep = arr_time + timedelta(minutes=turnaround_min)
                        
                        # Conservation de la durée initiale du vol suivant
                        next_arr_time = datetime.fromisoformat(next_flight['arrival_time'].replace("Z", "+00:00"))
                        flight_duration = next_arr_time - dep_time
                        new_arr = new_dep + flight_duration
                        
                        # Mise à jour des données du vol affecté
                        next_flight['departure_time'] = new_dep.isoformat()
                        next_flight['arrival_time'] = new_arr.isoformat()
                        next_flight['status'] = 'Delayed'
                    
                    break

        return {
            "has_conflicts": len(conflicts) > 0,
            "conflicts_count": len(conflicts),
            "conflicts": conflicts,
            "optimized_flights": resolved_flights
        }


# ==============================================================================
# BLOC DE TEST SUR LES PRÉDICTIONS DE L'IA
# ==============================================================================
if __name__ == "__main__":
    print("--- Test de l'optimiseur avec Couche de Réseau de Neurones ---")
    
    # Simulation d'un cas où le VOL-101 subit une météo désastreuse à l'arrivée (ex: Orage violent)
    test_flights = [
        {
            "id": "VOL-101",
            "aircraft_id": "AIR-A320",
            "departure_time": "2026-07-02T08:00:00",
            "arrival_time": "2026-07-02T10:00:00",
            "status": "Scheduled",
            "ai_features": {
                "traffic_density": 0.4,
                "weather_severity": 0.9,  # Forte valeur -> va déclencher un gros retard via le neurone
                "is_weekend": 1.0
            }
        },
        {
            "id": "VOL-102",
            "aircraft_id": "AIR-A320",
            "departure_time": "2026-07-02T10:50:00",  # Théoriquement 50 min au sol (ok par rapport aux 45 min requises)
            "arrival_time": "2026-07-02T12:00:00",
            "status": "Scheduled",
            "ai_features": {"traffic_density": 0.1, "weather_severity": 0.0, "is_weekend": 1.0}
        }
    ]
    
    result = AirlineOptimizer.detect_and_resolve_conflicts(test_flights, turnaround_min=45)
    
    print(f"\n[RÉSULTAT] Conflits détectés par anticipation : {result['conflicts_count']}")
    for conflict in result['conflicts']:
        print(f"⚠️ {conflict['description']}")
        
    print("\n--- Horaires recalculés après filtrage par le Réseau de Neurones ---")
    for flight in result['optimized_flights']:
        print(f"✈️ {flight['id']} (Retard Prédit: {flight['predicted_delay_minutes']} min) -> DEP: {flight['departure_time']} | ARR: {flight['arrival_time']} | {flight['status']}")