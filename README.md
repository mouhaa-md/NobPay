# NobPay

**Investissez au pays. Avec preuve.**
L'argent de la diaspora reste en séquestre et n'est libéré qu'étape par étape, sur preuve, directement au fournisseur. Chaque décision est inscrite dans un registre dont l'empreinte est ancrée sur Bitcoin : n'importe qui peut la vérifier, sans faire confiance à NobPay.

**Essayer en ligne : [nobpay.onrender.com](https://nobpay.onrender.com)**, puis « Essayer avec le compte démo ». C'est une instance de **démonstration** : les paiements y sont **simulés**, aucun vrai bitcoin n'est en jeu. Elle est hébergée sur une offre gratuite : si le serveur dormait, le premier chargement peut prendre environ une minute, et les données de démonstration sont remises à zéro à chaque redémarrage.

> *English version: [README.en.md](README.en.md). In short:* NobPay lets the diaspora fund projects, school fees and merchants' restocks back home. The money stays in escrow and is released step by step, only against proof, in bitcoin over Lightning; every event goes into a hash-chained record anchored on Bitcoin (OpenTimestamps), copied to Nostr relays, and verifiable from anyone's browser. "Verify, don't trust."

NobPay est né au hackathon **Code & Chain Dakar** (17-18 octobre 2026) et se prolonge pour le **Dakar Bitcoin Hack #4**. Ce qui a été ajouté pour ce second hackathon est listé à part de la base dans [`docs/CHANGELOG-DBD4.md`](docs/CHANGELOG-DBD4.md) ; `git diff pre-dbd4..HEAD` montre tout. Licence MIT.

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
4. **Vérifier** : chaque évènement s'ajoute à un registre enchaîné (SHA-256). Son empreinte est ancrée sur Bitcoin avec OpenTimestamps. La page publique `/verifier` refait tous les calculs dans le navigateur. Le registre public ne contient ni la position des photos ni les notes libres : seulement des empreintes scellées (avec un sel aléatoire gardé en privé), jamais les données.

## Ce qui est réel, ce qui est simulé

| Brique | Mode `mock` (défaut) | Mode `sandbox` |
|---|---|---|
| Facture Lightning | simulée (`lndemo1…`, non payable) ; bouton « Simuler le paiement » | **testé en vrai** : facture `lntb…` (testnet) créée par `POST /api/lightning/invoices` |
| Événement de paiement reçu | **vrai** chemin : le simulateur signe l'évènement (HMAC-SHA512) et appelle le même récepteur que Bitnob | webhook signé de Bitnob + repli par interrogation. **Webhooks `payouts.*` et `deposit.success` reçus en vrai**, signature vérifiée ; l'évènement de réception **Lightning** n'a jamais pu être vu (aucun moyen de payer une facture de test) |
| Conversion BTC → stablecoin | simulée | devis **testé en vrai** ; l'ordre n'a pas pu être passé (pas de solde) |
| Devis et paiement mobile money | simulés (taux indicatif, validation après ~2,5 s) | **testés en vrai de bout en bout** (Wave) : devis, `initialize`, `finalize`, webhooks, étape payée. Financé avec de l'USDC de test (faucet Circle) |
| Registre enchaîné, états, preuves | réels | réels |
| Ancrage Bitcoin (OpenTimestamps) | **réel** : calendriers publics, preuve `.ots` téléchargeable | réel |
| Vérification publique | réelle, dans le navigateur | réelle |

Détail de ce qui a été observé chez Bitnob : [`docs/BITNOB-SANDBOX-REPORT.md`](docs/BITNOB-SANDBOX-REPORT.md).

### Vrais bitcoins sur Lightning (Dakar Bitcoin Hack #4)

Avec `LIGHTNING_RAIL=nwc`, une instance utilise de **vrais sats** par Nostr Wallet Connect (NIP-47), sans intermédiaire : le financeur règle une vraie facture Lightning, le fournisseur est payé **à son adresse Lightning** (`nom@domaine`) et le reçu public montre la **preuve de paiement** (la préimage dont l'empreinte est celle de la facture). Le séquestre inutilisé peut être **remboursé**. Deux connexions de droits différents : l'une ne fait que créer et consulter des factures (elle ne peut pas dépenser), l'autre paie et porte un budget. Des plafonds de phase pilote bornent ce qui peut être en jeu. Mise en place : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md), réglages : [`frontend/.env.example`](frontend/.env.example).

**État de la vérification :** ce chemin est testé de bout en bout contre un **portefeuille simulé** (réponses perdues, refus, paiement à moitié connu, montant faux, facture falsifiée, adresse piégée), et l'adaptateur NWC contre un **vrai service de portefeuille NIP-47** (celui du SDK d'Alby, chiffrement réel) sur un relais simulé ; il n'a pas encore été essayé avec un vrai portefeuille ni de vrais relais. Les écrans l'appellent « Bitcoin réel » seulement sur une instance configurée ainsi.

### Le registre répliqué sur Nostr (Dakar Bitcoin Hack #4)

Avec `NOSTR_PUBLISH=1`, chaque événement du registre est aussi publié sur des **relais Nostr** : un petit événement signé par une clé propre au projet, qui ne contient que le numéro et les deux empreintes (ni nom, ni montant). La page de vérification publique **interroge les relais depuis le navigateur du visiteur**, contrôle chaque signature et compare : un registre réécrit ou amputé par l'opérateur ne correspond plus à ce que les relais ont gardé. Les événements où de l'argent a bougé sont de plus **horodatés sur Bitcoin selon NIP-03** (OpenTimestamps). Réglages et limites : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).

