import uuid
import os
import time
import threading
from collections import defaultdict, deque
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Blueprint, jsonify, request

from models import db, Flight
from services import get_real_weather_severity
from data.airports import get_airport_timezone


flights_bp = Blueprint("flights", __name__)


# =============================================================================
# CONFIGURATION MÉTÉO / "IA" DÉCISIONNELLE
# =============================================================================
#
# IMPORTANT :
# Cette couche est un moteur de scoring hybride temps réel + règles métier.
# Ce n'est pas encore un modèle ML entraîné. Elle est conçue pour pouvoir être
# remplacée plus tard par un modèle prédictif sans changer l'API React.
#
# Objectifs :
# - éviter un appel météo externe par vol à chaque GET ;
# - agréger départ + arrivée + escales ;
# - tenir compte de la proximité du départ ;
# - détecter la persistance d'une météo sévère ;
# - NE PAS annuler automatiquement un vol sur une seule mesure météo ;
# - fournir une décision explicable à l'IHM OCC.
# =============================================================================

WEATHER_CACHE_TTL_SECONDS = 180
WEATHER_HISTORY_SIZE = 5
# 4 workers évitent la sur-souscription CPU/RAM sur un i5 4e génération.
# Les appels météo sont surtout I/O, mais au-delà de 4 threads le gain devient
# souvent faible sur cette configuration et augmente la contention.
WEATHER_PARALLEL_WORKERS = 4
WEATHER_SKIP_PAST_COMPLETED = True

# ---------------------------------------------------------------------------
# HORIZONS MÉTÉO MULTI-NIVEAUX
# ---------------------------------------------------------------------------
# Le moteur distingue désormais :
# - J-30 → J-7 : STRATEGIC   (anticipation / tendance)
# - J-7  → J-1 : PLANNING    (prévision de planification)
# - J-1  → H-2 : TACTICAL    (surveillance renforcée)
# - H-2  → départ : OPERATIONAL (décision OCC proche du départ)
#
# Par défaut, le fournisseur météo réel est supposé fiable jusqu'à 7 jours.
# Si votre services.get_real_weather_severity supporte réellement 30 jours,
# définissez l'environnement WEATHER_PROVIDER_MAX_FORECAST_HOURS=720.
WEATHER_PROVIDER_MAX_FORECAST_HOURS = int(
    os.getenv("WEATHER_PROVIDER_MAX_FORECAST_HOURS", "168")
)

WEATHER_LONG_RANGE_MAX_HOURS = 30 * 24  # 720 h
WEATHER_PLANNING_MAX_HOURS = 7 * 24     # 168 h
WEATHER_TACTICAL_MAX_HOURS = 24         # 24 h
WEATHER_OPERATIONAL_MAX_HOURS = 2       # 2 h

# Intervalles de réévaluation conseillés.
WEATHER_REFRESH_STRATEGIC_SECONDS = 6 * 3600   # 6 h
WEATHER_REFRESH_PLANNING_SECONDS = 60 * 60     # 1 h
WEATHER_REFRESH_TACTICAL_SECONDS = 10 * 60     # 10 min
WEATHER_REFRESH_OPERATIONAL_SECONDS = 60       # 1 min

WEATHER_MONITOR_THRESHOLD = 0.45
WEATHER_DELAY_THRESHOLD = 0.70
WEATHER_SEVERE_THRESHOLD = 0.85
WEATHER_EXTREME_THRESHOLD = 0.92

# Une perturbation sévère doit être observée plusieurs fois avant de devenir
# "persistante". Cela limite les faux positifs / données météo transitoires.
PERSISTENCE_SAMPLE_COUNT = 3


def ensure_utc(dt: datetime) -> datetime:
    """Retourne une datetime timezone-aware en UTC."""
    if dt is None:
        return None

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)

    return dt.astimezone(timezone.utc)


@lru_cache(maxsize=256)
def get_cached_timezone(airport_code: str):
    """Cache le fuseau pour éviter de reconstruire ZoneInfo à chaque vol."""
    if not airport_code:
        return timezone.utc

    tz_str = get_airport_timezone(airport_code.strip().upper())

    try:
        return ZoneInfo(tz_str) if tz_str else timezone.utc
    except ZoneInfoNotFoundError:
        return timezone.utc


def format_to_local_time(dt: datetime, airport_code: str) -> str:
    """Convertit une datetime UTC vers le fuseau local de l'aéroport."""
    if not dt or not airport_code:
        return None

    dt_utc = ensure_utc(dt)
    local_tz = get_cached_timezone(airport_code)

    return dt_utc.astimezone(local_tz).isoformat()


