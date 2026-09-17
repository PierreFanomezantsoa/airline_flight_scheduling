"""Routes HTTP des vols.

La logique météo, les conversions de dates et les helpers métier ont été
extraits vers services/ et common/ afin de garder cette couche centrée sur HTTP.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from flask import Blueprint, jsonify, request
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


# =============================================================================
# BLUEPRINT — DOIT ÊTRE DÉCLARÉ AVANT TOUTE ROUTE
# =============================================================================

flights_bp = Blueprint("flights", __name__)


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
        data = request.get_json() or {}

        dep_airport = (data.get("aeroportDepart") or "").strip().upper()
        arr_airport = (data.get("aeroportArrivee") or "").strip().upper()
        dep_raw = data.get("heureDepart")
        arr_raw = data.get("heureArrivee")

        if not dep_airport or not arr_airport or not dep_raw or not arr_raw:
            return jsonify({
                "status": "error",
                "message": "Départ, arrivée et horaires sont requis.",
            }), 400

        dep_time = ensure_utc(datetime.fromisoformat(dep_raw.replace("Z", "+00:00")))
        arr_time = ensure_utc(datetime.fromisoformat(arr_raw.replace("Z", "+00:00")))

        if arr_time <= dep_time:
            return jsonify({
                "status": "error",
                "message": "L'arrivée doit être postérieure au départ.",
            }), 400

        stopovers = data.get("aeroportEscale") or data.get("escale") or data.get("stopovers")

        # Détail ML local par aéroport
        local_detail = local_weather_ml.assess_flight_detailed(
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=stopovers,
        )

        # Détail API par aéroport (résilient)
        dep_api = resilient_weather_service.get_severity_detail(dep_airport, dep_time)
        arr_api = resilient_weather_service.get_severity_detail(arr_airport, arr_time)

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

    except Exception as exc:
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
        flights = Flight.query.all()
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
            request.args.get(
                "weather",
                "1",
            )
            not in ["0", "false", "False"]
        )

        if weather_enabled:
            weather_assessments = (
                weather_engine.assess_many_flights(
                    flights,
                    force_refresh=False,
                )
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

            assessment = weather_assessments.get(
                str(flight.id),
                {},
            )

            current_status = flight.statut

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
                dep_utc,
                flight.aeroportDepart,
            )

            local_arr_str = format_to_local_time(
                arr_utc,
                flight.aeroportArrivee,
            )

            stopover_code = getattr(
                flight,
                "aeroportEscale",
                None,
            )

            stopover_duration = getattr(
                flight,
                "dureeEscale",
                None,
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
                        dep_utc.isoformat()
                        if dep_utc
                        else None
                    ),
                    "arrival": (
                        arr_utc.isoformat()
                        if arr_utc
                        else None
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
                            flight.avion,
                            "immatriculation",
                            None,
                        )
                        else "Sans Immat"
                    ),

                    # -----------------------------------------------------------------
                    # Compatibilité frontend existante :
                    # weatherSeverity reste disponible.
                    # -----------------------------------------------------------------
                    "weatherSeverity": assessment.get(
                        "score",
                        0.5,
                    ),

                    # -----------------------------------------------------------------
                    # Nouvelles données IA / OCC
                    # -----------------------------------------------------------------
                    "weatherAI": assessment,
                    "weatherRiskLevel": assessment.get(
                        "riskLevel",
                        "UNKNOWN",
                    ),
                    "weatherRiskLabel": assessment.get(
                        "riskLabel",
                        "Indéterminé",
                    ),
                    "weatherConfidence": assessment.get(
                        "confidence",
                        0.0,
                    ),
                    "weatherRecommendedAction": assessment.get(
                        "recommendedAction",
                    ),
                    "weatherRecommendedActionLabel": assessment.get(
                        "recommendedActionLabel",
                    ),
                    "weatherUpdatedAt": assessment.get(
                        "evaluatedAt",
                    ),
                    "weatherForecastPhase": assessment.get(
                        "forecastPhase",
                    ),
                    "weatherForecastPhaseLabel": assessment.get(
                        "forecastPhaseLabel",
                    ),
                    "weatherNextReviewAt": assessment.get(
                        "nextReviewAt",
                    ),
                    "weatherRefreshAfterSeconds": assessment.get(
                        "refreshAfterSeconds",
                    ),
                    "weatherCanAffectStatus": assessment.get(
                        "canAffectStatus",
                        False,
                    ),

                    "legs": build_legs_payload(flight),
                }
            )

        if has_changes:
            db.session.commit()

        return jsonify(updated_flights), 200

    except Exception as exc:
        db.session.rollback()

        print(
            f"Erreur critique lors de GET /flights : {str(exc)}"
        )

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
        data = request.get_json() or {}

        dep_airport = (
            data.get("aeroportDepart")
            or ""
        ).strip().upper()

        arr_airport = (
            data.get("aeroportArrivee")
            or ""
        ).strip().upper()

        dep_raw = data.get("heureDepart")
        arr_raw = data.get("heureArrivee")

        if not dep_airport or not arr_airport:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "Aéroports de départ et d'arrivée requis.",
                    }
                ),
                400,
            )

        if not dep_raw or not arr_raw:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "Horaires de départ et d'arrivée requis.",
                    }
                ),
                400,
            )

        dep_time = ensure_utc(
            datetime.fromisoformat(
                dep_raw.replace("Z", "+00:00")
            )
        )

        arr_time = ensure_utc(
            datetime.fromisoformat(
                arr_raw.replace("Z", "+00:00")
            )
        )

        if arr_time <= dep_time:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "L'arrivée doit être postérieure au départ.",
                    }
                ),
                400,
            )
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

        return (
            jsonify(
                {
                    "status": "success",
                    "weatherAI": assessment,
                }
            ),
            200,
        )

    except Exception as exc:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "Impossible d'évaluer la météo du vol.",
                }
            ),
            500,
        )


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

    Très utile sur machine 8 Go / CPU ancien.
    """
    try:
        flights = Flight.query.all()

        payload = []

        for flight in flights:
            dep_utc = ensure_utc(flight.heureDepart)
            arr_utc = ensure_utc(flight.heureArrivee)

            duration_minutes = None

            if dep_utc and arr_utc:
                duration_minutes = int(
                    (arr_utc - dep_utc).total_seconds()
                    / 60
                )

            payload.append(
                {
                    "id": str(flight.id),
                    "flightNumber": flight.numeroVol,
                    "origin": flight.aeroportDepart,
                    "destination": flight.aeroportArrivee,
                    "route": build_route_string(flight),
                    "departure": (
                        dep_utc.isoformat()
                        if dep_utc
                        else None
                    ),
                    "arrival": (
                        arr_utc.isoformat()
                        if arr_utc
                        else None
                    ),
                    "localDeparture": format_to_local_time(
                        dep_utc,
                        flight.aeroportDepart,
                    ),
                    "localArrival": format_to_local_time(
                        arr_utc,
                        flight.aeroportArrivee,
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
                        if getattr(
                            flight,
                            "avion",
                            None,
                        )
                        and getattr(
                            flight.avion,
                            "immatriculation",
                            None,
                        )
                        else "Sans Immat"
                    ),
                    "weatherSeverity": None,
                    "weatherPending": True,
                }
            )

        return jsonify(payload), 200

    except Exception as exc:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": str(exc),
                }
            ),
            500,
        )


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
            "horizonHours",
            default=24,
            type=int,
        )

        horizon_hours = max(
            1,
            min(
                horizon_hours,
                WEATHER_PLANNING_MAX_HOURS,
            ),
        )

        now_utc = datetime.now(timezone.utc)
        horizon_end = now_utc + timedelta(
            hours=horizon_hours
        )

        flights = Flight.query.filter(
            Flight.heureDepart >= now_utc,
            Flight.heureDepart <= horizon_end,
            Flight.statut != "Cancelled",
        ).all()

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
                monitor_score = assessment.get("score", 0)

            if (
                monitor_score
                >= WEATHER_MONITOR_THRESHOLD
                or not assessment.get(
                    "dataAvailable",
                    True,
                )
            ):
                alerts.append(
                    {
                        "flightId": str(flight.id),
                        "flightNumber": flight.numeroVol,
                        "origin": flight.aeroportDepart,
                        "destination": flight.aeroportArrivee,
                        "departure": (
                            ensure_utc(
                                flight.heureDepart
                            ).isoformat()
                            if flight.heureDepart
                            else None
                        ),
                        "status": flight.statut,
                        "weatherAI": assessment,
                    }
                )

        alerts.sort(
            key=lambda item: (
                item["weatherAI"].get("advisoryScore")
                if isinstance(item["weatherAI"].get("advisoryScore"), (int, float))
                else item["weatherAI"].get("score", 0)
            ),
            reverse=True,
        )

        return (
            jsonify(
                {
                    "status": "success",
                    "generatedAt": now_utc.isoformat(),
                    "refreshAfterSeconds": 60,
                    "horizonHours": horizon_hours,
                    "totalAlerts": len(alerts),
                    "alerts": alerts,
                }
            ),
            200,
        )

    except Exception as exc:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": str(exc),
                }
            ),
            500,
        )


