# models.py
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Aircraft(db.Model):
    __tablename__ = 'aircrafts'
    id = db.Column(db.String(50), primary_key=True)
    model = db.Column('modele', db.String(50), nullable=False)
    immatriculation = db.Column(db.String(50), nullable=True)

class Flight(db.Model):
    __tablename__ = 'flights'
    id = db.Column(db.String(36), primary_key=True)
    numeroVol = db.Column(db.String(50), unique=True, nullable=False)
    aeroportDepart = db.Column(db.String(10), nullable=False)
    aeroportArrivee = db.Column(db.String(10), nullable=False)
    heureDepart = db.Column(db.DateTime(timezone=True), nullable=False)
    heureArrivee = db.Column(db.DateTime(timezone=True), nullable=False)
    statut = db.Column(db.String(50), default='Scheduled') 
    avionId = db.Column(db.String(50), db.ForeignKey('aircrafts.id'), name='avionId', nullable=True)
    avion = db.relationship('Aircraft', foreign_keys=[avionId])