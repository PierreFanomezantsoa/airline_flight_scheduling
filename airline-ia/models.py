# models.py
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Aircraft(db.Model):
    __tablename__ = 'aircrafts'
    refAircraft = db.Column('ref_aircraft', db.String(50), primary_key=True)
    model = db.Column('model', db.String(50), nullable=False)
    registration = db.Column(db.String(50), nullable=True)
    totalFlightHrs = db.Column('totalFlightHours', db.Float, default=0)
    maintLimitHrs = db.Column('maintenanceHoursLimit', db.Float, nullable=True)
    hrsSinceMaint = db.Column('hoursSinceMaintenance', db.Float, default=0)
    lastMaintAt = db.Column('lastMaintenanceAt', db.DateTime(timezone=True), nullable=True)
    aircraftStatus = db.Column('aircraft_status', db.String(50), default='Active')


class MaintenanceSlot(db.Model):
    __tablename__ = 'maintenance_slots'
    refMaintSlot = db.Column('ref_maintenance_slot', db.String(36), primary_key=True)
    refAircraft = db.Column(
        'ref_aircraft',
        db.String(50),
        db.ForeignKey('aircrafts.ref_aircraft'),
        nullable=False,
    )
    startTime = db.Column(db.DateTime(timezone=True), nullable=False)
    endTime = db.Column(db.DateTime(timezone=True), nullable=False)
    maintStatus = db.Column('maintenance_status', db.String(50), nullable=True)

class Flight(db.Model):
    __tablename__ = 'flights'
    refFlight = db.Column('ref_flight', db.String(36), primary_key=True)
    flightNumber = db.Column(db.String(50), unique=True, nullable=False)
    
    # Itinéraire : Départ -> Escale (optionnelle) -> Destination
    depAirportCode = db.Column('departureAirportCode', db.String(10), nullable=False)
    stopoverCodes = db.Column('stopoverAirportCodes', db.String(50), nullable=True)   # Code AITA, ville ou pays d'escale
    stopoverMins = db.Column('stopoverDurationMinutes', db.Integer, nullable=True)         # Durée de l'escale en minutes
    arrAirportCode = db.Column('arrivalAirportCode', db.String(10), nullable=False)
    
    departureTime = db.Column(db.DateTime(timezone=True), nullable=False)
    arrivalTime = db.Column(db.DateTime(timezone=True), nullable=False)
    flightStatus = db.Column('flight_status', db.String(50), default='Scheduled')
    
    refAircraft = db.Column(
        'ref_aircraft',
        db.String(50),
        db.ForeignKey('aircrafts.ref_aircraft'),
        nullable=True,
    )
    aircraft = db.relationship('Aircraft', foreign_keys=[refAircraft])
    hoursRecorded = db.Column('flightHoursRecorded', db.Boolean, nullable=False, default=False)
    creditedHours = db.Column('creditedFlightHours', db.Float, nullable=True)
    hoursRecordedAt = db.Column('flightHoursRecordedAt', db.DateTime(timezone=True), nullable=True)