@flights_bp.route("/flights/weather-outlook", methods=["GET"])
def get_weather_outlook():
    """
    Vue météo stratégique jusqu'à J-30.

    Exemple :
        GET /flights/weather-outlook?horizonDays=30

    Cette route inclut les vols entre maintenant et J-30.
    - J-30 → J-7 : tendance stratégique, sans décision automatique.
    - J-7  → J-1 : prévision planning.
    - J-1  → H-2 : surveillance tactique.
    - H-2  → départ : décision OCC court terme.

    Si le fournisseur réel ne couvre que 7 jours, la zone J-30 → J-7
    retourne une évaluation "LONG_RANGE_MONITOR" sans faux score.
    """
    try:
        horizon_days = request.args.get(
            "horizonDays",
            default=30,
            type=int,
        )

        horizon_days = max(
            1,
            min(horizon_days, 30),
        )

        now_utc = datetime.now(timezone.utc)
        horizon_end = now_utc + timedelta(
            days=horizon_days
        )

        flights = Flight.query.filter(
            Flight.heureDepart >= now_utc,
            Flight.heureDepart <= horizon_end,
            Flight.statut != "Cancelled",
        ).all()

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

            # Au-delà de l'horizon fournisseur, le ML local fournit une
            # climatologie consultative avec confiance réduite.
            assessment = _enrich_with_local_ml(
                assessment,
                dep_airport=flight.aeroportDepart,
                arr_airport=flight.aeroportArrivee,
                dep_time=ensure_utc(flight.heureDepart),
                arr_time=ensure_utc(flight.heureArrivee),
                stopovers=getattr(flight, "aeroportEscale", None),
            )

            phase = assessment.get(
                "forecastPhase",
                "UNKNOWN",
            )

            phase_counts[phase] += 1

            items.append(
                {
                    "flightId": str(flight.id),
                    "flightNumber": flight.numeroVol,
                    "origin": flight.aeroportDepart,
                    "destination": flight.aeroportArrivee,
                    "departure": (
                        ensure_utc(
                            flight.heureDepart
                        ).isoformat()
                        if flight.heureDepart
                        else None
                    ),
                    "status": flight.statut,
                    "forecastPhase": phase,
                    "forecastPhaseLabel": assessment.get(
                        "forecastPhaseLabel"
                    ),
                    "weatherAI": assessment,
                }
            )

        # Les vols les plus proches et les risques réellement chiffrés
        # sont affichés en priorité.
        items.sort(
            key=lambda item: (
                item["departure"] or "",
                -(
                    (
                        item["weatherAI"].get("advisoryScore")
                        if isinstance(item["weatherAI"].get("advisoryScore"), (int, float))
                        else item["weatherAI"].get("score")
                    )
                    if isinstance(
                        (
                            item["weatherAI"].get("advisoryScore")
                            if isinstance(item["weatherAI"].get("advisoryScore"), (int, float))
                            else item["weatherAI"].get("score")
                        ),
                        (int, float),
                    )
                    else -1
                ),
            )
        )

        return (
            jsonify(
                {
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
                }
            ),
            200,
        )

    except Exception as exc:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": str(exc),
                }
            ),
            500,
        )


