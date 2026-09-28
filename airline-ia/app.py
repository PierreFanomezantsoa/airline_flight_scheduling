import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, request
from flask_cors import CORS

from common.authorization import require_session
from models import db
from routes import register_blueprints


PROJECT_DIR = Path(__file__).resolve().parent
load_dotenv(PROJECT_DIR / '.env')

# En développement local, Flask et Nest partagent le secret de session.
# En production, AUTH_SECRET doit être fourni directement à chaque service.
if not os.getenv('AUTH_SECRET'):
    nest_env = (
        PROJECT_DIR.parent
        / 'airline-scheduling-back'
        / 'back-airline-scheduling'
        / '.env'
    )
    load_dotenv(nest_env, override=False)


def create_app():
    app = Flask(__name__)
    CORS(app)

    @app.before_request
    def authenticate_api_request():
        if request.method == "OPTIONS":
            return None
        return require_session()

    # Configuration de la base de données depuis .env
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL est absente du fichier .env. "
            "Ajoutez la chaîne de connexion PostgreSQL avant de démarrer l'application."
        )

    if not os.getenv('AUTH_SECRET'):
        raise RuntimeError(
            'AUTH_SECRET est absente. Configurez le même secret que NestJS '
            'dans airline-ia/.env ou dans les variables du service.'
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