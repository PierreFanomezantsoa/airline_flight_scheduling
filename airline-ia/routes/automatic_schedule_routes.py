from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from flask import Blueprint, jsonify, request

import models as models_module
from models import db, Flight, Aircraft

try:
    from data.airports import get_airport_timezone
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except Exception:  # pragma: no cover - fallback si le module timezone n'existe pas
    get_airport_timezone = None
    ZoneInfo = None
    ZoneInfoNotFoundError = Exception


auto_schedule_bp = Blueprint("auto_schedule", __name__)

DEFAULT_TURNAROUND_MINUTES = 45
DEFAULT_SHIFT_STEP_MINUTES = 15
DEFAULT_MAX_SHIFT_MINUTES = 6 * 60
DEFAULT_HORIZON_DAYS = 7
MAX_HORIZON_DAYS = 30

ACTIVE_AIRCRAFT_STATUSES = {
    "ACTIVE",
    "ACTIF",
    "AVAILABLE",
    "DISPONIBLE",
}

IGNORED_FLIGHT_STATUSES = {
    "CANCELLED",
    "ANNULE",
    "ANNULÉ",
    "EFFECTUE",
    "EFFECTUÉ",
    "DONE",
    "COMPLETED",
    "LANDED",
}


# =============================================================================
# UTILITAIRES
# =============================================================================

def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def normalize_status(value: Any) -> str:
    return (
        str(value or "")
        .strip()
        .upper()
        .replace("-", "_")
        .replace(" ", "_")
    )


def safe_int(value: Any, default: int, minimum: int = 0, maximum: int | None = None) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default

    parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def aircraft_registration(aircraft: Aircraft) -> str:
    return (
        getattr(aircraft, "immatriculation", None)
        or getattr(aircraft, "registration", None)
        or str(aircraft.id)
    )


def aircraft_capacity(aircraft: Aircraft) -> Optional[int]:
    value = getattr(aircraft, "capacite", None)
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def aircraft_base(aircraft: Aircraft) -> Optional[str]:
    value = getattr(aircraft, "baseAttache", None)
    if not value:
        return None
    return str(value).strip().upper()


def is_aircraft_operational(aircraft: Aircraft) -> bool:
    status = normalize_status(getattr(aircraft, "statut", "Active"))
    if not status:
        return True
    return status in ACTIVE_AIRCRAFT_STATUSES


def get_local_iso(dt: Optional[datetime], airport_code: Optional[str]) -> Optional[str]:
    dt_utc = ensure_utc(dt)
    if not dt_utc:
        return None

    if not airport_code or not get_airport_timezone or not ZoneInfo:
        return dt_utc.isoformat()

    try:
        tz_name = get_airport_timezone(str(airport_code).strip().upper())
        if not tz_name:
            return dt_utc.isoformat()
        return dt_utc.astimezone(ZoneInfo(tz_name)).isoformat()
    except (ZoneInfoNotFoundError, Exception):
        return dt_utc.isoformat()


def flight_duration_minutes(flight: Flight) -> Optional[int]:
    dep = ensure_utc(getattr(flight, "heureDepart", None))
    arr = ensure_utc(getattr(flight, "heureArrivee", None))
    if not dep or not arr or arr <= dep:
        return None
    return int(round((arr - dep).total_seconds() / 60))


def maintenance_slots_for_aircraft(
    aircraft_id: str,
    horizon_start: datetime,
    horizon_end: datetime,
) -> list[tuple[datetime, datetime]]:
    """
    Retourne les créneaux de maintenance si MaintenanceSlot existe dans models.
    Le module reste compatible avec les projets où cette entité n'est pas encore chargée.
    """
    MaintenanceSlot = getattr(models_module, "MaintenanceSlot", None)
    if MaintenanceSlot is None:
        return []

    try:
        aircraft_field = getattr(MaintenanceSlot, "aircraftId", None)
        if aircraft_field is None:
            aircraft_field = getattr(MaintenanceSlot, "avionId", None)

        start_field = getattr(MaintenanceSlot, "startTime", None)
        end_field = getattr(MaintenanceSlot, "endTime", None)

        if aircraft_field is None or start_field is None or end_field is None:
            return []

        slots = (
            MaintenanceSlot.query
            .filter(aircraft_field == aircraft_id)
            .filter(start_field < horizon_end)
            .filter(end_field > horizon_start)
            .all()
        )

        result = []
        for slot in slots:
            start = ensure_utc(getattr(slot, "startTime", None))
            end = ensure_utc(getattr(slot, "endTime", None))
            if start and end and end > start:
                result.append((start, end))
        return result
    except Exception:
        return []


