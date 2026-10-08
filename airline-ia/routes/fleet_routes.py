from flask import Blueprint, jsonify
from models import Aircraft

fleet_bp = Blueprint('fleet', __name__)

@fleet_bp.route('/fleet/aircrafts', methods=['GET'])
def get_fleet_aircrafts():
    try:
        aircrafts = Aircraft.query.all()
        return jsonify([
            {
                "refAircraft": str(ac.refAircraft),
                "registration": ac.registration or "Sans Immat",
                "model": ac.registration or "Sans Immat",
                "capacity": getattr(ac, 'capacity', 180),
                "aircraftStatus": getattr(ac, 'aircraftStatus', 'Active'),
                "maintenanceHoursLimit": getattr(ac, 'maintenanceHoursLimit', 500),
                "hoursSinceMaintenance": getattr(ac, 'hoursSinceMaintenance', 0)
            }
            for ac in aircrafts
        ]), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500