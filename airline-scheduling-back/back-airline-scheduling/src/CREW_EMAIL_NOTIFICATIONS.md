# Notifications automatiques des équipages

Cette extension envoie automatiquement un e-mail au membre d'équipage :

1. immédiatement après une affectation à un vol ;
2. après une modification de l'affectation ;
3. entre T-2 h et T-1 h avant le départ, si le rappel T-2 h n'a pas encore été envoyé ;
4. dans la dernière heure avant le départ, si le rappel T-1 h n'a pas encore été envoyé.

Les rappels sont persistés dans `crew_assignments` pour éviter les doublons après un redémarrage du backend.

## Dépendance e-mail

Installer Nodemailer dans le projet backend :

```bash
npm install nodemailer
```

Le code charge Nodemailer dynamiquement. Sans le paquet ou sans configuration SMTP, l'affectation reste fonctionnelle mais le statut de notification devient `DISABLED`.

## Variables d'environnement

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=no-reply@example.com
SMTP_PASS=change-me
SMTP_FROM="Airline Flight Scheduling <no-reply@example.com>"

# Heure de présentation estimée affichée dans l'e-mail.
# Exemple : 60 = présentation 1 h avant le départ.
CREW_REPORT_BEFORE_DEPARTURE_MINUTES=60

# Fréquence de contrôle des vols proches (5 minutes par défaut).
CREW_REMINDER_CHECK_INTERVAL_MS=300000
```

## Migration PostgreSQL

La migration suivante ajoute les colonnes de suivi des notifications :

`20261015143000-AddCrewNotificationTracking.ts`

Exécuter les migrations avec la commande habituelle du projet avant le déploiement.

## Remarque opérationnelle

L'e-mail est un canal de notification. Il ne remplace pas les règles de disponibilité, de qualification, de temps de service ou de repos déjà contrôlées par le système, ni les procédures opérationnelles de la compagnie aérienne.

## Canal temps réel complémentaire

Le projet peut également diffuser le même rappel dans l'interface via Socket.IO/WebSocket. Voir `CREW_REALTIME_NOTIFICATIONS.md`. Le WebSocket ne remplace pas le planificateur de rappels : `CrewReminderService` détecte l'approche de l'heure du vol, puis transmet l'alerte au membre connecté.
