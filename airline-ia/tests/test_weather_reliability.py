import asyncio
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

import requests

from main import OptimizeRequest, predict_and_optimize_flights
from services.weather.api_provider import api_weather_provider
from services.weather.resilient_service import _clamp
from services.weather.risk_engine import WeatherRiskEngine

get_real_weather_severity = api_weather_provider._resolve()
weather_data_unavailable = get_real_weather_severity.__globals__[
    "WeatherDataUnavailable"
]
weather_requests = get_real_weather_severity.__globals__["requests"]


class WeatherProviderTests(unittest.TestCase):
    def test_invalid_numeric_weather_prediction_is_rejected(self):
        for value in (float("nan"), float("inf"), None, "invalid"):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    _clamp(value)

    def test_severe_weather_code_produces_high_risk(self):
        with patch.object(weather_requests, "get") as get:
            get.return_value = Mock(
                json=lambda: {
                    "hourly": {
                        "time": ["2026-01-01T12:00"],
                        "precipitation": [0],
                        "wind_speed_10m": [10],
                        "wind_gusts_10m": [20],
                        "visibility": [10000],
                        "weather_code": [95],
                    }
                },
                raise_for_status=Mock(),
            )

            score = get_real_weather_severity(
                "TNR", datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
            )

        self.assertGreaterEqual(score, 0.9)
        self.assertLessEqual(score, 1.0)
        self.assertEqual(get.call_args.kwargs["params"]["timezone"], "UTC")

    def test_api_unavailable_is_not_reported_as_low_risk(self):
        with patch.object(
            weather_requests, "get", side_effect=requests.ConnectionError("offline")
        ):
            with self.assertRaises(weather_data_unavailable):
                get_real_weather_severity(
                    "TNR", datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
                )

    def test_missing_hourly_variable_is_reported_as_unavailable(self):
        with patch.object(weather_requests, "get") as get:
            get.return_value = Mock(
                json=lambda: {
                    "hourly": {
                        "time": ["2026-01-01T12:00"],
                        "precipitation": [0],
                    }
                },
                raise_for_status=Mock(),
            )

            with self.assertRaisesRegex(
                weather_data_unavailable, "absente ou incohérente"
            ):
                get_real_weather_severity(
                    "TNR", datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
                )
    def test_unavailable_data_returns_unknown_not_an_invented_score(self):
        engine = WeatherRiskEngine()
        result = engine._build_assessment_from_samples(
            "TNR",
            datetime.now(timezone.utc),
            {
                "departure": {
                    "severity": None,
                    "available": False,
                    "source": "UNAVAILABLE",
                    "sourceConfidence": 0.0,
                    "trustedForAutomaticStatus": False,
                    "degraded": True,
                },
                "arrival": {
                    "severity": 0.95,
                    "available": True,
                    "source": "API",
                    "sourceConfidence": 0.95,
                    "trustedForAutomaticStatus": True,
                    "degraded": False,
                },
            },
        )

        self.assertIsNone(result["score"])
        self.assertEqual(result["riskLevel"], "UNKNOWN")
        self.assertEqual(result["confidence"], 0.0)
        self.assertEqual(result["recommendedAction"], "WEATHER_DATA_UNAVAILABLE")
        self.assertFalse(result["canAffectStatus"])

    def test_high_weather_risk_is_classified_when_all_samples_are_available(self):
        engine = WeatherRiskEngine()
        result = engine._build_assessment_from_samples(
            "TNR",
            datetime.now(timezone.utc),
            {
                "departure": {
                    "severity": 0.95,
                    "available": True,
                    "source": "API",
                    "sourceConfidence": 0.95,
                    "trustedForAutomaticStatus": True,
                    "degraded": False,
                },
                "arrival": {
                    "severity": 0.95,
                    "available": True,
                    "source": "API",
                    "sourceConfidence": 0.95,
                    "trustedForAutomaticStatus": True,
                    "degraded": False,
                },
            },
        )

        self.assertGreaterEqual(result["score"], 0.85)
        self.assertEqual(result["riskLevel"], "EXTREME")
        self.assertTrue(result["dataAvailable"])


