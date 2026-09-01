# Validation des comptes utilisateurs

Flux métier :

1. `POST /users` crée un compte `PENDING`.
2. Un compte `PENDING` ou `REJECTED` ne peut pas se connecter.
3. L'administrateur consulte `GET /users/pending`.
4. Il valide via `PATCH /users/:id/approve` ou refuse via `PATCH /users/:id/reject`.
5. Seuls les comptes `APPROVED` et `actif=true` peuvent obtenir une session.
6. Les endpoints de gestion des utilisateurs sont protégés par le token de session et le rôle `Admin`.

Le corps du refus est facultatif :

```json
{ "reason": "Informations à vérifier" }
```

Les comptes existants avant la migration sont marqués `APPROVED` pour éviter de bloquer l'administrateur existant.