@dataclass
class PlannedLeg:
    flight: Flight
    departure: datetime
    arrival: datetime
    aircraft_id: Optional[str]
    aircraft_registration: Optional[str]
    shift_minutes: int
    reason: str


# =============================================================================
# MOTEUR DE GÉNÉRATION AUTOMATIQUE
# =============================================================================

def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and a_end > b_start


def _candidate_is_feasible(
    aircraft: Aircraft,
    dep: datetime,
    arr: datetime,
    origin: str,
    turnaround_minutes: int,
    allocations: dict[str, list[PlannedLeg]],
    maintenance_map: dict[str, list[tuple[datetime, datetime]]],
) -> tuple[bool, str]:
    aircraft_id = str(aircraft.id)

    # Maintenance
    for maint_start, maint_end in maintenance_map.get(aircraft_id, []):
        if _overlaps(dep, arr, maint_start, maint_end):
            return False, "AIRCRAFT_MAINTENANCE"

    previous_legs = sorted(
        allocations.get(aircraft_id, []),
        key=lambda item: item.departure,
    )

    for leg in previous_legs:
        # chevauchement dur
        if _overlaps(dep, arr, leg.departure, leg.arrival):
            return False, "AIRCRAFT_OVERLAP"

        # rotation minimale si le nouveau vol part après ce vol
        if leg.arrival <= dep:
            gap = (dep - leg.arrival).total_seconds() / 60
            if gap < turnaround_minutes:
                return False, "TURNAROUND_TOO_SHORT"

            prev_destination = str(
                getattr(leg.flight, "aeroportArrivee", "") or ""
            ).strip().upper()
            if prev_destination and origin and prev_destination != origin:
                return False, "AIRCRAFT_POSITIONING"

    return True, "AVAILABLE"


