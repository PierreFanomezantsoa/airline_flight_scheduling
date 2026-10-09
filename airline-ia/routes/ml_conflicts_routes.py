# routes/ml_conflicts_routes.py
# =============================================================================
# MODULE ML SÉPARÉ : DÉTECTION DE CONFLITS DE VOLS PAR ARBRE DE DÉCISION
# =============================================================================
#
# IMPORTANT :
# - Ce fichier ne dépend PAS de joblib, numpy ou scikit-learn.
# - Il fonctionne uniquement avec Python standard + Flask + vos modèles SQLAlchemy.
# - Le "Decision Tree" est implémenté en Python pur afin d'éviter l'erreur
#   ModuleNotFoundError: No module named 'joblib'.
#
# Endpoints :
#   GET  /flights/conflicts
#   GET  /flights/ml/info
#   POST /flights/optimize
#
# Compatible avec votre frontend React :
#   const API_URL = 'http://localhost:3001/flights'
#   POST `${API_URL}/optimize`
#
# =============================================================================

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Optional

from flask import Blueprint, jsonify

import models as models_module
from models import db, Flight
from common.authorization import require_roles
from common.datetime_utils import ensure_utc
from common.status_utils import normalize_status


ml_conflicts_bp = Blueprint(
    "ml_conflicts",
    __name__,
)


# =============================================================================
# CONFIGURATION
# =============================================================================

MIN_TURNAROUND_MINUTES = 45
POSITIONING_MINUTES = 180

# Pour éviter de comparer chaque flight avec absolument tous les autres.
PAIR_SCAN_WINDOW_MINUTES = 6 * 60

MODEL_VERSION = "pure-python-decision-tree-v1"


# =============================================================================
# OUTILS GÉNÉRAUX
# =============================================================================

def is_cancelled_or_completed(value: Any) -> bool:
    return normalize_status(value) in {
        "CANCELLED",
        "ANNULE",
        "ANNULÉ",
        "COMPLETED",
        "DONE",
        "EFFECTUE",
        "EFFECTUÉ",
        "LANDED",
        "TERMINE",
        "TERMINÉ",
    }


def is_delayed(value: Any) -> bool:
    return normalize_status(value) in {
        "DELAYED",
        "RETARDE",
        "RETARDÉ",
    }


def get_aircraft_id(flight: Flight) -> Optional[str]:
    value = getattr(flight, "refAircraft", None)

    if value in [None, ""]:
        return None

    return str(value)


def get_aircraft_registration_from_flight(
    flight: Flight,
) -> Optional[str]:
    aircraft = getattr(
        flight,
        "aircraft",
        None,
    )

    if aircraft is not None:
        for attr in (
            "registration",
            "registration",
            "numero",
        ):
            value = getattr(
                aircraft,
                attr,
                None,
            )

            if value:
                return str(value)

    return get_aircraft_id(flight)


def flight_payload(
    flight: Flight,
) -> dict:
    dep = ensure_utc(
        getattr(
            flight,
            "departureTime",
            None,
        )
    )

    arr = ensure_utc(
        getattr(
            flight,
            "arrivalTime",
            None,
        )
    )

    return {
        "refFlight": str(flight.refFlight),
        "flightNumber": getattr(
            flight,
            "flightNumber",
            None,
        ),
        "depAirportCode": getattr(
            flight,
            "depAirportCode",
            None,
        ),
        "arrAirportCode": getattr(
            flight,
            "arrAirportCode",
            None,
        ),
        "departureTime": (
            dep.isoformat()
            if dep
            else None
        ),
        "arrivalTime": (
            arr.isoformat()
            if arr
            else None
        ),
        "status": getattr(
            flight,
            "status",
            None,
        ),
        "refAircraft": get_aircraft_id(
            flight
        ),
        "aircraftRegistration": (
            get_aircraft_registration_from_flight(
                flight
            )
        ),
    }


# =============================================================================
# FEATURES POUR L'ARBRE DE DÉCISION
# =============================================================================

