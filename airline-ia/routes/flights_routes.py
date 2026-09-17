"""Routes HTTP des vols.

La logique météo, les conversions de dates et les helpers métier ont été
extraits vers services/ et common/ afin de garder cette couche centrée sur HTTP.
"""
from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from flask import Blueprint, jsonify, request
from sqlalchemy.orm import joinedload
from werkzeug.exceptions import BadRequest

from models import db, Flight

from common.datetime_utils import ensure_utc, format_to_local_time
from services.flights.helpers import (
    normalize_stopover_storage,
    parse_stopover_duration,
    check_aircraft_conflict,
    build_route_string,
    build_legs_payload,
)
from services.weather.resilient_service import resilient_weather_service
from weather_ml import local_weather_ml
from services.weather.risk_engine import (
    WEATHER_MONITOR_THRESHOLD,
    WEATHER_PLANNING_MAX_HOURS,
    WEATHER_PROVIDER_MAX_FORECAST_HOURS,
    weather_engine,
    determine_operational_status,
)


logger = logging.getLogger(__name__)


# =============================================================================
# BLUEPRINT — DOIT ÊTRE DÉCLARÉ AVANT TOUTE ROUTE
# =============================================================================

flights_bp = Blueprint("flights", __name__)


# =============================================================================
# CONSTANTES
# =============================================================================

# Limite de sécurité pour éviter OOM sur gros volumes.
MAX_FLIGHTS_PER_REQUEST = 2000

# Statuts terminaux qui ne doivent JAMAIS être écrasés par la météo.
TERMINAL_STATUSES = {
    "Cancelled",
    "Annulé",
    "Annule",
    "Effectué",
    "Effectue",
    "Done",
    "Completed",
}

# Statuts d'annulation reconnus (FR + EN).
CANCELLED_STATUSES = {
    "Cancelled",
    "Canceled",
    "Annulé",
    "Annule",
    "ANNULE",
    "ANNULÉ",
}


# =============================================================================
# HELPERS DE VALIDATION
# =============================================================================

def _is_terminal_status(status: str | None) -> bool:
    return str(status or "").strip() in TERMINAL_STATUSES


def _is_cancelled_status(status: str | None) -> bool:
    return str(status or "").strip() in CANCELLED_STATUSES


def _parse_iso_datetime(raw: str | None, field_name: str = "date") -> datetime:
    """Parse une date ISO avec message d'erreur explicite."""
    if not raw:
        raise BadRequest(f"Le champ '{field_name}' est requis.")
    try:
        return ensure_utc(
            datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        )
    except (ValueError, TypeError) as exc:
        raise BadRequest(
            f"Le champ '{field_name}' n'est pas une date ISO valide : {exc}"
        )


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


# =============================================================================
# HELPERS LOCAUX
# =============================================================================

def _enrich_with_local_ml(
    assessment,
    *,
    dep_airport,
    arr_airport,
    dep_time,
    arr_time,
    stopovers=None,
):
    """Ajoute un second avis ML local sans modifier la décision opérationnelle.

    Le moteur/API existant reste la source de `score` et de `canAffectStatus`.
    Le ML local fournit uniquement `localML` et `advisoryScore`.
    """
    try:
        return local_weather_ml.enrich_api_assessment(
            assessment,
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=stopovers,
        )
    except Exception as exc:
        enriched = dict(assessment or {})
        enriched["localML"] = {
            "available": False,
            "source": "LOCAL_ML",
            "error": str(exc),
            "trustedForAutomaticStatus": False,
        }
        enriched["localMLAvailable"] = False
        enriched["localMLTrustedForAutomaticStatus"] = False
        return enriched


# =============================================================================
# POST /flights/weather/airports  — Prévision détaillée par aéroport
# =============================================================================