def generate_schedule_scenario(
    flights: list[Flight],
    aircrafts: list[Aircraft],
    turnaround_minutes: int = DEFAULT_TURNAROUND_MINUTES,
    shift_step_minutes: int = DEFAULT_SHIFT_STEP_MINUTES,
    max_shift_minutes: int = DEFAULT_MAX_SHIFT_MINUTES,
) -> dict:
    """
    Génère un scénario automatique sans mutation de la base.

    Stratégie déterministe et explicable :
      1) vols triés par heure de départ ;
      2) avions actifs uniquement ;
      3) recherche d'un avion faisable au créneau demandé ;
      4) si aucun avion n'est faisable, décalage progressif par pas de 15 min ;
      5) contrôle chevauchement, turnaround, positionnement et maintenance ;
      6) score simple privilégiant le faible décalage et la continuité d'utilisation.

    Il s'agit d'un générateur de scénario opérationnel, pas d'un solveur OR/ML optimal.
    """
    usable_aircrafts = [a for a in aircrafts if is_aircraft_operational(a)]

    relevant_flights = [
        f
        for f in flights
        if not normalize_status(getattr(f, "statut", None)) in IGNORED_FLIGHT_STATUSES
        and ensure_utc(getattr(f, "heureDepart", None))
        and ensure_utc(getattr(f, "heureArrivee", None))
        and ensure_utc(getattr(f, "heureArrivee", None))
        > ensure_utc(getattr(f, "heureDepart", None))
    ]

    relevant_flights.sort(
        key=lambda f: ensure_utc(f.heureDepart) or datetime.max.replace(tzinfo=timezone.utc)
    )

    if not relevant_flights:
        return {
            "status": "EMPTY",
            "message": "Aucun vol planifiable trouvé.",
            "assignments": [],
            "unassigned": [],
            "gantt": {"rows": [], "items": []},
            "metrics": {
                "totalFlights": 0,
                "assignedFlights": 0,
                "unassignedFlights": 0,
                "shiftedFlights": 0,
            },
        }

    horizon_start = min(ensure_utc(f.heureDepart) for f in relevant_flights)
    horizon_end = max(ensure_utc(f.heureArrivee) for f in relevant_flights) + timedelta(
        minutes=max_shift_minutes + turnaround_minutes
    )

    maintenance_map = {
        str(a.id): maintenance_slots_for_aircraft(
            str(a.id),
            horizon_start,
            horizon_end,
        )
        for a in usable_aircrafts
    }

    allocations: dict[str, list[PlannedLeg]] = {}
    assignments: list[dict] = []
    unassigned: list[dict] = []

    for flight in relevant_flights:
        base_dep = ensure_utc(flight.heureDepart)
        base_arr = ensure_utc(flight.heureArrivee)
        duration = base_arr - base_dep
        origin = str(getattr(flight, "aeroportDepart", "") or "").strip().upper()

        chosen: Optional[PlannedLeg] = None
        last_failure_reason = "NO_OPERATIONAL_AIRCRAFT"

        for shift_minutes in range(0, max_shift_minutes + 1, shift_step_minutes):
            dep = base_dep + timedelta(minutes=shift_minutes)
            arr = dep + duration

            candidates = []
            for aircraft in usable_aircrafts:
                feasible, reason = _candidate_is_feasible(
                    aircraft=aircraft,
                    dep=dep,
                    arr=arr,
                    origin=origin,
                    turnaround_minutes=turnaround_minutes,
                    allocations=allocations,
                    maintenance_map=maintenance_map,
                )

                if not feasible:
                    last_failure_reason = reason
                    continue

                aircraft_id = str(aircraft.id)
                previous = allocations.get(aircraft_id, [])
                continuity_bonus = 0
                if previous:
                    last = max(previous, key=lambda item: item.arrival)
                    last_destination = str(
                        getattr(last.flight, "aeroportArrivee", "") or ""
                    ).strip().upper()
                    continuity_bonus = 10 if last_destination == origin else 0

                # score : décalage minimal d'abord, continuité ensuite,
                # puis faible nombre de rotations déjà affectées.
                score = (
                    -shift_minutes * 100
                    + continuity_bonus
                    - len(previous)
                )
                candidates.append((score, aircraft))

            if candidates:
                candidates.sort(key=lambda item: item[0], reverse=True)
                aircraft = candidates[0][1]
                chosen = PlannedLeg(
                    flight=flight,
                    departure=dep,
                    arrival=arr,
                    aircraft_id=str(aircraft.id),
                    aircraft_registration=aircraft_registration(aircraft),
                    shift_minutes=shift_minutes,
                    reason="DIRECT_ASSIGNMENT" if shift_minutes == 0 else "SHIFTED_ASSIGNMENT",
                )
                allocations.setdefault(str(aircraft.id), []).append(chosen)
                break

        if chosen is None:
            unassigned.append(
                {
                    "flightId": str(flight.id),
                    "flightNumber": getattr(flight, "numeroVol", None),
                    "origin": getattr(flight, "aeroportDepart", None),
                    "destination": getattr(flight, "aeroportArrivee", None),
                    "departure": base_dep.isoformat(),
                    "arrival": base_arr.isoformat(),
                    "reason": last_failure_reason,
                }
            )
            continue

        assignments.append(
            {
                "flightId": str(flight.id),
                "flightNumber": getattr(flight, "numeroVol", None),
                "aircraftId": chosen.aircraft_id,
                "aircraftRegistration": chosen.aircraft_registration,
                "origin": getattr(flight, "aeroportDepart", None),
                "destination": getattr(flight, "aeroportArrivee", None),
                "originalDeparture": base_dep.isoformat(),
                "originalArrival": base_arr.isoformat(),
                "departure": chosen.departure.isoformat(),
                "arrival": chosen.arrival.isoformat(),
                "localDeparture": get_local_iso(
                    chosen.departure,
                    getattr(flight, "aeroportDepart", None),
                ),
                "localArrival": get_local_iso(
                    chosen.arrival,
                    getattr(flight, "aeroportArrivee", None),
                ),
                "durationMinutes": int(round(duration.total_seconds() / 60)),
                "shiftMinutes": chosen.shift_minutes,
                "reason": chosen.reason,
            }
        )

    rows = [
        {
            "aircraftId": str(aircraft.id),
            "aircraftRegistration": aircraft_registration(aircraft),
            "capacity": aircraft_capacity(aircraft),
            "base": aircraft_base(aircraft),
        }
        for aircraft in usable_aircrafts
    ]

    items = [
        {
            "id": item["flightId"],
            "flightId": item["flightId"],
            "flightNumber": item["flightNumber"],
            "rowId": item["aircraftId"],
            "aircraftRegistration": item["aircraftRegistration"],
            "start": item["departure"],
            "end": item["arrival"],
            "origin": item["origin"],
            "destination": item["destination"],
            "label": f'{item["flightNumber"] or "VOL"} · {item["origin"]} → {item["destination"]}',
            "shiftMinutes": item["shiftMinutes"],
            "status": "SHIFTED" if item["shiftMinutes"] > 0 else "SCHEDULED",
        }
        for item in assignments
    ]

    shifted = sum(1 for item in assignments if item["shiftMinutes"] > 0)

    status = "FEASIBLE" if not unassigned else "PARTIAL"

    return {
        "status": status,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "strategy": "deterministic-greedy-v1",
        "turnaroundMinutes": turnaround_minutes,
        "shiftStepMinutes": shift_step_minutes,
        "maxShiftMinutes": max_shift_minutes,
        "assignments": assignments,
        "unassigned": unassigned,
        "metrics": {
            "totalFlights": len(relevant_flights),
            "assignedFlights": len(assignments),
            "unassignedFlights": len(unassigned),
            "shiftedFlights": shifted,
            "directAssignments": len(assignments) - shifted,
            "operationalAircraft": len(usable_aircrafts),
        },
        "gantt": {
            "timezone": "UTC",
            "rows": rows,
            "items": items,
        },
    }


