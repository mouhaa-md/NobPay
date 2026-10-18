# NobPay

**Investissez au pays. Avec preuve.**
L'argent de la diaspora reste en séquestre et n'est libéré qu'étape par étape, sur preuve, directement au fournisseur. Chaque décision est inscrite dans un registre dont l'empreinte est ancrée sur Bitcoin : n'importe qui peut la vérifier, sans faire confiance à NobPay.

> *In English:* NobPay lets diaspora members fund real projects back home (real estate, farming, small business). Money sits in escrow in Bitnob wallets and is released step by step against proof (geotagged photos, invoices, land title), paid straight to the supplier by mobile money, and every state change is anchored on Bitcoin with OpenTimestamps. "Verify, don't trust."

Prototype réalisé pendant le hackathon **Code & Chain Dakar** (Bitnob × Btrust). Licence MIT.

## Le problème

La diaspora africaine envoie des centaines de milliards de dollars par an. Une grande part finance des projets (une maison, un champ, une boutique) gérés à distance, sur la parole d'un proche ou d'un entrepreneur. Un transfert déplace l'argent mais n'en contrôle pas l'usage.

Chiffres, avec leur source (IFAD, rapport présenté le 14 septembre 2026) :

- 124,2 Md$ reçus par l'Afrique en 2025, 728,6 Md$ pour tous les pays à revenu faible ou intermédiaire ;
- près d'un dollar sur trois arrive en zone rurale (≈ 233 Md$) ;
- environ 22 Md$ par an sont investis par les familles bénéficiaires dans l'agroalimentaire rural.