def build_features(
    flight_a: Flight,
    flight_b: Flight,
) -> Optional[dict]:
    """
    Transforme deux vols en variables exploitables par l'arbre.

    Les vols sont ordonnés par départ :
        A = premier flight
        B = flight suivant

    gap_minutes :
        > 0  : espace entre A et B
        = 0  : B commence quand A termine
        < 0  : chevauchement
    """
    a_dep = ensure_utc(
        getattr(
            flight_a,
            "departureTime",
            None,
        )
    )

    a_arr = ensure_utc(
        getattr(
            flight_a,
            "arrivalTime",
            None,
        )
    )

    b_dep = ensure_utc(
        getattr(
            flight_b,
            "departureTime",
            None,
        )
    )

    b_arr = ensure_utc(
        getattr(
            flight_b,
            "arrivalTime",
            None,
        )
    )

    if not all(
        [
            a_dep,
            a_arr,
            b_dep,
            b_arr,
        ]
    ):
        return None

    if b_dep < a_dep:
        (
            flight_a,
            flight_b,
        ) = (
            flight_b,
            flight_a,
        )

        a_dep = ensure_utc(
            flight_a.departureTime
        )

        a_arr = ensure_utc(
            flight_a.arrivalTime
        )

        b_dep = ensure_utc(
            flight_b.departureTime
        )

        b_arr = ensure_utc(
            flight_b.arrivalTime
        )

    gap_minutes = (
        b_dep - a_arr
    ).total_seconds() / 60

    overlap_minutes = max(
        0.0,
        -gap_minutes,
    )

    turnaround_shortage = max(
        0.0,
        MIN_TURNAROUND_MINUTES
        - max(
            gap_minutes,
            0.0,
        ),
    )

    destination_a = (
        str(
            getattr(
                flight_a,
                "arrAirportCode",
                "",
            )
            or ""
        )
        .strip()
        .upper()
    )

    origin_b = (
        str(
            getattr(
                flight_b,
                "depAirportCode",
                "",
            )
            or ""
        )
        .strip()
        .upper()
    )

    location_mismatch = int(
        bool(
            destination_a
            and origin_b
        )
        and destination_a
        != origin_b
    )

    return {
        "flightA": flight_a,
        "flightB": flight_b,
        "overlap_minutes": round(
            overlap_minutes,
            2,
        ),
        "gap_minutes": round(
            gap_minutes,
            2,
        ),
        "turnaround_shortage_minutes": round(
            turnaround_shortage,
            2,
        ),
        "location_mismatch": location_mismatch,
        "a_delayed": int(
            is_delayed(
                getattr(
                    flight_a,
                    "status",
                    None,
                )
            )
        ),
        "b_delayed": int(
            is_delayed(
                getattr(
                    flight_b,
                    "status",
                    None,
                )
            )
        ),
    }


# =============================================================================
# ARBRE DE DÉCISION EN PYTHON PUR
# =============================================================================