def parse_stopover_codes(value) -> list[str]:
    """Normalise une escale ou une liste d'escales en codes IATA uppercase."""
    if isinstance(value, list):
        return [
            str(code).strip().upper()
            for code in value
            if str(code).strip()
        ]

    if isinstance(value, str):
        return [
            code.strip().upper()
            for code in value.split(",")
            if code.strip()
        ]

    return []


def normalize_stopover_storage(value):
    """Formate les escales pour le stockage actuel (chaîne séparée par virgules)."""
    codes = parse_stopover_codes(value)
    return ",".join(codes) if codes else None


def parse_stopover_duration(data: dict) -> int:
    """
    Durée d'escale robuste.
    - dureeEscale : minutes
    - layoverHours : heures
    """
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


def check_aircraft_conflict(
    avion_id,
    dep_time,
    arr_time,
    current_flight_id=None,
):
    """Vérifie un chevauchement d'utilisation d'appareil."""
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



def get_forecast_phase(minutes_to_departure: float) -> dict:
    """
    Retourne le niveau de décision météo selon l'horizon du vol.

    STRATEGIC:
        J-30 à J-7. Aucune décision de retard/annulation automatique.
    PLANNING:
        J-7 à J-1. Préparation planning / reroutage éventuel.
    TACTICAL:
        J-1 à H-2. Surveillance renforcée.
    OPERATIONAL:
        H-2 au départ. Décisions OCC court terme.
    """
    hours_to_departure = minutes_to_departure / 60

    if minutes_to_departure < 0:
        return {
            "phase": "PAST",
            "label": "Départ passé",
            "refreshAfterSeconds": 300,
            "canAffectStatus": True,
        }

    if hours_to_departure <= WEATHER_OPERATIONAL_MAX_HOURS:
        return {
            "phase": "OPERATIONAL",
            "label": "H-2 → départ",
            "refreshAfterSeconds": WEATHER_REFRESH_OPERATIONAL_SECONDS,
            "canAffectStatus": True,
        }

    if hours_to_departure <= WEATHER_TACTICAL_MAX_HOURS:
        return {
            "phase": "TACTICAL",
            "label": "J-1 → H-2",
            "refreshAfterSeconds": WEATHER_REFRESH_TACTICAL_SECONDS,
            "canAffectStatus": False,
        }

    if hours_to_departure <= WEATHER_PLANNING_MAX_HOURS:
        return {
            "phase": "PLANNING",
            "label": "J-7 → J-1",
            "refreshAfterSeconds": WEATHER_REFRESH_PLANNING_SECONDS,
            "canAffectStatus": False,
        }

    if hours_to_departure <= WEATHER_LONG_RANGE_MAX_HOURS:
        return {
            "phase": "STRATEGIC",
            "label": "J-30 → J-7",
            "refreshAfterSeconds": WEATHER_REFRESH_STRATEGIC_SECONDS,
            "canAffectStatus": False,
        }

    return {
        "phase": "OUT_OF_RANGE",
        "label": "> J-30",
        "refreshAfterSeconds": 24 * 3600,
        "canAffectStatus": False,
    }


def build_next_review_time(
    now_utc: datetime,
    refresh_after_seconds: int,
) -> str:
    """Calcule la prochaine heure théorique de réévaluation météo."""
    return (
        now_utc
        + timedelta(seconds=max(60, refresh_after_seconds))
    ).isoformat()


