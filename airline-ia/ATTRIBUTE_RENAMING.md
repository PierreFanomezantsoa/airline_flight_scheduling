# Mise à jour des attributs — module Python airline-ia

Ce module a été aligné sur les noms d'attributs courts utilisés par le backend NestJS.
Les noms physiques des colonnes PostgreSQL existantes sont conservés dans `models.py`
afin d'éviter une migration destructive ou une perte de compatibilité avec la base déployée.

| Ancien attribut | Nouvel attribut |
|---|---|
| `totalFlightHours` | `totalFlightHrs` |
| `maintenanceHoursLimit` | `maintLimitHrs` |
| `hoursSinceMaintenance` | `hrsSinceMaint` |
| `lastMaintenanceAt` | `lastMaintAt` |
| `departureAirportCode` | `depAirportCode` |
| `stopoverAirportCodes` | `stopoverCodes` |
| `stopoverDurationMinutes` | `stopoverMins` |
| `arrivalAirportCode` | `arrAirportCode` |
| `flightHoursRecorded` | `hoursRecorded` |
| `creditedFlightHours` | `creditedHours` |
| `flightHoursRecordedAt` | `hoursRecordedAt` |
| `refMaintenanceSlot` | `refMaintSlot` |
| `maintenanceStatus` | `maintStatus` |

Les routes HTTP, services métier, logique météo, optimisation, génération automatique,
détection des conflits et tests concernés utilisent désormais les nouveaux noms.