class PurePythonConflictDecisionTree:
    """
    Arbre de décision explicable et très léger.

    Arbre logique :

                           overlap > 0 ?
                          /             \
                        oui             non
                        |                |
                  CRITICAL          gap < 45 ?
                                     /       \
                                   oui       non
                                   |          |
                                  HIGH   location mismatch ?
                                            /       \
                                          oui       non
                                          |          |
                                    gap < 180 ?    SAFE
                                      /    \
                                    oui    non
                                    |
                                   HIGH

    Une branche supplémentaire tient compte des vols déjà retardés afin
    d'augmenter légèrement le risque lorsque la marge de rotation est faible.
    """

    name = "PurePythonDecisionTree"
    version = MODEL_VERSION

    def predict(
        self,
        features: dict,
    ) -> dict:
        overlap = float(
            features[
                "overlap_minutes"
            ]
        )

        gap = float(
            features[
                "gap_minutes"
            ]
        )

        mismatch = bool(
            features[
                "location_mismatch"
            ]
        )

        delayed_context = bool(
            features["a_delayed"]
            or features["b_delayed"]
        )

        # --------------------------------------------------------------
        # Noeud 1 : chevauchement direct
        # --------------------------------------------------------------
        if overlap > 0:
            probability = min(
                1.0,
                0.88
                + min(
                    overlap / 240.0,
                    0.12,
                ),
            )

            return {
                "isConflict": True,
                "probability": round(
                    probability,
                    4,
                ),
                "type": "AIRCRAFT_OVERLAP",
                "severity": "CRITICAL",
                "reason": (
                    f"Chevauchement du même appareil pendant "
                    f"{round(overlap)} min."
                ),
            }

        # --------------------------------------------------------------
        # Noeud 2 : turnaround insuffisant
        # --------------------------------------------------------------
        if 0 <= gap < MIN_TURNAROUND_MINUTES:
            probability = 0.82

            if delayed_context:
                probability += 0.08

            probability += min(
                (
                    MIN_TURNAROUND_MINUTES
                    - gap
                )
                / 300.0,
                0.08,
            )

            return {
                "isConflict": True,
                "probability": round(
                    min(
                        probability,
                        0.98,
                    ),
                    4,
                ),
                "type": "TURNAROUND_TOO_SHORT",
                "severity": "HIGH",
                "reason": (
                    f"Temps de rotation de {round(gap)} min "
                    f"inférieur au minimum de "
                    f"{MIN_TURNAROUND_MINUTES} min."
                ),
            }

        # --------------------------------------------------------------
        # Noeud 3 : position géographique incompatible
        # --------------------------------------------------------------
        if (
            mismatch
            and 0
            <= gap
            < POSITIONING_MINUTES
        ):
            probability = 0.78

            if delayed_context:
                probability += 0.07

            return {
                "isConflict": True,
                "probability": round(
                    min(
                        probability,
                        0.95,
                    ),
                    4,
                ),
                "type": "AIRCRAFT_POSITIONING",
                "severity": "HIGH",
                "reason": (
                    "L'appareil termine le premier flight dans un "
                    "aéroport différent de celui du départ du flight "
                    "suivant, avec un temps de repositionnement "
                    "insuffisant."
                ),
            }

        # --------------------------------------------------------------
        # Noeud 4 : marge faible + retard existant
        # --------------------------------------------------------------
        if (
            delayed_context
            and 45 <= gap < 75
        ):
            return {
                "isConflict": True,
                "probability": 0.61,
                "type": "ML_CONFLICT_RISK",
                "severity": "MEDIUM",
                "reason": (
                    "La marge de rotation est faible et au moins "
                    "un des vols est déjà retardé."
                ),
            }

        return {
            "isConflict": False,
            "probability": 0.06,
            "type": None,
            "severity": None,
            "reason": None,
        }


conflict_tree = (
    PurePythonConflictDecisionTree()
)


# =============================================================================
# DÉTECTION DE CONFLITS
# =============================================================================

def recommendation_for(
    conflict_type: str,
) -> str:
    if (
        conflict_type
        == "AIRCRAFT_OVERLAP"
    ):
        return (
            "Décaler un des vols ou "
            "réaffecter le second flight."
        )

    if (
        conflict_type
        == "TURNAROUND_TOO_SHORT"
    ):
        return (
            f"Prévoir au moins "
            f"{MIN_TURNAROUND_MINUTES} min "
            "entre les rotations ou "
            "changer d'appareil."
        )

    if (
        conflict_type
        == "AIRCRAFT_POSITIONING"
    ):
        return (
            "Réaffecter l'appareil ou "
            "prévoir un repositionnement."
        )

    if (
        conflict_type
        == "UNASSIGNED_AIRCRAFT"
    ):
        return (
            "Affecter un appareil disponible."
        )

    return (
        "Faire valider la rotation "
        "par le régulateur OCC."
    )


