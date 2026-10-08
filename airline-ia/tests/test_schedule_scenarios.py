import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from routes.automatic_schedule_routes import generate_schedule_scenario


class AutomaticScheduleScenarioTests(unittest.TestCase):
    def setUp(self):
        self.departure = datetime(2026, 1, 1, 8, tzinfo=timezone.utc)

    def make_aircraft(self, aircraft_id="aircraft-1", hours=0):
        return SimpleNamespace(
            refAircraft=aircraft_id,
            registration=aircraft_id,
            aircraftStatus="Active",
            homeBase="TNR",
            hoursSinceMaintenance=hours,
            maintenanceHoursLimit=100,
        )

    def make_flight(
        self,
        flight_id,
        departure,
        arrival,
        origin="TNR",
        destination="NOS",
        stopover=None,
        stopover_minutes=None,
    ):
        return SimpleNamespace(
            refFlight=flight_id,
            flightNumber=flight_id.upper(),
            departureAirportCode=origin,
            stopoverAirportCodes=stopover,
            stopoverDurationMinutes=stopover_minutes,
            arrivalAirportCode=destination,
            departureTime=departure,
            arrivalTime=arrival,
            flightStatus="Scheduled",
        )

    def run_scenario(self, flights, aircrafts, **options):
        maintenance = {str(aircraft.refAircraft): [] for aircraft in aircrafts}
        with patch(
            "routes.automatic_schedule_routes.maintenance_slots_for_aircrafts_bulk",
            return_value=maintenance,
        ):
            return generate_schedule_scenario(flights, aircrafts, **options)

    def test_flight_without_conflict_is_assigned(self):
        flight = self.make_flight(
            "flight-1", self.departure, self.departure + timedelta(hours=2)
        )

        result = self.run_scenario([flight], [self.make_aircraft()])

        self.assertEqual(result["status"], "FEASIBLE")
        self.assertEqual(result["metrics"]["assignedFlights"], 1)
        self.assertEqual(result["metrics"]["unassignedFlights"], 0)
        self.assertEqual(result["assignments"][0]["shiftMinutes"], 0)

    def test_overlapping_flight_is_not_assigned_to_same_aircraft(self):
        aircraft = self.make_aircraft()
        flights = [
            self.make_flight(
                "flight-1", self.departure, self.departure + timedelta(hours=2)
            ),
            self.make_flight(
                "flight-2",
                self.departure + timedelta(hours=1),
                self.departure + timedelta(hours=3),
            ),
        ]

        result = self.run_scenario(
            flights, [aircraft], max_shift_minutes=0
        )

        self.assertEqual(result["metrics"]["assignedFlights"], 1)
        self.assertEqual(result["unassigned"][0]["reason"], "AIRCRAFT_OVERLAP")

    def test_insufficient_turnaround_is_shifted_to_first_feasible_slot(self):
        first = self.make_flight(
            "flight-1", self.departure, self.departure + timedelta(hours=2),
            destination="NOS",
        )
        second_departure = self.departure + timedelta(hours=2, minutes=30)
        second = self.make_flight(
            "flight-2",
            second_departure,
            second_departure + timedelta(hours=1),
            origin="NOS",
        )

        result = self.run_scenario(
            [first, second],
            [self.make_aircraft()],
            turnaround_minutes=45,
            shift_step_minutes=15,
            max_shift_minutes=60,
        )

        self.assertEqual(result["metrics"]["assignedFlights"], 2)
        self.assertEqual(result["assignments"][1]["shiftMinutes"], 15)

    def test_maintenance_window_blocks_aircraft_use(self):
        aircraft = self.make_aircraft()
        flight = self.make_flight(
            "flight-1",
            self.departure,
            self.departure + timedelta(hours=2),
        )
        maintenance = {
            "aircraft-1": [
                (
                    self.departure + timedelta(minutes=30),
                    self.departure + timedelta(hours=1),
                )
            ]
        }
        with patch(
            "routes.automatic_schedule_routes.maintenance_slots_for_aircrafts_bulk",
            return_value=maintenance,
        ):
            result = generate_schedule_scenario(
                [flight], [aircraft], max_shift_minutes=0
            )

        self.assertEqual(result["metrics"]["assignedFlights"], 0)
        self.assertEqual(result["unassigned"][0]["reason"], "AIRCRAFT_MAINTENANCE")

    def test_unselected_existing_flight_reserves_its_aircraft_and_position(self):
        aircraft = self.make_aircraft()
        fixed = self.make_flight(
            "fixed-flight",
            self.departure,
            self.departure + timedelta(hours=2),
            destination="NOS",
        )
        fixed.refAircraft = aircraft.refAircraft
        candidate_departure = self.departure + timedelta(hours=3)
        candidate = self.make_flight(
            "new-flight",
            candidate_departure,
            candidate_departure + timedelta(hours=1),
            origin="TNR",
        )

        result = self.run_scenario(
            [candidate],
            [aircraft],
            reserved_flights=[fixed],
            max_shift_minutes=0,
        )

        self.assertEqual(result["metrics"]["assignedFlights"], 0)
        self.assertEqual(
            result["unassigned"][0]["reason"], "AIRCRAFT_POSITIONING"
        )

    def test_stopover_schedule_is_supported(self):
        flight = self.make_flight(
            "flight-1",
            self.departure,
            self.departure + timedelta(hours=4),
            stopover="RUN",
            stopover_minutes=120,
        )

        result = self.run_scenario([flight], [self.make_aircraft()])

        self.assertEqual(result["metrics"]["assignedFlights"], 1)
        self.assertEqual(result["assignments"][0]["flightHours"], 2)

    def test_no_operational_aircraft_returns_no_valid_scenario(self):
        aircraft = self.make_aircraft()
        aircraft.aircraftStatus = "Maintenance"
        flight = self.make_flight(
            "flight-1", self.departure, self.departure + timedelta(hours=2)
        )

        result = self.run_scenario(
            [flight], [aircraft], max_shift_minutes=0
        )

        self.assertEqual(result["status"], "PARTIAL")
        self.assertEqual(result["metrics"]["assignedFlights"], 0)
        self.assertEqual(
            result["unassigned"][0]["reason"], "NO_OPERATIONAL_AIRCRAFT"
        )

    def test_scenarios_use_distinct_maintenance_aware_assignments_and_scores(self):
        flight = self.make_flight(
            "flight-1", self.departure, self.departure + timedelta(hours=2)
        )
        aircrafts = [
            self.make_aircraft("aircraft-1", hours=20),
            self.make_aircraft("aircraft-2", hours=0),
        ]

        balanced = self.run_scenario(
            [flight], aircrafts, selection_strategy="BALANCED"
        )
        maintenance_safe = self.run_scenario(
            [flight], aircrafts, selection_strategy="MAINTENANCE_SAFE"
        )

        self.assertNotEqual(
            balanced["assignments"][0]["refAircraft"],
            maintenance_safe["assignments"][0]["refAircraft"],
        )
        self.assertGreater(maintenance_safe["score"], balanced["score"])
        self.assertIn("maintenanceWarnings", balanced["scoreBreakdown"])

    def test_invalid_strategy_is_rejected(self):
        with self.assertRaises(ValueError):
            generate_schedule_scenario(
                [], [], selection_strategy="UNSUPPORTED"
            )


if __name__ == "__main__":
    unittest.main()
