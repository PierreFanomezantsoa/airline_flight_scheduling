# Secours météo ML local

Le backend utilise d'abord l'API météo existante. Après échec/timeout, il bascule
sur un modèle ML local sans modifier le contrat consommé par le reste de
l'application.

## Entraînement

CSV minimal : `airport,observed_at,severity`.

```bash
python weather_ml/train_weather_model.py --csv data/weather_history.csv --output models/weather_severity_model.joblib
```

Variables d'environnement utiles :

```env
WEATHER_LOCAL_MODEL_PATH=models/weather_severity_model.joblib
WEATHER_API_RETRIES=2
WEATHER_API_RETRY_DELAY_SECONDS=0.25
WEATHER_API_FAILURE_THRESHOLD=3
WEATHER_API_CIRCUIT_OPEN_SECONDS=60
WEATHER_STALE_CACHE_MAX_SECONDS=21600
```

Le ML local est volontairement marqué `trustedForAutomaticStatus=false` : il
peut alimenter le score et les recommandations OCC, mais il ne doit pas retarder
ou annuler automatiquement un vol sans donnée API fiable / validation OCC.