def detect_conflicts(
    flights: Optional[list] = None,
) -> list[dict]:
    if flights is None:
        flights = Flight.query.all()

    active_flights = [
        flight
        for flight in flights
        if not is_cancelled_or_completed(
            getattr(
                flight,
                "status",
                None,
            )
        )
    ]

    conflicts = []

    # --------------------------------------------------------------
    # Vols sans appareil
    # --------------------------------------------------------------
    for flight in active_flights:
        if not get_aircraft_id(
            flight
        ):
            conflicts.append(
                {
                    "id": (
                        f"UNASSIGNED:"
                        f"{flight.refFlight}"
                    ),
                    "type": (
                        "UNASSIGNED_AIRCRAFT"
                    ),
                    "severity": "HIGH",
                    "probability": 1.0,
                    "detector": "RULE",
                    "refAircraft": None,
                    "aircraftRegistration": None,
                    "flightA": flight_payload(
                        flight
                    ),
                    "flightB": None,
                    "overlapMinutes": 0,
                    "gapMinutes": None,
                    "reason": (
                        f"Le flight "
                        f"{flight.flightNumber} "
                        "n'a aucun appareil assigné."
                    ),
                    "recommendation": (
                        recommendation_for(
                            "UNASSIGNED_AIRCRAFT"
                        )
                    ),
                }
            )

    # --------------------------------------------------------------
    # Regroupement par appareil
    # --------------------------------------------------------------
    grouped = defaultdict(list)

    for flight in active_flights:
        aircraft_id = (
            get_aircraft_id(
                flight
            )
        )

        if aircraft_id:
            grouped[
                aircraft_id
            ].append(
                flight
            )

    # --------------------------------------------------------------
    # Comparaisons
    # --------------------------------------------------------------
    for (
        aircraft_id,
        aircraft_flights,
    ) in grouped.items():

        aircraft_flights.sort(
            key=lambda flight: (
                ensure_utc(
                    flight.departureTime
                )
                or datetime.max.replace(
                    tzinfo=timezone.utc
                )
            )
        )

        for index_a in range(
            len(
                aircraft_flights
            )
        ):
            flight_a = (
                aircraft_flights[
                    index_a
                ]
            )

            a_dep = ensure_utc(
                flight_a.departureTime
            )

            if not a_dep:
                continue

            for index_b in range(
                index_a + 1,
                len(
                    aircraft_flights
                ),
            ):
                flight_b = (
                    aircraft_flights[
                        index_b
                    ]
                )

                b_dep = ensure_utc(
                    flight_b.departureTime
                )

                if not b_dep:
                    continue

                delta_minutes = (
                    b_dep - a_dep
                ).total_seconds() / 60

                if (
                    delta_minutes
                    > PAIR_SCAN_WINDOW_MINUTES
                ):
                    break

                features = (
                    build_features(
                        flight_a,
                        flight_b,
                    )
                )

                if not features:
                    continue

                prediction = (
                    conflict_tree.predict(
                        features
                    )
                )

                if not prediction[
                    "isConflict"
                ]:
                    continue

                final_a = (
                    features[
                        "flightA"
                    ]
                )

                final_b = (
                    features[
                        "flightB"
                    ]
                )

                conflict_type = (
                    prediction["type"]
                )

                conflicts.append(
                    {
                        "id": (
                            f"{conflict_type}:"
                            f"{final_a.refFlight}:"
                            f"{final_b.refFlight}"
                        ),
                        "type": conflict_type,
                        "severity": (
                            prediction[
                                "severity"
                            ]
                        ),
                        "probability": (
                            prediction[
                                "probability"
                            ]
                        ),
                        "detector": "DECISION_TREE",
                        "refAircraft": aircraft_id,
                        "aircraftRegistration": (
                            get_aircraft_registration_from_flight(
                                final_a
                            )
                        ),
                        "flightA": (
                            flight_payload(
                                final_a
                            )
                        ),
                        "flightB": (
                            flight_payload(
                                final_b
                            )
                        ),
                        "overlapMinutes": (
                            features[
                                "overlap_minutes"
                            ]
                        ),
                        "gapMinutes": (
                            features[
                                "gap_minutes"
                            ]
                        ),
                        "reason": (
                            prediction[
                                "reason"
                            ]
                        ),
                        "recommendation": (
                            recommendation_for(
                                conflict_type
                            )
                        ),
                    }
                )

    severity_order = {
        "CRITICAL": 0,
        "HIGH": 1,
        "MEDIUM": 2,
    }

    conflicts.sort(
        key=lambda conflict: (
            severity_order.get(
                conflict[
                    "severity"
                ],
                9,
            ),
            -float(
                conflict[
                    "probability"
                ]
            ),
        )
    )

    return conflicts


# =============================================================================
# RECHERCHE D'UN APPAREIL DE REMPLACEMENT
# =============================================================================

def resolve_aircraft_model():
    """
    Supporte plusieurs noms possibles de votre modèle SQLAlchemy.
    """
    for name in (
        "Aircraft",
        "Avion",
        "AircraftModel",
    ):
        model = getattr(
            models_module,
            name,
            None,
        )

        if model is not None:
            return model

    return None


