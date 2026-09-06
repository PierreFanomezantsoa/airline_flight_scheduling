# ML météo local amélioré — Airline Flight Scheduling

Ce module sert de **second avis local et de secours** pour l'OCC.
Il ne remplace pas les observations / prévisions d'un fournisseur météo et ne
peut jamais, à lui seul, retarder ou annuler automatiquement un vol.

## Utilisation du ML local

Le modèle est maintenant exploitable à trois niveaux :

1. **Fallback** : lorsque l'API principale est indisponible.
2. **Second avis** : lorsque l'API fonctionne, le modèle local fournit un
   `advisoryScore` complémentaire. L'API reste dominante (80 % API / 20 % ML
   local par défaut dans le runtime fourni).
3. **Longue échéance / stratégique** : au-delà de la fenêtre de prévision
   fiable du fournisseur, le modèle fournit une climatologie locale avec une
   confiance volontairement limitée.

`trustedForAutomaticStatus` reste toujours `false` pour le ML local.

## 1. Entraînement minimal

CSV minimal :

```csv
airport,observed_at,severity
TNR,2026-01-01T10:00:00Z,0.12
CDG,2026-01-01T10:00:00Z,0.42
```

```bash
python weather_ml/train_weather_model.py \
  --csv data/weather_history.csv \
  --output models/weather_severity_model.joblib
```

Le fichier principal reste compatible avec l'ancien `LocalWeatherMLProvider`
qui effectue simplement `joblib.load(...).predict(...)`.

Le script génère également :

```text
models/weather_severity_model.joblib
models/weather_severity_model.joblib.metadata.json
```

## 2. Modèle enrichi facultatif

Si votre historique possède suffisamment de colonnes parmi :

```text
temperature_c
wind_speed_kmh
wind_gust_kmh
visibility_km
precipitation_mm
humidity_pct
pressure_hpa
cloud_cover_pct
thunderstorm
fog
```

un second modèle est automatiquement entraîné :

```text
models/weather_severity_model.enhanced.joblib
```

Le modèle minimal reste toujours présent pour garantir le fallback quand aucune
mesure météo temps réel n'est disponible.

## 3. Pourquoi la validation est maintenant temporelle ?

Une séparation aléatoire mélange le passé et le futur et peut donner une
performance artificiellement optimiste. La version améliorée entraîne sur les
dates les plus anciennes et évalue sur les plus récentes.

Les métriques enregistrées sont :

- MAE ;
- RMSE ;
- R² ;
- erreur absolue P90 ;
- validation croisée temporelle si le volume de données est suffisant.

## 4. Runtime local

```python
from weather_ml import local_weather_ml

assessment = local_weather_ml.assess_flight(
    dep_airport="TNR",
    arr_airport="CDG",
    dep_time="2026-09-10T17:00:00Z",
    arr_time="2026-09-11T04:00:00Z",
)
```

Le résultat contient notamment :

```json
{
  "available": true,
  "source": "LOCAL_ML",
  "score": 0.37,
  "riskLevel": "MODERATE",
  "confidence": 0.56,
  "trustedForAutomaticStatus": false
}
```

## 5. Fusion consultative avec l'API

```python
enriched = local_weather_ml.enrich_api_assessment(
    api_assessment,
    dep_airport="TNR",
    arr_airport="CDG",
    dep_time=departure,
    arr_time=arrival,
)
```

Le code conserve `api_assessment["score"]` intact et ajoute :

```text
localML
localMLAvailable
advisoryScore
advisoryRiskLevel
advisoryRiskLabel
advisorySource
localMLTrustedForAutomaticStatus = false
```

Ainsi, le ML local peut être davantage utilisé dans l'interface et les analyses
sans prendre le contrôle de la décision opérationnelle.

## 6. Variables d'environnement

```env
WEATHER_LOCAL_MODEL_PATH=models/weather_severity_model.joblib
WEATHER_LOCAL_ENHANCED_MODEL_PATH=models/weather_severity_model.enhanced.joblib
WEATHER_API_RETRIES=2
WEATHER_API_RETRY_DELAY_SECONDS=0.25
WEATHER_API_FAILURE_THRESHOLD=3
WEATHER_API_CIRCUIT_OPEN_SECONDS=60
WEATHER_STALE_CACHE_MAX_SECONDS=21600
```

## 7. Règle de sécurité OCC

Le ML local est un **outil d'aide à la décision** :

```text
API fiable                  -> source opérationnelle principale
API + ML local              -> second avis / score consultatif
API indisponible + ML local -> fallback avec confiance limitée
ML local seul               -> jamais d'annulation / retard automatique
```