Sources : [ONU Info](https://news.un.org/en/story/2026/09/1168330) · [IFAD](https://www.ifad.org/en/w/news/remittances-nearly-doubled-in-a-decade-to-reach-us-729-billion-in-2025-new-ifad-report-finds). Ces chiffres décrivent le marché, pas des résultats de NobPay.

## Ce que fait NobPay

1. **Financer** : le financeur crée un projet (immobilier, agricole ou commerce), le découpe en étapes et verse en Bitcoin Lightning. Les fonds restent en séquestre dans un portefeuille Bitnob.
2. **Prouver** : la personne de confiance sur place ouvre un lien privé (sans compte), envoie photos datées et localisées, facture, titre foncier, et indique qui payer.
3. **Libérer** : le financeur regarde la preuve, voit le devis (taux, frais, montant reçu en FCFA), puis valide. Le fournisseur est payé directement en mobile money via Bitnob Payouts.
4. **Vérifier** : chaque évènement s'ajoute à un registre enchaîné (SHA-256). Son empreinte est ancrée sur Bitcoin avec OpenTimestamps. La page publique `/verifier` refait tous les calculs dans le navigateur.

## Ce qui est réel, ce qui est simulé

| Brique | Mode `mock` (défaut) | Mode `sandbox` |
|---|---|---|
| Facture Lightning | simulée (`lndemo1…`, non payable) ; bouton « Simuler le paiement » | `POST /api/lightning/invoices` chez Bitnob |
| Événement de paiement reçu | **vrai** chemin : le simulateur signe l'évènement (HMAC-SHA512) et appelle le même récepteur que Bitnob | webhook signé de Bitnob + repli par interrogation |
| Devis et paiement mobile money | simulés (taux indicatif, validation après ~2,5 s) | `POST /api/payouts/quotes`, `initialize`, `finalize` |
| Registre enchaîné, états, preuves | réels | réels |
| Ancrage Bitcoin (OpenTimestamps) | **réel** : calendriers publics, preuve `.ots` téléchargeable | réel |
| Vérification publique | réelle, dans le navigateur | réelle |

Limites à connaître :

- Aucun argent réel n'est géré. Le code de connexion SMS est un code de démonstration (`DEMO_OTP`).
- Le mode `sandbox` a été écrit d'après la documentation publique de Bitnob (bitnob.dev) et le workshop du hackathon. Les formes exactes de certaines réponses et des webhooks n'y sont pas toutes documentées : les analyseurs sont tolérants, mais le mode doit être validé avec vos clés avant la démonstration.
- Pas de limitation de débit ni de protection anti-abus : ne mettez pas ce prototype en accès public durable.
- La base est un fichier JSON local (`.data/db.json`) : parfait pour une démonstration, inadapté à un hébergement sans disque partagé (serverless).
- Les dépôts USDT/USDC et l'approbation « 2 personnes sur 3 » sont affichés « Bientôt ».
- Un ancrage n'est confirmé sur Bitcoin qu'au bout de quelques heures : il apparaît d'abord « en attente ».
- L'ancrage prouve qu'un dossier n'a pas changé ; il ne prouve pas qu'une photo montre le bon chantier. C'est le financeur qui en juge avant de payer.

## Démarrer

Prérequis : Node.js 20 ou plus récent.

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

En production locale : `npm run build && npm start`. Le service worker (installation sur l'écran d'accueil) ne s'active qu'en production.

- Compte de démonstration : bouton « Essayer avec le compte démo » sur l'écran d'accueil de l'application. Le code SMS de démonstration est `123456`.
- Réinitialiser les données : Profil → « Réinitialiser les données » (mode `mock` seulement).
- Affichage : sur ordinateur (1024 px et plus) l'application a une barre latérale et des écrans en colonnes ; sur téléphone, une colonne avec barre du bas. Les écrans de connexion restent en colonne étroite.
- Installer sur un téléphone : ouvrez l'URL sur le téléphone puis « Ajouter à l'écran d'accueil » (Chrome et Edge proposent aussi un bouton « Installer »). Hors `localhost`, HTTPS est nécessaire.

### Parcours de démonstration (5 minutes)

1. `/` : la vitrine, puis « Essayer la démo ».
2. Compte démo → **Résidence à Thiès** : une preuve attend votre décision (étape 3).
3. Ouvrez l'étape, regardez photos géolocalisées et facture, **Valider et payer** : devis, confirmation, suivi du paiement (reçu par webhook signé).
4. Étape 4 débloquée → ouvrez `/terrain/demo-villa-thies` (vue de la personne sur place) et envoyez une preuve avec une photo et une facture.
5. Revenez côté financeur, validez à nouveau.
6. **Nouveau projet** : assistant en 5 écrans, puis **Financer** : clavier, facture Lightning, « Simuler le paiement ».
7. Projet → **Certificat de preuve** → « Ancrer l'état actuel sur Bitcoin », puis ouvrez la **page publique** de vérification.

## Passer en sandbox Bitnob

1. Copiez `frontend/.env.example` en `frontend/.env.local`.
2. Dans le tableau de bord Bitnob (mode Sandbox) : créez une clé API et notez `CLIENT_ID` et `CLIENT_SECRET`.
3. Exposez l'application en HTTPS (par exemple `cloudflared tunnel --url http://localhost:3000`) et créez un webhook vers `https://<votre-url>/api/webhooks/bitnob` avec un secret de signature de votre choix.
4. Renseignez dans `.env.local` : `BITNOB_MODE=sandbox`, `BITNOB_CLIENT_ID`, `BITNOB_CLIENT_SECRET`, `BITNOB_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`, et un `SESSION_SECRET` long.
5. Relancez. Le profil indique « Sandbox Bitnob ». Si le devis de paiement échoue chez Bitnob, l'application propose de continuer en simulation, clairement étiquetée.

Vérifiez `GET /api/health` : il indique le mode, la présence des clés et l'URL de webhook attendue.

## Architecture

```
Navigateur (PWA) ──► Next.js (App Router, TypeScript)
                       ├─ Pages : / (vitrine) · /app/* (financeur) · /terrain/[token] · /verifier
                       ├─ API : /api/* (auth, projets, financements, preuves, devis, paiements, ancrages)
                       ├─ server/bitnob : client signé (HMAC-SHA256), passerelle mock ou sandbox
                       ├─ server/webhooks : signature (HMAC-SHA512) → rejeu → ressource connue → application
                       ├─ server/ledger : registre enchaîné SHA-256 + dossier canonique
                       ├─ server/ots : OpenTimestamps (estampille, mise à niveau, lecture de la preuve .ots)
                       └─ .data/db.json : état (transactions atomiques, un seul processus)
```

Règles qui comptent :

- **Les secrets restent côté serveur.** Le navigateur n'appelle jamais Bitnob.
- **Les états sont pilotés par les webhooks**, pas par la réponse d'un appel. Le récepteur vérifie dans l'ordre : signature (401), évènement déjà vu (200, ignoré), ressource connue (200, sans effet), puis applique. Il est idempotent.
- **Machine d'étapes** : à venir → active (une seule à la fois, seulement si le séquestre la couvre) → preuve envoyée → paiement en cours → payée (ou refusée → nouvelle preuve ; paiement échoué → retour à « preuve envoyée »).
- **Registre** : `hash = sha256(précédent | n° | type | date | JSON canonique)`. Le dossier (JSON canonique) est hashé puis estampillé ; seule l'empreinte quitte la machine.
- **Argent** : toujours en cents entiers.
- **Vérification** : `src/lib/verify.ts` tourne dans le navigateur (WebCrypto, avec repli en JavaScript pur si la page n'est pas en HTTPS).

## Tests

```bash
cd frontend
npm run typecheck
npm test            # signatures, registre, webhooks, OpenTimestamps, vérification navigateur
```

## Structure

```
frontend/
  src/app/            pages et routes API (Next.js App Router)
  src/components/     interface (app, vitrine, vérification)
  src/server/         logique serveur (Bitnob, webhooks, registre, OpenTimestamps, base)
  src/lib/            types, formats, SHA-256 et vérification partagés avec le navigateur
  motion/             kit d'animations de la vitrine (CSS + JS, voir ANIMATIONS.md)
  design-reference/   maquettes Stitch et règles de rédaction (COPY-RULES.md)
  tests/              tests Vitest
```

## Crédits

Code et illustrations CSS originaux. Bibliothèques : Next.js, React, Tailwind CSS, [Lenis](https://github.com/darkroomengineering/lenis) (MIT), qrcode.react (ISC). Polices Inter et Plus Jakarta Sans, icônes Material Symbols (licences libres, via Fontsource). Photos de couverture (immobilier, agricole, commerce) : images fournies par l'équipe ; photos de preuve de démonstration : images d'illustration. Le kit d'animations reprend des durées et des courbes mesurées sur un site public, sans en copier le code ni les ressources.