def aircraft_id_from_object(
    aircraft,
) -> Optional[str]:
    for attr in (
        "id",
        "refAircraft",
    ):
        value = getattr(
            aircraft,
            attr,
            None,
        )

        if value not in [
            None,
            "",
        ]:
            return str(
                value
            )

    return None


def aircraft_label(
    aircraft,
) -> str:
    for attr in (
        "registration",
        "registration",
        "numero",
        "model",
        "model",
    ):
        value = getattr(
            aircraft,
            attr,
            None,
        )

        if value:
            return str(
                value
            )

    return (
        aircraft_id_from_object(
            aircraft
        )
        or "APPAREIL"
    )


def aircraft_in_maintenance(
    aircraft,
) -> bool:
    status = ""

    for attr in (
        "status",
        "status",
    ):
        value = getattr(
            aircraft,
            attr,
            None,
        )

        if value:
            status = str(
                value
            ).lower()

            break

    return (
        "mainten" in status
        or "immobil" in status
        or "out_of_service"
        in status
        or "hors_service"
        in status
    )


def available_aircrafts() -> list:
    model = resolve_aircraft_model()

    if model is not None:
        try:
            return [
                aircraft
                for aircraft
                in model.query.all()
                if not aircraft_in_maintenance(
                    aircraft
                )
            ]

        except Exception as exc:
            print(
                "Impossible de lire "
                "la flotte : "
                f"{exc}"
            )

    # Fallback :
    # récupère les appareils déjà
    # présents dans Flight.aircraft.
    unique = {}

    for flight in Flight.query.all():
        aircraft = getattr(
            flight,
            "aircraft",
            None,
        )

        if aircraft is None:
            continue

        aircraft_id = (
            aircraft_id_from_object(
                aircraft
            )
        )

        if aircraft_id:
            unique[
                aircraft_id
            ] = aircraft

    return list(
        unique.values()
    )


def can_assign_aircraft(
    target_flight: Flight,
    candidate_aircraft_id: str,
    all_flights: list,
) -> bool:
    target_dep = ensure_utc(
        target_flight.departureTime
    )

    target_arr = ensure_utc(
        target_flight.arrivalTime
    )

    if not target_dep or not target_arr:
        return False

    others = [
        flight
        for flight in all_flights
        if str(flight.refFlight)
        != str(target_flight.refFlight)
        and get_aircraft_id(
            flight
        )
        == candidate_aircraft_id
        and not is_cancelled_or_completed(
            getattr(
                flight,
                "status",
                None,
            )
        )
    ]

    # Chevauchement exact
    for other in others:
        other_dep = ensure_utc(
            other.departureTime
        )

        other_arr = ensure_utc(
            other.arrivalTime
        )

        if not other_dep or not other_arr:
            continue

        if (
            other_dep < target_arr
            and other_arr > target_dep
        ):
            return False

    previous = [
        flight
        for flight in others
        if ensure_utc(
            flight.arrivalTime
        )
        and ensure_utc(
            flight.arrivalTime
        )
        <= target_dep
    ]

    following = [
        flight
        for flight in others
        if ensure_utc(
            flight.departureTime
        )
        and ensure_utc(
            flight.departureTime
        )
        >= target_arr
    ]

    if previous:
        prev_flight = max(
            previous,
            key=lambda flight: (
                ensure_utc(
                    flight.arrivalTime
                )
            ),
        )

        prev_arr = ensure_utc(
            prev_flight.arrivalTime
        )

        gap = (
            target_dep - prev_arr
        ).total_seconds() / 60

        if gap < MIN_TURNAROUND_MINUTES:
            return False

        if (
            prev_flight.arrAirportCode
            != target_flight.depAirportCode
            and gap < POSITIONING_MINUTES
        ):
            return False

    if following:
        next_flight = min(
            following,
            key=lambda flight: (
                ensure_utc(
                    flight.departureTime
                )
            ),
        )

        next_dep = ensure_utc(
            next_flight.departureTime
        )

        gap = (
            next_dep - target_arr
        ).total_seconds() / 60

        if gap < MIN_TURNAROUND_MINUTES:
            return False

        if (
            target_flight.arrAirportCode
            != next_flight.depAirportCode
            and gap < POSITIONING_MINUTES
        ):
            return False

    return True


