# Tests du backend Airline Flight Scheduling

## Organisation

- `test/unit/` : tests unitaires des services métier isolés.
- `test/integration/` : tests de collaboration entre `FlightsService` et le moteur de planification.
- `test/e2e/` : tests HTTP des routes NestJS avec `ValidationPipe`.

## Dépendances de développement

Si elles ne sont pas déjà présentes dans le projet :

```bash
npm install -D jest ts-jest @types/jest supertest @types/supertest @nestjs/testing
```

## Scripts à ajouter dans `package.json`

```json
{
  "scripts": {
    "test": "jest --config jest.config.js",
    "test:unit": "jest --config jest.config.js test/unit",
    "test:integration": "jest --config jest.config.js test/integration",
    "test:e2e": "jest --config test/jest-e2e.json",
    "test:cov": "jest --config jest.config.js --coverage"
  }
}
```

## Exécution

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:cov
```

Les tests couvrent notamment : fenêtre horaire invalide, vol sans avion, normalisation IATA, création coordonnée d’un vol, blocage sur conflit de planning, validation DTO HTTP et endpoint de détection globale des conflits.

## Tests métier OCC

Ajouter dans `package.json` :

```json
"test:business": "jest --config ./jest.config.js test/business"
```

Puis exécuter :

```bash
npm run test:business
```

Les règles couvertes sont : chevauchement du même avion, turnaround minimal, positionnement, statut avion, limite horaire de maintenance, conflit avec un créneau de maintenance, chevauchement équipage et repos minimal équipage.
