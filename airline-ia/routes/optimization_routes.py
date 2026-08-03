from datetime import datetime
import requests
from flask import Blueprint, jsonify, request

from models import db, Flight
from services import get_real_weather_severity

optimization_bp = Blueprint('optimization', __name__)

FASTAPI_URL = "http://localhost:8000/api/ia/optimize"


@optimization_bp.route('/optimize', methods=['POST'])
def optimize_assignments():
    try:
        data = request.get_json() or {}
        aircrafts = data.get('aircrafts', [])
        flights = data.get('flights', [])

        if not aircrafts or not flights:
            return jsonify({
                "status": "INFEASIBLE",
                "assignments": [],
                "message": "Aucun avion ou vol fourni pour l'optimisation."
            }), 200

        assignments = []
        for idx, flight in enumerate(flights):
            aircraft = aircrafts[idx % len(aircrafts)]
            assignments.append({
                "flightId": flight.get('id'),
                "aircraftId": aircraft.get('id')
            })

        return jsonify({
            "status": "OPTIMAL",
            "assignments": assignments
        }), 200

    except Exception as e:
        print(f"Erreur lors de POST /optimize : {str(e)}")
        return jsonify({
            "status": "INFEASIBLE",
            "assignments": [],
            "error": str(e)
        }), 500


@optimization_bp.route('/flights/optimize', methods=['POST'])
def optimize_schedule_with_fastapi():
    try:
        db_flights = Flight.query.all()
        if not db_flights:
            return jsonify({"status": "error", "message": "Aucun vol trouvé."}), 400

        formatted_flights = []
        for f in db_flights:
            is_weekend = 1.0 if f.heureDepart.weekday() >= 5 else 0.0
            same_hour_slots = [
                vol for vol in db_flights
                if vol.aeroportDepart == f.aeroportDepart and vol.heureDepart.hour == f.heureDepart.hour
            ]
            traffic_density = min(len(same_hour_slots) / 4.0, 1.0)
            weather_severity = get_real_weather_severity(f.aeroportDepart, f.heureDepart)

            formatted_flights.append({
                "id": str(f.id),
                "aircraft_id": str(f.avionId) if f.avionId else "SANS_ENGIN",
                "departure_time": f.heureDepart.isoformat() if f.heureDepart else None,
                "arrival_time": f.heureArrivee.isoformat() if f.heureArrivee else None,
                "status": f.statut,
                "ai_features": {
                    "traffic_density": traffic_density,
                    "weather_severity": weather_severity,
                    "is_weekend": is_weekend
                }
            })

        response = requests.post(FASTAPI_URL, json={"flights": formatted_flights, "turnaround_minutes": 45}, timeout=10)
        response.raise_for_status()

        if response.status_code == 200:
            results = response.json()
            for opt_f in results.get("optimized_flights", []):
                flight = db.session.get(Flight, opt_f["id"])
                if flight:
                    flight.heureDepart = datetime.fromisoformat(opt_f["departure_time"].replace('Z', '+00:00'))
                    flight.heureArrivee = datetime.fromisoformat(opt_f["arrival_time"].replace('Z', '+00:00'))
                    flight.statut = opt_f["status"]
            db.session.commit()
            return jsonify({"status": "success", "message": "Planning mis à jour avec succès."}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"Erreur d'optimisation : {str(e)}"}), 500