# =============================================================================
# ENDPOINTS
# =============================================================================

@auto_schedule_bp.route("/flights/auto-schedule/generate", methods=["POST"])
def generate_automatic_schedule():
    """
    Génère automatiquement un scénario de programmation de vols.

    Body optionnel :
    {
      "horizonDays": 7,
      "turnaroundMinutes": 45,
      "shiftStepMinutes": 15,
      "maxShiftMinutes": 360,
      "apply": false
    }

    Par défaut, aucun changement n'est écrit en base. L'utilisateur peut
    visualiser le Gantt et valider le scénario avant application.
    """
    try:
        data = request.get_json(silent=True) or {}

        horizon_days = safe_int(
            data.get("horizonDays"),
            DEFAULT_HORIZON_DAYS,
            minimum=1,
            maximum=MAX_HORIZON_DAYS,
        )
        turnaround_minutes = safe_int(
            data.get("turnaroundMinutes"),
            DEFAULT_TURNAROUND_MINUTES,
            minimum=0,
            maximum=240,
        )
        shift_step_minutes = safe_int(
            data.get("shiftStepMinutes"),
            DEFAULT_SHIFT_STEP_MINUTES,
            minimum=5,
            maximum=60,
        )
        max_shift_minutes = safe_int(
            data.get("maxShiftMinutes"),
            DEFAULT_MAX_SHIFT_MINUTES,
            minimum=0,
            maximum=24 * 60,
        )
        apply_changes = bool(data.get("apply", False))

        now_utc = datetime.now(timezone.utc)
        horizon_end = now_utc + timedelta(days=horizon_days)

        flights = (
            Flight.query
            .filter(Flight.heureDepart >= now_utc)
            .filter(Flight.heureDepart <= horizon_end)
            .order_by(Flight.heureDepart.asc())
            .all()
        )
        aircrafts = Aircraft.query.all()

        scenario = generate_schedule_scenario(
            flights=flights,
            aircrafts=aircrafts,
            turnaround_minutes=turnaround_minutes,
            shift_step_minutes=shift_step_minutes,
            max_shift_minutes=max_shift_minutes,
        )

        if apply_changes and scenario["assignments"]:
            assignments_by_id = {
                item["flightId"]: item
                for item in scenario["assignments"]
            }

            for flight in flights:
                item = assignments_by_id.get(str(flight.id))
                if not item:
                    continue

                flight.avionId = item["aircraftId"]
                flight.heureDepart = datetime.fromisoformat(item["departure"])
                flight.heureArrivee = datetime.fromisoformat(item["arrival"])

                if normalize_status(getattr(flight, "statut", None)) not in {
                    "CANCELLED",
                    "ANNULE",
                    "ANNULÉ",
                }:
                    flight.statut = "Scheduled"

            db.session.commit()
            scenario["applied"] = True
            scenario["message"] = (
                "Scénario généré et appliqué à la programmation des vols."
            )
        else:
            scenario["applied"] = False
            scenario["message"] = (
                "Scénario généré sans modification de la base. "
                "Validez-le dans l'IHM avant de l'appliquer."
            )

        return jsonify(scenario), 200

    except Exception as exc:
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "error",
                    "message": f"Impossible de générer le planning automatique : {str(exc)}",
                }
            ),
            500,
        )