@flights_bp.route("/flights/weather/airports", methods=["POST"])
def get_weather_by_airport():
    """
    Prévision météo détaillée par aéroport.

    Body JSON :
    {
        "aeroportDepart": "LFPG",
        "aeroportArrivee": "KJFK",
        "heureDepart": "2025-01-15T10:00:00Z",
        "heureArrivee": "2025-01-15T18:00:00Z",
        "aeroportEscale": "EGLL"   // optionnel
    }
    """
    try:
        data = request.get_json(silent=True) or {}

        dep_airport = (data.get("aeroportDepart") or "").strip().upper()
        arr_airport = (data.get("aeroportArrivee") or "").strip().upper()
        dep_raw = data.get("heureDepart")
        arr_raw = data.get("heureArrivee")

        if not dep_airport or not arr_airport or not dep_raw or not arr_raw:
            return jsonify({
                "status": "error",
                "message": "Départ, arrivée et horaires sont requis.",
            }), 400

        dep_time = _parse_iso_datetime(dep_raw, "heureDepart")
        arr_time = _parse_iso_datetime(arr_raw, "heureArrivee")

        if arr_time <= dep_time:
            return jsonify({
                "status": "error",
                "message": "L'arrivée doit être postérieure au départ.",
            }), 400

        stopovers = (
            data.get("aeroportEscale")
            or data.get("escale")
            or data.get("stopovers")
        )

        # Détail ML local par aéroport
        local_detail = local_weather_ml.assess_flight_detailed(
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=stopovers,
        )

        # Détail API par aéroport (résilient)
        dep_api = resilient_weather_service.get_severity_detail(
            dep_airport, dep_time
        )
        arr_api = resilient_weather_service.get_severity_detail(
            arr_airport, arr_time
        )

        return jsonify({
            "status": "success",
            "airports": {
                "departure": {
                    "code": dep_airport,
                    "time": dep_time.isoformat(),
                    "api": dep_api,
                    "localML": local_detail["departure"],
                },
                "arrival": {
                    "code": arr_airport,
                    "time": arr_time.isoformat(),
                    "api": arr_api,
                    "localML": local_detail["arrival"],
                },
                "stopovers": local_detail.get("stopovers", []),
            },
            "trustedForAutomaticStatus": False,
        }), 200

    except BadRequest as exc:
        return jsonify({"status": "error", "message": str(exc)}), 400
    except Exception as exc:
        logger.exception("Erreur sur POST /flights/weather/airports")
        return jsonify({
            "status": "error",
            "message": str(exc),
        }), 500


# =============================================================================
# GET /flights
# =============================================================================

