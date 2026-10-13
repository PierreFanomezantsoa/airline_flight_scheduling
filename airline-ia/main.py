# main.py (FastAPI Engine - XGBoost)
from __future__ import annotations

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List

from optimizer import AirlineOptimizer

app = FastAPI(
    title="Airline IA Core Engine - XGBoost",
    description="Moteur XGBoost de prédiction des retards et d'analyse des rotations",
    version="2.0.0",
)


class AIFeatures(BaseModel):
    traffic_density: float = Field(ge=0.0, le=1.0)
    weather_severity: float = Field(ge=0.0, le=1.0)
    weather_available: bool = True
    is_weekend: float = Field(ge=0.0, le=1.0)


class FlightItem(BaseModel):
    refFlight: str
    refAircraft: str
    departure_time: str
    arrival_time: str
    flightStatus: str
    ai_features: AIFeatures


class OptimizeRequest(BaseModel):
    flights: List[FlightItem]
    turnaround_minutes: int = Field(default=45, ge=0, le=24 * 60)


_optimizer = AirlineOptimizer()


@app.get("/api/ia/info")
def ia_info():
    return {
        "algorithm": "XGBoost",
        "delayModel": "XGBRegressor",
        "purpose": "Prévision du retard et détection anticipée des risques de rotation",
        "automaticOperationalDecision": False,
    }


@app.post("/api/ia/optimize")
async def predict_and_optimize_flights(payload: OptimizeRequest):
    try:
        raw_flights = [flight.model_dump() for flight in payload.flights]
        result = _optimizer.detect_and_resolve_conflicts(
            raw_flights,
            turnaround_min=payload.turnaround_minutes,
        )

        by_ref = {item["refFlight"]: item for item in result["optimized_flights"]}
        optimized_flights = []
        for original in payload.flights:
            item = by_ref[original.refFlight]
            features = original.ai_features

            if not features.weather_available:
                recommendation = "WEATHER_DATA_UNAVAILABLE"
            elif features.weather_severity >= 0.8:
                recommendation = "WEATHER_REVIEW"
            elif float(item.get("predicted_delay_minutes", 0.0)) >= 15.0:
                recommendation = "DELAY_RISK_REVIEW"
            else:
                recommendation = "NORMAL_MONITORING"

            optimized_flights.append(
                {
                    "refFlight": item["refFlight"],
                    "departure_time": item["departure_time"],
                    "arrival_time": item["arrival_time"],
                    "flightStatus": item.get("flightStatus", original.flightStatus),
                    "predictedDelayMinutes": item.get("predicted_delay_minutes", 0.0),
                    "recommendation": recommendation,
                    "algorithm": "XGBoost",
                }
            )

        return {
            "status": "ADVISORY_ONLY",
            "algorithm": "XGBoost",
            "conflicts": result["conflicts"],
            "conflictsCount": result["conflicts_count"],
            "optimized_flights": optimized_flights,
        }
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne de traitement XGBoost : {str(exc)}",
        ) from exc


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
