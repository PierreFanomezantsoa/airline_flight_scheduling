import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from services.flights.helpers import (
    flight_hours_for_maintenance,
    validate_aircraft_maintenance,
)
from routes.automatic_schedule_routes import (
    generate_schedule_scenario,
    maintenance_slots_for_aircrafts_bulk,
)


class FlightMaintenanceRulesTest(unittest.TestCase):
    def make_flight(self, stopover=None, stopover_minutes=120):
        return SimpleNamespace(
            heureDepart=datetime(2026, 1, 1, 8, tzinfo=timezone.utc),
            heureArrivee=datetime(2026, 1, 1, 12, tzinfo=timezone.utc),
            aeroportEscale=stopover,
            dureeEscale=stopover_minutes,
        )

    def test_direct_flight_does_not_subtract_default_stopover_duration(self):
        self.assertEqual(flight_hours_for_maintenance(self.make_flight()), 4)

    def test_stopover_ground_time_is_excluded_from_flight_hours(self):
        self.assertEqual(
            flight_hours_for_maintenance(self.make_flight("RUN")),
            2,
        )

    def test_stopover_duration_cannot_credit_negative_flight_hours(self):
        self.assertEqual(
            flight_hours_for_maintenance(
                self.make_flight("RUN", stopover_minutes=600)
            ),
            0,
        )

    def test_missing_maintenance_model_fails_closed(self):
        with patch(
            "routes.automatic_schedule_routes._get_maintenance_model",
            return_value=None,
        ):
            with self.assertRaisesRegex(RuntimeError, "modèle.*maintenance"):
                maintenance_slots_for_aircrafts_bulk(
                    ["aircraft-1"],
                    datetime(2026, 1, 1, tzinfo=timezone.utc),
                    datetime(2026, 1, 2, tzinfo=timezone.utc),
                )

    def test_maintenance_query_failure_fails_closed(self):
        class Column:
            def in_(self, _values):
                return self

            def __lt__(self, _value):
                return self

            def __gt__(self, _value):
                return self

        class Query:
            def filter(self, *_conditions):
                return self

            def all(self):
                raise RuntimeError("database unavailable")

        class MaintenanceModel:
            aircraftId = Column()
            startTime = Column()
            endTime = Column()
            query = Query()

        with patch(
            "routes.automatic_schedule_routes._get_maintenance_model",
            return_value=MaintenanceModel,
        ):
            with self.assertRaisesRegex(RuntimeError, "Impossible de charger"):
                maintenance_slots_for_aircrafts_bulk(
                    ["aircraft-1"],
                    datetime(2026, 1, 1, tzinfo=timezone.utc),
                    datetime(2026, 1, 2, tzinfo=timezone.utc),
                )

    def test_schedule_cannot_use_aircraft_at_exact_maintenance_limit(self):
        departure = datetime(2026, 1, 1, 8, tzinfo=timezone.utc)
        aircraft = SimpleNamespace(
            id="aircraft-1",
            immatriculation="5R-ABC",
            statut="Active",
            limiteHeuresMaintenance=100,
            heuresDepuisDerniereMaintenance=99,
        )
        flight = SimpleNamespace(
            id="flight-1",
            numeroVol="MD001",
            aeroportDepart="TNR",
            aeroportEscale=None,
            dureeEscale=120,
            aeroportArrivee="RUN",
            heureDepart=departure,
            heureArrivee=departure + timedelta(hours=1),
            statut="Scheduled",
        )

        with patch(
            "routes.automatic_schedule_routes.maintenance_slots_for_aircrafts_bulk",
            return_value={"aircraft-1": []},
        ):
            scenario = generate_schedule_scenario([flight], [aircraft])

        self.assertEqual(scenario["metrics"]["assignedFlights"], 0)
        self.assertEqual(
            scenario["unassigned"][0]["reason"],
            "MAINTENANCE_DUE",
        )

    def test_manual_assignment_is_blocked_during_active_maintenance(self):
        from flask import Flask
        from models import Aircraft, MaintenanceSlot, db

        app = Flask(__name__)
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
        app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
        db.init_app(app)

        with app.app_context():
            db.create_all()
            try:
                aircraft = Aircraft(
                    id="aircraft-1",
                    model="A320",
                    immatriculation="5R-ABC",
                    statut="Active",
                )
                db.session.add(aircraft)
                db.session.add(
                    MaintenanceSlot(
                        id="maintenance-1",
                        aircraftId=aircraft.id,
                        startTime=datetime(2026, 1, 1, 9, tzinfo=timezone.utc),
                        endTime=datetime(2026, 1, 1, 10, tzinfo=timezone.utc),
                        status="Planned",
                    )
                )
                db.session.commit()

                issue = validate_aircraft_maintenance(
                    aircraft.id,
                    datetime(2026, 1, 1, 8, tzinfo=timezone.utc),
                    datetime(2026, 1, 1, 12, tzinfo=timezone.utc),
                )

                self.assertIsNotNone(issue)
                self.assertEqual(issue[0]["code"], "AIRCRAFT_MAINTENANCE")
                self.assertEqual(issue[1], 409)
            finally:
                db.session.remove()
                db.drop_all()

    def test_manual_assignment_is_blocked_at_maintenance_limit(self):
        from flask import Flask
        from models import Aircraft, db

        app = Flask(__name__)
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite://"
        app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
        db.init_app(app)

        with app.app_context():
            db.create_all()
            try:
                aircraft = Aircraft(
                    id="aircraft-1",
                    model="A320",
                    immatriculation="5R-ABC",
                    statut="Active",
                    heuresDepuisDerniereMaintenance=99,
                    limiteHeuresMaintenance=100,
                )
                db.session.add(aircraft)
                db.session.commit()

                issue = validate_aircraft_maintenance(
                    aircraft.id,
                    datetime(2026, 1, 1, 8, tzinfo=timezone.utc),
                    datetime(2026, 1, 1, 9, tzinfo=timezone.utc),
                )

                self.assertIsNotNone(issue)
                self.assertEqual(issue[0]["code"], "MAINTENANCE_DUE")
                self.assertEqual(issue[1], 409)
            finally:
                db.session.remove()
                db.drop_all()


if __name__ == "__main__":
    unittest.main()
