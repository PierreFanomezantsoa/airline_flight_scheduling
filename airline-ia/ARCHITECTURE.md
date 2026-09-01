# Architecture améliorée

## Objectif
La version initiale concentrait beaucoup de responsabilités dans `routes/flights_routes.py` (HTTP, météo, cache, règles OCC, dates, conflits avion, sérialisation). La version refactorisée applique une séparation claire des responsabilités sans changer les URLs publiques.

## Structure

```text
common/
  datetime_utils.py       # UTC, fuseaux, heure locale
  status_utils.py         # normalisation de statuts
config/
routes/
  flights_routes.py       # couche HTTP uniquement
  weather_resilience.py   # shim de compatibilité
  ...
services/
  flights/
    helpers.py            # escales, conflit avion, route, legs
  weather/
    resilient_service.py  # API -> ML local -> stale cache -> indisponible
    risk_engine.py        # scoring, phases, recommandations OCC
weather_ml/
  train_weather_model.py  # entraînement hors-ligne
```

## Dépendances

```text
routes -> services -> common
                 -> models
services/weather -> fournisseur API existant + modèle ML local
```

La couche `services/` ne dépend pas de Flask. Elle peut être réutilisée par un worker, une CLI, des tests, ou une autre API.

## Résilience météo
1. API météo principale.
2. ML local si panne/timeout/circuit ouvert.
3. Cache API antérieur si ML indisponible.
4. Mode dégradé explicite si aucune source n'est disponible.

Le champ `trustedForAutomaticStatus` empêche une estimation ML locale de déclencher seule une modification automatique critique.

## Compatibilité
Les endpoints existants sont conservés. `routes/weather_resilience.py` reste présent comme shim pour ne pas casser d'anciens imports.

## Étape suivante recommandée
Extraire progressivement `automatic_schedule_routes.py` et `ml_conflicts_routes.py` vers des services métier (`SchedulingService`, `ConflictDetectionService`) en gardant leurs Blueprints comme adaptateurs HTTP très fins.

## Correction du conflit `services.py` / `services/`

La refactorisation introduit un package `services/`. En Python, ce package peut
masquer l'ancien fichier racine `services.py`, ce qui rend invalide :

```python
from services import get_real_weather_severity
```

La couche `services/weather/api_provider.py` supprime ce couplage. Elle résout
le fournisseur météo de façon paresseuse :

1. `WEATHER_API_CALLABLE=module:fonction` si configuré ;
2. sinon, chargement du fichier historique `<racine>/services.py` sous un nom
   interne distinct ;
3. si aucun fournisseur n'est disponible, aucune erreur n'est levée au
   démarrage : le service résilient bascule vers le modèle ML local.

Ainsi, une panne ou une mauvaise configuration du fournisseur météo ne bloque
plus `python app.py`.

### Configuration recommandée à terme

Déplacer progressivement l'implémentation de l'API météo historique vers un
module dédié, par exemple `integrations/weather/openweather.py`, puis définir :

```env
WEATHER_API_CALLABLE=integrations.weather.openweather:get_real_weather_severity
```

Cela permet de supprimer ultérieurement le fichier historique `services.py`
sans changer `WeatherRiskEngine`, les routes ou le frontend.
