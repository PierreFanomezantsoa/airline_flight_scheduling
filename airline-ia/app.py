import os
from flask import Flask
from flask_cors import CORS

from models import db
from routes import register_blueprints


def create_app():
    app = Flask(__name__)
    CORS(app)

    # Configuration de la base de données
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
        'DATABASE_URL', 
        'postgresql://postgres:0701@localhost:5432/airline_ops_db'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # Initialisation de la BDD
    db.init_app(app)

    # Enregistrement centralisé de tous les Blueprints (Aéroports, Vols, Flotte, Optimisation, Analytics)
    register_blueprints(app)

    return app


app = create_app()

if __name__ == '__main__':
    app.run(debug=True, port=5000)