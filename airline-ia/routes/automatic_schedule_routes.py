from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
import hashlib
import json
from typing import Any, Optional

from flask import Blueprint, jsonify, request

import models as models_module
from models import db, Flight, Aircraft
from common.authorization import require_roles
from common.datetime_utils import ensure_utc
from common.status_utils import normalize_status

try:
    from data.airports import get_airport_timezone
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except Exception:  # pragma: no cover
    get_airport_timezone = None
    ZoneInfo = None
    ZoneInfoNotFoundError = Exception


auto_schedule_bp = Blueprint("auto_schedule", __name__)


# =============================================================================
# CONSTANTES
# =============================================================================

DEFAULT_TURNAROUND_MINUTES = 45
DEFAULT_SHIFT_STEP_MINUTES = 15
DEFAULT_MAX_SHIFT_MINUTES = 6 * 60
DEFAULT_HORIZON_DAYS = 7
MAX_HORIZON_DAYS = 30
DEFAULT_MAINTENANCE_WARNING_HOURS = 10.0

# Limite de sécurité pour éviter une explosion mémoire sur gros volumes.
MAX_FLIGHTS_PER_REQUEST = 2000

ACTIVE_AIRCRAFT_STATUSES = {
    "ACTIVE",
    "ACTIF",
    "AVAILABLE",
    "DISPONIBLE",
}

# Statuts qui n'ont plus besoin d'être planifiés.
# IMPORTANT : on garde "EN VOL" / "IN-FLIGHT" pour qu'ils apparaissent
# dans le Gantt (le vol est en cours, il occupe l'appareil).
IGNORED_FLIGHT_STATUSES = {
    "CANCELLED",
    "CANCELED",
    "ANNULE",
    "ANNULÉ",
    "EFFECTUE",
    "EFFECTUÉ",
    "DONE",
    "COMPLETED",
    "LANDED",
}

# Statuts considérés comme terminés (pour le Gantt lecture seule).
TERMINAL_FLIGHT_STATUSES = {
    "EFFECTUE",
    "EFFECTUÉ",
    "DONE",
    "COMPLETED",
    "LANDED",
}

CANCELLED_FLIGHT_STATUSES = {
    "CANCELLED",
    "CANCELED",
    "ANNULE",
    "ANNULÉ",
}


# =============================================================================
# UTILITAIRES
# =============================================================================

def safe_int(
    value: Any,
    default: int,
    minimum: int = 0,
    maximum: int | None = None,
) -> int:
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


def get_local_iso(
    dt: Optional[datetime],
    airport_code: Optional[str],
) -> Optional[str]:
    dt_utc = ensure_utc(dt)
    if not dt_utc:
        return None

    # Fallback : pas de config timezone disponible.
    if not airport_code or not get_airport_timezone or not ZoneInfo:
        return dt_utc.isoformat()

    try:
        tz_name = get_airport_timezone(str(airport_code).strip().upper())
        if not tz_name:
            return dt_utc.isoformat()
        return dt_utc.astimezone(ZoneInfo(tz_name)).isoformat()
    except ZoneInfoNotFoundError:
        return dt_utc.isoformat()
    except Exception:
        # On garde le fallback UTC mais on n'avale pas silencieusement
        # les erreurs inattendues : elles sont converties en ISO UTC.
        return dt_utc.isoformat()


def flight_duration_minutes(flight: Flight) -> Optional[int]:
    dep = ensure_utc(getattr(flight, "heureDepart", None))
    arr = ensure_utc(getattr(flight, "heureArrivee", None))
    if not dep or not arr or arr <= dep:
        return None
    return int(round((arr - dep).total_seconds() / 60))


def flight_hours_for_maintenance(flight: Flight) -> Optional[float]:
    """Calcule les heures de vol à créditer, hors durée d'escale."""
    duration_minutes = flight_duration_minutes(flight)
    if duration_minutes is None:
        return None
    stopover_minutes = safe_int(
        getattr(flight, "dureeEscale", 0),
        default=0,
        minimum=0,
    )
    return max(0.0, (duration_minutes - stopover_minutes) / 60.0)


def aircraft_maintenance_limit(aircraft: Aircraft) -> Optional[float]:
    value = getattr(aircraft, "limiteHeuresMaintenance", None)
    try:
        return float(value) if value is not None and float(value) > 0 else None
    except (TypeError, ValueError):
        return None