class WeatherRiskEngine:
    """
    Couche décisionnelle météo proche du temps réel.

    Entrée actuelle :
        get_real_weather_severity(airport_code, target_datetime) -> float [0..1]

    Le moteur enrichit cette valeur par :
    - cache TTL court ;
    - historique des observations ;
    - agrégation multi-aéroports ;
    - horizon temporel ;
    - persistance ;
    - recommandation opérationnelle explicable.
    """

    def __init__(self):
        self._cache = {}
        self._history = defaultdict(lambda: deque(maxlen=WEATHER_HISTORY_SIZE))
        self._lock = threading.Lock()

    @staticmethod
    def _clamp(value) -> float:
        try:
            return max(0.0, min(1.0, float(value)))
        except (TypeError, ValueError):
            return 0.5

    @staticmethod
    def _time_bucket(target_time: datetime) -> str:
        """
        Cache par heure de prévision.
        Évite de mélanger une météo prévue à 10h avec celle de 18h.
        """
        target = ensure_utc(target_time) or datetime.now(timezone.utc)
        return target.strftime("%Y-%m-%dT%H")

    def _cache_key(self, airport_code: str, target_time: datetime):
        return airport_code.upper(), self._time_bucket(target_time)

    def clear_cache(self):
        with self._lock:
            self._cache.clear()

    def _fetch_weather_sample(
        self,
        airport_code: str,
        target_time: datetime,
        force_refresh: bool = False,
    ) -> dict:
        airport_code = (airport_code or "").strip().upper()

        if not airport_code:
            return {
                "airport": None,
                "severity": 0.5,
                "available": False,
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "error": "Code aéroport absent",
            }

        target_time = ensure_utc(target_time) or datetime.now(timezone.utc)
        now_utc = datetime.now(timezone.utc)
        hours_ahead = (target_time - now_utc).total_seconds() / 3600

        # Ne jamais inventer une météo au-delà de la capacité réelle du fournisseur.
        if hours_ahead > WEATHER_PROVIDER_MAX_FORECAST_HOURS:
            return {
                "airport": airport_code,
                "severity": None,
                "available": False,
                "forecastAvailable": False,
                "fetchedAt": now_utc.isoformat(),
                "targetTime": target_time.isoformat(),
                "error": (
                    "Prévision météo détaillée indisponible au-delà de "
                    f"{WEATHER_PROVIDER_MAX_FORECAST_HOURS} h avec le fournisseur actuel."
                ),
            }

        key = self._cache_key(airport_code, target_time)
        now_ts = time.time()

        if not force_refresh:
            with self._lock:
                cached = self._cache.get(key)

            if cached and (now_ts - cached["cached_at"]) < WEATHER_CACHE_TTL_SECONDS:
                return cached["sample"]

        try:
            raw_severity = get_real_weather_severity(airport_code, target_time)
            severity = self._clamp(raw_severity)

            sample = {
                "airport": airport_code,
                "severity": severity,
                "available": True,
                "forecastAvailable": True,
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "targetTime": target_time.isoformat(),
                "error": None,
            }

        except Exception as exc:
            # Fail-safe : une panne du fournisseur météo ne doit pas être
            # interprétée comme "météo favorable".
            sample = {
                "airport": airport_code,
                "severity": 0.5,
                "available": False,
                "forecastAvailable": False,
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "targetTime": target_time.isoformat(),
                "error": str(exc),
            }

        with self._lock:
            self._cache[key] = {
                "cached_at": now_ts,
                "sample": sample,
            }

            if sample["available"]:
                self._history[airport_code].append(
                    {
                        "severity": sample["severity"],
                        "timestamp": now_ts,
                    }
                )

        return sample

    def _is_persistent_severe(self, airport_code: str) -> bool:
        """Détecte une météo sévère répétée sur les dernières mesures."""
        airport_code = (airport_code or "").strip().upper()

        with self._lock:
            history = list(self._history.get(airport_code, []))

        if len(history) < PERSISTENCE_SAMPLE_COUNT:
            return False

        recent = history[-PERSISTENCE_SAMPLE_COUNT:]

        return all(
            item["severity"] >= WEATHER_SEVERE_THRESHOLD
            for item in recent
        )

    @staticmethod
    def _forecast_confidence(minutes_to_departure: float) -> float:
        """
        Confiance indicative selon l'horizon.

        Important :
        la confiance baisse volontairement à mesure que l'on s'éloigne du
        départ. Une tendance J-30 ne doit jamais être présentée avec la même
        certitude qu'une alerte H-2.
        """
        if minutes_to_departure <= 0:
            return 0.98
        if minutes_to_departure <= 120:       # H-2
            return 0.95
        if minutes_to_departure <= 360:       # H-6
            return 0.90
        if minutes_to_departure <= 720:       # H-12
            return 0.82
        if minutes_to_departure <= 1440:      # J-1
            return 0.72
        if minutes_to_departure <= 72 * 60:   # J-3
            return 0.62
        if minutes_to_departure <= 168 * 60:  # J-7
            return 0.52
        if minutes_to_departure <= 336 * 60:  # J-14
            return 0.35
        if minutes_to_departure <= 720 * 60:  # J-30
            return 0.22
        return 0.10

    def _build_request_specs(
        self,
        dep_airport: str,
        arr_airport: str,
        dep_time: datetime,
        arr_time: datetime,
        stopovers=None,
    ) -> list[tuple[str, str, datetime]]:
        """
        Prépare les points météo à lire pour un vol, sans lancer d'appel réseau.
        """
        dep_time = ensure_utc(dep_time) or datetime.now(timezone.utc)
        arr_time = ensure_utc(arr_time) or (dep_time + timedelta(hours=2))

        stopover_codes = parse_stopover_codes(stopovers)

        total_seconds = max(
            1,
            (arr_time - dep_time).total_seconds(),
        )

        specs = [
            ("departure", dep_airport, dep_time),
            ("arrival", arr_airport, arr_time),
        ]

        for index, airport in enumerate(stopover_codes, start=1):
            ratio = index / (len(stopover_codes) + 1)
            stop_time = dep_time + timedelta(
                seconds=total_seconds * ratio
            )
            specs.append(
                (f"stopover_{index}", airport, stop_time)
            )

        return specs

    def build_long_range_assessment(
        self,
        dep_airport: str,
        arr_airport: str,
        dep_time: datetime,
        arr_time: datetime,
        stopovers=None,
    ) -> dict:
        """
        Evaluation J-30 → J-7.

        Si le fournisseur météo ne sait pas réellement prévoir aussi loin,
        on ne fabrique PAS de score. On retourne une tendance stratégique
        explicite avec une faible confiance et une date de prochaine revue.

        Si WEATHER_PROVIDER_MAX_FORECAST_HOURS est configuré à 720 et que
        get_real_weather_severity supporte cet horizon, assess_flight utilisera
        les vraies données du fournisseur.
        """
        dep_time = ensure_utc(dep_time) or datetime.now(timezone.utc)
        now_utc = datetime.now(timezone.utc)

        minutes_to_departure = (
            dep_time - now_utc
        ).total_seconds() / 60

        phase = get_forecast_phase(minutes_to_departure)

        return {
            "engine": "weather-risk-hybrid-v4-lifecycle",
            "evaluatedAt": now_utc.isoformat(),
            "score": None,
            "riskLevel": "UNKNOWN",
            "riskLabel": "Tendance long terme",
            "confidence": self._forecast_confidence(
                minutes_to_departure
            ),
            "dataAvailable": False,
            "forecastAvailable": False,
            "persistentSevere": False,
            "minutesToDeparture": round(
                minutes_to_departure,
                1,
            ),
            "forecastPhase": phase["phase"],
            "forecastPhaseLabel": phase["label"],
            "refreshAfterSeconds": phase[
                "refreshAfterSeconds"
            ],
            "nextReviewAt": build_next_review_time(
                now_utc,
                phase["refreshAfterSeconds"],
            ),
            "canAffectStatus": False,
            "recommendedAction": "LONG_RANGE_MONITOR",
            "recommendedActionLabel": "Surveillance stratégique",
            "explanation": (
                "Le vol est encore au-delà de l'horizon de prévision détaillée "
                f"du fournisseur ({WEATHER_PROVIDER_MAX_FORECAST_HOURS} h). "
                "Aucune décision opérationnelle ne doit être prise à partir "
                "d'une fausse précision. Le vol sera automatiquement "
                "réévalué à l'approche de J-7, puis J-1 et H-2."
            ),
            "departure": {
                "airport": dep_airport,
                "severity": None,
                "available": False,
                "forecastAvailable": False,
            },
            "arrival": {
                "airport": arr_airport,
                "severity": None,
                "available": False,
                "forecastAvailable": False,
            },
            "stopovers": [
                {
                    "airport": code,
                    "severity": None,
                    "available": False,
                    "forecastAvailable": False,
                }
                for code in parse_stopover_codes(stopovers)
            ],
        }

    def _build_assessment_from_samples(
        self,
        dep_airport: str,
        dep_time: datetime,
        samples: dict,
    ) -> dict:
        """
        Calcule le risque IA à partir d'échantillons déjà récupérés.
        Cette séparation permet le traitement bulk sans appels météo dupliqués.
        """
        dep_time = ensure_utc(dep_time) or datetime.now(timezone.utc)
        now_utc = datetime.now(timezone.utc)

        departure_sample = samples.get(
            "departure",
            {
                "severity": 0.5,
                "available": False,
                "airport": dep_airport,
            },
        )

        arrival_sample = samples.get(
            "arrival",
            {
                "severity": 0.5,
                "available": False,
                "airport": None,
            },
        )

        stopover_samples = [
            value
            for key, value in samples.items()
            if key.startswith("stopover_")
        ]

        dep_risk = self._clamp(departure_sample.get("severity"))
        arr_risk = self._clamp(arrival_sample.get("severity"))

        stop_risk = (
            max(
                self._clamp(sample.get("severity"))
                for sample in stopover_samples
            )
            if stopover_samples
            else 0.0
        )

        if stopover_samples:
            weighted_risk = (
                dep_risk * 0.55
                + arr_risk * 0.30
                + stop_risk * 0.15
            )
        else:
            weighted_risk = dep_risk * 0.65 + arr_risk * 0.35

        all_risks = [dep_risk, arr_risk] + [
            self._clamp(sample.get("severity"))
            for sample in stopover_samples
        ]

        max_risk = max(all_risks)

        overall_risk = round(
            self._clamp(
                max(
                    weighted_risk,
                    max_risk * 0.90,
                )
            ),
            3,
        )

        minutes_to_departure = (
            dep_time - now_utc
        ).total_seconds() / 60

        forecast_phase = get_forecast_phase(
            minutes_to_departure
        )

        confidence = self._forecast_confidence(
            minutes_to_departure
        )

        data_available = all(
            sample.get("available", False)
            for sample in samples.values()
        )

        if not data_available:
            confidence = max(
                0.20,
                confidence - 0.25,
            )

        persistent_severe = self._is_persistent_severe(
            dep_airport
        )

        if overall_risk >= WEATHER_EXTREME_THRESHOLD:
            risk_level = "EXTREME"
            risk_label = "Extrême"
        elif overall_risk >= WEATHER_SEVERE_THRESHOLD:
            risk_level = "SEVERE"
            risk_label = "Sévère"
        elif overall_risk >= WEATHER_DELAY_THRESHOLD:
            risk_level = "HIGH"
            risk_label = "Élevé"
        elif overall_risk >= WEATHER_MONITOR_THRESHOLD:
            risk_level = "MODERATE"
            risk_label = "Modéré"
        else:
            risk_level = "LOW"
            risk_label = "Faible"

        phase_name = forecast_phase["phase"]

        if not data_available:
            action = "WEATHER_DATA_UNAVAILABLE"
            action_label = "Vérification météo requise"
            explanation = (
                "Une ou plusieurs données météo sont indisponibles."
            )

        # H-2 → départ : seul horizon autorisé à influencer automatiquement
        # le statut via determine_operational_status().
        elif phase_name == "OPERATIONAL":
            if (
                overall_risk >= WEATHER_EXTREME_THRESHOLD
                and minutes_to_departure <= 90
                and persistent_severe
            ):
                action = "GROUND_HOLD_REVIEW"
                action_label = "Maintien au sol à évaluer"
                explanation = (
                    "Risque météo extrême et persistant proche du départ."
                )
            elif overall_risk >= WEATHER_SEVERE_THRESHOLD:
                action = "DELAY_REVIEW"
                action_label = "Retard à évaluer"
                explanation = (
                    "Conditions météo sévères dans la fenêtre H-2."
                )
            elif overall_risk >= WEATHER_DELAY_THRESHOLD:
                action = "REROUTE_OR_DELAY"
                action_label = "Reroutage / retard à étudier"
                explanation = (
                    "Risque météo élevé dans la fenêtre opérationnelle."
                )
            elif overall_risk >= WEATHER_MONITOR_THRESHOLD:
                action = "MONITOR"
                action_label = "Surveillance renforcée"
                explanation = (
                    "Risque météo modéré à proximité du départ."
                )
            else:
                action = "NORMAL"
                action_label = "Conditions acceptables"
                explanation = (
                    "Aucune contrainte météo majeure détectée."
                )

        # J-1 → H-2 : pas de statut automatique ; recommandation tactique.
        elif phase_name == "TACTICAL":
            if overall_risk >= WEATHER_SEVERE_THRESHOLD:
                action = "TACTICAL_REVIEW"
                action_label = "Préparer scénario de perturbation"
                explanation = (
                    "Risque météo sévère avant la fenêtre H-2. "
                    "Préparer un nouveau créneau, un reroutage ou une "
                    "réaffectation sans modifier automatiquement le statut."
                )
            elif overall_risk >= WEATHER_MONITOR_THRESHOLD:
                action = "MONITOR"
                action_label = "Surveillance tactique"
                explanation = (
                    "Conditions à surveiller jusqu'à l'entrée en fenêtre H-2."
                )
            else:
                action = "NORMAL"
                action_label = "Conditions acceptables"
                explanation = (
                    "Aucune contrainte majeure détectée à J-1."
                )

        # J-7 → J-1 : anticipation planning.
        elif phase_name == "PLANNING":
            if overall_risk >= WEATHER_DELAY_THRESHOLD:
                action = "PLANNING_REVIEW"
                action_label = "Réviser le planning"
                explanation = (
                    "Signal météo significatif à moyen terme. "
                    "Comparer des créneaux ou routes alternatives."
                )
            elif overall_risk >= WEATHER_MONITOR_THRESHOLD:
                action = "MONITOR"
                action_label = "Surveillance planning"
                explanation = (
                    "Tendance météo à surveiller jusqu'à J-1."
                )
            else:
                action = "NORMAL"
                action_label = "Planning maintenu"
                explanation = (
                    "Aucun signal météo majeur sur l'horizon J-7 → J-1."
                )

        else:
            # STRATEGIC devrait normalement passer par build_long_range_assessment,
            # mais ce fallback reste conservateur.
            action = "LONG_RANGE_MONITOR"
            action_label = "Surveillance stratégique"
            explanation = (
                "Horizon long terme : aucune décision opérationnelle automatique."
            )

        return {
            "engine": "weather-risk-hybrid-v4-lifecycle",
            "evaluatedAt": now_utc.isoformat(),
            "score": overall_risk,
            "riskLevel": risk_level,
            "riskLabel": risk_label,
            "confidence": round(confidence, 2),
            "dataAvailable": data_available,
            "persistentSevere": persistent_severe,
            "minutesToDeparture": round(
                minutes_to_departure,
                1,
            ),
            "forecastPhase": forecast_phase["phase"],
            "forecastPhaseLabel": forecast_phase["label"],
            "refreshAfterSeconds": forecast_phase[
                "refreshAfterSeconds"
            ],
            "nextReviewAt": build_next_review_time(
                now_utc,
                forecast_phase["refreshAfterSeconds"],
            ),
            "canAffectStatus": forecast_phase[
                "canAffectStatus"
            ],
            "recommendedAction": action,
            "recommendedActionLabel": action_label,
            "explanation": explanation,
            "departure": departure_sample,
            "arrival": arrival_sample,
            "stopovers": stopover_samples,
        }

    def build_skipped_assessment(
        self,
        reason: str,
        score: float = 0.0,
    ) -> dict:
        now_utc = datetime.now(timezone.utc)

        return {
            "engine": "weather-risk-hybrid-v4-lifecycle",
            "evaluatedAt": now_utc.isoformat(),
            "score": score,
            "riskLevel": "SKIPPED",
            "riskLabel": "Non évalué",
            "confidence": 0.0,
            "dataAvailable": True,
            "forecastAvailable": False,
            "persistentSevere": False,
            "forecastPhase": "OUT_OF_RANGE",
            "forecastPhaseLabel": "> J-30",
            "refreshAfterSeconds": 24 * 3600,
            "nextReviewAt": build_next_review_time(
                now_utc,
                24 * 3600,
            ),
            "canAffectStatus": False,
            "recommendedAction": "NONE",
            "recommendedActionLabel": "Aucune évaluation requise",
            "explanation": reason,
            "departure": None,
            "arrival": None,
            "stopovers": [],
        }

    def assess_many_flights(
        self,
        flights,
        force_refresh: bool = False,
    ) -> dict:
        """
        Évalue plusieurs vols en un seul batch.

        Optimisations clés :
        1. pas de ThreadPoolExecutor imbriqué ;
        2. déduplication (aéroport + heure de prévision) ;
        3. maximum 4 workers ;
        4. vols terminés/annulés ignorés ;
        5. vols > 7 jours ignorés jusqu'à ce qu'ils deviennent pertinents.
        """
        now_utc = datetime.now(timezone.utc)

        flight_specs = {}
        unique_requests = {}

        for flight in flights:
            flight_id = str(flight.id)

            dep_utc = ensure_utc(flight.heureDepart)
            arr_utc = ensure_utc(flight.heureArrivee)
            current_status = getattr(
                flight,
                "statut",
                None,
            )

            if (
                WEATHER_SKIP_PAST_COMPLETED
                and current_status in [
                    "Effectué",
                    "Done",
                    "Cancelled",
                ]
            ):
                flight_specs[flight_id] = {
                    "skip": self.build_skipped_assessment(
                        "Vol terminé ou annulé : appel météo inutile."
                    )
                }
                continue

            if (
                dep_utc
                and dep_utc
                > now_utc
                + timedelta(
                    hours=WEATHER_LONG_RANGE_MAX_HOURS
                )
            ):
                flight_specs[flight_id] = {
                    "skip": self.build_skipped_assessment(
                        "Vol au-delà de J-30 : évaluation météo reportée."
                    )
                }
                continue

            if dep_utc:
                hours_to_departure = (
                    dep_utc - now_utc
                ).total_seconds() / 3600

                if (
                    hours_to_departure
                    > WEATHER_PROVIDER_MAX_FORECAST_HOURS
                ):
                    flight_specs[flight_id] = {
                        "skip": self.build_long_range_assessment(
                            dep_airport=flight.aeroportDepart,
                            arr_airport=flight.aeroportArrivee,
                            dep_time=dep_utc,
                            arr_time=arr_utc,
                            stopovers=getattr(
                                flight,
                                "aeroportEscale",
                                None,
                            ),
                        )
                    }
                    continue

            specs = self._build_request_specs(
                flight.aeroportDepart,
                flight.aeroportArrivee,
                dep_utc,
                arr_utc,
                getattr(
                    flight,
                    "aeroportEscale",
                    None,
                ),
            )

            flight_specs[flight_id] = {
                "dep_airport": flight.aeroportDepart,
                "dep_time": dep_utc,
                "specs": specs,
            }

            for label, airport, target_time in specs:
                cache_key = self._cache_key(
                    airport,
                    target_time,
                )

                if cache_key not in unique_requests:
                    unique_requests[cache_key] = (
                        airport,
                        target_time,
                    )

        fetched_by_key = {}

        if unique_requests:
            with ThreadPoolExecutor(
                max_workers=min(
                    WEATHER_PARALLEL_WORKERS,
                    len(unique_requests),
                )
            ) as executor:
                future_map = {
                    executor.submit(
                        self._fetch_weather_sample,
                        airport,
                        target_time,
                        force_refresh,
                    ): cache_key
                    for cache_key, (
                        airport,
                        target_time,
                    ) in unique_requests.items()
                }

                for future in as_completed(future_map):
                    cache_key = future_map[future]

                    try:
                        fetched_by_key[
                            cache_key
                        ] = future.result()
                    except Exception as exc:
                        airport, target_time = (
                            unique_requests[cache_key]
                        )

                        fetched_by_key[
                            cache_key
                        ] = {
                            "airport": airport,
                            "severity": 0.5,
                            "available": False,
                            "fetchedAt": now_utc.isoformat(),
                            "targetTime": (
                                ensure_utc(
                                    target_time
                                ).isoformat()
                                if target_time
                                else None
                            ),
                            "error": str(exc),
                        }

        results = {}

        for flight_id, data in flight_specs.items():
            if "skip" in data:
                results[flight_id] = data["skip"]
                continue

            samples = {}

            for label, airport, target_time in data["specs"]:
                samples[label] = fetched_by_key.get(
                    self._cache_key(
                        airport,
                        target_time,
                    ),
                    {
                        "airport": airport,
                        "severity": 0.5,
                        "available": False,
                        "error": "Échantillon météo absent",
                    },
                )

            results[flight_id] = (
                self._build_assessment_from_samples(
                    data["dep_airport"],
                    data["dep_time"],
                    samples,
                )
            )

        return results

    def assess_flight(
        self,
        dep_airport: str,
        arr_airport: str,
        dep_time: datetime,
        arr_time: datetime,
        stopovers=None,
        force_refresh: bool = False,
    ) -> dict:
        """
        Évaluation unitaire utilisée par POST / PUT.

        Pour un seul vol, les 2 à 4 appels météo sont exécutés séquentiellement :
        cela évite de créer un nouveau pool de threads pour chaque requête Flask.
        Le cache 180 s maintient généralement ces lectures très rapides.
        """
        dep_time = ensure_utc(dep_time) or datetime.now(timezone.utc)
        arr_time = ensure_utc(arr_time) or (dep_time + timedelta(hours=2))

        now_utc = datetime.now(timezone.utc)
        hours_to_departure = (
            dep_time - now_utc
        ).total_seconds() / 3600

        # J-30 → J-7 :
        # si le fournisseur ne couvre pas cet horizon, on retourne une
        # tendance stratégique sans inventer de score météo.
        if (
            hours_to_departure > WEATHER_PROVIDER_MAX_FORECAST_HOURS
            and hours_to_departure <= WEATHER_LONG_RANGE_MAX_HOURS
        ):
            return self.build_long_range_assessment(
                dep_airport=dep_airport,
                arr_airport=arr_airport,
                dep_time=dep_time,
                arr_time=arr_time,
                stopovers=stopovers,
            )

        if hours_to_departure > WEATHER_LONG_RANGE_MAX_HOURS:
            return self.build_skipped_assessment(
                "Vol au-delà de J-30 : aucune évaluation météo utile pour le moment."
            )

        specs = self._build_request_specs(
            dep_airport,
            arr_airport,
            dep_time,
            arr_time,
            stopovers,
        )

        samples = {}

        for label, airport, target_time in specs:
            samples[label] = self._fetch_weather_sample(
                airport,
                target_time,
                force_refresh,
            )

        return self._build_assessment_from_samples(
            dep_airport,
            dep_time,
            samples,
        )


