import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from flask import Blueprint, jsonify, request

from models import db, Flight
from services import get_real_weather_severity
from data.airports import get_airport_timezone

flights_bp = Blueprint('flights', __name__)


def ensure_utc(dt: datetime) -> datetime:
    """S'assure qu'une datetime est consciente de son fuseau horaire UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def format_to_local_time(dt: datetime, airport_code: str) -> str:
    """
    Convertit une datetime UTC vers l'heure locale de l'aéroport spécifié.
    Retourne la chaîne ISO-8601 correspondante.
    """
    if not dt or not airport_code:
        return None
    
    dt_utc = ensure_utc(dt)
    tz_str = get_airport_timezone(airport_code)
    
    try:
        local_tz = ZoneInfo(tz_str) if tz_str else timezone.utc
    except ZoneInfoNotFoundError:
        local_tz = timezone.utc

    return dt_utc.astimezone(local_tz).isoformat()


def check_aircraft_conflict(avion_id, dep_time, arr_time, current_flight_id=None):
    """
    Vérifie si l'appareil est déjà assigné à un autre vol sur la même plage horaire.
    """
    if not avion_id:
        return None

    query = Flight.query.filter(
        Flight.avionId == avion_id,
        Flight.statut != 'Cancelled',
        Flight.heureDepart < arr_time,
        Flight.heureArrivee > dep_time
    )

    if current_flight_id:
        query = query.filter(Flight.id != current_flight_id)

    return query.first()


@flights_bp.route('/flights', methods=['GET'])
def get_flights():
    try:
        flights = Flight.query.all()
        updated_flights = []
        has_changes = False
        now_utc = datetime.now(timezone.utc)

        for f in flights:
            dep_utc = ensure_utc(f.heureDepart)
            arr_utc = ensure_utc(f.heureArrivee)

            weather_severity = get_real_weather_severity(f.aeroportDepart, dep_utc) if dep_utc else 0.0
            current_status = f.statut

            # RÈGLE 1 : Vol 'Effectué'
            if arr_utc and arr_utc < now_utc:
                if current_status not in ['Effectué', 'Done', 'Cancelled']:
                    current_status = 'Effectué'
                    f.statut = current_status
                    has_changes = True

            # RÈGLE 2 : Départ passé
            elif current_status != 'Effectué' and dep_utc and dep_utc <= now_utc:
                if weather_severity >= 0.8:
                    if current_status != 'Cancelled':
                        current_status = 'Cancelled'
                        f.statut = 'Cancelled'
                        has_changes = True
                elif current_status in ['Scheduled', 'Delayed', 'Planifié', 'Retardé']:
                    current_status = 'In-Flight'
                    f.statut = 'In-Flight'
                    has_changes = True

            # RÈGLE 3 : Alerte météo extrême sur vols futurs
            elif weather_severity >= 0.8 and current_status not in ['Cancelled', 'Effectué']:
                current_status = 'Cancelled'
                f.statut = 'Cancelled'
                has_changes = True

            # Calcul de la durée en minutes
            duration_minutes = None
            if dep_utc and arr_utc:
                duration_minutes = int((arr_utc - dep_utc).total_seconds() / 60)

            # CONVERSION EN HEURE LOCALE DESTINATION / ESCALE / DÉPART
            local_dep_str = format_to_local_time(dep_utc, f.aeroportDepart)
            local_arr_str = format_to_local_time(arr_utc, f.aeroportArrivee)
            
            # Récupération de l'escale (ou liste d'escales) et de la durée
            stopover_code = getattr(f, 'aeroportEscale', None)
            stopover_duration = getattr(f, 'dureeEscale', None)

            # Construction dynamic du libellé de l'itinéraire incluant les escales
            route_points = [f.aeroportDepart]
            if stopover_code:
                if isinstance(stopover_code, list):
                    route_points.extend([s.strip().upper() for s in stopover_code if s.strip()])
                elif isinstance(stopover_code, str):
                    # Prise en charge des escales séparées par des virgules (ex: "MRU, RUN")
                    route_points.extend([s.strip().upper() for s in stopover_code.split(',') if s.strip()])
            route_points.append(f.aeroportArrivee)
            
            route_str = " ➔ ".join(route_points)

            # Extraction des tronçons (legs) si relation ORM existante
            legs_payload = []
            if hasattr(f, 'legs') and f.legs:
                for leg in f.legs:
                    legs_payload.append({
                        'numeroVol': getattr(leg, 'numeroVol', f.numeroVol),
                        'aeroportDepart': leg.aeroportDepart,
                        'aeroportArrivee': leg.aeroportArrivee,
                        'heureDepart': ensure_utc(leg.heureDepart).isoformat() if leg.heureDepart else None,
                        'heureArrivee': ensure_utc(leg.heureArrivee).isoformat() if leg.heureArrivee else None,
                    })

            updated_flights.append({
                'id': str(f.id),
                'flightNumber': f.numeroVol,
                'origin': f.aeroportDepart,
                'stopover': stopover_code,
                'stopoverDurationMinutes': stopover_duration,
                'destination': f.aeroportArrivee,
                'route': route_str,
                'departure': dep_utc.isoformat() if dep_utc else None,
                'arrival': arr_utc.isoformat() if arr_utc else None,
                'localDeparture': local_dep_str,
                'localArrival': local_arr_str,
                'durationMinutes': duration_minutes,
                'status': current_status,
                'aircraft': str(f.avionId) if f.avionId else 'NON ASSIGNÉ',
                'aircraftModel': f.avion.immatriculation if getattr(f, 'avion', None) and getattr(f.avion, 'immatriculation', None) else 'Sans Immat',
                'weatherSeverity': weather_severity,
                'legs': legs_payload
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
        
        # Mappage flexible des clés d'escale provenant du Frontend React
        stopover_input = data.get('aeroportEscale') or data.get('escale') or data.get('stopovers')
        if isinstance(stopover_input, list):
            stopover_airport = ",".join([s.strip().upper() for s in stopover_input if s.strip()]) or None
        elif isinstance(stopover_input, str) and stopover_input.strip():
            stopover_airport = stopover_input.strip().upper()
        else:
            stopover_airport = None

        stopover_duration = data.get('dureeEscale') or data.get('layoverHours', 2) * 60

        dep_time = datetime.fromisoformat(data['heureDepart'].replace('Z', '+00:00'))
        arr_time = datetime.fromisoformat(data['heureArrivee'].replace('Z', '+00:00'))

        dep_time = ensure_utc(dep_time)
        arr_time = ensure_utc(arr_time)

        if arr_time <= dep_time:
            return jsonify({"status": "error", "message": "L'heure d'arrivée doit être postérieure au départ."}), 400

        avion_id = data.get('avionId') or None

        # Vérification du chevauchement d'appareil
        conflicting_flight = check_aircraft_conflict(avion_id, dep_time, arr_time)
        if conflicting_flight:
            return jsonify({
                "status": "error",
                "message": f"Cet appareil est déjà assigné au vol {conflicting_flight.numeroVol} sur ce créneau horaire."
            }), 409

        weather_severity = get_real_weather_severity(dep_airport, dep_time)

        frontend_status = data.get('status', 'Planifié')
        status_mapping = {
            'Planifié': 'Scheduled', 'Retardé': 'Delayed', 'En Vol': 'In-Flight',
            'Annulé': 'Cancelled', 'Effectué': 'Effectué'
        }
        initial_status = status_mapping.get(frontend_status, 'Scheduled')

        now_utc = datetime.now(timezone.utc)
        if arr_time < now_utc:
            initial_status = 'Effectué'
        elif weather_severity >= 0.8:
            initial_status = 'Cancelled'

        new_flight = Flight(
            id=str(uuid.uuid4()),
            numeroVol=data['numeroVol'],
            aeroportDepart=dep_airport,
            aeroportEscale=stopover_airport,
            dureeEscale=stopover_duration,
            aeroportArrivee=arr_airport,
            heureDepart=dep_time,
            heureArrivee=arr_time,
            avionId=avion_id,
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

        stopover_input = data.get('aeroportEscale') or data.get('escale') or data.get('stopovers')
        if isinstance(stopover_input, list):
            stopover_airport = ",".join([s.strip().upper() for s in stopover_input if s.strip()]) or None
        elif isinstance(stopover_input, str) and stopover_input.strip():
            stopover_airport = stopover_input.strip().upper()
        else:
            stopover_airport = None

        stopover_duration = data.get('dureeEscale') or data.get('layoverHours', 2) * 60

        dep_time = datetime.fromisoformat(data['heureDepart'].replace('Z', '+00:00'))
        arr_time = datetime.fromisoformat(data['heureArrivee'].replace('Z', '+00:00'))

        dep_time = ensure_utc(dep_time)
        arr_time = ensure_utc(arr_time)

        if arr_time <= dep_time:
            return jsonify({"status": "error", "message": "L'heure d'arrivée doit être postérieure au départ."}), 400

        avion_id = data.get('avionId') or None

        conflicting_flight = check_aircraft_conflict(avion_id, dep_time, arr_time, current_flight_id=id)
        if conflicting_flight:
            return jsonify({
                "status": "error",
                "message": f"Cet appareil est déjà assigné au vol {conflicting_flight.numeroVol} sur ce créneau horaire."
            }), 409

        weather_severity = get_real_weather_severity(dep_airport, dep_time)

        frontend_status = data.get('status', flight.statut)
        status_mapping = {
            'Planifié': 'Scheduled', 'Retardé': 'Delayed', 'En Vol': 'In-Flight',
            'Annulé': 'Cancelled', 'Effectué': 'Effectué'
        }

        new_status = status_mapping.get(frontend_status, frontend_status)
        now_utc = datetime.now(timezone.utc)
        if arr_time < now_utc:
            new_status = 'Effectué'
        elif weather_severity >= 0.8:
            new_status = 'Cancelled'

        flight.numeroVol = data['numeroVol']
        flight.aeroportDepart = dep_airport
        flight.aeroportEscale = stopover_airport
        flight.dureeEscale = stopover_duration
        flight.aeroportArrivee = arr_airport
        flight.heureDepart = dep_time
        flight.heureArrivee = arr_time
        flight.avionId = avion_id
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