@flights_bp.route("/flights/weather/local-assess", methods=["POST"])
def assess_weather_local_only():
    """Évalue un vol uniquement avec le ML local (consultatif OCC)."""
    try:
        data = request.get_json() or {}
        dep_airport = (data.get("aeroportDepart") or "").strip().upper()
        arr_airport = (data.get("aeroportArrivee") or "").strip().upper()
        dep_raw = data.get("heureDepart")
        arr_raw = data.get("heureArrivee")

        if not dep_airport or not arr_airport or not dep_raw or not arr_raw:
            return jsonify({
                "status": "error",
                "message": "Départ, arrivée et horaires sont requis.",
            }), 400

        dep_time = ensure_utc(datetime.fromisoformat(dep_raw.replace("Z", "+00:00")))
        arr_time = ensure_utc(datetime.fromisoformat(arr_raw.replace("Z", "+00:00")))
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
    except Exception as exc:
        return jsonify({
            "status": "error",
            "message": str(exc),
        }), 500


@flights_bp.route("/flights/weather/status", methods=["GET"])
def get_weather_system_status():
    """État de résilience météo : circuit API et disponibilité du ML local."""
    return jsonify({
        "status": "success",
        "weather": resilient_weather_service.status(),
        "localML": local_weather_ml.status(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }), 200


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

        return (
            jsonify(
                {
                    "status": "success",
                    "message": "Cache météo invalidé. La prochaine lecture forcera une actualisation.",
                    "timestamp": datetime.now(
                        timezone.utc
                    ).isoformat(),
                }
            ),
            200,
        )

    except Exception as exc:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": str(exc),
                }
            ),
            500,
        )


