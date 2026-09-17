from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from flask import Blueprint, jsonify, request

import models as models_module
from models import db, Flight, Aircraft
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