@flights_bp.route("/flights", methods=["GET"])
def get_flights():
    try:
        # joinedload évite le N+1 sur flight.avion
        flights = (
            Flight.query
            .options(joinedload(Flight.avion))
            .order_by(Flight.heureDepart.asc())
            .limit(MAX_FLIGHTS_PER_REQUEST)
            .all()
        )

        updated_flights = []
        has_changes = False

        # ---------------------------------------------------------------------
        # Traitement météo bulk optimisé :
        # - déduplication aéroport + heure,
        # - 4 threads maximum,
        # - aucun pool imbriqué,
        # - cache partagé 180 secondes.
        # ---------------------------------------------------------------------
        weather_enabled = (
            request.args.get("weather", "1")
            not in ["0", "false", "False"]
        )

        if weather_enabled:
            weather_assessments = weather_engine.assess_many_flights(
                flights,
                force_refresh=False,
            )
        else:
            weather_assessments = {
                str(flight.id): weather_engine.build_skipped_assessment(
                    "Météo désactivée par le paramètre ?weather=0."
                )
                for flight in flights
            }

        for flight in flights:
            dep_utc = ensure_utc(flight.heureDepart)
            arr_utc = ensure_utc(flight.heureArrivee)

            assessment = weather_assessments.get(str(flight.id), {})
            current_status = flight.statut

            # On ne laisse PAS la météo écraser un statut terminal.
            if _is_terminal_status(current_status):
                derived_status = current_status
            else:
                derived_status = determine_operational_status(
                    current_status=current_status,
                    dep_time=dep_utc,
                    arr_time=arr_utc,
                    weather_assessment=assessment,
                )

            # Le ML local enrichit l'affichage / l'aide OCC, mais ne participe
            # pas à determine_operational_status(). Si ?weather=0, aucun
            # traitement météo (API ou ML) n'est exécuté.
            if weather_enabled:
                assessment = _enrich_with_local_ml(
                    assessment,
                    dep_airport=flight.aeroportDepart,
                    arr_airport=flight.aeroportArrivee,
                    dep_time=dep_utc,
                    arr_time=arr_utc,
                    stopovers=getattr(flight, "aeroportEscale", None),
                )

            if derived_status != current_status:
                flight.statut = derived_status
                current_status = derived_status
                has_changes = True

            duration_minutes = None
            if dep_utc and arr_utc:
                duration_minutes = int(
                    (arr_utc - dep_utc).total_seconds() / 60
                )

            local_dep_str = format_to_local_time(
                dep_utc, flight.aeroportDepart
            )
            local_arr_str = format_to_local_time(
                arr_utc, flight.aeroportArrivee
            )

            stopover_code = getattr(flight, "aeroportEscale", None)
            stopover_duration = getattr(flight, "dureeEscale", None)

            # weatherSeverity sécurisé : jamais None
            raw_score = assessment.get("score")
            weather_severity = (
                _safe_float(raw_score, 0.5)
                if raw_score is not None
                else 0.5
            )

            updated_flights.append(
                {
                    "id": str(flight.id),
                    "flightNumber": flight.numeroVol,
                    "origin": flight.aeroportDepart,
                    "stopover": stopover_code,
                    "stopoverDurationMinutes": stopover_duration,
                    "destination": flight.aeroportArrivee,
                    "route": build_route_string(flight),
                    "departure": (
                        dep_utc.isoformat() if dep_utc else None
                    ),
                    "arrival": (
                        arr_utc.isoformat() if arr_utc else None
                    ),
                    "localDeparture": local_dep_str,
                    "localArrival": local_arr_str,
                    "durationMinutes": duration_minutes,
                    "status": current_status,
                    "aircraft": (
                        str(flight.avionId)
                        if flight.avionId
                        else "NON ASSIGNÉ"
                    ),
                    "aircraftModel": (
                        flight.avion.immatriculation
                        if getattr(flight, "avion", None)
                        and getattr(
                            flight.avion, "immatriculation", None
                        )
                        else "Sans Immat"
                    ),

                    # Compatibilité frontend existante
                    "weatherSeverity": weather_severity,

                    # Nouvelles données IA / OCC
                    "weatherAI": assessment,
                    "weatherRiskLevel": assessment.get(
                        "riskLevel", "UNKNOWN"
                    ),
                    "weatherRiskLabel": assessment.get(
                        "riskLabel", "Indéterminé"
                    ),
                    "weatherConfidence": assessment.get(
                        "confidence", 0.0
                    ),
                    "weatherRecommendedAction": assessment.get(
                        "recommendedAction"
                    ),
                    "weatherRecommendedActionLabel": assessment.get(
                        "recommendedActionLabel"
                    ),
                    "weatherUpdatedAt": assessment.get("evaluatedAt"),
                    "weatherForecastPhase": assessment.get(
                        "forecastPhase"
                    ),
                    "weatherForecastPhaseLabel": assessment.get(
                        "forecastPhaseLabel"
                    ),
                    "weatherNextReviewAt": assessment.get("nextReviewAt"),
                    "weatherRefreshAfterSeconds": assessment.get(
                        "refreshAfterSeconds"
                    ),
                    "weatherCanAffectStatus": assessment.get(
                        "canAffectStatus", False
                    ),

                    "legs": build_legs_payload(flight),
                }
            )

        if has_changes:
            db.session.commit()

        return jsonify(updated_flights), 200

    except Exception as exc:
        db.session.rollback()
        logger.exception("Erreur critique lors de GET /flights")
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "Impossible de charger les vols.",
                }
            ),
            500,
        )


# =============================================================================
# POST /flights/weather/assess
# =============================================================================

