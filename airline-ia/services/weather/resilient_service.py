"""Couche météo résiliente et interopérable.

Priorité des sources :
1) API météo principale via services.weather.api_provider
2) modèle ML local joblib
3) dernière valeur API valide (stale cache) si suffisamment récente
4) mode dégradé neutre (0.5), explicitement marqué indisponible

Le reste de l'application consomme un contrat stable (dict) et ne dépend pas
ni du fournisseur API ni de la technologie du modèle local.
"""
from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.weather.api_provider import api_weather_provider


WEATHER_API_RETRIES = max(1, int(os.getenv("WEATHER_API_RETRIES", "2")))
WEATHER_API_RETRY_DELAY_SECONDS = max(
    0.0, float(os.getenv("WEATHER_API_RETRY_DELAY_SECONDS", "0.25"))
)
WEATHER_API_FAILURE_THRESHOLD = max(
    1, int(os.getenv("WEATHER_API_FAILURE_THRESHOLD", "3"))
)
WEATHER_API_CIRCUIT_OPEN_SECONDS = max(
    5, int(os.getenv("WEATHER_API_CIRCUIT_OPEN_SECONDS", "60"))
)
WEATHER_STALE_CACHE_MAX_SECONDS = max(
    60, int(os.getenv("WEATHER_STALE_CACHE_MAX_SECONDS", str(6 * 3600)))
)
WEATHER_LOCAL_MODEL_PATH = os.getenv(
    "WEATHER_LOCAL_MODEL_PATH", "models/weather_severity_model.joblib"
)


def _ensure_utc(dt: datetime | None) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _clamp(value: Any, default: float = 0.5) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return default


class LocalWeatherMLProvider:
    """Charge paresseusement un modèle scikit-learn/joblib local.

    Contrat attendu du modèle : predict(DataFrame) -> severity [0..1].
    Variables fournies : airport, month, day, day_of_year, hour, weekday.
    Un Pipeline sklearn avec OneHotEncoder(handle_unknown='ignore') est conseillé.
    """

    def __init__(self, model_path: str = WEATHER_LOCAL_MODEL_PATH):
        self.model_path = Path(model_path)
        self._model = None
        self._load_error: str | None = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        self._load_if_needed()
        return self._model is not None

    @property
    def load_error(self) -> str | None:
        self._load_if_needed()
        return self._load_error

    def _load_if_needed(self) -> None:
        if self._model is not None or self._load_error is not None:
            return
        with self._lock:
            if self._model is not None or self._load_error is not None:
                return
            try:
                import joblib  # dépendance optionnelle au démarrage

                if not self.model_path.exists():
                    raise FileNotFoundError(
                        f"Modèle météo local absent: {self.model_path}"
                    )
                self._model = joblib.load(self.model_path)
            except Exception as exc:  # le backend doit continuer sans modèle
                self._load_error = str(exc)

    def predict(self, airport_code: str, target_time: datetime) -> float:
        self._load_if_needed()
        if self._model is None:
            raise RuntimeError(self._load_error or "Modèle météo local indisponible")

        import pandas as pd

        target = _ensure_utc(target_time)
        row = pd.DataFrame(
            [
                {
                    "airport": (airport_code or "").strip().upper(),
                    "month": target.month,
                    "day": target.day,
                    "day_of_year": target.timetuple().tm_yday,
                    "hour": target.hour,
                    "weekday": target.weekday(),
                }
            ]
        )
        prediction = self._model.predict(row)
        value = prediction[0] if hasattr(prediction, "__len__") else prediction
        return _clamp(value)