def aircraft_maintenance_hours(aircraft: Aircraft) -> float:
    try:
        return max(
            0.0,
            float(getattr(aircraft, "heuresDepuisDerniereMaintenance", 0) or 0),
        )
    except (TypeError, ValueError):
        return 0.0


def _normalized_flight_status(flight: Flight) -> str:
    """Retourne le statut normalisé en MAJUSCULES.

    Tolère :
    - colonne String ;
    - colonne Enum PostgreSQL ;
    - statut None ;
    - statut inconnu.
    """
    try:
        return (normalize_status(getattr(flight, "statut", None)) or "").upper()
    except Exception:
        raw = getattr(flight, "statut", None)
        return str(raw).strip().upper() if raw else ""


def _is_cancelled_flight(flight: Flight) -> bool:
    return _normalized_flight_status(flight) in CANCELLED_FLIGHT_STATUSES


def _is_terminal_flight(flight: Flight) -> bool:
    return _normalized_flight_status(flight) in TERMINAL_FLIGHT_STATUSES


def _is_planifiable_flight(flight: Flight) -> bool:
    """Vrai si le vol doit être considéré par le générateur automatique."""
    status = _normalized_flight_status(flight)
    if status in IGNORED_FLIGHT_STATUSES:
        return False

    dep = ensure_utc(getattr(flight, "heureDepart", None))
    arr = ensure_utc(getattr(flight, "heureArrivee", None))
    if not dep or not arr or arr <= dep:
        return False

    return True


# =============================================================================
# MAINTENANCE — VERSION BULK (évite le N+1)
# =============================================================================

def _get_maintenance_model():
    return getattr(models_module, "MaintenanceSlot", None)


def maintenance_slots_for_aircrafts_bulk(
    aircraft_ids: list[str],
    horizon_start: datetime,
    horizon_end: datetime,
) -> dict[str, list[tuple[datetime, datetime]]]:
    """
    Récupère en une seule requête les créneaux de maintenance
    pour l'ensemble des avions donnés.
    """
    MaintenanceSlot = _get_maintenance_model()
    if MaintenanceSlot is None or not aircraft_ids:
        return {aid: [] for aid in aircraft_ids}

    try:
        # Détecter le nom du champ côté modèle
        aircraft_field_name = None
        if hasattr(MaintenanceSlot, "aircraftId"):
            aircraft_field_name = "aircraftId"
        elif hasattr(MaintenanceSlot, "avionId"):
            aircraft_field_name = "avionId"

        if aircraft_field_name is None:
            return {aid: [] for aid in aircraft_ids}

        if not hasattr(MaintenanceSlot, "startTime") or not hasattr(
            MaintenanceSlot, "endTime"
        ):
            return {aid: [] for aid in aircraft_ids}

        aircraft_col = getattr(MaintenanceSlot, aircraft_field_name)

        slots = (
            MaintenanceSlot.query
            .filter(aircraft_col.in_(aircraft_ids))
            .filter(MaintenanceSlot.startTime < horizon_end)
            .filter(MaintenanceSlot.endTime > horizon_start)
            .all()
        )

        result: dict[str, list[tuple[datetime, datetime]]] = {
            aid: [] for aid in aircraft_ids
        }

        for slot in slots:
            if str(getattr(slot, "status", "") or "").upper() in {
                "CANCELLED", "CANCELED", "CANCELLE", "COMPLETED", "TERMINE",
            }:
                continue
            aid = str(getattr(slot, aircraft_field_name, "") or "")
            start = ensure_utc(getattr(slot, "startTime", None))
            end = ensure_utc(getattr(slot, "endTime", None))
            if not aid or not start or not end or end <= start:
                continue
            result.setdefault(aid, []).append((start, end))

        return result
    except Exception:
        return {aid: [] for aid in aircraft_ids}


# =============================================================================
# PLANIFICATION
# =============================================================================

@dataclass
class PlannedLeg:
    flight: Flight
    departure: datetime
    arrival: datetime
    aircraft_id: Optional[str]
    aircraft_registration: Optional[str]
    shift_minutes: int
    reason: str


def _overlaps(
    a_start: datetime,
    a_end: datetime,
    b_start: datetime,
    b_end: datetime,
) -> bool:
    return a_start < b_end and a_end > b_start


