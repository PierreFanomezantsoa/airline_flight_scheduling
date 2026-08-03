import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from flask import Blueprint, jsonify, request

from models import db, Flight
from services import get_real_weather_severity
from data.airports import get_airport_timezone

flights_bp = Blueprint('flights', __name__)

@flights_bp.route('/flights', methods=['GET'])
def get_flights():
    try:
        flights = Flight.query.all()
        updated_flights = []
        has_changes = False

        for f in flights:
            weather_severity = get_real_weather_severity(f.aeroportDepart, f.heureDepart)
            current_status = f.statut

            if f.heureDepart and f.heureDepart.tzinfo is not None:
                now = datetime.now(f.heureDepart.tzinfo)
            else:
                now = datetime.now(timezone.utc)

            # RÈGLE 1 : Vol 'Effectué'
            if f.heureArrivee:
                now_arr = datetime.now(f.heureArrivee.tzinfo) if f.heureArrivee.tzinfo else datetime.now(timezone.utc)
                if f.heureArrivee < now_arr:
                    if current_status not in ['Effectué', 'Done', 'Cancelled']:
                        current_status = 'Effectué'
                        f.statut = current_status
                        has_changes = True

            # RÈGLE 2 : Départ passé
            if current_status != 'Effectué' and f.heureDepart and f.heureDepart <= now:
                if weather_severity >= 0.8:
                    if current_status != 'Cancelled':
                        current_status = 'Cancelled'
                        f.statut = 'Cancelled'
                        has_changes = True
                elif current_status in ['Scheduled', 'Delayed']:
                    current_status = 'In-Flight'
                    f.statut = 'In-Flight'
                    has_changes = True

            # RÈGLE 3 : Alerte météo extrême sur vols futurs
            elif weather_severity >= 0.8 and current_status not in ['Cancelled', 'Effectué']:
                current_status = 'Cancelled'
                f.statut = 'Cancelled'
                has_changes = True

            # Calcul décalage et durée
            duration_minutes = None
            local_dep_str = None
            local_arr_str = None

            if f.heureDepart and f.heureArrivee:
                duration_minutes = int((f.heureArrivee - f.heureDepart).total_seconds() / 60)
                tz_dep = ZoneInfo(get_airport_timezone(f.aeroportDepart))
                tz_arr = ZoneInfo(get_airport_timezone(f.aeroportArrivee))
                local_dep_str = f.heureDepart.astimezone(tz_dep).isoformat()
                local_arr_str = f.heureArrivee.astimezone(tz_arr).isoformat()

            updated_flights.append({
                'id': str(f.id),
                'flightNumber': f.numeroVol,
                'origin': f.aeroportDepart,
                'destination': f.aeroportArrivee,
                'departure': f.heureDepart.isoformat() if f.heureDepart else None,
                'arrival': f.heureArrivee.isoformat() if f.heureArrivee else None,
                'localDeparture': local_dep_str,
                'localArrival': local_arr_str,
                'durationMinutes': duration_minutes,
                'status': current_status,
                'aircraft': str(f.avionId) if f.avionId else 'NON ASSIGNÉ',
                'aircraftModel': f.avion.immatriculation if f.avion and f.avion.immatriculation else 'Sans Immat',
                'weatherSeverity': weather_severity
            })

        if has_changes:
            db.session.commit()

        return jsonify(updated_flights), 200
    except Exception as e:
        db.session.rollback()
        print(f"Erreur critique lors de GET /flights : {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@flights_bp.route('/flights', methods=['POST'])
def create_flight():
    try:
        data = request.get_json()

        dep_airport = data['aeroportDepart'].upper()
        arr_airport = data['aeroportArrivee'].upper()

        dep_time = datetime.fromisoformat(data['heureDepart'].replace('Z', '+00:00'))
        arr_time = datetime.fromisoformat(data['heureArrivee'].replace('Z', '+00:00'))

        if dep_time.tzinfo is None:
            dep_time = dep_time.replace(tzinfo=timezone.utc)
        if arr_time.tzinfo is None:
            arr_time = arr_time.replace(tzinfo=timezone.utc)

        if arr_time <= dep_time:
            return jsonify({"status": "error", "message": "L'heure d'arrivée doit être postérieure au départ."}), 400

        weather_severity = get_real_weather_severity(dep_airport, dep_time)

        frontend_status = data.get('status', 'Planifié')
        status_mapping = {
            'Planifié': 'Scheduled', 'Retardé': 'Delayed', 'En Vol': 'In-Flight',
            'Annulé': 'Cancelled', 'Effectué': 'Effectué'
        }
        initial_status = status_mapping.get(frontend_status, 'Scheduled')

        now = datetime.now(timezone.utc)
        if arr_time < now:
            initial_status = 'Effectué'
        elif weather_severity >= 0.8:
            initial_status = 'Cancelled'

        new_flight = Flight(
            id=str(uuid.uuid4()),
            numeroVol=data['numeroVol'],
            aeroportDepart=dep_airport,
            aeroportArrivee=arr_airport,
            heureDepart=dep_time,
            heureArrivee=arr_time,
            avionId=data.get('avionId') or None,
            statut=initial_status
        )
        db.session.add(new_flight)
        db.session.commit()
        return jsonify({"status": "success", "id": str(new_flight.id), "assigned_status": initial_status}), 201
    except Exception as e:
        db.session.rollback()
        print(f"Erreur lors de la création du vol : {str(e)}")
        return jsonify({"status": "error", "message": f"Erreur de traitement : {str(e)}"}), 500


@flights_bp.route('/flights/<id>', methods=['PUT'])
def update_flight(id):
    try:
        data = request.get_json()
        flight = db.session.get(Flight, id)
        if not flight:
            return jsonify({"status": "error", "message": "Vol introuvable"}), 404

        dep_airport = data['aeroportDepart'].upper()
        arr_airport = data['aeroportArrivee'].upper()

        dep_time = datetime.fromisoformat(data['heureDepart'].replace('Z', '+00:00'))
        arr_time = datetime.fromisoformat(data['heureArrivee'].replace('Z', '+00:00'))

        if dep_time.tzinfo is None:
            dep_time = dep_time.replace(tzinfo=timezone.utc)
        if arr_time.tzinfo is None:
            arr_time = arr_time.replace(tzinfo=timezone.utc)

        if arr_time <= dep_time:
            return jsonify({"status": "error", "message": "L'heure d'arrivée doit être postérieure au départ."}), 400

        weather_severity = get_real_weather_severity(dep_airport, dep_time)

        frontend_status = data.get('status', flight.statut)
        status_mapping = {
            'Planifié': 'Scheduled', 'Retardé': 'Delayed', 'En Vol': 'In-Flight',
            'Annulé': 'Cancelled', 'Effectué': 'Effectué'
        }

        new_status = status_mapping.get(frontend_status, frontend_status)
        now = datetime.now(timezone.utc)
        if arr_time < now:
            new_status = 'Effectué'
        elif weather_severity >= 0.8:
            new_status = 'Cancelled'

        flight.numeroVol = data['numeroVol']
        flight.aeroportDepart = dep_airport
        flight.aeroportArrivee = arr_airport
        flight.heureDepart = dep_time
        flight.heureArrivee = arr_time
        flight.avionId = data.get('avionId') or None
        flight.statut = new_status

        db.session.commit()
        return jsonify({"status": "success", "message": "Vol mis à jour", "assigned_status": new_status}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500


@flights_bp.route('/flights/<id>', methods=['DELETE'])
def delete_flight(id):
    try:
        flight = db.session.get(Flight, id)
        if not flight:
            return jsonify({"status": "error", "message": "Vol introuvable"}), 404

        db.session.delete(flight)
        db.session.commit()
        return jsonify({"status": "success", "message": "Vol supprimé"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500