# =============================================================================
# POST /flights
# =============================================================================

@flights_bp.route("/flights", methods=["POST"])
def create_flight():
    try:
        data = request.get_json() or {}

        dep_airport = data["aeroportDepart"].strip().upper()
        arr_airport = data["aeroportArrivee"].strip().upper()

        stopover_input = (
            data.get("aeroportEscale")
            or data.get("escale")
            or data.get("stopovers")
        )

        stopover_airport = normalize_stopover_storage(
            stopover_input
        )

        stopover_duration = parse_stopover_duration(data)

        dep_time = datetime.fromisoformat(
            data["heureDepart"].replace(
                "Z",
                "+00:00",
            )
        )

        arr_time = datetime.fromisoformat(
            data["heureArrivee"].replace(
                "Z",
                "+00:00",
            )
        )

        dep_time = ensure_utc(dep_time)
        arr_time = ensure_utc(arr_time)

        if arr_time <= dep_time:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "L'heure d'arrivée doit être postérieure au départ.",
                    }
                ),
                400,
            )
        avion_id = data.get("avionId") or None

        conflicting_flight = check_aircraft_conflict(
            avion_id,
            dep_time,
            arr_time,
        )
        if conflicting_flight:
            return (
                jsonify(
                    {
                        "status": "error",
                        "code": "AIRCRAFT_CONFLICT",
                        "message": (
                            f"Cet appareil est déjà assigné au vol "
                            f"{conflicting_flight.numeroVol} sur ce créneau horaire."
                        ),
                    }
                ),
                409,
            )
        weather_assessment = weather_engine.assess_flight(
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=stopover_airport,
            force_refresh=False,
        )
        frontend_status = data.get(
            "status",
            "Planifié",
        )
        status_mapping = {
            "Planifié": "Scheduled",
            "Retardé": "Delayed",
            "En Vol": "In-Flight",
            "Annulé": "Cancelled",
            "Effectué": "Effectué",
        }

        initial_status = status_mapping.get(
            frontend_status,
            "Scheduled",
        )

        now_utc = datetime.now(timezone.utc)

        if arr_time < now_utc:
            initial_status = "Effectué"

        elif (
            weather_assessment.get(
                "canAffectStatus",
                False,
            )
            and weather_assessment.get(
                "recommendedAction"
            )
            in [
                "GROUND_HOLD_REVIEW",
                "DELAY_REVIEW",
            ]
            and weather_assessment.get(
                "minutesToDeparture",
                9999,
            )
            <= 120
        ):
            # Important :
            # météo sévère => retard / revue OCC,
            # pas annulation automatique.
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
            numeroVol=data["numeroVol"].strip().upper(),
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

        return (
            jsonify(
                {
                    "status": "success",
                    "id": str(new_flight.id),
                    "assigned_status": initial_status,
                    "weatherSeverity": response_weather_assessment.get(
                        "score"
                    ),
                    "weatherAI": response_weather_assessment,
                }
            ),
            201,
        )

    except Exception as exc:
        db.session.rollback()

        print(
            f"Erreur lors de la création du vol : {str(exc)}"
        )

        return (
            jsonify(
                {
                    "status": "error",
                    "message": f"Erreur de traitement : {str(exc)}",
                }
            ),
            500,
        )


# =============================================================================
# PUT /flights/<id>
# =============================================================================

