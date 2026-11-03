# Architecture

Un seul projet Next.js 16 (App Router, React 19, TypeScript strict) dans `frontend/`. Le « backend » est `frontend/src/server/` (logique) et `frontend/src/app/api/` (routes HTTP). Pas de base externe : un fichier JSON (`.data/db.json`), **un seul processus**. Interface en **français et en anglais** (voir « Langues »).

```
Navigateur (PWA, FR / EN)
  /app        financeur            /terrain/<jeton>   personne sur place (sans compte)
  /recu/<jeton>  fournisseur       /verifier          public : contrôle sans nous croire
   │                                     │
   │ pages React (serveur + client)      │ lit les relais Nostr et vérifie les signatures
   ▼                                     ▼ (WebSocket, depuis le navigateur du visiteur)
 src/app/**  ─────────────►  src/server/services.ts   cas d'usage (projet, preuve, devis, libération)
 routes /api/*                 │       │        │
                               │       │        └─ lightningFlows.ts   Lightning réel : versement, paiement, remboursement
                  domain.ts ───┘       │             │
                  (règles pures)       │             ├─ lightning/nwc.ts      portefeuille Nostr Wallet Connect (NIP-47)
                  ledger.ts            │             ├─ lightning/lnurl.ts    adresse Lightning du fournisseur (LUD-16)
                  (registre enchaîné)  │             ├─ lightning/bolt11.ts   lecture et contrôle des factures
                  anchors.ts, ots.ts   │             └─ lightning/price.ts    cours BTC (2 sources) et taux dollar → FCFA
                  (OpenTimestamps)     │
                  nostr/*              ├─ proofChecks.ts   contrôles sans IA     ┐ consultatifs :
                  (engagements, NIP-03)├─ aiReview.ts      avis de Claude        ┘ ne bloquent jamais
                                       └─ bitnob/{mock,client}.ts   mobile money (démonstration et bac à sable)
        jobs.ts : une boucle dans le même processus (paiements, factures, remboursements, solvabilité, Nostr, ancrages, taux)
```

## Trois modes d'instance

| Mode | `LIGHTNING_RAIL` / `BITNOB_MODE` | Ce qui bouge vraiment |
|---|---|---|
| **Démonstration** | (rien) | Rien : Bitnob simulé, comptes de démonstration. Le registre, les signatures et l'ancrage sont réels. |
| **Bac à sable** | `BITNOB_MODE=sandbox` | Des paiements de test chez Bitnob. Jamais de clés de production (refus au démarrage). |
| **Vrais sats** | `LIGHTNING_RAIL=nwc` | Des bitcoins réels sur Lightning, sous plafonds de phase pilote. Exige `ALLOW_DEMO=0`. |

## Flux d'argent (vrais sats)

1. **Financer.** Le portefeuille de **réception** (connexion NWC qui ne peut pas dépenser) fait une facture au montant exact. Le versement n'est crédité que lorsque le **portefeuille** dit la facture réglée (jamais sur la parole d'un écran), une seule fois (`applyFundingPaid`, idempotent). Une facture expirée depuis moins de 24 h est encore interrogée.
2. **Prouver.** La personne de confiance envoie photos et facture par son lien signé (`/terrain/<jeton>`, 90 jours, renouvelable). Le fournisseur à payer est **figé** dès l'envoi.
3. **Examiner.** Contrôles sans IA (fichier déjà utilisé, position du téléphone, dates, montant) puis, à la demande, avis de Claude. **L'IA lit, le code compare, le financeur décide.**
4. **Libérer.** Devis (facture du fournisseur demandée à son domaine, **vérifiée** : montant, réseau, empreinte de description, expiration) → confirmation → réservation du séquestre → paiement par le portefeuille de **paiement** (seul à dépenser, avec un budget). Preuve de paiement = la préimage dont l'empreinte est celle de la facture.
5. **Rembourser.** Le séquestre non utilisé retourne au financeur (adresse Lightning). Le montant sort du séquestre **avant** le paiement ; un échec le remet.
6. **Vérifier.** Chaque événement entre dans un registre enchaîné par empreintes ; son empreinte est ancrée sur Bitcoin (OpenTimestamps) et, si `NOSTR_PUBLISH=1`, publiée sur des relais Nostr sous forme d'un engagement signé (numéro et empreintes seulement). `/verifier` refait tous les calculs **dans le navigateur**.

## Règles qui tiennent l'ensemble

- **Une issue inconnue ne devient jamais un échec.** Un paiement dont la réponse est perdue, ou que le portefeuille dit « échoué » sans que son statut le confirme, garde l'argent réservé ; on l'interroge par son empreinte. On ne le déclare « jamais parti » qu'une fois la facture périmée (un portefeuille hors ligne peut traiter plus tard).
- Toute écriture passe par `withDb` : transaction sur un brouillon, **disque d'abord** (écriture, `fsync`, renommage), mémoire ensuite. Un fichier illisible n'est **jamais** remplacé sur une instance qui détient de l'argent : le serveur s'arrête et dit quelle sauvegarde restaurer.
- **Le cours du bitcoin** vient de deux sources qui doivent concorder à 5 % ; aucun vrai versement ni paiement ne se fait sur un cours de repli.
- **Solvabilité** : chaque minute, ce que nous devons est comparé à ce que contiennent les portefeuilles ; en cas d'écart, versements et paiements sont suspendus.
- **Plafonds de phase pilote** (versement, paiement, séquestre total) : un projet que ces plafonds interdiraient de payer ne peut pas être créé.
- **Secrets** : les chaînes de connexion NWC valent un droit de dépense ; elles ne sont ni journalisées ni renvoyées dans une erreur.
- **Sécurité** : sessions signées et révocables, comptes invités avec lien de récupération, codes SMS hachés, limitation de débit (dont les devis), validation stricte des entrées, fichiers contrôlés par leurs octets, en-têtes et CSP, refus des requêtes d'un autre site (`proxy.ts`), journaux masqués, boucle de fond qui ne peut pas se figer.

## Langues

Le français est dans le code. Un dictionnaire `src/lib/i18n/en.ts` associe phrase française → phrase anglaise ; une phrase sans traduction s'affiche en français. `scripts/i18n-missing.mjs` (et un test) refuse toute phrase d'écran sans traduction. La langue vient d'un cookie, puis du navigateur. Détail : `docs/TRADUIRE.md`.

## Ce qui est volontairement simple

Un fichier JSON et un seul processus (SQLite est le prochain pas, pas un préalable) ; pas de file de messages ; l'IA est un seul appel structuré ; la sauvegarde est un script (`deploy/backup.sh`). Détail, dette technique et décisions : `docs/CONTEXTE-PROJET.md`, `docs/CHANGELOG-DBD4.md`, `docs/AUDIT-2026-11-03.md`. Déploiement : `docs/DEPLOIEMENT.md`.