class ResilientWeatherService:
    """Façade stable API -> ML local -> cache stale -> mode dégradé.

    Inclut un mini circuit-breaker afin d'éviter de marteler une API en panne.
    """

    def __init__(self):
        self.local_ml = LocalWeatherMLProvider()
        self._lock = threading.Lock()
        self._api_failures = 0
        self._circuit_open_until = 0.0
        self._last_good: dict[tuple[str, str], dict] = {}

    # =========================================================================
    # Utilitaires internes
    # =========================================================================

    @staticmethod
    def _bucket(airport_code: str, target_time: datetime) -> tuple[str, str]:
        target = _ensure_utc(target_time)
        return (
            (airport_code or "").strip().upper(),
            target.strftime("%Y-%m-%dT%H"),
        )

    def _circuit_is_open(self) -> bool:
        with self._lock:
            return time.time() < self._circuit_open_until

    def _register_api_success(self) -> None:
        with self._lock:
            self._api_failures = 0
            self._circuit_open_until = 0.0

    def _register_api_failure(self) -> None:
        with self._lock:
            self._api_failures += 1
            if self._api_failures >= WEATHER_API_FAILURE_THRESHOLD:
                self._circuit_open_until = (
                    time.time() + WEATHER_API_CIRCUIT_OPEN_SECONDS
                )

    def _save_last_good(
        self, airport_code: str, target_time: datetime, severity: float
    ) -> None:
        key = self._bucket(airport_code, target_time)
        with self._lock:
            self._last_good[key] = {
                "severity": severity,
                "saved_at": time.time(),
            }

    def _get_stale_cache(
        self, airport_code: str, target_time: datetime
    ) -> dict | None:
        key = self._bucket(airport_code, target_time)
        with self._lock:
            cached = self._last_good.get(key)
        if not cached:
            return None
        age = time.time() - cached["saved_at"]
        if age > WEATHER_STALE_CACHE_MAX_SECONDS:
            return None
        return {
            "severity": _clamp(cached["severity"]),
            "source": "STALE_API_CACHE",
            "confidence": 0.45,
            "available": True,
            "forecastAvailable": True,
            "degraded": True,
            "trustedForAutomaticStatus": False,
            "apiAvailable": False,
            "mlAvailable": self.local_ml.available,
            "error": "API indisponible; dernière valeur API valide réutilisée.",
        }

    def _try_api(
        self, airport_code: str, target_time: datetime
    ) -> tuple[float | None, str | None]:
        if self._circuit_is_open():
            return (
                None,
                "Circuit API météo temporairement ouvert après plusieurs échecs.",
            )

        last_error = None
        for attempt in range(WEATHER_API_RETRIES):
            try:
                raw = api_weather_provider.get_severity(airport_code, target_time)
                severity = _clamp(raw)
                self._register_api_success()
                self._save_last_good(airport_code, target_time, severity)
                return severity, None
            except Exception as exc:
                last_error = str(exc)
                self._register_api_failure()
                if attempt + 1 < WEATHER_API_RETRIES:
                    time.sleep(WEATHER_API_RETRY_DELAY_SECONDS)
        return None, last_error or "Erreur API météo inconnue"

    # =========================================================================
    # API publique
    # =========================================================================

    def get_severity(self, airport_code: str, target_time: datetime) -> dict:
        airport = (airport_code or "").strip().upper()
        target = _ensure_utc(target_time)

        if not airport:
            return {
                "severity": 0.5,
                "source": "UNAVAILABLE",
                "confidence": 0.0,
                "available": False,
                "forecastAvailable": False,
                "degraded": True,
                "trustedForAutomaticStatus": False,
                "apiAvailable": False,
                "mlAvailable": self.local_ml.available,
                "error": "Code aéroport absent",
            }

        api_value, api_error = self._try_api(airport, target)
        if api_value is not None:
            return {
                "severity": api_value,
                "source": "API",
                "confidence": 0.95,
                "available": True,
                "forecastAvailable": True,
                "degraded": False,
                "trustedForAutomaticStatus": True,
                "apiAvailable": True,
                "mlAvailable": self.local_ml.available,
                "error": None,
            }

        # API en panne : le ML local prend le relais immédiatement.
        try:
            ml_value = self.local_ml.predict(airport, target)
            return {
                "severity": ml_value,
                "source": "LOCAL_ML",
                "confidence": 0.60,
                "available": True,
                "forecastAvailable": True,
                "degraded": True,
                "trustedForAutomaticStatus": False,
                "apiAvailable": False,
                "mlAvailable": True,
                "error": f"API météo indisponible: {api_error}",
            }
        except Exception as ml_exc:
            stale = self._get_stale_cache(airport, target)
            if stale:
                stale["error"] = (
                    f"API indisponible: {api_error}; "
                    f"ML local indisponible: {ml_exc}. "
                    "Utilisation du cache API antérieur."
                )
                return stale

            return {
                "severity": 0.5,
                "source": "UNAVAILABLE",
                "confidence": 0.20,
                "available": False,
                "forecastAvailable": False,
                "degraded": True,
                "trustedForAutomaticStatus": False,
                "apiAvailable": False,
                "mlAvailable": False,
                "error": (
                    f"API météo indisponible: {api_error}; "
                    f"ML local indisponible: {ml_exc}"
                ),
            }

    def get_severity_detail(
        self, airport_code: str, target_time: datetime
    ) -> dict:
        """Comme get_severity() mais expose la source et le détail par aéroport."""
        result = self.get_severity(airport_code, target_time)
        result["airport"] = (airport_code or "").strip().upper()
        result["targetTime"] = _ensure_utc(target_time).isoformat()
        return result

    def status(self) -> dict:
        with self._lock:
            failures = self._api_failures
            open_until = self._circuit_open_until
        return {
            "apiCircuitOpen": time.time() < open_until,
            "apiFailureCount": failures,
            "apiCircuitOpenUntil": (
                datetime.fromtimestamp(open_until, tz=timezone.utc).isoformat()
                if open_until > time.time()
                else None
            ),
            "apiProviderAvailable": api_weather_provider.available,
            "apiProviderError": api_weather_provider.error,
            "localMLAvailable": self.local_ml.available,
            "localMLModelPath": str(self.local_ml.model_path),
            "localMLLoadError": self.local_ml.load_error,
        }


resilient_weather_service = ResilientWeatherService()