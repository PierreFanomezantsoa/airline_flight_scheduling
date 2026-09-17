"""Runtime léger pour exploiter davantage le ML météo local.

Ce module est indépendant de Flask et des services météo externes. Il peut :
- charger le modèle historique compatible existant ;
- calculer un score local pour un aéroport et une date ;
- produire une estimation de confiance ;
- évaluer départ + arrivée + escale(s) ;
- fusionner le score API et le score local en un *advisoryScore* OCC.

IMPORTANT : le score local n'est JAMAIS autorisé à modifier seul le statut d'un
vol. Les champs retournés portent explicitement `trustedForAutomaticStatus=False`.
"""

from __future__ import annotations

import json
import math
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import joblib
import numpy as np
import pandas as pd

DEFAULT_MODEL_PATH = "models/weather_severity_model.joblib"
MODEL_ENV = "WEATHER_LOCAL_MODEL_PATH"
ENHANCED_MODEL_ENV = "WEATHER_LOCAL_ENHANCED_MODEL_PATH"


def _clamp01(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    return max(0.0, min(1.0, number))


def _utc(value: datetime | str) -> datetime:
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _risk_level(score: float) -> tuple[str, str, str]:
    if score >= 0.85:
        return "EXTREME", "Extrême", "REVIEW_IMMEDIATELY"
    if score >= 0.70:
        return "SEVERE", "Sévère", "OCC_REVIEW"
    if score >= 0.50:
        return "HIGH", "Élevé", "MONITOR_CLOSELY"
    if score >= 0.30:
        return "MODERATE", "Modéré", "MONITOR"
    return "LOW", "Faible", "NORMAL_MONITORING"


class LocalWeatherML:
    """Provider local thread-safe avec chargement paresseux."""

    def __init__(self, model_path: str | None = None, enhanced_model_path: str | None = None):
        self.model_path = Path(model_path or os.getenv(MODEL_ENV, DEFAULT_MODEL_PATH))
        self.enhanced_model_path = Path(
            enhanced_model_path
            or os.getenv(
                ENHANCED_MODEL_ENV,
                str(self.model_path.with_name(f"{self.model_path.stem}.enhanced{self.model_path.suffix}")),
            )
        )
        self.metadata_path = self.model_path.with_suffix(self.model_path.suffix + ".metadata.json")

        self._core_model: Any | None = None
        self._enhanced_model: Any | None = None
        self._metadata: dict[str, Any] = {}
        self._load_error: str | None = None
        self._lock = threading.RLock()
        self._loaded = False

    def _load(self) -> None:
        with self._lock:
            if self._loaded:
                return

            try:
                if not self.model_path.exists():
                    raise FileNotFoundError(f"Modèle local absent: {self.model_path}")

                self._core_model = joblib.load(self.model_path)

                if self.enhanced_model_path.exists():
                    try:
                        self._enhanced_model = joblib.load(self.enhanced_model_path)
                    except Exception as exc:  # modèle enrichi facultatif
                        self._enhanced_model = None
                        self._load_error = f"Modèle enrichi ignoré: {exc}"

                if self.metadata_path.exists():
                    try:
                        self._metadata = json.loads(self.metadata_path.read_text(encoding="utf-8"))
                    except Exception:
                        self._metadata = {}

            except Exception as exc:
                self._core_model = None
                self._enhanced_model = None
                self._load_error = str(exc)
            finally:
                self._loaded = True

    @property
    def available(self) -> bool:
        self._load()
        return self._core_model is not None

    def status(self) -> dict[str, Any]:
        self._load()
        return {
            "available": self._core_model is not None,
            "modelPath": str(self.model_path),
            "enhancedModelPath": str(self.enhanced_model_path),
            "enhancedAvailable": self._enhanced_model is not None,
            "modelVersion": self._metadata.get("modelVersion"),
            "trainedAt": self._metadata.get("trainedAt"),
            "coverageStart": self._metadata.get("coverageStart"),
            "coverageEnd": self._metadata.get("coverageEnd"),
            "airportCount": self._metadata.get("airportCount"),
            "coreMetrics": self._metadata.get("coreMetrics"),
            "loadError": self._load_error,
            "trustedForAutomaticStatus": False,
        }

    @staticmethod
    def _core_row(airport: str, target_time: datetime | str) -> tuple[pd.DataFrame, datetime]:
        dt = _utc(target_time)
        airport = str(airport or "").strip().upper()
        row = pd.DataFrame(
            [
                {
                    "airport": airport,
                    "month": dt.month,
                    "day": dt.day,
                    "day_of_year": dt.timetuple().tm_yday,
                    "hour": dt.hour,
                    "weekday": dt.weekday(),
                }
            ]
        )
        return row, dt

    def _tree_uncertainty(self, model: Any, row: pd.DataFrame) -> float | None:
        """Dispersion normalisée entre arbres si le pipeline le permet."""
        try:
            pre = model.named_steps["preprocessor"]
            reg = model.named_steps["regressor"]
            if not hasattr(reg, "estimators_"):
                return None
            transformed = pre.transform(row)
            preds = np.array([float(tree.predict(transformed)[0]) for tree in reg.estimators_])
            if len(preds) < 2:
                return None
            return float(np.clip(np.std(preds), 0.0, 0.5))
        except Exception:
            return None

    def _confidence(
        self,
        *,
        airport: str,
        target_time: datetime,
        uncertainty: float | None,
        enhanced: bool,
    ) -> float:
        # Base dépendant de la qualité de validation du modèle.
        metrics_key = "enhancedMetrics" if enhanced else "coreMetrics"
        metrics = self._metadata.get(metrics_key) or {}
        mae = metrics.get("mae")
        try:
            mae = float(mae)
        except (TypeError, ValueError):
            mae = 0.22

        quality = _clamp01(1.0 - (mae / 0.5), default=0.55)

        profiles = self._metadata.get("airportProfiles") or {}
        profile = profiles.get(airport)
        if profile:
            count = int(profile.get("count") or 0)
            airport_factor = min(1.0, 0.45 + math.log10(max(1, count)) / 3.0)
        else:
            # Aéroport inconnu : le OneHot ignore la catégorie, donc faible confiance.
            airport_factor = 0.35

        now = datetime.now(timezone.utc)
        horizon_days = max(0.0, (target_time - now).total_seconds() / 86400.0)
        if horizon_days <= 7:
            horizon_factor = 0.95
        elif horizon_days <= 14:
            horizon_factor = 0.82
        elif horizon_days <= 30:
            horizon_factor = 0.68
        else:
            horizon_factor = 0.50

        uncertainty_factor = 1.0
        if uncertainty is not None:
            uncertainty_factor = max(0.35, 1.0 - uncertainty * 2.0)

        enhanced_bonus = 1.05 if enhanced else 0.92
        confidence = quality * airport_factor * horizon_factor * uncertainty_factor * enhanced_bonus

        # Un modèle climatologique local ne doit jamais se déclarer quasi certain.
        return round(min(0.82 if enhanced else 0.72, max(0.12, confidence)), 4)

    def predict_point(
        self,
        airport: str,
        target_time: datetime | str,
        weather_features: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._load()
        airport = str(airport or "").strip().upper()

        if not airport:
            return {
                "available": False,
                "source": "LOCAL_ML",
                "error": "Code aéroport manquant.",
                "trustedForAutomaticStatus": False,
            }

        if self._core_model is None:
            return {
                "available": False,
                "airport": airport,
                "source": "LOCAL_ML",
                "error": self._load_error or "Modèle local indisponible.",
                "trustedForAutomaticStatus": False,
            }

        core_row, dt = self._core_row(airport, target_time)
        selected_model = self._core_model
        row = core_row.copy()
        enhanced_used = False

        enhanced_features = self._metadata.get("enhancedFeatures") or []
        if self._enhanced_model is not None and weather_features and enhanced_features:
            supplied = 0
            for feature in enhanced_features:
                value = weather_features.get(feature)
                row[feature] = value
                if value is not None:
                    supplied += 1
            # Utiliser l'enrichi si au moins la moitié des variables sont fournies.
            if supplied >= max(1, math.ceil(len(enhanced_features) / 2)):
                selected_model = self._enhanced_model
                enhanced_used = True

        try:
            score = _clamp01(float(selected_model.predict(row)[0]), default=0.5)
            uncertainty = self._tree_uncertainty(selected_model, row)
            confidence = self._confidence(
                airport=airport,
                target_time=dt,
                uncertainty=uncertainty,
                enhanced=enhanced_used,
            )
            level, label, action = _risk_level(score)

            known_airports = set(self._metadata.get("airports") or [])
            warnings: list[str] = []
            if known_airports and airport not in known_airports:
                warnings.append("Aéroport absent de l'historique d'entraînement : confiance réduite.")

            return {
                "available": True,
                "source": "LOCAL_ML_ENHANCED" if enhanced_used else "LOCAL_ML_CLIMATOLOGY",
                "airport": airport,
                "targetTime": dt.isoformat(),
                "score": round(score, 4),
                "riskLevel": level,
                "riskLabel": label,
                "confidence": confidence,
                "uncertainty": round(uncertainty, 4) if uncertainty is not None else None,
                "recommendedAction": action,
                "modelVersion": self._metadata.get("modelVersion"),
                "warnings": warnings,
                "trustedForAutomaticStatus": False,
            }
        except Exception as exc:
            return {
                "available": False,
                "airport": airport,
                "targetTime": dt.isoformat(),
                "source": "LOCAL_ML",
                "error": str(exc),
                "trustedForAutomaticStatus": False,
            }

    def assess_flight_detailed(
        self,
        *,
        dep_airport: str,
        arr_airport: str,
        dep_time: datetime | str,
        arr_time: datetime | str,
        stopovers: str | Iterable[str] | None = None,
    ) -> dict[str, Any]:
        """Retourne le détail par aéroport : départ, arrivée, escales."""
        dep_point = self.predict_point(dep_airport, dep_time)
        arr_point = self.predict_point(arr_airport, arr_time)

        stopover_codes: list[str] = []
        if isinstance(stopovers, str):
            raw = stopovers.replace(";", ",").replace("|", ",")
            stopover_codes = [x.strip().upper() for x in raw.split(",") if x.strip()]
        elif stopovers:
            stopover_codes = [str(x).strip().upper() for x in stopovers if str(x).strip()]

        dep_dt = _utc(dep_time)
        arr_dt = _utc(arr_time)
        midpoint = dep_dt + (arr_dt - dep_dt) / 2
        stopover_points = [
            {"airport": code, **self.predict_point(code, midpoint)}
            for code in stopover_codes
        ]

        return {
            "available": dep_point.get("available") or arr_point.get("available"),
            "source": "LOCAL_ML",
            "departure": dep_point,
            "arrival": arr_point,
            "stopovers": stopover_points,
            "evaluatedAt": datetime.now(timezone.utc).isoformat(),
            "trustedForAutomaticStatus": False,
        }

    def assess_flight(
        self,
        *,
        dep_airport: str,
        arr_airport: str,
        dep_time: datetime | str,
        arr_time: datetime | str,
        stopovers: str | Iterable[str] | None = None,
    ) -> dict[str, Any]:
        departure = self.predict_point(dep_airport, dep_time)
        arrival = self.predict_point(arr_airport, arr_time)

        stopover_codes: list[str] = []
        if isinstance(stopovers, str):
            raw = stopovers.replace(";", ",").replace("|", ",")
            stopover_codes = [x.strip().upper() for x in raw.split(",") if x.strip()]
        elif stopovers:
            stopover_codes = [str(x).strip().upper() for x in stopovers if str(x).strip()]

        dep_dt = _utc(dep_time)
        arr_dt = _utc(arr_time)
        midpoint = dep_dt + (arr_dt - dep_dt) / 2
        stopover_points = [self.predict_point(code, midpoint) for code in stopover_codes]

        points = [departure, arrival] + stopover_points
        valid_scores = [float(p["score"]) for p in points if p.get("available") and p.get("score") is not None]
        valid_conf = [float(p["confidence"]) for p in points if p.get("available") and p.get("confidence") is not None]

        if not valid_scores:
            return {
                "available": False,
                "source": "LOCAL_ML",
                "score": None,
                "confidence": 0.0,
                "departure": departure,
                "arrival": arrival,
                "stopovers": stopover_points,
                "trustedForAutomaticStatus": False,
            }

        # Score conservateur mais pas uniquement max : 70% pire point + 30% moyenne.
        score = 0.70 * max(valid_scores) + 0.30 * float(np.mean(valid_scores))
        score = _clamp01(score)
        confidence = min(valid_conf) if valid_conf else 0.2
        level, label, action = _risk_level(score)

        return {
            "available": True,
            "source": "LOCAL_ML",
            "score": round(score, 4),
            "riskLevel": level,
            "riskLabel": label,
            "confidence": round(confidence, 4),
            "recommendedAction": action,
            "departure": departure,
            "arrival": arrival,
            "stopovers": stopover_points,
            "evaluatedAt": datetime.now(timezone.utc).isoformat(),
            "trustedForAutomaticStatus": False,
        }

    def enrich_api_assessment(
        self,
        api_assessment: dict[str, Any] | None,
        *,
        dep_airport: str,
        arr_airport: str,
        dep_time: datetime | str,
        arr_time: datetime | str,
        stopovers: str | Iterable[str] | None = None,
    ) -> dict[str, Any]:
        """Ajoute le ML local sans modifier les champs opérationnels existants.

        `score`, `canAffectStatus`, etc. de l'évaluation API restent inchangés.
        Un nouveau `advisoryScore` peut être affiché à l'OCC.
        """
        assessment = dict(api_assessment or {})
        local = self.assess_flight(
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=stopovers,
        )
        assessment["localML"] = local
        assessment["localMLAvailable"] = bool(local.get("available"))

        api_score_raw = assessment.get("score")
        local_score_raw = local.get("score")
        api_data_available = bool(assessment.get("dataAvailable", api_score_raw is not None))

        api_score: float | None = None
        if api_score_raw is not None:
            try:
                api_score = _clamp01(api_score_raw)
            except Exception:
                api_score = None

        local_score: float | None = None
        if local_score_raw is not None:
            try:
                local_score = _clamp01(local_score_raw)
            except Exception:
                local_score = None

        if api_data_available and api_score is not None and local_score is not None:
            # L'API reste dominante. Le ML local joue le rôle d'un second avis.
            advisory = 0.80 * api_score + 0.20 * local_score
            source = "API_PLUS_LOCAL_ML"
        elif api_score is not None:
            advisory = api_score
            source = "API_ONLY"
        elif local_score is not None:
            advisory = local_score
            source = "LOCAL_ML_ONLY"
        else:
            advisory = None
            source = "NO_DATA"

        assessment["advisoryScore"] = round(advisory, 4) if advisory is not None else None
        assessment["advisorySource"] = source
        assessment["localMLTrustedForAutomaticStatus"] = False

        if advisory is not None:
            level, label, _ = _risk_level(advisory)
            assessment["advisoryRiskLevel"] = level
            assessment["advisoryRiskLabel"] = label

        return assessment


local_weather_ml = LocalWeatherML()
