"""Compatibilité descendante.

Le code météo n'appartient plus à la couche HTTP. Les anciens imports
`routes.weather_resilience` continuent néanmoins de fonctionner.
"""
from services.weather.resilient_service import (  # noqa: F401
    LocalWeatherMLProvider,
    ResilientWeatherService,
    resilient_weather_service,
)
