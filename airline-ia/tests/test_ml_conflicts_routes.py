import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from flask import Flask

from routes import ml_conflicts_routes


class OptimizeFlightsTests(unittest.TestCase):
    def test_optimization_uses_ref_flight_for_each_conflict_shape(self):
        cases = [
            (
                "unassigned flight",
                {
                    "type": "UNASSIGNED_AIRCRAFT",
                    "flightA": {"refFlight": "flight-a"},
                    "flightB": None,
                    "reason": "Aircraft is not assigned.",
                },
                "flight-a",
            ),
            (
                "second flight in a conflict",
                {
                    "type": "AIRCRAFT_OVERLAP",
                    "flightA": {"refFlight": "flight-a"},
                    "flightB": {"refFlight": "flight-b"},
                    "reason": "Flights overlap.",
                },
                "flight-b",
            ),
        ]

        app = Flask(__name__)
        for name, conflict, expected_flight_id in cases:
            with self.subTest(name=name):
                target_flight = SimpleNamespace(
                    refFlight=expected_flight_id,
                    flightNumber=expected_flight_id.upper(),
                    refAircraft="aircraft-current",
                    aircraft=None,
                )
                session = Mock()
                session.get.return_value = target_flight
                fake_flight = type(
                    "FakeFlight",
                    (),
                    {"query": SimpleNamespace(all=Mock(return_value=[target_flight]))},
                )

                with (
                    app.app_context(),
                    patch.object(ml_conflicts_routes, "Flight", fake_flight),
                    patch.object(
                        ml_conflicts_routes,
                        "db",
                        SimpleNamespace(session=session),
                    ),
                    patch.object(
                        ml_conflicts_routes,
                        "detect_conflicts",
                        side_effect=[[conflict], []],
                    ),
                    patch.object(
                        ml_conflicts_routes,
                        "find_replacement_aircraft",
                        return_value=None,
                    ),
                ):
                    response, status = (
                        ml_conflicts_routes.optimize_flights.__wrapped__()
                    )

                self.assertEqual(status, 200)
                self.assertEqual(
                    response.get_json()["details"][0]["status"],
                    "UNRESOLVED",
                )
                session.get.assert_called_once_with(
                    fake_flight,
                    expected_flight_id,
                )


if __name__ == "__main__":
    unittest.main()
