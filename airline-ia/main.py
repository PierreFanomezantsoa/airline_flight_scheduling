# main.py (FastAPI Engine)
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from datetime import datetime
import random

app = FastAPI(
    title="Airline IA Core Engine", 
    description="Moteur de prédiction des statuts et retards de vols",
    version="1.0.0"
)

# -----------------------------------------------------------------
# SCHÉMAS DE VALIDATION PYDANTIC
# -----------------------------------------------------------------

class AIFeatures(BaseModel):
    traffic_density: float
    weather_severity: float
    is_weekend: float

class FlightItem(BaseModel):
    id: str
    aircraft_id: str
    departure_time: str
    arrival_time: str
    status: str
    ai_features: AIFeatures

class OptimizeRequest(BaseModel):
    flights: List[FlightItem]
    turnaround_minutes: int

# -----------------------------------------------------------------
# ROUTE D'INFÉRENCE & PRÉDICTION
# -----------------------------------------------------------------

@app.post("/api/ia/optimize")
async def predict_and_optimize_flights(payload: OptimizeRequest):
    try:
        optimized_flights = []
        
        for flight in payload.flights:
            # Récupération de l'heure réelle du vol pour extraire des caractéristiques temporelles
            dt_dept = datetime.fromisoformat(flight.departure_time.replace('Z', '+00:00'))
            hour_of_day = dt_dept.hour
            day_of_week = dt_dept.weekday()  # 0 = Lundi, 6 = Dimanche
            
            # Algorithme prédictif simulé (Arbre de décision basé sur vos features)
            # Équivalent d'un modèle .predict() XGBoost/RandomForest entraîné
            if flight.ai_features.weather_severity > 0.75:
                # Risque critique : Tempête ou conditions extrêmes sur l'aéroport de départ
                predicted_status = random.choice(["Delayed", "Cancelled"])
            elif hour_of_day >= 17 and flight.ai_features.traffic_density > 0.65:
                # Risque de congestion de fin de journée combiné à un fort trafic
                predicted_status = "Delayed"
            elif day_of_week >= 5 and hour_of_day in [7, 8, 9] and flight.ai_features.traffic_density > 0.5:
                # Rush des départs en matinée durant le week-end
                predicted_status = "Delayed"
            elif random.random() < 0.05:
                # Aléa technique résiduel imprévu (5% de chance de retard de maintenance)
                predicted_status = "Delayed"
            else:
                # Le vol reste nominal et à l'heure
                predicted_status = "Scheduled"
                
            optimized_flights.append({
                "id": flight.id,
                "departure_time": flight.departure_time,
                "arrival_time": flight.arrival_time,
                "status": predicted_status
            })
            
        return {"optimized_flights": optimized_flights}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne de traitement IA : {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)