# services.py
import requests

AIRPORT_COORDINATES = {
    "CDG": {"lat": 49.0097, "lon": 2.5479},   # Paris Charles de Gaulle
    "JFK": {"lat": 40.6413, "lon": -73.7781},  # New York JFK
    "TNR": {"lat": -18.7969, "lon": 47.4788},  # Antananarivo Ivato
    "WRO": {"lat": 51.1027, "lon": 16.8858}    # Hub secondaire
}

def get_real_weather_severity(airport_code, flight_date):
    """
    Récupère la météo horaire via Open-Meteo et calcule un indice de sévérité entre 0.0 et 1.0
    """
    if airport_code not in AIRPORT_COORDINATES:
        return 0.1
        
    coords = AIRPORT_COORDINATES[airport_code]
    date_str = flight_date.strftime("%Y-%m-%d")
    flight_hour = flight_date.hour

    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={coords['lat']}&longitude={coords['lon']}&hourly=precipitation,wind_speed_10m&start_date={date_str}&end_date={date_str}"
        response = requests.get(url, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            rain = data['hourly']['precipitation'][flight_hour]  # mm
            wind = data['hourly']['wind_speed_10m'][flight_hour] # km/h
            
            severity = (min(rain / 12.0, 1.0) * 0.5) + (min(wind / 60.0, 1.0) * 0.5)
            return round(max(severity, 0.1), 2)
            
    except Exception as e:
        print(f"Erreur de récupération météo pour {airport_code}: {e}")
        
    return 0.1