**État de la vérification :** testé contre de faux relais (refus, silence, panne, événements falsifiés, deuxième version contradictoire) et en lecture seule contre trois relais publics ; la **publication réelle** vers des relais publics n'a pas encore été essayée (`node scripts/nostr-smoke.mjs` le fait, sur demande).

### Un deuxième regard avant de payer (Dakar Bitcoin Hack #4)

**Les proches autour du projet.** Le financeur peut nommer un **témoin indépendant** (un voisin, un maçon) qui regarde chaque preuve de l'extérieur et dit « je confirme » ou « je conteste », et décider que **rien n'est payé sans sa confirmation**. Un **lien famille** permet aux proches d'ajouter de l'argent au séquestre depuis n'importe quel portefeuille Lightning (sans rien pouvoir débloquer ni reprendre). Des **notifications** sur le téléphone (Web Push, sans SMS) préviennent chacun quand quelque chose l'attend. Les trois passent par des liens signés, sans compte ; la réponse du témoin est inscrite au registre. Détail : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).

Sur l'écran d'une preuve, **des contrôles sans IA** (photo ou facture déjà utilisée ailleurs, position des photos, date, montant de la facture comparé à l'étape) et, à la demande du financeur, **l'avis d'une IA** (Claude, via l'API officielle d'Anthropic) qui regarde les photos et lit la facture. Principe : **l'IA lit, le code compare, le financeur décide** ; l'avis est consultatif et ne bloque ni ne déclenche jamais un paiement. Les fichiers ne sont envoyés qu'à la demande, et l'écran le dit avant. Réglages : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).

**État de la vérification :** testé avec un faux client (forme de la requête, contenu envoyé, comparaisons, refus, erreurs, plafonds) ; **jamais exécuté contre l'API réelle**, faute de clé : la qualité de l'avis sur de vraies photos reste à constater.

Limites à connaître :

- Hors du mode vrais bitcoins, aucun argent réel n'est géré. En sandbox, le portefeuille se finance avec de l'**USDC de test** (faucet Circle, ~10 min de délai de détection) ; **on ne peut pas payer une facture Lightning de test**, donc l'entrée Lightning et la conversion BTC→stablecoin n'ont pas été vues en vrai (en démonstration, le bouton « Simuler la réception » (`ALLOW_DEMO=1`) crédite le séquestre par un évènement signé par NobPay : ce versement est marqué `simulated` dans le registre public). `GET /api/balances` est instable en sandbox : voir le rapport.
- **Un paiement mobile money au Sénégal est limité à 200 000 FCFA (environ 336 $)** par Bitnob : en sandbox, une étape de plus de 330 $ est refusée dès la création du projet (réglable : `MAX_STEP_USD`) ; en mode simulé, pas de limite. Le taux réel observé est d'environ 593 FCFA pour 1 $.
- La base est un fichier JSON local (`.data/db.json`), un seul processus : parfait pour une démonstration, inadapté à un hébergement sans disque partagé (serverless).
- La limitation de débit est en mémoire (un seul processus). Le prototype n'a pas été audité : lisez [`SECURITY.md`](SECURITY.md) avant toute exposition publique.
- Le code de connexion SMS est par utilisateur avec un fournisseur SMS configuré (`SMS_PROVIDER`) ; sans fournisseur, seul existe un code de démonstration partagé (`DEMO_OTP`), fermé hors mode simulé sauf `ALLOW_DEMO=1`.
- La position GPS et l'heure d'une photo sont déclarées par le téléphone (falsifiables).
- Seuls les versements en Bitcoin Lightning existent ; l'approbation « 2 personnes sur 3 » est affichée « Bientôt ».
- Un ancrage n'est confirmé sur Bitcoin qu'au bout de quelques heures : il apparaît d'abord « en attente ».
- L'ancrage prouve qu'un dossier n'a pas changé ; il ne prouve pas qu'une photo montre le bon chantier. C'est le financeur qui en juge avant de payer.

## Démarrer

Prérequis : **Node.js 22** ou plus récent.

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

En production locale : `npm run build && npm start`. Le service worker (installation sur l'écran d'accueil) ne s'active qu'en production.

- Compte de démonstration : bouton « Essayer avec le compte démo » sur l'écran d'accueil de l'application. Le code SMS de démonstration est `123456`. En mode `sandbox`, ces facilités sont fermées par défaut : mettez `ALLOW_DEMO=1` dans `.env.local` pour les rouvrir (voir ci-dessous).
- Réinitialiser les données : Profil → « Réinitialiser les données » (mode `mock` seulement).
- Affichage : sur ordinateur (1024 px et plus) l'application a une barre latérale et des écrans en colonnes ; sur téléphone, une colonne avec barre du bas. Les écrans de connexion restent en colonne étroite.
- Installer sur un téléphone : ouvrez l'URL sur le téléphone puis « Ajouter à l'écran d'accueil » (Chrome et Edge proposent aussi un bouton « Installer »). Hors `localhost`, HTTPS est nécessaire.

### Parcours de démonstration (5 minutes)

1. `/` : la vitrine, puis « Essayer la démo ».
2. Compte démo → **Résidence à Thiès** : une preuve attend votre décision (étape 3).
3. Ouvrez l'étape, regardez les photos (avec la position du téléphone) et la facture, **Valider et payer** : devis, confirmation, suivi du paiement (reçu par webhook signé).
4. Étape 4 débloquée → ouvrez `/terrain/demo-villa-thies` (vue de la personne sur place) et envoyez une preuve avec une photo et une facture.
5. Revenez côté financeur, validez à nouveau.
6. **Nouveau projet** : assistant en 5 écrans, puis **Financer** : clavier, facture Lightning, « Simuler le paiement ».
7. Projet → **Certificat de preuve** → « Ancrer l'état actuel sur Bitcoin », puis ouvrez la **page publique** de vérification.

## Passer en sandbox Bitnob

1. Copiez `frontend/.env.example` en `frontend/.env.local`.
2. Dans le tableau de bord Bitnob (mode Sandbox) : créez une clé API (**liste d'adresses IP vide** si votre hébergement n'a pas d'IP fixe, sinon l'API répond `403 IP address not whitelisted`). Le tableau de bord n'affiche qu'**un seul jeton** `prd:sandbox_…` : c'est le **secret** (`BITNOB_CLIENT_SECRET`) ; le `BITNOB_CLIENT_ID` est un UUID donné séparément. Contrôle : `GET /api/whoami` doit répondre `environment: "sandbox"`.
3. Exposez l'application en HTTPS (par exemple `cloudflared tunnel --url http://localhost:3000`) et créez un webhook vers `https://<votre-url>/api/webhooks/bitnob` avec un secret de signature de votre choix.
4. Renseignez dans `.env.local` : `BITNOB_MODE=sandbox`, `BITNOB_CLIENT_ID`, `BITNOB_CLIENT_SECRET`, `BITNOB_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`, et un `SESSION_SECRET` d'au moins 32 caractères (`openssl rand -hex 32`) : **le serveur refuse de démarrer sans**. Pour vous connecter : soit `SMS_PROVIDER=twilio` avec les trois variables `TWILIO_*` (vrais SMS), soit `SMS_PROVIDER=log` (le code s'écrit dans la console du serveur : développement seulement), soit `ALLOW_DEMO=1` sans fournisseur (le code est alors le même pour tout le monde, `123456` : à réserver à des personnes de confiance). N'utilisez que des clés **sandbox** : le serveur refuse les clés qui ressemblent à des clés de production (`prd:live_…`).
5. Relancez. Le profil indique « Sandbox Bitnob ». Si le devis de paiement échoue chez Bitnob, l'application propose de continuer en simulation, clairement étiquetée.

