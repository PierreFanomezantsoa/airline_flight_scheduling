"""Fonctions métier légères relatives aux vols.

Aucune dépendance Flask : ces fonctions sont réutilisables depuis des tests,
workers, commandes CLI ou une autre API.
"""
from __future__ import annotations

from typing import Any
from models import Flight
from common.datetime_utils import ensure_utc


def parse_stopover_codes(value) -> list[str]:
    if isinstance(value, list):
        return [str(code).strip().upper() for code in value if str(code).strip()]
    if isinstance(value, str):
        return [code.strip().upper() for code in value.split(",") if code.strip()]
    return []


def normalize_stopover_storage(value):
    codes = parse_stopover_codes(value)
    return ",".join(codes) if codes else None


def parse_stopover_duration(data: dict) -> int:
    if data.get("dureeEscale") is not None:
        try:
            return max(0, int(float(data["dureeEscale"])))
        except (TypeError, ValueError):
            return 120
    if data.get("layoverHours") is not None:
        try:
            return max(0, int(float(data["layoverHours"]) * 60))
        except (TypeError, ValueError):
            return 120
    return 120


def check_aircraft_conflict(avion_id, dep_time, arr_time, current_flight_id=None):
    """Retourne le premier vol qui chevauche le créneau de l'appareil."""
    if not avion_id:
        return None
    query = Flight.query.filter(
        Flight.avionId == avion_id,
        Flight.statut != "Cancelled",
        Flight.heureDepart < arr_time,
        Flight.heureArrivee > dep_time,
    )
    if current_flight_id:
        query = query.filter(Flight.id != current_flight_id)
    return query.first()


def build_route_string(flight) -> str:
    points = [flight.aeroportDepart]
    points.extend(parse_stopover_codes(getattr(flight, "aeroportEscale", None)))
    points.append(flight.aeroportArrivee)
    return " ➔ ".join(points)


def build_legs_payload(flight) -> list[dict]:
    payload = []
    if hasattr(flight, "legs") and flight.legs:
        for leg in flight.legs:
            payload.append(
                {
                    "numeroVol": getattr(leg, "numeroVol", flight.numeroVol),
                    "aeroportDepart": leg.aeroportDepart,
                    "aeroportArrivee": leg.aeroportArrivee,
                    "heureDepart": ensure_utc(leg.heureDepart).isoformat() if leg.heureDepart else None,
                    "heureArrivee": ensure_utc(leg.heureArrivee).isoformat() if leg.heureArrivee else None,
                }
            )
    return payload
