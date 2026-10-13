# Migration des algorithmes IA vers XGBoost

Les composants IA du module `airline-ia` utilisent désormais XGBoost :

- **Prévision météo locale** : `XGBRegressor` dans `weather_ml/train_weather_model.py`.
- **Prévision du retard** : `XGBRegressor` dans `optimizer.py`.
- **Détection de conflits entre rotations** : `XGBClassifier` dans `routes/ml_conflicts_routes.py`.
- **Moteur FastAPI IA** : utilise l'optimiseur XGBoost et n'emploie plus de logique aléatoire de prédiction.

## Important pour le mémoire

Le jeu de données météo doit être réel et historique pour entraîner le modèle météo.
Le dépôt ne contenant pas encore un historique OCC labellisé de conflits/retards, les modèles de conflit et de retard sont initialisés avec un jeu bootstrap déterministe construit à partir des règles métier existantes. Pour une mise en production, ces données bootstrap doivent être remplacées par des exemples historiques validés (conflit/non-conflit, type de conflit, retard réellement observé).

Les contraintes de sécurité strictes (vol sans aéronef, maintenance, règles d'intégrité) restent des règles métier déterministes : elles ne doivent pas dépendre uniquement d'un modèle statistique.
