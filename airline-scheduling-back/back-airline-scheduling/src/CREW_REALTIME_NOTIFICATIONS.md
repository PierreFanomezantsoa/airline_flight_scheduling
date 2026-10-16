# Alertes équipage en temps réel avec WebSocket

Le rappel e-mail reste géré par `CrewEmailNotificationService`. Le WebSocket ajoute un second canal pour afficher une alerte immédiatement dans l'application lorsqu'un membre d'équipage connecté approche de son heure de départ.

## Dépendances backend

Installer dans le projet NestJS complet :

```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
```

## Dépendance frontend

```bash
npm install socket.io-client
```

## Connexion frontend React/TypeScript

Le token retourné par `POST /auth/login` doit être transmis dans le handshake Socket.IO :

```ts
import { io } from 'socket.io-client';

const token = localStorage.getItem('token');
const socket = io('http://localhost:3001/crew-notifications', {
  auth: { token },
  transports: ['websocket'],
});

socket.on('crew:departure-reminder', (notification) => {
  console.log('Alerte équipage :', notification);
  // Afficher ici toast, cloche de notification ou modal.
});
```

En production derrière HTTPS, le navigateur utilise WSS automatiquement avec l'URL HTTPS du backend/reverse proxy :

```ts
const socket = io('https://airline-flight.54.156.21.207.nip.io/crew-notifications', {
  auth: { token },
  transports: ['websocket'],
});
```

## Fonctionnement

1. `CrewReminderService` contrôle périodiquement les vols à venir.
2. Dans la fenêtre T-2 h ou T-1 h, il déclenche l'e-mail et l'alerte WebSocket en parallèle.
3. `CrewNotificationGateway` authentifie le socket avec le même token HMAC que les API REST.
4. Chaque utilisateur rejoint une room privée `crew-user:<refUser>`.
5. Seul le membre d'équipage concerné reçoit l'événement `crew:departure-reminder`.
6. Le rappel est marqué comme envoyé si au moins un canal (e-mail ou WebSocket) a fonctionné, afin d'éviter les doublons.

## Nginx / AWS EC2

Le reverse proxy doit autoriser l'upgrade WebSocket. Exemple à adapter dans le bloc `location` qui relaie le backend :

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Avec cette fonctionnalité, la mention `HTTPS / WSS` devient cohérente dans le diagramme d'architecture : HTTPS pour les API REST et WSS pour les notifications temps réel.
