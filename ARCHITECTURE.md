# Architecture

Un seul projet Next.js 14 (App Router, TypeScript strict) dans `frontend/`. Le « backend » est `frontend/src/server/` (logique) et `frontend/src/app/api/` (routes HTTP). Pas de base externe : un fichier JSON (`.data/db.json`), **un seul processus**.

```
Navigateur (PWA, français)
   │  pages React (serveur + client)              routes /api/*
   ▼                                                 ▼
 src/app/**  ─────────────────────────────►  src/server/services.ts     cas d'usage
                                                │       │        │
                                  domain.ts  ledger.ts  anchors.ts   managerToken.ts, otp.ts, auth.ts
                                  (règles)   (registre) (OpenTimestamps)
                                                │
                              bitnob/{client.ts | mock.ts}   ← interface Gateway
                                                │
                                      api.bitnob.com  ──webhook signé──►  /api/webhooks/bitnob
                                                                              (webhooks.ts)
        jobs.ts : une boucle dans le même processus (paiements, factures, conversion, solvabilité, ancrages)
```

## Flux d'argent

1. **Financer** : facture Lightning (`createFunding`) → paiement reçu par **webhook** (repli : interrogation) → `applyFundingPaid` crédite le séquestre **une seule fois** (montant vérifié).
2. **Convertir** : la boucle de fond vend les BTC reçus contre le stablecoin (`convertPaidFundings`), référence stable, jamais deux ventes.
3. **Prouver** : la personne de confiance envoie une preuve par son lien signé (`/terrain/<jeton>`).
4. **Libérer** : devis → « Confirmer et payer » en trois temps (`confirmRelease` : réserver, appeler Bitnob, enregistrer). Une réponse perdue laisse l'étape en cours ; `reconcile()` suit le vrai statut.
5. **Vérifier** : chaque évènement entre dans un registre enchaîné par hachage ; son empreinte est ancrée sur Bitcoin (OpenTimestamps) ; `/verifier` refait les calculs dans le navigateur.

## Règles qui tiennent l'ensemble

- Les états sont pilotés par les **webhooks** ; le récepteur vérifie dans l'ordre signature (401), rejeu, ressource connue (par identifiants du contenu, pas par nom d'évènement), montant, puis applique de façon idempotente.
- Toute écriture passe par `withDb` (transaction sur un brouillon, écriture atomique du fichier).
- `mock` et `sandbox` partagent l'interface `Gateway` ; en `mock` le simulateur envoie des évènements **signés** au vrai récepteur.
- Sécurité : sessions signées révocables, codes SMS par utilisateur, limitation de débit, validation stricte des entrées, fichiers vérifiés par leurs octets, en-têtes et CSP, protection des requêtes d'un autre site, journaux masqués.

Détail, dette technique et décisions : `docs/CONTEXTE-PROJET.md`. Plan : `docs/ROADMAP-BACKEND.md`.
