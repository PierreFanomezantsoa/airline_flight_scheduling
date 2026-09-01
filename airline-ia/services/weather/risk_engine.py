"""Moteur de risque météo indépendant de Flask et des routes HTTP."""
from __future__ import annotations

import os
import time
import threading
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta

from common.datetime_utils import ensure_utc
from services.flights.helpers import parse_stopover_codes
from services.weather.resilient_service import resilient_weather_service
from config.weather import (
    WEATHER_CACHE_TTL_SECONDS,
    WEATHER_HISTORY_SIZE,
    WEATHER_PARALLEL_WORKERS,
    WEATHER_SKIP_PAST_COMPLETED,
    WEATHER_PROVIDER_MAX_FORECAST_HOURS,
    WEATHER_LONG_RANGE_MAX_HOURS,
    WEATHER_PLANNING_MAX_HOURS,
    WEATHER_TACTICAL_MAX_HOURS,
    WEATHER_OPERATIONAL_MAX_HOURS,
    WEATHER_REFRESH_STRATEGIC_SECONDS,
    WEATHER_REFRESH_PLANNING_SECONDS,
    WEATHER_REFRESH_TACTICAL_SECONDS,
    WEATHER_REFRESH_OPERATIONAL_SECONDS,
    WEATHER_MONITOR_THRESHOLD,
    WEATHER_DELAY_THRESHOLD,
    WEATHER_SEVERE_THRESHOLD,
    WEATHER_EXTREME_THRESHOLD,
    PERSISTENCE_SAMPLE_COUNT,
)

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

        # Source météo résiliente : API principale -> ML local -> cache stale.
        # Le contrat reste identique pour le reste du moteur, avec en plus
        # la provenance et le niveau de confiance de la donnée.
        result = resilient_weather_service.get_severity(
            airport_code,
            target_time,
        )
        severity = self._clamp(result.get("severity", 0.5))

        sample = {
            "airport": airport_code,
            "severity": severity,
            "available": result.get("available", False),
            "forecastAvailable": result.get("forecastAvailable", False),
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "targetTime": target_time.isoformat(),
            "source": result.get("source", "UNAVAILABLE"),
            "sourceConfidence": result.get("confidence", 0.0),
            "degraded": result.get("degraded", True),
            "trustedForAutomaticStatus": result.get(
                "trustedForAutomaticStatus", False
            ),
            "apiAvailable": result.get("apiAvailable", False),
            "mlAvailable": result.get("mlAvailable", False),
            "error": result.get("error"),
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

        # Provenance agrégée : si une seule étape vient du ML/cache, le vol
        # est considéré en mode dégradé et ne peut pas changer automatiquement
        # de statut sur la seule base de cette estimation.
        sample_values = list(samples.values())
        source_set = {
            sample.get("source", "UNAVAILABLE")
            for sample in sample_values
        }
        if source_set == {"API"}:
            weather_source = "API"
        elif "LOCAL_ML" in source_set:
            weather_source = "LOCAL_ML"
        elif "STALE_API_CACHE" in source_set:
            weather_source = "STALE_API_CACHE"
        else:
            weather_source = "MIXED" if len(source_set) > 1 else next(iter(source_set))

        source_confidences = [
            float(sample.get("sourceConfidence", 0.0) or 0.0)
            for sample in sample_values
        ]
        source_confidence = min(source_confidences) if source_confidences else 0.0
        confidence = min(confidence, source_confidence or confidence)

        trusted_for_automatic_status = bool(sample_values) and all(
            sample.get("trustedForAutomaticStatus", False)
            for sample in sample_values
        )
        degraded_mode = any(
            sample.get("degraded", False)
            for sample in sample_values
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
            "canAffectStatus": (
                forecast_phase["canAffectStatus"]
                and trusted_for_automatic_status
            ),
            "weatherSource": weather_source,
            "weatherSourceConfidence": round(source_confidence, 2),
            "degradedMode": degraded_mode,
            "trustedForAutomaticStatus": trusted_for_automatic_status,
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