weather_engine = WeatherRiskEngine()


def determine_operational_status(
    current_status: str,
    dep_time: datetime,
    arr_time: datetime,
    weather_assessment: dict,
) -> str:
    """
    Détermine un statut opérationnel conservateur.

    Changements automatiques autorisés :
    - arrivée passée -> Effectué
    - départ passé -> In-Flight
    - météo sévère proche -> Delayed

    Annulation automatique météo supprimée :
    une annulation doit être une décision métier explicite.
    """
    current_status = current_status or "Scheduled"
    dep_time = ensure_utc(dep_time)
    arr_time = ensure_utc(arr_time)
    now_utc = datetime.now(timezone.utc)

    if current_status in ["Cancelled", "Annulé"]:
        return "Cancelled"

    if arr_time and arr_time < now_utc:
        return "Effectué"

    if dep_time and dep_time <= now_utc:
        if current_status not in ["Effectué", "Done", "Cancelled"]:
            return "In-Flight"
        return current_status

    action = weather_assessment.get("recommendedAction")
    minutes_to_departure = weather_assessment.get(
        "minutesToDeparture",
        99999,
    )
    can_affect_status = weather_assessment.get(
        "canAffectStatus",
        minutes_to_departure <= 120,
    )

    if (
        can_affect_status
        and action in ["GROUND_HOLD_REVIEW", "DELAY_REVIEW"]
        and minutes_to_departure <= 120
        and current_status not in ["Cancelled", "Effectué"]
    ):
        return "Delayed"

    return current_status