def find_replacement_aircraft(
    target_flight: Flight,
    current_aircraft_id: Optional[str],
    all_flights: list,
):
    candidates = (
        available_aircrafts()
    )

    utilization = defaultdict(int)

    for flight in all_flights:
        aircraft_id = (
            get_aircraft_id(
                flight
            )
        )

        if aircraft_id:
            utilization[
                aircraft_id
            ] += 1

    # Priorité aux appareils les moins utilisés.
    candidates.sort(
        key=lambda aircraft: (
            utilization.get(
                aircraft_id_from_object(
                    aircraft
                )
                or "",
                0,
            )
        )
    )

    for aircraft in candidates:
        candidate_id = (
            aircraft_id_from_object(
                aircraft
            )
        )

        if not candidate_id:
            continue

        if (
            current_aircraft_id
            and candidate_id
            == current_aircraft_id
        ):
            continue

        if can_assign_aircraft(
            target_flight,
            candidate_id,
            all_flights,
        ):
            return aircraft

    return None


# =============================================================================
# ENDPOINT 1 : DÉTECTION
# =============================================================================

@ml_conflicts_bp.route(
    "/flights/conflicts",
    methods=["GET"],
)
def get_conflicts():
    try:
        conflicts = (
            detect_conflicts()
        )

        severity_count = defaultdict(
            int
        )

        for conflict in conflicts:
            severity_count[
                conflict[
                    "severity"
                ]
            ] += 1

        return jsonify(
            {
                "timestamp": (
                    datetime.now(
                        timezone.utc
                    ).isoformat()
                ),
                "totalConflicts": (
                    len(
                        conflicts
                    )
                ),
                "criticalConflicts": (
                    severity_count[
                        "CRITICAL"
                    ]
                ),
                "highConflicts": (
                    severity_count[
                        "HIGH"
                    ]
                ),
                "mediumConflicts": (
                    severity_count[
                        "MEDIUM"
                    ]
                ),
                "model": {
                    "algorithm": (
                        conflict_tree.name
                    ),
                    "version": (
                        conflict_tree.version
                    ),
                    "externalDependencies": [],
                    "minTurnaroundMinutes": (
                        MIN_TURNAROUND_MINUTES
                    ),
                    "positioningMinutes": (
                        POSITIONING_MINUTES
                    ),
                },
                "conflicts": conflicts,
            }
        ), 200

    except Exception as exc:
        print(
            "Erreur détection conflits : "
            f"{exc}"
        )

        return jsonify(
            {
                "status": "error",
                "message": (
                    "Impossible de détecter "
                    "les conflits."
                ),
            }
        ), 500


# =============================================================================
# ENDPOINT 2 : INFORMATIONS ARBRE
# =============================================================================

@ml_conflicts_bp.route(
    "/flights/ml/info",
    methods=["GET"],
)
def ml_info():
    return jsonify(
        {
            "status": "success",
            "model": {
                "algorithm": (
                    conflict_tree.name
                ),
                "version": (
                    conflict_tree.version
                ),
                "type": (
                    "Decision Tree "
                    "implemented in pure Python"
                ),
                "externalDependencies": [],
                "tree": {
                    "root": (
                        "overlap_minutes > 0"
                    ),
                    "turnaroundNode": (
                        f"gap_minutes < "
                        f"{MIN_TURNAROUND_MINUTES}"
                    ),
                    "positionNode": (
                        "location_mismatch == 1"
                    ),
                    "positionGapNode": (
                        f"gap_minutes < "
                        f"{POSITIONING_MINUTES}"
                    ),
                    "delayedContextNode": (
                        "delayed && "
                        "45 <= gap < 75"
                    ),
                },
            },
        }
    ), 200


# =============================================================================
# ENDPOINT 3 : OPTIMISATION
# =============================================================================