@auto_schedule_bp.route("/flights/auto-schedule/gantt", methods=["GET"])
def get_current_schedule_gantt():
    """
    Retourne le planning actuel sous une forme directement exploitable
    par un composant Gantt React.

    Exemple : GET /flights/auto-schedule/gantt?horizonDays=7
    """
    try:
        horizon_days = safe_int(
            request.args.get("horizonDays"),
            DEFAULT_HORIZON_DAYS,
            minimum=1,
            maximum=MAX_HORIZON_DAYS,
        )

        now_utc = datetime.now(timezone.utc)
        horizon_end = now_utc + timedelta(days=horizon_days)

        flights = (
            Flight.query
            .filter(Flight.heureDepart >= now_utc)
            .filter(Flight.heureDepart <= horizon_end)
            .filter(Flight.statut != "Cancelled")
            .order_by(Flight.heureDepart.asc())
            .all()
        )

        aircrafts = Aircraft.query.all()
        aircraft_by_id = {str(a.id): a for a in aircrafts}

        row_ids = []
        rows = []
        items = []

        for aircraft in aircrafts:
            aid = str(aircraft.id)
            row_ids.append(aid)
            rows.append(
                {
                    "aircraftId": aid,
                    "aircraftRegistration": aircraft_registration(aircraft),
                    "capacity": aircraft_capacity(aircraft),
                    "base": aircraft_base(aircraft),
                    "status": getattr(aircraft, "statut", None),
                }
            )

        if "UNASSIGNED" not in row_ids:
            rows.append(
                {
                    "aircraftId": "UNASSIGNED",
                    "aircraftRegistration": "NON ASSIGNÉ",
                    "capacity": None,
                    "base": None,
                    "status": "UNASSIGNED",
                }
            )

        for flight in flights:
            dep = ensure_utc(getattr(flight, "heureDepart", None))
            arr = ensure_utc(getattr(flight, "heureArrivee", None))
            if not dep or not arr or arr <= dep:
                continue

            aircraft_id = str(flight.avionId) if flight.avionId else "UNASSIGNED"
            aircraft = aircraft_by_id.get(aircraft_id)
            registration = (
                aircraft_registration(aircraft)
                if aircraft
                else "NON ASSIGNÉ"
            )

            origin = getattr(flight, "aeroportDepart", None)
            destination = getattr(flight, "aeroportArrivee", None)
            flight_number = getattr(flight, "numeroVol", None)

            items.append(
                {
                    "id": str(flight.id),
                    "flightId": str(flight.id),
                    "flightNumber": flight_number,
                    "rowId": aircraft_id,
                    "aircraftRegistration": registration,
                    "start": dep.isoformat(),
                    "end": arr.isoformat(),
                    "localStart": get_local_iso(dep, origin),
                    "localEnd": get_local_iso(arr, destination),
                    "origin": origin,
                    "destination": destination,
                    "durationMinutes": int(round((arr - dep).total_seconds() / 60)),
                    "status": getattr(flight, "statut", None),
                    "label": f"{flight_number or 'VOL'} · {origin} → {destination}",
                }
            )

        return (
            jsonify(
                {
                    "status": "success",
                    "generatedAt": datetime.now(timezone.utc).isoformat(),
                    "horizonDays": horizon_days,
                    "gantt": {
                        "timezone": "UTC",
                        "rows": rows,
                        "items": items,
                    },
                    "metrics": {
                        "totalFlights": len(items),
                        "assignedFlights": sum(
                            1 for item in items if item["rowId"] != "UNASSIGNED"
                        ),
                        "unassignedFlights": sum(
                            1 for item in items if item["rowId"] == "UNASSIGNED"
                        ),
                    },
                }
            ),
            200,
        )

    except Exception as exc:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": f"Impossible de construire le Gantt : {str(exc)}",
                }
            ),
            500,
        )
