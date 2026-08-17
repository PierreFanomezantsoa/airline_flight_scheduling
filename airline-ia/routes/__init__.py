from flask import Flask

from .airports_routes import airports_bp
from .flights_routes import flights_bp
from .fleet_routes import fleet_bp
from .analytics_routes import analytics_bp
from .automatic_schedule_routes import auto_schedule_bp

# Nouveau module IA / arbre de décision pour les conflits
from .ml_conflicts_routes import ml_conflicts_bp

# IMPORTANT :
# Si optimization_routes.py expose déjà POST /flights/optimize,
# ne pas enregistrer optimization_bp en même temps que ml_conflicts_bp,
# sinon vous risquez d'avoir deux routes concurrentes pour le même endpoint.
#
# from .optimization_routes import optimization_bp


# Liste de tous les Blueprints
ALL_BLUEPRINTS = [
    airports_bp,
    flights_bp,
    fleet_bp,
    ml_conflicts_bp,
    analytics_bp,
    auto_schedule_bp,
]


def register_blueprints(app: Flask) -> None:
    """Enregistre automatiquement tous les Blueprints de l'application Flask."""
    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)