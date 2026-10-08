"""Fonctions métier légères relatives aux vols.

Aucune dépendance Flask : ces fonctions sont réutilisables depuis des tests,
workers, commandes CLI ou une autre API.
"""
from __future__ import annotations

import math
from types import SimpleNamespace
from typing import Any

from models import Aircraft, Flight, MaintenanceSlot, db
from common.datetime_utils import ensure_utc
from common.status_utils import normalize_status


ACTIVE_AIRCRAFT_STATUSES = {"ACTIVE", "ACTIF", "AVAILABLE", "DISPONIBLE"}
INACTIVE_MAINTENANCE_STATUSES = {
    "CANCELLED",
    "CANCELED",
    "CANCELLE",
    "ANNULÉ",
    "ANNULE",
    "COMPLETED",
    "TERMINE",
    "TERMINÉ",
}


def parse_stopover_codes(value) -> list[str]:
    if isinstance(value, list):
        return [str(code).strip().upper() for code in value if str(code).strip()]
    if isinstance(value, str):
        return [code.strip().upper() for code in value.split(",") if code.strip()]
    return []


def is_aircraft_operational(aircraft: Aircraft) -> bool:
    status = normalize_status(getattr(aircraft, "aircraftStatus", "Active"))
    return not status or status in ACTIVE_AIRCRAFT_STATUSES


def flight_hours_for_maintenance(flight: Flight) -> float | None:
    """Estimate flight hours, excluding ground time only for a real stopover."""
    departure = ensure_utc(getattr(flight, "departureTime", None))
    arrival = ensure_utc(getattr(flight, "arrivalTime", None))
    if not departure or not arrival or arrival <= departure:
        return None

    elapsed_minutes = (arrival - departure).total_seconds() / 60
    if not parse_stopover_codes(getattr(flight, "stopoverAirportCodes", None)):
        return elapsed_minutes / 60

    try:
        raw_stopover_minutes = float(getattr(flight, "stopoverDurationMinutes", 0) or 0)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(raw_stopover_minutes):
        return None

    stopover_minutes = min(elapsed_minutes, max(0, raw_stopover_minutes))
    return max(0, (elapsed_minutes - stopover_minutes) / 60)


