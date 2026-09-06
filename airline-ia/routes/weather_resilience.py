"""Compatibilité descendante des composants météo.

- Le service résilient existant reste disponible sous les mêmes imports.
- Le ML local amélioré est également exposé comme second avis OCC.
"""

from services.weather.resilient_service import (  # noqa: F401
    LocalWeatherMLProvider,
    ResilientWeatherService,
    resilient_weather_service,
)
from weather_ml import LocalWeatherML, local_weather_ml  # noqa: F401

__all__ = [
    "LocalWeatherMLProvider",
    "ResilientWeatherService",
    "resilient_weather_service",
    "LocalWeatherML",
    "local_weather_ml",
]