Vérifiez `GET /api/health` : il indique le mode, la présence des clés et l'URL de webhook attendue (avec une session démo, `?detail=1` ajoute les soldes Bitnob et le contrôle de solvabilité). Pour débogger les webhooks reçus : `CAPTURE_WEBHOOKS=1` les écrit dans `frontend/.data/webhook-captures/` (signature masquée). Sur un Codespace GitHub, le port 3000 doit être en visibilité *Public* pour que Bitnob atteigne le webhook, et il repasse en privé à chaque redémarrage du serveur.

## Architecture

```
Navigateur (PWA) ──► Next.js (App Router, TypeScript)
                       ├─ Pages : / (vitrine) · /app/* (financeur) · /app/admin (administrateur, lecture seule) · /terrain/[token] (personne sur place) · /recu/[jeton] (reçu du fournisseur) · /verifier
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
npm test            # plus de 700 tests, sans réseau ni clé
```

Ils couvrent : signatures Bitnob, récepteur de webhooks (forgé, rejeu, montant, nom d'évènement), client Bitnob (réponses réelles rejouées, reprises), paiements et reprises après réponse perdue, conversion, solvabilité, sessions, codes SMS, limitation de débit, validation des entrées, fichiers, jeton de la personne de confiance, en-têtes, journaux, registre, OpenTimestamps, vérification navigateur, et des **séquences aléatoires d'évènements** qui vérifient que l'argent ne peut être ni compté ni payé deux fois. La CI GitHub (`.github/workflows/ci.yml`) les lance avec le build et un contrôle de secrets.

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

## Reprendre le projet (backend)

- [`docs/CONTEXTE-PROJET.md`](docs/CONTEXTE-PROJET.md) : contexte complet (produit, architecture, règles métier, état de vérification, dette technique).
- [`docs/ROADMAP-BACKEND.md`](docs/ROADMAP-BACKEND.md) : feuille de route par phases, avec ce qui est fait.
- [`docs/BITNOB-SANDBOX-REPORT.md`](docs/BITNOB-SANDBOX-REPORT.md) : ce qui a été observé en vrai chez Bitnob.
- [`docs/PROMPT-CLAUDE-BACKEND.md`](docs/PROMPT-CLAUDE-BACKEND.md) : prompt de démarrage pour un assistant Claude.
- [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md).

## Crédits

Code et illustrations CSS originaux. Bibliothèques : Next.js, React, Tailwind CSS, [Lenis](https://github.com/darkroomengineering/lenis) (MIT), qrcode.react (ISC). Polices Bricolage Grotesque, Figtree et Instrument Serif (accents en italique), icônes Material Symbols (licences libres, via Fontsource). Photos de couverture (immobilier, agricole, commerce) : images fournies par l'équipe ; photos de preuve de démonstration : images d'illustration. Le kit d'animations reprend des durées et des courbes mesurées sur un site public, sans en copier le code ni les ressources.