def build_flight_weather_assessment(flight, force_refresh=False) -> dict:
    dep_utc = ensure_utc(flight.heureDepart)
    arr_utc = ensure_utc(flight.heureArrivee)

    stopovers = getattr(flight, "aeroportEscale", None)

    return weather_engine.assess_flight(
        dep_airport=flight.aeroportDepart,
        arr_airport=flight.aeroportArrivee,
        dep_time=dep_utc,
        arr_time=arr_utc,
        stopovers=stopovers,
        force_refresh=force_refresh,
    )


def build_route_string(flight) -> str:
    route_points = [flight.aeroportDepart]

    stopovers = parse_stopover_codes(
        getattr(flight, "aeroportEscale", None)
    )

    route_points.extend(stopovers)
    route_points.append(flight.aeroportArrivee)

    return " ➔ ".join(route_points)


def build_legs_payload(flight) -> list[dict]:
    legs_payload = []

    if hasattr(flight, "legs") and flight.legs:
        for leg in flight.legs:
            legs_payload.append(
                {
                    "numeroVol": getattr(
                        leg,
                        "numeroVol",
                        flight.numeroVol,
                    ),
                    "aeroportDepart": leg.aeroportDepart,
                    "aeroportArrivee": leg.aeroportArrivee,
                    "heureDepart": (
                        ensure_utc(leg.heureDepart).isoformat()
                        if leg.heureDepart
                        else None
                    ),
                    "heureArrivee": (
                        ensure_utc(leg.heureArrivee).isoformat()
                        if leg.heureArrivee
                        else None
                    ),
                }
            )

    return legs_payload


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

            if (
                assessment.get("score", 0)
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
            key=lambda item: item["weatherAI"].get(
                "score",
                0,
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
                    item["weatherAI"].get("score")
                    if isinstance(
                        item["weatherAI"].get("score"),
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
                    "weatherSeverity": weather_assessment.get(
                        "score"
                    ),
                    "weatherAI": weather_assessment,
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
                    "weatherSeverity": weather_assessment.get(
                        "score"
                    ),
                    "weatherAI": weather_assessment,
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