@flights_bp.route("/flights/weather/assess", methods=["POST"])
def assess_weather_before_flight():
    """
    Pré-évaluation météo d'un vol avant création / modification.

    Cet endpoint ne touche pas la base de données.
    Il est optimisé pour FlightAddModal :
    - cache météo partagé 180 s ;
    - aucun polling serveur ;
    - réponse légère ;
    - départ + arrivée + escale(s).
    """
    try:
        data = request.get_json(silent=True) or {}

        dep_airport = (data.get("aeroportDepart") or "").strip().upper()
        arr_airport = (data.get("aeroportArrivee") or "").strip().upper()
        dep_raw = data.get("heureDepart")
        arr_raw = data.get("heureArrivee")

        if not dep_airport or not arr_airport:
            return jsonify({
                "status": "error",
                "message": "Aéroports de départ et d'arrivée requis.",
            }), 400

        if not dep_raw or not arr_raw:
            return jsonify({
                "status": "error",
                "message": "Horaires de départ et d'arrivée requis.",
            }), 400

        dep_time = _parse_iso_datetime(dep_raw, "heureDepart")
        arr_time = _parse_iso_datetime(arr_raw, "heureArrivee")

        if arr_time <= dep_time:
            return jsonify({
                "status": "error",
                "message": "L'arrivée doit être postérieure au départ.",
            }), 400

        assessment = weather_engine.assess_flight(
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=data.get("aeroportEscale"),
            force_refresh=False,
        )

        assessment = _enrich_with_local_ml(
            assessment,
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=data.get("aeroportEscale"),
        )

        return jsonify({
            "status": "success",
            "weatherAI": assessment,
        }), 200

    except BadRequest as exc:
        return jsonify({"status": "error", "message": str(exc)}), 400
    except Exception as exc:
        logger.exception("Erreur sur POST /flights/weather/assess")
        return jsonify({
            "status": "error",
            "message": "Impossible d'évaluer la météo du vol.",
        }), 500


# =============================================================================
# GET /flights/fast
# =============================================================================

@flights_bp.route("/flights/fast", methods=["GET"])
def get_flights_fast():
    """
    Endpoint léger pour l'affichage immédiat du dashboard.

    AUCUN appel réseau météo.
    Le frontend peut :
      1) charger /flights/fast immédiatement ;
      2) charger /flights/weather-alerts ensuite ;
      3) fusionner les alertes météo en arrière-plan.
    """
    try:
        flights = (
            Flight.query
            .options(joinedload(Flight.avion))
            .order_by(Flight.heureDepart.asc())
            .limit(MAX_FLIGHTS_PER_REQUEST)
            .all()
        )

        payload = []

        for flight in flights:
            dep_utc = ensure_utc(flight.heureDepart)
            arr_utc = ensure_utc(flight.heureArrivee)

            duration_minutes = None
            if dep_utc and arr_utc:
                duration_minutes = int(
                    (arr_utc - dep_utc).total_seconds() / 60
                )

            payload.append(
                {
                    "id": str(flight.id),
                    "flightNumber": flight.numeroVol,
                    "origin": flight.aeroportDepart,
                    "destination": flight.aeroportArrivee,
                    "route": build_route_string(flight),
                    "departure": (
                        dep_utc.isoformat() if dep_utc else None
                    ),
                    "arrival": (
                        arr_utc.isoformat() if arr_utc else None
                    ),
                    "localDeparture": format_to_local_time(
                        dep_utc, flight.aeroportDepart
                    ),
                    "localArrival": format_to_local_time(
                        arr_utc, flight.aeroportArrivee
                    ),
                    "durationMinutes": duration_minutes,
                    "status": flight.statut,
                    "aircraft": (
                        str(flight.avionId)
                        if flight.avionId
                        else "NON ASSIGNÉ"
                    ),
                    "aircraftModel": (
                        flight.avion.immatriculation
                        if getattr(flight, "avion", None)
                        and getattr(
                            flight.avion, "immatriculation", None
                        )
                        else "Sans Immat"
                    ),
                    "weatherSeverity": None,
                    "weatherPending": True,
                }
            )

        return jsonify(payload), 200

    except Exception as exc:
        logger.exception("Erreur sur GET /flights/fast")
        return jsonify({
            "status": "error",
            "message": str(exc),
        }), 500


# =============================================================================
# ALERTES MÉTÉO OCC
# =============================================================================