@flights_bp.route("/flights/<id>", methods=["PUT"])
def update_flight(id):
    try:
        data = request.get_json() or {}

        flight = db.session.get(Flight, id)

        if not flight:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "Vol introuvable",
                    }
                ),
                404,
            )

        dep_airport = data["aeroportDepart"].strip().upper()
        arr_airport = data["aeroportArrivee"].strip().upper()

        stopover_input = (
            data.get("aeroportEscale")
            or data.get("escale")
            or data.get("stopovers")
        )

        stopover_airport = normalize_stopover_storage(
            stopover_input
        )

        stopover_duration = parse_stopover_duration(data)

        dep_time = datetime.fromisoformat(
            data["heureDepart"].replace(
                "Z",
                "+00:00",
            )
        )

        arr_time = datetime.fromisoformat(
            data["heureArrivee"].replace(
                "Z",
                "+00:00",
            )
        )

        dep_time = ensure_utc(dep_time)
        arr_time = ensure_utc(arr_time)

        if arr_time <= dep_time:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "L'heure d'arrivée doit être postérieure au départ.",
                    }
                ),
                400,
            )

        avion_id = data.get("avionId") or None

        conflicting_flight = check_aircraft_conflict(
            avion_id,
            dep_time,
            arr_time,
            current_flight_id=id,
        )

        if conflicting_flight:
            return (
                jsonify(
                    {
                        "status": "error",
                        "code": "AIRCRAFT_CONFLICT",
                        "message": (
                            f"Cet appareil est déjà assigné au vol "
                            f"{conflicting_flight.numeroVol} sur ce créneau horaire."
                        ),
                    }
                ),
                409,
            )

        weather_assessment = weather_engine.assess_flight(
            dep_airport=dep_airport,
            arr_airport=arr_airport,
            dep_time=dep_time,
            arr_time=arr_time,
            stopovers=stopover_airport,
            force_refresh=False,
        )

        frontend_status = data.get(
            "status",
            flight.statut,
        )

        status_mapping = {
            "Planifié": "Scheduled",
            "Retardé": "Delayed",
            "En Vol": "In-Flight",
            "Annulé": "Cancelled",
            "Effectué": "Effectué",
        }

        new_status = status_mapping.get(
            frontend_status,
            frontend_status,
        )

        now_utc = datetime.now(timezone.utc)

        if arr_time < now_utc:
            new_status = "Effectué"

        elif (
            new_status not in [
                "Cancelled",
                "Effectué",
            ]
            and weather_assessment.get(
                "canAffectStatus",
                False,
            )
            and weather_assessment.get(
                "recommendedAction"
            )
            in [
                "GROUND_HOLD_REVIEW",
                "DELAY_REVIEW",
            ]
            and weather_assessment.get(
                "minutesToDeparture",
                9999,
            )
            <= 120
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

        flight.numeroVol = data["numeroVol"].strip().upper()
        flight.aeroportDepart = dep_airport
        flight.aeroportEscale = stopover_airport
        flight.dureeEscale = stopover_duration
        flight.aeroportArrivee = arr_airport
        flight.heureDepart = dep_time
        flight.heureArrivee = arr_time
        flight.avionId = avion_id
        flight.statut = new_status

        db.session.commit()

        return (
            jsonify(
                {
                    "status": "success",
                    "message": "Vol mis à jour",
                    "assigned_status": new_status,
                    "weatherSeverity": response_weather_assessment.get(
                        "score"
                    ),
                    "weatherAI": response_weather_assessment,
                }
            ),
            200,
        )

    except Exception as exc:
        db.session.rollback()

        return (
            jsonify(
                {
                    "status": "error",
                    "message": str(exc),
                }
            ),
            500,
        )


# =============================================================================
# DELETE /flights/<id>
# =============================================================================

@flights_bp.route("/flights/<id>", methods=["DELETE"])
def delete_flight(id):
    try:
        flight = db.session.get(Flight, id)

        if not flight:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "Vol introuvable",
                    }
                ),
                404,
            )

        db.session.delete(flight)
        db.session.commit()

        return (
            jsonify(
                {
                    "status": "success",
                    "message": "Vol supprimé",
                }
            ),
            200,
        )

    except Exception as exc:
        db.session.rollback()

        return (
            jsonify(
                {
                    "status": "error",
                    "message": str(exc),
                }
            ),
            500,
        )