class DeterministicAdvisoryTests(unittest.TestCase):
    def test_weather_recommendation_is_repeatable_and_does_not_cancel(self):
        payload = OptimizeRequest.model_validate(
            {
                "turnaround_minutes": 45,
                "flights": [
                    {
                        "refFlight": "flight-1",
                        "refAircraft": "aircraft-1",
                        "departure_time": "2026-01-01T12:00:00+00:00",
                        "arrival_time": "2026-01-01T14:00:00+00:00",
                        "status": "Scheduled",
                        "ai_features": {
                            "traffic_density": 0.2,
                            "weather_severity": 0.95,
                            "weather_available": True,
                            "is_weekend": 0,
                        },
                    }
                ],
            }
        )

        first = asyncio.run(predict_and_optimize_flights(payload))
        second = asyncio.run(predict_and_optimize_flights(payload))

        self.assertEqual(first, second)
        self.assertEqual(first["status"], "ADVISORY_ONLY")
        self.assertEqual(first["optimized_flights"][0]["status"], "Scheduled")
        self.assertEqual(
            first["optimized_flights"][0]["recommendation"], "WEATHER_REVIEW"
        )

    def test_high_weather_risk_advisory_is_deterministic(self):
        payload = OptimizeRequest.model_validate(
            {
                "turnaround_minutes": 45,
                "flights": [
                    {
                        "refFlight": "flight-1",
                        "refAircraft": "aircraft-1",
                        "departure_time": "2026-01-01T12:00:00+00:00",
                        "arrival_time": "2026-01-01T14:00:00+00:00",
                        "status": "Scheduled",
                        "ai_features": {
                            "traffic_density": 0.2,
                            "weather_severity": 0.95,
                            "weather_available": True,
                            "is_weekend": 0,
                        },
                    }
                ],
            }
        )

        first = asyncio.run(predict_and_optimize_flights(payload))
        second = asyncio.run(predict_and_optimize_flights(payload))

        self.assertEqual(first, second)
        self.assertEqual(first["optimized_flights"][0]["recommendation"], "WEATHER_REVIEW")
        self.assertEqual(first["optimized_flights"][0]["status"], "Scheduled")

    def test_out_of_range_weather_input_is_rejected(self):
        with self.assertRaises(ValueError):
            OptimizeRequest.model_validate(
                {
                    "turnaround_minutes": 45,
                    "flights": [
                        {
                            "refFlight": "flight-1",
                            "refAircraft": "aircraft-1",
                            "departure_time": "2026-01-01T12:00:00+00:00",
                            "arrival_time": "2026-01-01T14:00:00+00:00",
                            "status": "Scheduled",
                            "ai_features": {
                                "traffic_density": 0.2,
                                "weather_severity": 1.1,
                                "weather_available": True,
                                "is_weekend": 0,
                            },
                        }
                    ],
                }
            )

    def test_unavailable_weather_requires_review_not_a_low_risk_advisory(self):
        payload = OptimizeRequest.model_validate(
            {
                "turnaround_minutes": 45,
                "flights": [
                    {
                        "refFlight": "flight-1",
                        "refAircraft": "aircraft-1",
                        "departure_time": "2026-01-01T12:00:00+00:00",
                        "arrival_time": "2026-01-01T14:00:00+00:00",
                        "status": "Scheduled",
                        "ai_features": {
                            "traffic_density": 0.1,
                            "weather_severity": 0.1,
                            "weather_available": False,
                            "is_weekend": 0,
                        },
                    }
                ],
            }
        )

        result = asyncio.run(predict_and_optimize_flights(payload))

        self.assertEqual(
            result["optimized_flights"][0]["recommendation"],
            "WEATHER_DATA_UNAVAILABLE",
        )
        self.assertEqual(result["optimized_flights"][0]["status"], "Scheduled")