@flights_bp.route("/flights/weather-alerts", methods=["GET"])
def get_weather_alerts():
    """
    Retourne les vols ayant un risque météo significatif.

    Usage frontend recommandé :
        polling toutes les 30 à 60 secondes.

    Exemple :
        GET /flights/weather-alerts?horizonHours=24
    """
    try:
        horizon_hours = request.args.get(
            "horizonHours", default=24, type=int
        )
        horizon_hours = max(
            1,
            min(horizon_hours, WEATHER_PLANNING_MAX_HOURS),
        )

        now_utc = datetime.now(timezone.utc)
        horizon_end = now_utc + timedelta(hours=horizon_hours)

        # Filtre SQL minimal, puis filtre Python pour les variantes d'annulation
        all_flights = (
            Flight.query
            .filter(Flight.heureDepart >= now_utc)
            .filter(Flight.heureDepart <= horizon_end)
            .order_by(Flight.heureDepart.asc())
            .limit(MAX_FLIGHTS_PER_REQUEST)
            .all()
        )
        flights = [
            f for f in all_flights if not _is_cancelled_status(f.statut)
        ]

        alerts = []

        assessments = weather_engine.assess_many_flights(
            flights,
            force_refresh=False,
        )

        for flight in flights:
            assessment = assessments.get(
                str(flight.id),
                weather_engine.build_skipped_assessment(
                    "Évaluation absente."
                ),
            )

            assessment = _enrich_with_local_ml(
                assessment,
                dep_airport=flight.aeroportDepart,
                arr_airport=flight.aeroportArrivee,
                dep_time=ensure_utc(flight.heureDepart),
                arr_time=ensure_utc(flight.heureArrivee),
                stopovers=getattr(flight, "aeroportEscale", None),
            )

            monitor_score = assessment.get("advisoryScore")
            if not isinstance(monitor_score, (int, float)):
                monitor_score = _safe_float(assessment.get("score"), 0.0)

            if (
                monitor_score >= WEATHER_MONITOR_THRESHOLD
                or not assessment.get("dataAvailable", True)
            ):
                alerts.append({
                    "flightId": str(flight.id),
                    "flightNumber": flight.numeroVol,
                    "origin": flight.aeroportDepart,
                    "destination": flight.aeroportArrivee,
                    "departure": (
                        ensure_utc(flight.heureDepart).isoformat()
                        if flight.heureDepart
                        else None
                    ),
                    "status": flight.statut,
                    "weatherAI": assessment,
                })

        alerts.sort(
            key=lambda item: _safe_float(
                item["weatherAI"].get("advisoryScore")
                if isinstance(
                    item["weatherAI"].get("advisoryScore"),
                    (int, float),
                )
                else item["weatherAI"].get("score"),
                0.0,
            ),
            reverse=True,
        )

        return jsonify({
            "status": "success",
            "generatedAt": now_utc.isoformat(),
            "refreshAfterSeconds": 60,
            "horizonHours": horizon_hours,
            "totalAlerts": len(alerts),
            "alerts": alerts,
        }), 200

    except Exception as exc:
        logger.exception("Erreur sur GET /flights/weather-alerts")
        return jsonify({
            "status": "error",
            "message": str(exc),
        }), 500


@flights_bp.route("/flights/weather-outlook", methods=["GET"])
def get_weather_outlook():
    """
    Vue météo stratégique jusqu'à J-30.

    Exemple :
        GET /flights/weather-outlook?horizonDays=30
    """
    try:
        horizon_days = request.args.get(
            "horizonDays", default=30, type=int
        )
        horizon_days = max(1, min(horizon_days, 30))

        now_utc = datetime.now(timezone.utc)
        horizon_end = now_utc + timedelta(days=horizon_days)

        all_flights = (
            Flight.query
            .filter(Flight.heureDepart >= now_utc)
            .filter(Flight.heureDepart <= horizon_end)
            .order_by(Flight.heureDepart.asc())
            .limit(MAX_FLIGHTS_PER_REQUEST)
            .all()
        )
        flights = [
            f for f in all_flights if not _is_cancelled_status(f.statut)
        ]

        assessments = weather_engine.assess_many_flights(
            flights,
            force_refresh=False,
        )

        items = []
        phase_counts = defaultdict(int)

        for flight in flights:
            assessment = assessments.get(
                str(flight.id),
                weather_engine.build_skipped_assessment(
                    "Évaluation absente."
                ),
            )

            assessment = _enrich_with_local_ml(
                assessment,
                dep_airport=flight.aeroportDepart,
                arr_airport=flight.aeroportArrivee,
                dep_time=ensure_utc(flight.heureDepart),
                arr_time=ensure_utc(flight.heureArrivee),
                stopovers=getattr(flight, "aeroportEscale", None),
            )

            phase = assessment.get("forecastPhase", "UNKNOWN")
            phase_counts[phase] += 1

            items.append({
                "flightId": str(flight.id),
                "flightNumber": flight.numeroVol,
                "origin": flight.aeroportDepart,
                "destination": flight.aeroportArrivee,
                "departure": (
                    ensure_utc(flight.heureDepart).isoformat()
                    if flight.heureDepart
                    else None
                ),
                "status": flight.statut,
                "forecastPhase": phase,
                "forecastPhaseLabel": assessment.get(
                    "forecastPhaseLabel"
                ),
                "weatherAI": assessment,
            })

        items.sort(
            key=lambda item: (
                item["departure"] or "",
                -_safe_float(
                    (
                        item["weatherAI"].get("advisoryScore")
                        if isinstance(
                            item["weatherAI"].get("advisoryScore"),
                            (int, float),
                        )
                        else item["weatherAI"].get("score")
                    ),
                    -1.0,
                ),
            )
        )

        return jsonify({
            "status": "success",
            "generatedAt": now_utc.isoformat(),
            "horizonDays": horizon_days,
            "providerForecastMaxHours": (
                WEATHER_PROVIDER_MAX_FORECAST_HOURS
            ),
            "lifecycle": {
                "J30_J7": "STRATEGIC",
                "J7_J1": "PLANNING",
                "J1_H2": "TACTICAL",
                "H2_DEP": "OPERATIONAL",
            },
            "phaseCounts": dict(phase_counts),
            "totalFlights": len(items),
            "flights": items,
        }), 200

    except Exception as exc:
        logger.exception("Erreur sur GET /flights/weather-outlook")
        return jsonify({
            "status": "error",
            "message": str(exc),
        }), 500