def validate_aircraft_maintenance(
    aircraft_id: str | None,
    departure,
    arrival,
    stopover_airports: str | None = None,
    stopover_minutes: int | None = None,
    current_flight_id: str | None = None,
) -> tuple[dict[str, str], int] | None:
    """Reject a manual assignment to an unknown, inactive, or maintained aircraft."""
    if not aircraft_id:
        return None

    aircraft = db.session.get(Aircraft, aircraft_id)
    if aircraft is None:
        return (
            {
                "code": "AIRCRAFT_NOT_FOUND",
                "message": f"L'appareil {aircraft_id} est introuvable.",
            },
            404,
        )
    if not is_aircraft_operational(aircraft):
        return (
            {
                "code": "AIRCRAFT_UNAVAILABLE",
                "message": (
                    f"L'appareil {getattr(aircraft, 'registration', None) or aircraft.refAircraft} "
                    f"n'est pas opérationnel (status : {aircraft.aircraftStatus})."
                ),
            },
            409,
        )

    maintenance_limit = getattr(aircraft, "maintenanceHoursLimit", None)
    hours_since_maintenance = getattr(
        aircraft, "hoursSinceMaintenance", None
    )
    if maintenance_limit is not None:
        try:
            limit_hours = float(maintenance_limit)
            used_hours = float(hours_since_maintenance or 0)
        except (TypeError, ValueError) as exc:
            raise RuntimeError(
                f"Compteurs de maintenance invalides pour l'appareil {aircraft_id}."
            ) from exc

        if not math.isfinite(limit_hours) or not math.isfinite(used_hours):
            raise RuntimeError(
                f"Compteurs de maintenance invalides pour l'appareil {aircraft_id}."
            )

        if limit_hours > 0:
            previous_flights_query = Flight.query.filter(
                Flight.refAircraft == aircraft_id,
                Flight.flightHoursRecorded.is_(False),
                Flight.departureTime < departure,
            )
            if current_flight_id:
                previous_flights_query = previous_flights_query.filter(
                    Flight.refFlight != current_flight_id
                )

            previous_flights = previous_flights_query.all()
            previous_hours = sum(
                flight_hours_for_maintenance(flight) or 0
                for flight in previous_flights
                if normalize_status(getattr(flight, "flightStatus", None))
                not in {"CANCELLED", "CANCELED", "ANNULE", "ANNULÉ"}
            )
            candidate_hours = flight_hours_for_maintenance(
                SimpleNamespace(
                    departureTime=departure,
                    arrivalTime=arrival,
                    stopoverAirportCodes=stopover_airports,
                    stopoverDurationMinutes=stopover_minutes,
                )
            )
            projected_hours = (
                used_hours + previous_hours + (candidate_hours or 0)
            )
            if candidate_hours is None or projected_hours >= limit_hours:
                return (
                    {
                        "code": "MAINTENANCE_DUE",
                        "message": (
                            f"L'appareil {getattr(aircraft, 'registration', None) or aircraft.refAircraft} "
                            "atteindrait ou dépasserait sa limite de maintenance "
                            "avec ce flight et les rotations déjà programmées."
                        ),
                    },
                    409,
                )

    slots = (
        MaintenanceSlot.query
        .filter(
            MaintenanceSlot.refAircraft == aircraft_id,
            MaintenanceSlot.startTime < arrival,
            MaintenanceSlot.endTime > departure,
        )
        .all()
    )
    conflict = next(
        (
            slot
            for slot in slots
            if normalize_status(getattr(slot, "maintenanceStatus", None))
            not in INACTIVE_MAINTENANCE_STATUSES
        ),
        None,
    )
    if conflict:
        return (
            {
                "code": "AIRCRAFT_MAINTENANCE",
                "message": (
                    f"L'appareil {getattr(aircraft, 'registration', None) or aircraft.refAircraft} est indisponible "
                    f"pour maintenance du {ensure_utc(conflict.startTime).isoformat()} "
                    f"au {ensure_utc(conflict.endTime).isoformat()}."
                ),
            },
            409,
        )
    return None


def normalize_stopover_storage(value):
    codes = parse_stopover_codes(value)
    return ",".join(codes) if codes else None


def parse_stopover_duration(data: dict) -> int:
    if data.get("stopoverDurationMinutes") is not None:
        try:
            return max(0, int(float(data["stopoverDurationMinutes"])))
        except (TypeError, ValueError):
            return 120
    if data.get("layoverHours") is not None:
        try:
            return max(0, int(float(data["layoverHours"]) * 60))
        except (TypeError, ValueError):
            return 120
    return 120


def check_aircraft_conflict(avion_id, dep_time, arr_time, current_flight_id=None):
    """Retourne le premier flight qui chevauche le créneau de l'appareil."""
    if not avion_id:
        return None
    query = Flight.query.filter(
        Flight.refAircraft == avion_id,
        Flight.flightStatus != "Cancelled",
        Flight.departureTime < arr_time,
        Flight.arrivalTime > dep_time,
    )
    if current_flight_id:
        query = query.filter(Flight.refFlight != current_flight_id)
    return query.first()


def build_route_string(flight) -> str:
    points = [flight.departureAirportCode]
    points.extend(parse_stopover_codes(getattr(flight, "stopoverAirportCodes", None)))
    points.append(flight.arrivalAirportCode)
    return " ➔ ".join(points)


def build_legs_payload(flight) -> list[dict]:
    payload = []
    if hasattr(flight, "legs") and flight.legs:
        for leg in flight.legs:
            payload.append(
                {
                    "flightNumber": getattr(leg, "flightNumber", flight.flightNumber),
                    "departureAirportCode": leg.departureAirportCode,
                    "arrivalAirportCode": leg.arrivalAirportCode,
                    "departureTime": ensure_utc(leg.departureTime).isoformat() if leg.departureTime else None,
                    "arrivalTime": ensure_utc(leg.arrivalTime).isoformat() if leg.arrivalTime else None,
                }
            )
    return payload
