from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Dict, Any

import numpy as np
from xgboost import XGBRegressor


class AirlineXGBoostDelayModel:
    """Modèle XGBoost de prédiction du retard additionnel (minutes).

    Le projet ne fournit pas encore un historique labellisé de retards. Le
    modèle est donc initialisé avec un jeu d'apprentissage bootstrap
    déterministe construit à partir des variables déjà disponibles. Cette
    base doit être remplacée par l'historique opérationnel réel dès qu'il est
    disponible, sans changer l'interface ``predict_delay``.
    """

    FEATURE_NAMES = ["traffic_density", "weather_severity", "is_weekend"]

    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.model = XGBRegressor(
            objective="reg:squarederror",
            n_estimators=220,
            max_depth=4,
            learning_rate=0.04,
            subsample=0.9,
            colsample_bytree=1.0,
            reg_lambda=1.0,
            random_state=random_state,
            n_jobs=1,
            tree_method="hist",
        )
        self._fit_bootstrap_model()

    @staticmethod
    def _bootstrap_delay(traffic: float, weather: float, weekend: float) -> float:
        # Cible bootstrap déterministe : sert uniquement à initialiser XGBoost
        # en l'absence d'un historique réel de retards labellisés.
        base = 2.0 + 12.5 * traffic + 25.0 * weather + 5.0 * weekend
        interaction = 12.0 * traffic * weather
        severe_bonus = 18.0 if weather >= 0.8 else 0.0
        congestion_bonus = 8.0 if traffic >= 0.75 else 0.0
        return max(0.0, min(120.0, base + interaction + severe_bonus + congestion_bonus))

    def _fit_bootstrap_model(self) -> None:
        rows: list[list[float]] = []
        targets: list[float] = []
        for traffic in np.linspace(0.0, 1.0, 11):
            for weather in np.linspace(0.0, 1.0, 11):
                for weekend in (0.0, 1.0):
                    rows.append([float(traffic), float(weather), weekend])
                    targets.append(self._bootstrap_delay(float(traffic), float(weather), weekend))
        self.model.fit(np.asarray(rows, dtype=float), np.asarray(targets, dtype=float))

    def predict_delay(self, features: Dict[str, float]) -> float:
        row = np.asarray([[float(features.get(name, 0.0) or 0.0) for name in self.FEATURE_NAMES]])
        predicted = float(self.model.predict(row)[0])
        return round(max(0.0, min(120.0, predicted)), 1)


class AirlineOptimizer:
    """Optimiseur de rotations utilisant XGBoost pour anticiper les retards."""

    def __init__(self):
        self.delay_model = AirlineXGBoostDelayModel()

    def detect_and_resolve_conflicts(
        self,
        flights: List[Dict[str, Any]],
        turnaround_min: int = 45,
    ) -> Dict[str, Any]:
        conflicts = []
        resolved_flights = sorted(
            [dict(flight) for flight in flights],
            key=lambda x: x["departure_time"],
        )

        # 1) Prédiction XGBoost du retard additionnel.
        for flight in resolved_flights:
            features = flight.get(
                "ai_features",
                {"traffic_density": 0.2, "weather_severity": 0.1, "is_weekend": 0.0},
            )
            predicted_delay_min = self.delay_model.predict_delay(features)
            flight["predicted_delay_minutes"] = predicted_delay_min

            # Le retard prévu sert à calculer l'heure d'arrivée estimée. Il ne
            # change pas à lui seul le statut opérationnel du vol.
            original_arr = datetime.fromisoformat(
                flight["arrival_time"].replace("Z", "+00:00")
            )
            flight["arrival_time"] = (
                original_arr + timedelta(minutes=predicted_delay_min)
            ).isoformat()

        # 2) Détection des violations de turnaround causées/renforcées par le retard prévu.
        for i in range(len(resolved_flights) - 1):
            current_flight = resolved_flights[i]
            for j in range(i + 1, len(resolved_flights)):
                next_flight = resolved_flights[j]
                if current_flight.get("refAircraft") != next_flight.get("refAircraft"):
                    continue

                arr_time = datetime.fromisoformat(
                    current_flight["arrival_time"].replace("Z", "+00:00")
                )
                dep_time = datetime.fromisoformat(
                    next_flight["departure_time"].replace("Z", "+00:00")
                )
                ground_time = (dep_time - arr_time).total_seconds() / 60.0

                if ground_time < turnaround_min:
                    conflict_desc = (
                        f"Conflit anticipé par XGBoost sur l'appareil "
                        f"{current_flight.get('refAircraft')}. Le retard prédit "
                        f"({current_flight['predicted_delay_minutes']} min) réduit "
                        f"le temps au sol à {int(ground_time)} min, pour un minimum "
                        f"requis de {turnaround_min} min."
                    )
                    conflicts.append(
                        {
                            "type": "XGBOOST_TURNAROUND_RISK",
                            "refFlight": next_flight.get("refFlight"),
                            "refAircraft": next_flight.get("refAircraft"),
                            "description": conflict_desc,
                        }
                    )

                    new_dep = arr_time + timedelta(minutes=turnaround_min)
                    next_arr_time = datetime.fromisoformat(
                        next_flight["arrival_time"].replace("Z", "+00:00")
                    )
                    flight_duration = next_arr_time - dep_time
                    next_flight["departure_time"] = new_dep.isoformat()
                    next_flight["arrival_time"] = (new_dep + flight_duration).isoformat()
                    next_flight["flightStatus"] = "Delayed"
                break

        return {
            "algorithm": "XGBoost",
            "has_conflicts": bool(conflicts),
            "conflicts_count": len(conflicts),
            "conflicts": conflicts,
            "optimized_flights": resolved_flights,
        }


if __name__ == "__main__":
    print("--- Test de l'optimiseur XGBoost ---")
    test_flights = [
        {
            "refFlight": "VOL-101",
            "refAircraft": "AIR-A320",
            "departure_time": "2026-07-02T08:00:00",
            "arrival_time": "2026-07-02T10:00:00",
            "flightStatus": "Scheduled",
            "ai_features": {
                "traffic_density": 0.4,
                "weather_severity": 0.9,
                "is_weekend": 1.0,
            },
        },
        {
            "refFlight": "VOL-102",
            "refAircraft": "AIR-A320",
            "departure_time": "2026-07-02T10:50:00",
            "arrival_time": "2026-07-02T12:00:00",
            "flightStatus": "Scheduled",
            "ai_features": {
                "traffic_density": 0.1,
                "weather_severity": 0.0,
                "is_weekend": 1.0,
            },
        },
    ]
    result = AirlineOptimizer().detect_and_resolve_conflicts(test_flights, 45)
    print(result)
