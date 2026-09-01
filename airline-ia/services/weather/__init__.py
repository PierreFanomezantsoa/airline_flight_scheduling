"""Services météorologiques de l'application.

Les imports publics restent volontairement minimaux afin d'éviter les cycles
d'import et de permettre un démarrage même si le fournisseur externe est HS.
"""

from .api_provider import api_weather_provider
from .resilient_service import resilient_weather_service

__all__ = [
    "api_weather_provider",
    "resilient_weather_service",
]
