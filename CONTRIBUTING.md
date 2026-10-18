# Contribuer à NobPay

Merci de votre intérêt. Le projet est petit et ses règles sont strictes sur un point : **ce que l'interface affiche doit être vrai**.

## Démarrer

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000, mode simulé, rien à configurer
npm run typecheck && npm test
```

Les tests (Vitest) tournent en quelques secondes et n'ont besoin d'aucun réseau ni d'aucune clé. La CI (`.github/workflows/ci.yml`) lance : installation propre, typecheck, tests, build de production, contrôle de secrets.

## Règles

1. **Le mode `mock` ne doit jamais casser** : c'est la démonstration de secours. Tout comportement Bitnob nouveau passe par l'interface `Gateway` (`frontend/src/server/bitnob/types.ts`) et existe dans les deux implémentations (`client.ts` et `mock.ts`).
2. **Jamais de secret dans Git** : clés Bitnob, secrets de session ou de webhook, jetons SMS vont dans `frontend/.env.local` (ignoré). `node scripts/check-secrets.mjs` doit passer. N'utilisez que des clés **sandbox** ; ne basculez jamais en mode live.
3. **Chaque comportement nouveau a un test.** Pour l'API Bitnob : rejouez une réponse réelle **nettoyée** (identifiants remplacés) depuis `frontend/tests/fixtures/bitnob/`.
4. **Ne changez pas sans en discuter** : les formes JSON des routes `/api/*` (les écrans en dépendent), l'ordre des contrôles du récepteur de webhooks (signature → rejeu → ressource connue → application), le format du registre et du dossier (`ledger.ts`, `lib/canonical.ts` : le modifier invalide les ancrages déjà publiés).
5. **Textes de l'interface** : relisez `frontend/design-reference/COPY-RULES.md`. Pas de « multisig », « on-chain » pour le séquestre, « audité », « garanti »… Le jury relit chaque phrase.
6. **L'argent est en cents entiers**, jamais en flottant.
7. Code commenté en anglais, interface en français.

## Branches et commits

Une branche par sujet (`backend/<sujet>`, `frontend/<sujet>`), commits petits, message en anglais à l'impératif (« Add… », « Fix… »), pas de `push --force` sur `main`. Décrivez le **pourquoi** dans le corps du commit.

## Où lire

`docs/CONTEXTE-PROJET.md` (le produit, les règles, la dette technique), `docs/ROADMAP-BACKEND.md` (ce qui reste), `docs/BITNOB-SANDBOX-REPORT.md` (ce qui a été observé en vrai), `ARCHITECTURE.md`.
