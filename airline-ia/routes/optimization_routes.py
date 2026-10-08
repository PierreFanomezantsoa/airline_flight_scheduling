from datetime import datetime
import requests
from flask import Blueprint, jsonify, request

from common.authorization import require_roles
from models import db, Flight
from services.weather.resilient_service import resilient_weather_service

optimization_bp = Blueprint('optimization', __name__)

FASTAPI_URL = "http://localhost:8000/api/ia/optimize"


@optimization_bp.route('/optimize', methods=['POST'])
@require_roles("Planificateur", "Regulator")
def optimize_assignments():
    try:
        data = request.get_json() or {}
        aircrafts = data.get('aircrafts', [])
        flights = data.get('flights', [])

        if not aircrafts or not flights:
            return jsonify({
                "status": "INFEASIBLE",
                "assignments": [],
                "message": "Aucun aircraft ou flight fourni pour l'optimisation."
            }), 200

        assignments = []
        for idx, flight in enumerate(flights):
            aircraft = aircrafts[idx % len(aircrafts)]
            assignments.append({
                "refFlight": flight.get('refFlight'),
                "refAircraft": aircraft.get('refAircraft')
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
@require_roles("Planificateur", "Regulator")
def optimize_schedule_with_fastapi():
    try:
        db_flights = Flight.query.all()
        if not db_flights:
            return jsonify({"status": "error", "message": "Aucun flight trouvé."}), 400

        formatted_flights = []
        for f in db_flights:
            is_weekend = 1.0 if f.departureTime.weekday() >= 5 else 0.0
            same_hour_slots = [
                flight for flight in db_flights
                if flight.departureAirportCode == f.departureAirportCode and flight.departureTime.hour == f.departureTime.hour
            ]
            traffic_density = min(len(same_hour_slots) / 4.0, 1.0)
            weather_result = resilient_weather_service.get_severity(f.departureAirportCode, f.departureTime)
            weather_severity = weather_result.get("severity", 0.5)

            formatted_flights.append({
                "refFlight": str(f.refFlight),
                "refAircraft": str(f.refAircraft) if f.refAircraft else "SANS_ENGIN",
                "departure_time": f.departureTime.isoformat() if f.departureTime else None,
                "arrival_time": f.arrivalTime.isoformat() if f.arrivalTime else None,
                "status": f.status,
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
                flight = db.session.get(Flight, opt_f["refFlight"])
                if flight:
                    flight.departureTime = datetime.fromisoformat(opt_f["departure_time"].replace('Z', '+00:00'))
                    flight.arrivalTime = datetime.fromisoformat(opt_f["arrival_time"].replace('Z', '+00:00'))
                    flight.status = opt_f["status"]
            db.session.commit()
            return jsonify({"status": "success", "message": "Planning mis à jour avec succès."}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"Erreur d'optimisation : {str(e)}"}), 500