from flask import Blueprint, jsonify
from models import Aircraft

fleet_bp = Blueprint('fleet', __name__)

@fleet_bp.route('/fleet/aircrafts', methods=['GET'])
def get_fleet_aircrafts():
    try:
        aircrafts = Aircraft.query.all()
        return jsonify([
            {
                "id": str(ac.id),
                "immatriculation": ac.immatriculation or "Sans Immat",
                "model": ac.immatriculation or "Sans Immat",
                "capacite": getattr(ac, 'capacite', 180),
                "statut": getattr(ac, 'statut', 'Active'),
                "limiteHeuresMaintenance": getattr(ac, 'limiteHeuresMaintenance', 500),
                "heuresDepuisDerniereMaintenance": getattr(ac, 'heuresDepuisDerniereMaintenance', 0)
            }
            for ac in aircrafts
        ]), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500