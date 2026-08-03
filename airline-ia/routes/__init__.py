from flask import Flask

from .airports_routes import airports_bp
from .flights_routes import flights_bp
from .fleet_routes import fleet_bp
from .optimization_routes import optimization_bp
from .analytics_routes import analytics_bp

# Liste de tous les Blueprints
ALL_BLUEPRINTS = [
    airports_bp,
    flights_bp,
    fleet_bp,
    optimization_bp,
    analytics_bp,
]

def register_blueprints(app: Flask) -> None:
    """Enregistre automatiquement tous les Blueprints de la grille de routes dans l'application Flask."""
    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)