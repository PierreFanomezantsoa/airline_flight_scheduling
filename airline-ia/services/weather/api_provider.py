"""Adaptateur vers le fournisseur météo historique de l'application.

Pourquoi ce module existe
------------------------
Avant la refactorisation, le projet exposait généralement
``get_real_weather_severity`` depuis un fichier racine ``services.py``.
Depuis l'introduction du package ``services/``, ``from services import ...``
charge ``services/__init__.py`` et masque ce fichier historique.

Ce module résout ce conflit sans coupler le reste de l'application au legacy :
- priorité à un callable configurable par variable d'environnement ;
- compatibilité automatique avec le fichier racine ``services.py`` ;
- import paresseux : une API absente ne fait jamais planter le démarrage Flask.

Variable d'environnement optionnelle :
    WEATHER_API_CALLABLE=mon_module.ma_fonction
ou :
    WEATHER_API_CALLABLE=mon_module:ma_fonction
"""
from __future__ import annotations

import importlib
import importlib.util
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional


WeatherSeverityCallable = Callable[[str, datetime], float]


class WeatherAPIProviderUnavailable(RuntimeError):
    """Le fournisseur météo principal ne peut pas être chargé."""


class LegacyWeatherAPIProvider:
    """Résout paresseusement la fonction API météo existante.

    Le chargement est volontairement différé jusqu'au premier appel météo afin
    que l'application puisse démarrer même si l'API externe ou son adaptateur
    est temporairement absent. Le ``ResilientWeatherService`` pourra alors
    basculer sur le ML local.
    """

    def __init__(self) -> None:
        self._callable: Optional[WeatherSeverityCallable] = None
        self._resolve_error: Optional[str] = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        try:
            self._resolve()
            return True
        except Exception:
            return False

    @property
    def error(self) -> Optional[str]:
        if self._callable is not None:
            return None
        # Ne force pas un import coûteux uniquement pour lire le statut.
        return self._resolve_error

    def reset(self) -> None:
        """Force une nouvelle résolution au prochain appel."""
        with self._lock:
            self._callable = None
            self._resolve_error = None

    def _from_env(self) -> Optional[WeatherSeverityCallable]:
        target = os.getenv("WEATHER_API_CALLABLE", "").strip()
        if not target:
            return None

        if ":" in target:
            module_name, function_name = target.split(":", 1)
        else:
            module_name, _, function_name = target.rpartition(".")

        if not module_name or not function_name:
            raise WeatherAPIProviderUnavailable(
                "WEATHER_API_CALLABLE doit être de la forme "
                "'module.fonction' ou 'module:fonction'."
            )

        module = importlib.import_module(module_name)
        function = getattr(module, function_name, None)
        if not callable(function):
            raise WeatherAPIProviderUnavailable(
                f"Callable météo introuvable : {target}"
            )
        return function

    @staticmethod
    def _legacy_services_file() -> Path:
        # .../services/weather/api_provider.py -> racine projet
        return Path(__file__).resolve().parents[2] / "services.py"

    def _from_legacy_services_file(self) -> Optional[WeatherSeverityCallable]:
        legacy_path = self._legacy_services_file()
        if not legacy_path.is_file():
            return None

        module_name = "_airline_legacy_weather_services"
        spec = importlib.util.spec_from_file_location(module_name, legacy_path)
        if spec is None or spec.loader is None:
            raise WeatherAPIProviderUnavailable(
                f"Impossible de charger le fournisseur historique : {legacy_path}"
            )

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        function = getattr(module, "get_real_weather_severity", None)
        if not callable(function):
            raise WeatherAPIProviderUnavailable(
                f"{legacy_path} existe mais ne contient pas "
                "get_real_weather_severity(...)."
            )
        return function

    def _resolve(self) -> WeatherSeverityCallable:
        if self._callable is not None:
            return self._callable

        with self._lock:
            if self._callable is not None:
                return self._callable

            errors: list[str] = []

            try:
                configured = self._from_env()
                if configured is not None:
                    self._callable = configured
                    self._resolve_error = None
                    return configured
            except Exception as exc:
                errors.append(f"WEATHER_API_CALLABLE: {exc}")

            try:
                legacy = self._from_legacy_services_file()
                if legacy is not None:
                    self._callable = legacy
                    self._resolve_error = None
                    return legacy
            except Exception as exc:
                errors.append(f"services.py historique: {exc}")

            message = (
                "Aucun fournisseur API météo n'est configuré. "
                "Conservez le fichier racine services.py contenant "
                "get_real_weather_severity(...) ou définissez "
                "WEATHER_API_CALLABLE."
            )
            if errors:
                message += " Détails: " + " | ".join(errors)

            self._resolve_error = message
            raise WeatherAPIProviderUnavailable(message)

    def get_severity(self, airport_code: str, target_time: datetime) -> float:
        function = self._resolve()
        return float(function(airport_code, target_time))


api_weather_provider = LegacyWeatherAPIProvider()
