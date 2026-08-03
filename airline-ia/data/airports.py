from zoneinfo import ZoneInfo

AIRPORTS_DB = {
    "TNR": {"name": "Antananarivo (Ivato)", "timezone": "Indian/Antananarivo"},
    "CDG": {"name": "Paris (Charles de Gaulle)", "timezone": "Europe/Paris"},
    "JFK": {"name": "New York (JFK)", "timezone": "America/New_York"},
    "DXB": {"name": "Dubai International", "timezone": "Asia/Dubai"},
    "RUN": {"name": "La Réunion (Roland Garros)", "timezone": "Indian/Reunion"},
    "MRU": {"name": "Maurice (Sir Seewoosagur Ramgoolam)", "timezone": "Indian/Mauritius"}
}

def get_airport_timezone(iata_code):
    """Retourne la timezone correspondante au code IATA ou 'UTC' par défaut."""
    if not iata_code:
        return "UTC"
    return AIRPORTS_DB.get(iata_code.upper(), {}).get("timezone", "UTC")