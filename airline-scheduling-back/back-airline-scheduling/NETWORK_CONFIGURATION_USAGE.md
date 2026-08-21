# Configuration réseau / règles opérationnelles

## Endpoints

- `GET /network-configuration` : retourne les règles actives + détails des hubs.
- `PUT /network-configuration` : modifie les seuils et les hubs.

## Exemple PUT

```json
{
  "mediumHaulTurnaroundMinutes": 45,
  "longHaulTurnaroundMinutes": 90,
  "positioningBufferMinutes": 180,
  "minimumCrewRestHours": 10,
  "maximumContinuousFlightHours": 8,
  "maintenanceWarningHours": 10,
  "hubIataCodes": ["TNR", "WFI", "CDG"]
}
```

## Effet métier immédiat

Les valeurs suivantes sont réellement consommées par le moteur :

- `mediumHaulTurnaroundMinutes` -> détection `TURNAROUND_TOO_SHORT` ;
- `positioningBufferMinutes` -> détection `AIRCRAFT_POSITIONING` ;
- `minimumCrewRestHours` -> contrôle `CREW_REST` dans Scheduling et CrewService ;
- `maintenanceWarningHours` -> alerte `MAINTENANCE_DUE` proche du seuil.

`longHaulTurnaroundMinutes` et `maximumContinuousFlightHours` sont persistés et exposés pour l'IHM ; ils sont prêts à être utilisés pour des règles supplémentaires de classification long-courrier / duty time.

## Base de données

Une migration est ajoutée :

`src/migrations/20260821120000-CreateNetworkConfiguration.ts`

Avec `DB_SYNCHRONIZE=false`, exécuter les migrations avec la commande TypeORM utilisée par le projet.