def _candidate_is_feasible(
    aircraft: Aircraft,
    dep: datetime,
    arr: datetime,
    origin: str,
    turnaround_minutes: int,
    allocations: dict[str, list[PlannedLeg]],
    maintenance_map: dict[str, list[tuple[datetime, datetime]]],
    projected_hours: float,
) -> tuple[bool, str]:
    """
    Vérifie qu'un avion peut opérer ce vol.

    Contrôles :
    - chevauchement avec maintenance ;
    - chevauchement avec d'autres legs ;
    - turnaround minimum ;
    - positionnement (l'avion doit être au bon endroit).
    """
    aircraft_id = str(aircraft.id)

    # 1) Maintenance
    for maint_start, maint_end in maintenance_map.get(aircraft_id, []):
        if _overlaps(dep, arr, maint_start, maint_end):
            return False, "AIRCRAFT_MAINTENANCE"

    limit_hours = aircraft_maintenance_limit(aircraft)
    if limit_hours is not None and projected_hours > limit_hours:
        return False, "MAINTENANCE_DUE"

    # 2) Autres legs déjà alloués à cet avion
    previous_legs = allocations.get(aircraft_id, [])

    for leg in previous_legs:
        # 2a) Chevauchement dur
        if _overlaps(dep, arr, leg.departure, leg.arrival):
            return False, "AIRCRAFT_OVERLAP"

        # 2b) Turnaround + positionnement
        #     On regarde dans les deux sens (avant / après).
        if leg.arrival <= dep:
            gap = (dep - leg.arrival).total_seconds() / 60
            if gap < turnaround_minutes:
                return False, "TURNAROUND_TOO_SHORT"

            prev_destination = str(
                getattr(leg.flight, "aeroportArrivee", "") or ""
            ).strip().upper()
            if prev_destination and origin and prev_destination != origin:
                return False, "AIRCRAFT_POSITIONING"

        elif dep <= leg.departure:
            # Le nouveau vol passe AVANT un autre déjà alloué
            gap = (leg.departure - arr).total_seconds() / 60
            if gap < turnaround_minutes:
                return False, "TURNAROUND_TOO_SHORT"

            next_origin = str(
                getattr(leg.flight, "aeroportDepart", "") or ""
            ).strip().upper()
            destination = str(
                getattr(leg.flight, "aeroportArrivee", "") or ""
            ).strip().upper()
            # L'avion arrive à destination de ce vol, il doit pouvoir
            # repartir depuis cette destination pour le leg suivant.
            if destination and next_origin and destination != next_origin:
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
      4) si aucun avion n'est faisable, décalage progressif par pas ;
      5) contrôle chevauchement, turnaround, positionnement, maintenance ;
      6) score : faible décalage + continuité d'utilisation.
    """
    usable_aircrafts = [a for a in aircrafts if is_aircraft_operational(a)]
    usable_aircrafts.sort(key=lambda a: str(a.id))  # déterminisme

    relevant_flights = [f for f in flights if _is_planifiable_flight(f)]

    # Tri stable : date de départ, puis numéro de vol (déterminisme).
    relevant_flights.sort(
        key=lambda f: (
            ensure_utc(f.heureDepart) or datetime.max.replace(tzinfo=timezone.utc),
            str(getattr(f, "numeroVol", "") or ""),
        )
    )

    if not relevant_flights:
        return {
            "status": "EMPTY",
            "message": "Aucun vol planifiable trouvé.",
            "assignments": [],
            "unassigned": [],
            "gantt": {"timezone": "UTC", "rows": [], "items": []},
            "metrics": {
                "totalFlights": 0,
                "assignedFlights": 0,
                "unassignedFlights": 0,
                "shiftedFlights": 0,
                "directAssignments": 0,
                "operationalAircraft": len(usable_aircrafts),
            },
        }

    horizon_start = min(ensure_utc(f.heureDepart) for f in relevant_flights)
    horizon_end = max(ensure_utc(f.heureArrivee) for f in relevant_flights) + timedelta(
        minutes=max_shift_minutes + turnaround_minutes
    )

    # Maintenance bulk (une seule requête)
    maintenance_map = maintenance_slots_for_aircrafts_bulk(
        aircraft_ids=[str(a.id) for a in usable_aircrafts],
        horizon_start=horizon_start,
        horizon_end=horizon_end,
    )

    allocations: dict[str, list[PlannedLeg]] = {}
    aircraft_by_id = {str(aircraft.id): aircraft for aircraft in usable_aircrafts}
    planned_hours = {
        aircraft_id: aircraft_maintenance_hours(aircraft)
        for aircraft_id, aircraft in aircraft_by_id.items()
    }
    assignments: list[dict] = []
    unassigned: list[dict] = []

    for flight in relevant_flights:
        base_dep = ensure_utc(flight.heureDepart)
        base_arr = ensure_utc(flight.heureArrivee)
        duration = base_arr - base_dep
        origin = str(getattr(flight, "aeroportDepart", "") or "").strip().upper()

        chosen: Optional[PlannedLeg] = None
        failure_reasons: dict[str, int] = {}  # compteur par raison

        for shift_minutes in range(0, max_shift_minutes + 1, shift_step_minutes):
            dep = base_dep + timedelta(minutes=shift_minutes)
            arr = dep + duration

            candidates = []
            for aircraft in usable_aircrafts:
                flight_hours = flight_hours_for_maintenance(flight)
                if flight_hours is None:
                    continue
                feasible, reason = _candidate_is_feasible(
                    aircraft=aircraft,
                    dep=dep,
                    arr=arr,
                    origin=origin,
                    turnaround_minutes=turnaround_minutes,
                    allocations=allocations,
                    maintenance_map=maintenance_map,
                    projected_hours=(
                        planned_hours[str(aircraft.id)] + flight_hours
                    ),
                )

                if not feasible:
                    failure_reasons[reason] = failure_reasons.get(reason, 0) + 1
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
                    reason=(
                        "DIRECT_ASSIGNMENT"
                        if shift_minutes == 0
                        else "SHIFTED_ASSIGNMENT"
                    ),
                )
                allocations.setdefault(str(aircraft.id), []).append(chosen)
                planned_hours[str(aircraft.id)] += flight_hours
                break

        if chosen is None:
            # On garde la raison la plus fréquente au lieu de la dernière.
            dominant_reason = (
                max(failure_reasons.items(), key=lambda kv: kv[1])[0]
                if failure_reasons
                else "NO_OPERATIONAL_AIRCRAFT"
            )
            unassigned.append(
                {
                    "flightId": str(flight.id),
                    "flightNumber": getattr(flight, "numeroVol", None),
                    "origin": getattr(flight, "aeroportDepart", None),
                    "destination": getattr(flight, "aeroportArrivee", None),
                    "departure": base_dep.isoformat(),
                    "arrival": base_arr.isoformat(),
                    "reason": dominant_reason,
                }
            )
            continue

        aircraft = aircraft_by_id[chosen.aircraft_id]
        flight_hours = flight_hours_for_maintenance(flight) or 0.0
        hours_after = planned_hours[chosen.aircraft_id]
        hours_before = hours_after - flight_hours
        maintenance_limit = aircraft_maintenance_limit(aircraft)

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
                "flightHours": round(flight_hours, 2),
                "aircraftHoursBeforeFlight": round(hours_before, 2),
                "aircraftHoursAfterFlight": round(hours_after, 2),
                "maintenanceLimitHours": maintenance_limit,
                "maintenanceRequired": (
                    maintenance_limit is not None
                    and hours_after >= maintenance_limit
                ),
                "maintenanceWarning": (
                    maintenance_limit is not None
                    and maintenance_limit - hours_after
                    <= DEFAULT_MAINTENANCE_WARNING_HOURS
                ),
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
            "status": getattr(aircraft, "statut", None),
        }
        for aircraft in usable_aircrafts
    ]

    # Ligne UNASSIGNED toujours présente
    rows.append(
        {
            "aircraftId": "UNASSIGNED",
            "aircraftRegistration": "NON ASSIGNÉ",
            "capacity": None,
            "base": None,
            "status": "UNASSIGNED",
        }
    )

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
            "localStart": item["localDeparture"],
            "localEnd": item["localArrival"],
            "durationMinutes": item["durationMinutes"],
            "flightHours": item["flightHours"],
            "aircraftHoursAfterFlight": item["aircraftHoursAfterFlight"],
            "maintenanceLimitHours": item["maintenanceLimitHours"],
            "maintenanceRequired": item["maintenanceRequired"],
            "maintenanceWarning": item["maintenanceWarning"],
            "label": (
                f'{item["flightNumber"] or "VOL"} · '
                f'{item["origin"]} → {item["destination"]}'
            ),
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
        "strategy": "deterministic-greedy-v2",
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


def _scenario_signature(scenario: dict, options: dict) -> str:
    """Empreinte stable du scénario affiché, utilisée lors de sa validation."""
    payload = {
        "options": options,
        "assignments": scenario.get("assignments", []),
        "unassigned": scenario.get("unassigned", []),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _eligible_flights_for_horizon(horizon_days: int) -> list[Flight]:
    now_utc = datetime.now(timezone.utc)
    horizon_end = now_utc + timedelta(days=horizon_days)
    flights = (
        Flight.query
        .filter(Flight.heureDepart >= now_utc)
        .filter(Flight.heureDepart <= horizon_end)
        .order_by(Flight.heureDepart.asc())
        .limit(MAX_FLIGHTS_PER_REQUEST)
        .all()
    )
    return [flight for flight in flights if _is_planifiable_flight(flight)]


@auto_schedule_bp.route("/flights/auto-schedule/eligible", methods=["GET"])
def get_eligible_schedule_flights():
    """Liste les vols futurs valides pouvant entrer dans un scénario."""
    horizon_days = safe_int(
        request.args.get("horizonDays"),
        DEFAULT_HORIZON_DAYS,
        minimum=1,
        maximum=MAX_HORIZON_DAYS,
    )
    flights = _eligible_flights_for_horizon(horizon_days)
    return jsonify({
        "horizonDays": horizon_days,
        "total": len(flights),
        "flights": [
            {
                "id": str(flight.id),
                "flightNumber": flight.numeroVol,
                "origin": flight.aeroportDepart,
                "destination": flight.aeroportArrivee,
                "departure": ensure_utc(flight.heureDepart).isoformat(),
                "arrival": ensure_utc(flight.heureArrivee).isoformat(),
                "aircraftId": flight.avionId,
            }
            for flight in flights
        ],
    }), 200


# =============================================================================
# ENDPOINTS
# =============================================================================

@auto_schedule_bp.route("/flights/auto-schedule/generate", methods=["POST"])
@require_roles("Planificateur", "Regulator")
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

    Par défaut, aucun changement n'est écrit en base.
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
        selected_ids = data.get("selectedFlightIds")
        if selected_ids is not None and (
            not isinstance(selected_ids, list)
            or any(not isinstance(item, str) or not item.strip() for item in selected_ids)
        ):
            return jsonify({"status": "error", "message": "selectedFlightIds doit être une liste d'identifiants."}), 400

        eligible_flights = _eligible_flights_for_horizon(horizon_days)
        eligible_by_id = {str(flight.id): flight for flight in eligible_flights}
        if selected_ids is None:
            flights = eligible_flights
        else:
            normalized_ids = list(dict.fromkeys(item.strip() for item in selected_ids))
            missing_ids = [item for item in normalized_ids if item not in eligible_by_id]
            if missing_ids:
                return jsonify({
                    "status": "error",
                    "message": "Certains vols sélectionnés ne sont plus éligibles.",
                    "flightIds": missing_ids,
                }), 409
            flights = [eligible_by_id[item] for item in normalized_ids]

        aircrafts = Aircraft.query.all()

        scenario = generate_schedule_scenario(
            flights=flights,
            aircrafts=aircrafts,
            turnaround_minutes=turnaround_minutes,
            shift_step_minutes=shift_step_minutes,
            max_shift_minutes=max_shift_minutes,
        )

        scenario_options = {
            "horizonDays": horizon_days,
            "turnaroundMinutes": turnaround_minutes,
            "shiftStepMinutes": shift_step_minutes,
            "maxShiftMinutes": max_shift_minutes,
            "selectedFlightIds": sorted(str(flight.id) for flight in flights),
        }
        signature = _scenario_signature(scenario, scenario_options)
        scenario["scenarioSignature"] = signature

        if apply_changes:
            expected_signature = data.get("scenarioSignature")
            if not isinstance(expected_signature, str) or not expected_signature:
                return jsonify({
                    "status": "error",
                    "message": "Une prévisualisation valide est requise avant la validation.",
                }), 400
            if expected_signature != signature:
                return jsonify({
                    "status": "error",
                    "message": "Le planning a changé depuis la prévisualisation. Générez un nouveau scénario.",
                    "scenarioSignature": signature,
                }), 409
            if not scenario["assignments"]:
                return jsonify({
                    "status": "error",
                    "message": "Le scénario ne contient aucune affectation à valider.",
                }), 409

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

                if not _is_cancelled_flight(flight):
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
                    "message": (
                        "Impossible de générer le planning automatique : "
                        f"{str(exc)}"
                    ),
                }
            ),
            500,
        )


@auto_schedule_bp.route("/flights/auto-schedule/gantt", methods=["GET"])
def get_current_schedule_gantt():
    """
    Retourne le planning actuel sous une forme exploitable par un Gantt React.

    ✅ Inclut TOUS les vols de l'horizon (sauf annulés), y compris :
       - Planifié / Scheduled
       - En Vol / In-Flight
       - Effectué (en lecture seule)
       - Non affectés (ligne UNASSIGNED)

    ✅ Aucun filtre SQL sur `statut` — compatible ENUM PostgreSQL.

    Exemple : GET /flights/auto-schedule/gantt?horizonDays=7
    """
    try:
        horizon_days = safe_int(
            request.args.get("horizonDays"),
            DEFAULT_HORIZON_DAYS,
            minimum=1,
            maximum=MAX_HORIZON_DAYS,
        )
        include_terminal = (
            str(request.args.get("includeTerminal", "1")).lower()
            not in {"0", "false", "no"}
        )

        now_utc = datetime.now(timezone.utc)
        horizon_end = now_utc + timedelta(days=horizon_days)

        # =====================================================================
        # ✅ Requête SANS filtre statut SQL — évite les erreurs d'ENUM PostgreSQL
        # =====================================================================
        all_flights = (
            Flight.query
            .filter(Flight.heureDepart >= now_utc)
            .filter(Flight.heureDepart <= horizon_end)
            .order_by(Flight.heureDepart.asc())
            .limit(MAX_FLIGHTS_PER_REQUEST)
            .all()
        )

        # Filtre Python — fonctionne avec n'importe quel type de colonne
        flights = []
        for flight in all_flights:
            if _is_cancelled_flight(flight):
                continue
            if not include_terminal and _is_terminal_flight(flight):
                continue
            flights.append(flight)

        aircrafts = Aircraft.query.all()
        aircraft_by_id = {str(a.id): a for a in aircrafts}

        # Position utile pour la lecture du planning : dernière destination
        # connue, ou origine de la prochaine rotation si l'appareil est libre.
        current_position_by_aircraft = {}
        now_position = datetime.now(timezone.utc)
        for aircraft in aircrafts:
            aircraft_flights = [
                flight for flight in flights
                if flight.avionId and str(flight.avionId) == str(aircraft.id)
            ]
            completed = [
                flight for flight in aircraft_flights
                if ensure_utc(getattr(flight, "heureArrivee", None))
                and ensure_utc(getattr(flight, "heureArrivee", None)) <= now_position
            ]
            completed.sort(
                key=lambda flight: ensure_utc(getattr(flight, "heureArrivee", None))
                or datetime.min.replace(tzinfo=timezone.utc),
                reverse=True,
            )
            if completed:
                current_position_by_aircraft[str(aircraft.id)] = getattr(
                    completed[0], "aeroportArrivee", None
                )
                continue

            upcoming = [
                flight for flight in aircraft_flights
                if ensure_utc(getattr(flight, "heureDepart", None))
                and ensure_utc(getattr(flight, "heureDepart", None)) > now_position
            ]
            upcoming.sort(
                key=lambda flight: ensure_utc(getattr(flight, "heureDepart", None))
                or datetime.max.replace(tzinfo=timezone.utc)
            )
            if upcoming:
                current_position_by_aircraft[str(aircraft.id)] = getattr(
                    upcoming[0], "aeroportDepart", None
                )

        rows = []
        items = []

        # Ligne par appareil (y compris inactifs, pour contexte)
        for aircraft in sorted(aircrafts, key=lambda a: str(a.id)):
            aid = str(aircraft.id)
            rows.append(
                {
                    "aircraftId": aid,
                    "aircraftRegistration": aircraft_registration(aircraft),
                    "capacity": aircraft_capacity(aircraft),
                    "base": aircraft_base(aircraft),
                    "currentPosition": current_position_by_aircraft.get(aid),
                    "status": getattr(aircraft, "statut", None),
                }
            )

        # Ligne UNASSIGNED toujours présente.
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

            aircraft_id = (
                str(flight.avionId) if flight.avionId else "UNASSIGNED"
            )
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
                    "durationMinutes": int(
                        round((arr - dep).total_seconds() / 60)
                    ),
                    "status": getattr(flight, "statut", None),
                    "label": (
                        f"{flight_number or 'VOL'} · {origin} → {destination}"
                    ),
                }
            )

        assigned_count = sum(
            1 for item in items if item["rowId"] != "UNASSIGNED"
        )
        unassigned_count = len(items) - assigned_count

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
                        "assignedFlights": assigned_count,
                        "unassignedFlights": unassigned_count,
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