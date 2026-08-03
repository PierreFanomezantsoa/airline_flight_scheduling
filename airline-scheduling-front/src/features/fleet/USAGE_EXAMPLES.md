# Utilisation du Module Fleet

## 📍 Intégration Simple

### Dans votre page/composant principal

```typescript
// src/pages/FleetPage.tsx
import React from 'react';
import { FleetManagement } from '../features/fleet';

export const FleetPage: React.FC = () => {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-4xl font-bold mb-8 text-slate-900">
        Gestion de la Flotte Aérienne
      </h1>
      <FleetManagement />
    </div>
  );
};
```

### Dans le routeur (React Router)

```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { FleetPage } from './pages/FleetPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/fleet" element={<FleetPage />} />
        {/* autres routes */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

## 🎯 Utilisation du Service Directement

Si vous avez besoin d'accéder au service Fleet directement:

```typescript
import { fleetService } from './features/fleet';

// Dans un composant ou fonction
async function getFleetInfo() {
  try {
    const aircrafts = await fleetService.getAircrafts();
    const stats = await fleetService.getFleetStatistics();
    
    console.log('Aéronefs:', aircrafts);
    console.log('Statistiques:', stats);
  } catch (error) {
    console.error('Erreur:', error);
  }
}
```

## 🔄 Appels API Courants

```typescript
import { fleetService, CreateAircraftDto } from './features/fleet';

// 1. Créer un aéronef
const newAircraft = await fleetService.createAircraft({
  registration: '5R-MFT',
  model: 'Boeing 737-800',
  capacity: 189,
  maintenanceHoursLimit: 5000,
  status: 'Active',
  homeBase: 'TNR',
});

// 2. Récupérer tous les aéronefs
const all = await fleetService.getAircrafts();

// 3. Récupérer un aéronef spécifique
const aircraft = await fleetService.getAircraftById('aircraft-id');

// 4. Mettre à jour un aéronef
await fleetService.updateAircraft('aircraft-id', {
  capacity: 200,
  status: 'Maintenance',
});

// 5. Supprimer un aéronef
await fleetService.deleteAircraft('aircraft-id');

// 6. Ajouter des heures de vol
await fleetService.updateMaintenanceStatus('aircraft-id', 150); // 150 heures

// 7. Réinitialiser la maintenance
await fleetService.resetMaintenanceCounter('aircraft-id');

// 8. Récupérer les statistiques
const stats = await fleetService.getFleetStatistics();

// 9. Filtrer par statut
const active = await fleetService.getAircraftsByStatus('Active');
const maintenance = await fleetService.getAircraftsByStatus('Maintenance');

// 10. Filtrer par base d'attache
const tnr = await fleetService.getAircraftsByHomeBase('TNR');
```

## 📊 Afficher les Statistiques Seules

```typescript
import { FleetStatistics } from './features/fleet';
import { useState, useEffect } from 'react';
import { fleetService } from './features/fleet';

export const StatsDashboard: React.FC = () => {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fleetService.getFleetStatistics().then(setStats).finally(() => setIsLoading(false));
  }, []);

  return <FleetStatistics stats={stats} isLoading={isLoading} />;
};
```

## 🎨 Personnalisation

### Changer les couleurs
Modifier les classes Tailwind dans `FleetManagement.tsx`:

```typescript
// Avant
className="bg-sky-600 hover:bg-sky-700"

// Après (couleur rouge)
className="bg-red-600 hover:bg-red-700"
```

### Ajouter des colonnes
Ajouter dans le formulaire:

```typescript
<div>
  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
    Votre Champ
  </label>
  <input
    type="text"
    value={form.votreChamp}
    onChange={(e) => setForm({ ...form, votreChamp: e.target.value })}
    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none"
  />
</div>
```

## 🧩 Composants Personnalisés

### Créer un composant enfant

```typescript
// src/features/fleet/AircraftCard.tsx
import React from 'react';
import { Aircraft } from './fleetService';

interface AircraftCardProps {
  aircraft: Aircraft;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
}

export const AircraftCard: React.FC<AircraftCardProps> = ({
  aircraft,
  onDelete,
  onReset,
}) => {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-bold text-lg">{aircraft.registration}</h3>
      <p className="text-sm text-gray-500">{aircraft.model}</p>
      {/* Afficher plus de détails... */}
    </div>
  );
};
```

## 🔌 Intégration avec Redux/Zustand

Si vous utilisez un state management global:

```typescript
// Redux slice example
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { fleetService, Aircraft } from '../features/fleet';

export const fetchAircrafts = createAsyncThunk(
  'fleet/fetchAircrafts',
  async () => {
    return await fleetService.getAircrafts();
  }
);

const fleetSlice = createSlice({
  name: 'fleet',
  initialState: {
    aircrafts: [] as Aircraft[],
    loading: false,
    error: null as string | null,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAircrafts.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchAircrafts.fulfilled, (state, action) => {
        state.aircrafts = action.payload;
        state.loading = false;
      })
      .addCase(fetchAircrafts.rejected, (state, action) => {
        state.error = action.error.message || 'Error';
        state.loading = false;
      });
  },
});

export default fleetSlice.reducer;
```

## 🔐 Authentification

Si vous avez besoin d'ajouter un token d'authentification:

```typescript
// fleetService.ts modification
class FleetService {
  private api: AxiosInstance;

  constructor(token?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    this.api = axios.create({
      baseURL: `${API_URL}/fleet`,
      headers,
    });
  }
}

// Utilisation
const token = localStorage.getItem('authToken');
export const fleetService = new FleetService(token);
```

## 📝 Validation Côté Client

```typescript
// Ajouter validation avant envoi
const validateAircraft = (data: CreateAircraftDto): string[] => {
  const errors: string[] = [];

  if (!data.registration) errors.push('Immatriculation requise');
  if (!data.model) errors.push('Modèle requise');
  if (data.capacity <= 0) errors.push('Capacité doit être > 0');
  if (data.maintenanceHoursLimit <= 0) errors.push('Butoir doit être > 0');

  return errors;
};

// Dans le formulaire
const handleSubmit = (e) => {
  const errors = validateAircraft(form);
  if (errors.length > 0) {
    setError(errors.join(', '));
    return;
  }
  // Continuer avec l'envoi...
};
```

## 🎯 Cas d'usage avancés

### Synchronisation en temps réel avec WebSocket

```typescript
import { useEffect } from 'react';
import io from 'socket.io-client';

export const useFleetSync = (onUpdate: (aircraft: Aircraft) => void) => {
  useEffect(() => {
    const socket = io('http://localhost:3001');

    socket.on('aircraft:updated', (aircraft: Aircraft) => {
      onUpdate(aircraft);
    });

    return () => socket.disconnect();
  }, [onUpdate]);
};
```

### Pré-chargement et cache

```typescript
let cachedAircrafts: Aircraft[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const getCachedAircrafts = async () => {
  const now = Date.now();

  if (cachedAircrafts && now - cacheTimestamp < CACHE_DURATION) {
    return cachedAircrafts;
  }

  cachedAircrafts = await fleetService.getAircrafts();
  cacheTimestamp = now;
  return cachedAircrafts;
};
```

---

Pour plus d'informations, consultez:
- `IMPROVEMENTS.md` - Améliorations détaillées
- `SETUP.md` - Configuration
- Backend `README.md` - Documentation API
