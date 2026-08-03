# Configuration & Setup - Fleet Module Front

## 📋 Prérequis

- React 18+
- TypeScript 5+
- Axios
- Lucide React (icônes)
- Tailwind CSS

## 🔧 Installation

### 1. Variables d'environnement

Créez `.env.local` à la racine du projet:

```env
REACT_APP_API_URL=http://localhost:3000/api
```

Pour la production:
```env
REACT_APP_API_URL=https://api.yourdomain.com/api
```

### 2. Structure des fichiers

```
src/features/fleet/
├── FleetManagement.tsx      # Composant principal
├── FleetStatistics.tsx      # Composant statistiques
├── fleetService.ts          # Service API
├── index.ts                 # Exporte centralisés
├── IMPROVEMENTS.md          # Documentation améliorations
└── SETUP.md                 # Ce fichier
```

### 3. Intégration dans l'app

```typescript
// src/App.tsx
import { FleetManagement } from './features/fleet';

function App() {
  return (
    <div className="p-6">
      <h1>Gestion de la Flotte</h1>
      <FleetManagement />
    </div>
  );
}

export default App;
```

## 🚀 Démarrage

### Développement local

```bash
# Terminal 1: Backend NestJS
cd airline-scheduling-back/back-airline-scheduling
npm run start:dev

# Terminal 2: Frontend React
cd airline-scheduling-front
npm run dev
```

### Production

```bash
# Build backend
npm run build

# Build frontend
npm run build

# Déployer sur votre serveur
```

## 📡 Configuration API

### Requêtes HTTP supportées

```typescript
// Récupérer tous les aéronefs
await fleetService.getAircrafts()

// Récupérer statistiques
await fleetService.getFleetStatistics()

// Créer un aéronef
await fleetService.createAircraft({
  registration: '5R-MFT',
  model: 'Boeing 737-800',
  capacity: 189,
  maintenanceHoursLimit: 5000,
  status: 'Active',
  homeBase: 'TNR'
})

// Mettre à jour un aéronef
await fleetService.updateAircraft(id, {
  capacity: 200,
  status: 'Maintenance'
})

// Supprimer un aéronef
await fleetService.deleteAircraft(id)

// Ajouter heures de vol
await fleetService.updateMaintenanceStatus(id, 150)

// Réinitialiser maintenance
await fleetService.resetMaintenanceCounter(id)
```

## 🔐 Sécurité

### Headers HTTP
```typescript
headers: {
  'Content-Type': 'application/json',
  // Ajouter authentication si nécessaire:
  // 'Authorization': `Bearer ${token}`
}
```

### CORS
Assurez-vous que le backend autorise les requêtes CORS:

```typescript
// main.ts (backend)
const app = await NestFactory.create(AppModule);
app.enableCors();
await app.listen(3000);
```

## 🧪 Tests

### Tester avec cURL

```bash
# Récupérer la flotte
curl http://localhost:3000/api/fleet/aircrafts

# Créer un aéronef
curl -X POST http://localhost:3000/api/fleet/aircrafts \
  -H "Content-Type: application/json" \
  -d '{
    "registration":"5R-MFT",
    "model":"Boeing 737-800",
    "capacity":189,
    "maintenanceHoursLimit":5000
  }'

# Récupérer statistiques
curl http://localhost:3000/api/fleet/aircrafts/statistics
```

### Tester avec Postman

1. Import la collection depuis `CURL_EXAMPLES.md` du backend
2. Configurer l'URL de base: `http://localhost:3000/api`
3. Tester chaque endpoint

## 🛠️ Debugging

### Logs de la console

```typescript
// Activer les logs axios
import axios from 'axios';

const instance = axios.create({
  baseURL: API_URL,
});

instance.interceptors.response.use(
  response => {
    console.log('API Response:', response);
    return response;
  },
  error => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);
```

### DevTools
- Ouvrir React DevTools (F12)
- Vérifier Network tab pour les requêtes HTTP
- Vérifier Console pour les erreurs

## ⚠️ Erreurs courantes

### 1. "Cannot find module 'fleetService'"
```bash
# Assurez-vous que le fichier existe:
ls src/features/fleet/fleetService.ts
```

### 2. "Network error" ou "Failed to fetch"
```bash
# Vérifier que le backend tourne:
curl http://localhost:3000/api/fleet/aircrafts

# Vérifier REACT_APP_API_URL:
echo $REACT_APP_API_URL
```

### 3. "Type 'Aircraft' has no properties"
```typescript
// Vérifier l'import:
import { Aircraft } from './fleetService';
```

### 4. "CORS error"
```typescript
// Backend: Ajouter enableCors()
app.enableCors({
  origin: 'http://localhost:3000',
  credentials: true
});
```

## 📚 Ressources

### Documentation
- [React Hooks](https://react.dev/reference/react)
- [TypeScript](https://www.typescriptlang.org/docs/)
- [Axios](https://axios-http.com/docs/intro)
- [Tailwind CSS](https://tailwindcss.com/docs)

### Backend
- Voir `airline-scheduling-back/src/fleet/README.md`
- Voir `airline-scheduling-back/src/fleet/CURL_EXAMPLES.md`

## 🔄 Mise à jour

Pour synchroniser avec le backend après modifications:

1. Mettre à jour les interfaces dans `fleetService.ts`
2. Ajouter les nouvelles méthodes au service
3. Mettre à jour les composants pour utiliser les nouvelles données

## 💡 Bonnes pratiques

1. **Typage**: Toujours typer les réponses API
2. **Erreurs**: Gérer tous les cas d'erreur
3. **Loading**: Afficher un loader pendant les opérations
4. **Validation**: Valider les inputs côté client
5. **Cache**: Utiliser des states pour réduire les requêtes

## 🚀 Optimisations futures

- [ ] Implémenter le caching avec React Query
- [ ] Ajouter pagination pour grande flotte
- [ ] Optimiser les requêtes API
- [ ] Ajouter validations côté client
- [ ] Implémenter WebSocket pour temps réel
- [ ] Ajouter offline mode

---

Pour des questions spécifiques, consultez la documentation du backend ou le code source.