@ml_conflicts_bp.route(
    "/flights/optimize",
    methods=["POST"],
)
@require_roles("Planificateur", "Regulator")
def optimize_flights():
    try:
        all_flights = (
            Flight.query.all()
        )

        conflicts_before = (
            detect_conflicts(
                all_flights
            )
        )

        details = []
        processed_flights = set()

        for conflict in conflicts_before:

            # Vol sans appareil
            if (
                conflict["type"]
                == "UNASSIGNED_AIRCRAFT"
            ):
                target_id = (
                    conflict[
                        "flightA"
                    ][
                        "id"
                    ]
                )

            else:
                flight_b = (
                    conflict.get(
                        "flightB"
                    )
                )

                if not flight_b:
                    continue

                # On modifie de préférence le
                # deuxième flight de la rotation.
                target_id = (
                    flight_b[
                        "id"
                    ]
                )

            if (
                target_id
                in processed_flights
            ):
                continue

            target_flight = (
                db.session.get(
                    Flight,
                    target_id,
                )
            )

            if target_flight is None:
                continue

            current_aircraft_id = (
                get_aircraft_id(
                    target_flight
                )
            )

            candidate = (
                find_replacement_aircraft(
                    target_flight,
                    current_aircraft_id,
                    all_flights,
                )
            )

            if candidate is None:
                details.append(
                    {
                        "flightNumber": (
                            target_flight.flightNumber
                        ),
                        "status": (
                            "UNRESOLVED"
                        ),
                        "from": (
                            get_aircraft_registration_from_flight(
                                target_flight
                            )
                            or "NON ASSIGNÉ"
                        ),
                        "reason": (
                            conflict[
                                "reason"
                            ]
                        ),
                    }
                )

                processed_flights.add(
                    target_id
                )

                continue

            candidate_id = (
                aircraft_id_from_object(
                    candidate
                )
            )

            if not candidate_id:
                details.append(
                    {
                        "flightNumber": (
                            target_flight.flightNumber
                        ),
                        "status": (
                            "UNRESOLVED"
                        ),
                        "from": (
                            get_aircraft_registration_from_flight(
                                target_flight
                            )
                            or "NON ASSIGNÉ"
                        ),
                        "reason": (
                            "Appareil candidat "
                            "sans identifiant."
                        ),
                    }
                )

                processed_flights.add(
                    target_id
                )

                continue

            old_aircraft = (
                get_aircraft_registration_from_flight(
                    target_flight
                )
                or "NON ASSIGNÉ"
            )

            target_flight.refAircraft = (
                candidate_id
            )

            db.session.flush()

            details.append(
                {
                    "flightNumber": (
                        target_flight.flightNumber
                    ),
                    "status": (
                        "REASSIGNED"
                    ),
                    "from": (
                        old_aircraft
                    ),
                    "to": (
                        aircraft_label(
                            candidate
                        )
                    ),
                    "reason": (
                        conflict[
                            "reason"
                        ]
                    ),
                }
            )

            processed_flights.add(
                target_id
            )

        db.session.commit()
        db.session.expire_all()

        conflicts_after = (
            detect_conflicts(
                Flight.query.all()
            )
        )

        resolved = [
            detail
            for detail in details
            if detail["status"]
            == "REASSIGNED"
        ]

        unresolved = [
            detail
            for detail in details
            if detail["status"]
            == "UNRESOLVED"
        ]

        return jsonify(
            {
                "timestamp": (
                    datetime.now(
                        timezone.utc
                    ).isoformat()
                ),
                "resolvedConflicts": (
                    len(
                        resolved
                    )
                ),
                "unresolvedConflicts": (
                    len(
                        unresolved
                    )
                ),
                "details": details,
                "conflictsBefore": (
                    len(
                        conflicts_before
                    )
                ),
                "conflictsAfter": (
                    len(
                        conflicts_after
                    )
                ),
                "remainingConflicts": (
                    conflicts_after
                ),
                "model": {
                    "algorithm": (
                        conflict_tree.name
                    ),
                    "version": (
                        conflict_tree.version
                    ),
                },
            }
        ), 200

    except Exception as exc:
        db.session.rollback()

        print(
            "Erreur optimisation : "
            f"{exc}"
        )

        return jsonify(
            {
                "status": "error",
                "message": (
                    "Optimisation impossible : "
                    f"{str(exc)}"
                ),
            }
        ), 500