@flights_bp.route("/flights/weather/local-assess", methods=["POST"])
def assess_weather_local_only():
    """Évalue un vol uniquement avec le ML local (consultatif OCC)."""
    try:
        data = request.get_json(silent=True) or {}

        dep_airport = (data.get("aeroportDepart") or "").strip().upper()
        arr_airport = (data.get("aeroportArrivee") or "").strip().upper()
        dep_raw = data.get("heureDepart")
        arr_raw = data.get("heureArrivee")

        if not dep_airport or not arr_airport or not dep_raw or not arr_raw:
            return jsonify({
                "status": "error",
                "message": "Départ, arrivée et horaires sont requis.",
            }), 400

        dep_time = _parse_iso_datetime(dep_raw, "heureDepart")
        arr_time = _parse_iso_datetime(arr_raw, "heureArrivee")

        if arr_time <= dep_time:
            return jsonify({
                "status": "error",
                "message": "L'arrivée doit être postérieure au départ.",
            }), 400

        local_assessment = local_weather_ml.assess_flight(
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=data.get("aeroportEscale"),
        )

        return jsonify({
            "status": "success",
            "localML": local_assessment,
            "trustedForAutomaticStatus": False,
        }), 200

    except BadRequest as exc:
        return jsonify({"status": "error", "message": str(exc)}), 400
    except Exception as exc:
        logger.exception("Erreur sur POST /flights/weather/local-assess")
        return jsonify({
            "status": "error",
            "message": str(exc),
        }), 500


