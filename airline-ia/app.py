import os

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from models import db
from routes import register_blueprints


# Charge les variables du fichier .env à la racine du projet
load_dotenv()


def create_app():
    app = Flask(__name__)
    CORS(app)

    # Configuration de la base de données depuis .env
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL est absente du fichier .env. "
            "Ajoutez la chaîne de connexion PostgreSQL avant de démarrer l'application."
        )

    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # Initialisation de la BDD
    db.init_app(app)

    # Enregistrement centralisé de tous les Blueprints
    register_blueprints(app)

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        debug=os.getenv("FLASK_DEBUG", "1") == "1",
        host=os.getenv("FLASK_HOST", "127.0.0.1"),
        port=int(os.getenv("FLASK_PORT", "5000")),
    )