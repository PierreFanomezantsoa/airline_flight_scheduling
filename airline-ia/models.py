# models.py
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Aircraft(db.Model):
    __tablename__ = 'aircrafts'
    id = db.Column(db.String(50), primary_key=True)
    model = db.Column('modele', db.String(50), nullable=False)
    immatriculation = db.Column(db.String(50), nullable=True)
    heuresDeVolTotales = db.Column(db.Float, default=0)
    limiteHeuresMaintenance = db.Column(db.Float, nullable=True)
    heuresDepuisDerniereMaintenance = db.Column(db.Float, default=0)
    dateDerniereMaintenance = db.Column(db.DateTime(timezone=True), nullable=True)
    statut = db.Column(db.String(50), default='Active')


class MaintenanceSlot(db.Model):
    __tablename__ = 'maintenance_slots'
    id = db.Column(db.String(36), primary_key=True)
    aircraftId = db.Column(db.String(50), db.ForeignKey('aircrafts.id'), nullable=False)
    startTime = db.Column(db.DateTime(timezone=True), nullable=False)
    endTime = db.Column(db.DateTime(timezone=True), nullable=False)
    status = db.Column(db.String(50), nullable=True)

class Flight(db.Model):
    __tablename__ = 'flights'
    id = db.Column(db.String(36), primary_key=True)
    numeroVol = db.Column(db.String(50), unique=True, nullable=False)
    
    # Itinéraire : Départ -> Escale (optionnelle) -> Destination
    aeroportDepart = db.Column(db.String(10), nullable=False)
    aeroportEscale = db.Column(db.String(50), nullable=True)   # Code AITA, ville ou pays d'escale
    dureeEscale = db.Column(db.Integer, nullable=True)         # Durée de l'escale en minutes
    aeroportArrivee = db.Column(db.String(10), nullable=False)
    
    heureDepart = db.Column(db.DateTime(timezone=True), nullable=False)
    heureArrivee = db.Column(db.DateTime(timezone=True), nullable=False)
    statut = db.Column(db.String(50), default='Scheduled') 
    
    avionId = db.Column(db.String(50), db.ForeignKey('aircrafts.id'), name='avionId', nullable=True)
    avion = db.relationship('Aircraft', foreign_keys=[avionId])
    heuresComptabilisees = db.Column(db.Boolean, nullable=False, default=False)
    heuresCreditees = db.Column(db.Float, nullable=True)
    heuresComptabiliseesAt = db.Column(db.DateTime(timezone=True), nullable=True)