@flights_bp.route("/flights/weather/status", methods=["GET"])
def get_weather_system_status():
    """État de résilience météo : circuit API et disponibilité du ML local."""
    try:
        return jsonify({
            "status": "success",
            "weather": resilient_weather_service.status(),
            "localML": local_weather_ml.status(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 200
    except Exception as exc:
        logger.exception("Erreur sur GET /flights/weather/status")
        return jsonify({
            "status": "error",
            "message": str(exc),
        }), 500


@flights_bp.route("/flights/weather/refresh", methods=["POST"])
def force_weather_refresh():
    """
    Invalide le cache météo.

    À utiliser :
    - bouton "Actualiser météo" OCC ;
    - après une alerte externe ;
    - avant une optimisation critique.
    """
    try:
        weather_engine.clear_cache()

        return jsonify({
            "status": "success",
            "message": (
                "Cache météo invalidé. La prochaine lecture "
                "forcera une actualisation."
            ),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 200

    except Exception as exc:
        logger.exception("Erreur sur POST /flights/weather/refresh")
        return jsonify({
            "status": "error",
            "message": str(exc),
        }), 500


# =============================================================================
# POST /flights
# =============================================================================

@flights_bp.route("/flights", methods=["POST"])
def create_flight():
    try:
        data = request.get_json(silent=True) or {}

        # ---------------------------------------------------------------
        # Validation stricte
        # ---------------------------------------------------------------
        numero_vol = str(data.get("numeroVol") or "").strip().upper()
        dep_airport = str(data.get("aeroportDepart") or "").strip().upper()
        arr_airport = str(data.get("aeroportArrivee") or "").strip().upper()

        if not numero_vol:
            return jsonify({
                "status": "error",
                "message": "Numéro de vol requis.",
            }), 400

        if not dep_airport or not arr_airport:
            return jsonify({
                "status": "error",
                "message": "Aéroports de départ et d'arrivée requis.",
            }), 400

        dep_time = _parse_iso_datetime(data.get("heureDepart"), "heureDepart")
        arr_time = _parse_iso_datetime(data.get("heureArrivee"), "heureArrivee")

        if arr_time <= dep_time:
            return jsonify({
                "status": "error",
                "message": "L'heure d'arrivée doit être postérieure au départ.",
            }), 400

        stopover_input = (
            data.get("aeroportEscale")
            or data.get("escale")
            or data.get("stopovers")
        )
        stopover_airport = normalize_stopover_storage(stopover_input)
        stopover_duration = parse_stopover_duration(data)

        avion_id = data.get("avionId") or None

        # ---------------------------------------------------------------
        # Conflit avion
        # ---------------------------------------------------------------
        conflicting_flight = check_aircraft_conflict(
            avion_id, dep_time, arr_time
        )
        if conflicting_flight and hasattr(conflicting_flight, "numeroVol"):
            return jsonify({
                "status": "error",
                "code": "AIRCRAFT_CONFLICT",
                "message": (
                    f"Cet appareil est déjà assigné au vol "
                    f"{conflicting_flight.numeroVol} sur ce créneau horaire."
                ),
            }), 409

        # ---------------------------------------------------------------
        # Météo
        # ---------------------------------------------------------------
        weather_assessment = weather_engine.assess_flight(
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=stopover_airport,
            force_refresh=False,
        )

        # ---------------------------------------------------------------
        # Statut initial : intention utilisateur > météo
        # ---------------------------------------------------------------
        frontend_status = data.get("status", "Planifié")
        status_mapping = {
            "Planifié": "Scheduled",
            "Retardé": "Delayed",
            "En Vol": "In-Flight",
            "Annulé": "Cancelled",
            "Effectué": "Effectué",
        }
        initial_status = status_mapping.get(frontend_status, "Scheduled")

        now_utc = datetime.now(timezone.utc)

        if _is_cancelled_status(initial_status):
            pass  # respecté
        elif arr_time < now_utc:
            initial_status = "Effectué"
        elif (
            weather_assessment.get("canAffectStatus", False)
            and weather_assessment.get("recommendedAction")
            in ["GROUND_HOLD_REVIEW", "DELAY_REVIEW"]
            and weather_assessment.get("minutesToDeparture", 9999) <= 120
        ):
            # météo sévère => retard / revue OCC, pas annulation automatique.
            initial_status = "Delayed"

        response_weather_assessment = _enrich_with_local_ml(
            weather_assessment,
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=stopover_airport,
        )

        new_flight = Flight(
            id=str(uuid.uuid4()),
            numeroVol=numero_vol,
            aeroportDepart=dep_airport,
            aeroportEscale=stopover_airport,
            dureeEscale=stopover_duration,
            aeroportArrivee=arr_airport,
            heureDepart=dep_time,
            heureArrivee=arr_time,
            avionId=avion_id,
            statut=initial_status,
        )

        db.session.add(new_flight)
        db.session.commit()

        return jsonify({
            "status": "success",
            "id": str(new_flight.id),
            "assigned_status": initial_status,
            "weatherSeverity": response_weather_assessment.get("score"),
            "weatherAI": response_weather_assessment,
        }), 201

    except BadRequest as exc:
        db.session.rollback()
        return jsonify({"status": "error", "message": str(exc)}), 400

    except Exception as exc:
        db.session.rollback()
        logger.exception("Erreur lors de la création du vol")
        return jsonify({
            "status": "error",
            "message": f"Erreur de traitement : {str(exc)}",
        }), 500


# =============================================================================
# PUT /flights/<id>
# =============================================================================

@flights_bp.route("/flights/<id>", methods=["PUT"])
def update_flight(id):
    try:
        data = request.get_json(silent=True) or {}

        flight = db.session.get(Flight, id)
        if not flight:
            return jsonify({
                "status": "error",
                "message": "Vol introuvable",
            }), 404

        numero_vol = str(data.get("numeroVol") or "").strip().upper()
        dep_airport = str(data.get("aeroportDepart") or "").strip().upper()
        arr_airport = str(data.get("aeroportArrivee") or "").strip().upper()

        if not numero_vol:
            return jsonify({
                "status": "error",
                "message": "Numéro de vol requis.",
            }), 400

        if not dep_airport or not arr_airport:
            return jsonify({
                "status": "error",
                "message": "Aéroports de départ et d'arrivée requis.",
            }), 400

        dep_time = _parse_iso_datetime(data.get("heureDepart"), "heureDepart")
        arr_time = _parse_iso_datetime(data.get("heureArrivee"), "heureArrivee")

        if arr_time <= dep_time:
            return jsonify({
                "status": "error",
                "message": "L'heure d'arrivée doit être postérieure au départ.",
            }), 400

        stopover_input = (
            data.get("aeroportEscale")
            or data.get("escale")
            or data.get("stopovers")
        )
        stopover_airport = normalize_stopover_storage(stopover_input)
        stopover_duration = parse_stopover_duration(data)

        avion_id = data.get("avionId") or None

        conflicting_flight = check_aircraft_conflict(
            avion_id,
            dep_time,
            arr_time,
            current_flight_id=id,
        )
        if conflicting_flight and hasattr(conflicting_flight, "numeroVol"):
            return jsonify({
                "status": "error",
                "code": "AIRCRAFT_CONFLICT",
                "message": (
                    f"Cet appareil est déjà assigné au vol "
                    f"{conflicting_flight.numeroVol} sur ce créneau horaire."
                ),
            }), 409

        weather_assessment = weather_engine.assess_flight(
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=stopover_airport,
            force_refresh=False,
        )

        frontend_status = data.get("status", flight.statut)
        status_mapping = {
            "Planifié": "Scheduled",
            "Retardé": "Delayed",
            "En Vol": "In-Flight",
            "Annulé": "Cancelled",
            "Effectué": "Effectué",
        }
        new_status = status_mapping.get(frontend_status, frontend_status)

        now_utc = datetime.now(timezone.utc)

        # Priorité : Annulé/Effectué manuels > météo > statut initial
        if _is_cancelled_status(new_status) or new_status in {
            "Effectué",
            "Effectue",
        }:
            pass
        elif arr_time < now_utc:
            new_status = "Effectué"
        elif (
            weather_assessment.get("canAffectStatus", False)
            and weather_assessment.get("recommendedAction")
            in ["GROUND_HOLD_REVIEW", "DELAY_REVIEW"]
            and weather_assessment.get("minutesToDeparture", 9999) <= 120
        ):
            new_status = "Delayed"

        response_weather_assessment = _enrich_with_local_ml(
            weather_assessment,
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=stopover_airport,
        )

        flight.numeroVol = numero_vol
        flight.aeroportDepart = dep_airport
        flight.aeroportEscale = stopover_airport
        flight.dureeEscale = stopover_duration
        flight.aeroportArrivee = arr_airport
        flight.heureDepart = dep_time
        flight.heureArrivee = arr_time
        flight.avionId = avion_id
        flight.statut = new_status

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Vol mis à jour",
            "assigned_status": new_status,
            "weatherSeverity": response_weather_assessment.get("score"),
            "weatherAI": response_weather_assessment,
        }), 200

    except BadRequest as exc:
        db.session.rollback()
        return jsonify({"status": "error", "message": str(exc)}), 400

    except Exception as exc:
        db.session.rollback()
        logger.exception("Erreur lors de la mise à jour du vol %s", id)
        return jsonify({
            "status": "error",
            "message": str(exc),
        }), 500


# =============================================================================
# DELETE /flights/<id>
# =============================================================================

@flights_bp.route("/flights/<id>", methods=["DELETE"])
def delete_flight(id):
    try:
        flight = db.session.get(Flight, id)
        if not flight:
            return jsonify({
                "status": "error",
                "message": "Vol introuvable",
            }), 404

        db.session.delete(flight)
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Vol supprimé",
        }), 200

    except Exception as exc:
        db.session.rollback()
        logger.exception("Erreur lors de la suppression du vol %s", id)
        return jsonify({
            "status": "error",
            "message": str(exc),
        }), 500