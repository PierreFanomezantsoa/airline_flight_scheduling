# Refactorisation des attributs métier

Cette version raccourcit les noms d'attributs trop longs dans les entités et dans le code métier associé, tout en conservant les noms de colonnes PostgreSQL existants dans les décorateurs TypeORM afin d'éviter une migration destructive de la base déjà déployée.

## Principales conventions

- `Hrs` : heures
- `Mins` : minutes
- `Maint` : maintenance
- `Dep` : départ
- `Arr` : arrivée
- `Ref` : référence
- les noms restent explicites et évitent les abréviations ambiguës.

## Correspondance des attributs

| Ancien attribut | Nouvel attribut |
|---|---|
| `maintenanceIntervalHours` | `maintIntervalHrs` |
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
| `maintenanceType` | `maintType` |
| `maintenanceStatus` | `maintStatus` |
| `pendingReviewSince` | `reviewPendingAt` |
| `technicalLevel` | `techLevel` |
| `professionalLevel` | `businessLevel` |
| `refCrewAssignment` | `refCrewAssign` |
| `priorRestHours` | `restBeforeHrs` |
| `refNetworkConfiguration` | `refNetworkConfig` |
| `mediumHaulTurnaroundMinutes` | `mediumTurnMins` |
| `longHaulTurnaroundMinutes` | `longTurnMins` |
| `positioningBufferMinutes` | `posBufferMins` |
| `minimumCrewRestHours` | `minCrewRestHrs` |
| `maximumContinuousFlightHours` | `maxContFlightHrs` |
| `maintenanceWarningHours` | `maintWarnHrs` |
| `minimumTurnaroundMinutes` | `minTurnMins` |

## Compatibilité base de données

Les noms physiques des colonnes existantes sont explicitement conservés avec l'option `name` des décorateurs TypeORM. Cela permet de refactoriser le code sans renommer les colonnes ni perdre les données existantes.

## Impact API

Les DTO et objets métier utilisent désormais les nouveaux noms courts. Un frontend qui envoie directement les anciens noms doit être mis à jour pour utiliser les nouveaux champs.
