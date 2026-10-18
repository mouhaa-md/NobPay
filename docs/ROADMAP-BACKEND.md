# NobPay : feuille de route backend

> **Pour qui :** le développeur qui reprend le backend (et son Claude). À lire après `docs/CONTEXTE-PROJET.md`.
> **Rédigé le :** 17 octobre 2026. **Demo Day :** probablement le 18 octobre 2026 (à confirmer par le chef de projet).

## 0. En trois phrases

1. Le frontend est **terminé et testé en mode `mock`**. Le backend existe et fonctionne en `mock`, mais **n'a jamais parlé à la vraie API Bitnob** : tout ce qui touche Bitnob repose sur des hypothèses tirées de la documentation.
2. Ce qui fait gagner devant le jury, c'est un **parcours réel en sandbox Bitnob** (facture Lightning payée, webhook signé reçu, paiement mobile money lancé et confirmé), avec le mode `mock` comme **plan B**. C'est la **Phase 0**, et elle passe avant tout.
3. Le reste (sécurité, fiabilité des flux d'argent, vraie base de données, nouvelles fonctions) est classé par priorité. **Ne commencez pas la Phase 3 (base de données) avant d'avoir fini la Phase 0.**

## 1. Règles du jeu

**Contrats à ne pas casser** (le frontend en dépend) :

- Les **routes `/api/*`** et leurs formes JSON : voir `CONTEXTE-PROJET.md` § 9. Si une forme doit changer, **changez le frontend dans le même commit** et prévenez le chef de projet.
- L'interface **`Gateway`** (`src/server/bitnob/types.ts`) : tout nouveau comportement Bitnob y passe et existe **dans les deux implémentations** (`client.ts` et `mock.ts`).
- L'interface de la base **`readDb()` / `withDb(fn)` / `resetDb()`** (`src/server/db.ts`), utilisée par les pages serveur et les services. `withDb` est **transactionnel** : si `fn` lève une exception, rien n'est écrit.
- L'**ordre des contrôles du récepteur de webhooks** : signature → rejeu → ressource connue → application.
- Le **format du registre et du dossier** (`ledger.ts`, `lib/canonical.ts`) : le modifier invalide les ancrages déjà publiés et la vérification navigateur.
- Les **textes de l'interface** : ils respectent `design-reference/COPY-RULES.md`. N'affichez rien que le code ne tient pas.

**Définition de « terminé »** pour toute tâche : `npm run typecheck` et `npm test` passent, le mode `mock` fonctionne toujours (parcours de démonstration du README), des tests couvrent le nouveau comportement, aucun secret dans le dépôt ni dans les journaux, et la tâche est notée dans le compte rendu.

**Tailles :** **S** ≈ moins d'1 h · **M** ≈ 2 à 4 h · **L** ≈ une journée ou plus. **Priorités :** **P0** bloque la démonstration ou toute exposition publique · **P1** important avant un vrai usage · **P2** produit / confort.

**Sécurité de l'argent pendant les tests :** la sandbox Bitnob est censée ne manipuler que de l'argent de test, mais le tableau de bord propose une bascule « Live mode » et une facture `lnbc…` (mainnet) a été vue au workshop. **Ne basculez jamais en live. Si une facture générée commence par `lnbc`, ne la payez pas et demandez à un mentor.**

## 2. Plan des prochaines 24 heures (si le Demo Day est demain)

| Ordre | Quoi | Tâches | Durée indicative |
|---|---|---|---|
| 1 | Installer, lancer, comprendre | B0.1 | 30 min |
| 2 | Clés, tunnel HTTPS, webhook, capture des évènements | B0.2, B0.3 | 1 h |
| 3 | Facture Lightning et paiement en sandbox | B0.4, B0.5 | 2 à 3 h |
| 4 | Pays supportés, devis, payout, évènement final | B0.7, B0.8, B0.9 | 3 à 4 h |
| 5 | Rapport, jeux d'essai, tests du client Bitnob | B0.10 | 1 à 2 h |
| 6 | Verrous de sécurité minimum si une URL publique est montrée | B1.2, B1.3, B1.4 | 1 à 2 h |
| 7 | Fiabilité minimale de l'argent (conversion, montant, reprise) | B2.2, B2.3, B2.4 | 2 à 3 h |
| 8 | **Répétition générale** du parcours en sandbox + plan B `mock` | B0.11 | 1 h |

Tout le reste (vraie base de données, nouvelles fonctions) vient **après** le Demo Day. Pour la démonstration, la solution la plus sûre est **de lancer l'application sur une machine locale** avec un tunnel HTTPS (voir B0.2) : la base JSON et le stockage disque y fonctionnent tels quels.

---

## Phase 0 : débloquer la sandbox Bitnob  `P0`

**Objectif :** remplacer chaque hypothèse de `CONTEXTE-PROJET.md` § 8.2 par un fait observé, et obtenir un parcours complet en `BITNOB_MODE=sandbox`.

### B0.1 Poser la base de référence  `P0 · S`
- Cloner le dépôt, `cd frontend && npm install`, `npm run typecheck`, `npm test` (45 tests verts), `npm run dev`.
- Faire le parcours de démonstration du README en `mock` (compte démo, valider l'étape 3 de « Résidence à Thiès », envoyer une preuve via `/terrain/demo-villa-thies`, financer, ancrer).
- Lire dans cet ordre : `server/services.ts`, `server/domain.ts`, `server/webhooks.ts`, `server/bitnob/client.ts`, `server/db.ts`.
- **Terminé quand :** tout est vert chez vous et vous pouvez expliquer en 2 minutes ce qui se passe quand le financeur clique « Confirmer et payer » (CONTEXTE § 7.2).

### B0.2 Clés, tunnel et webhook  `P0 · S`  ✅ clés et authentification validées (`whoami`), URL publique OK ; webhook à créer dans le tableau de bord
- Tableau de bord Bitnob en **Sandbox** : Settings → API keys → créer une clé (liste blanche d'IP **vide**) ; noter `CLIENT_ID` et `CLIENT_SECRET`.
- Exposer le port 3000 en HTTPS : `cloudflared tunnel --url http://localhost:3000` (ou `ngrok http 3000`). Noter l'URL publique.
- Tableau de bord → Webhooks : URL `<URL publique>/api/webhooks/bitnob`, **secret de signature de votre choix** (long, aléatoire), tentatives : 3.
- `frontend/.env.local` : `BITNOB_MODE=sandbox`, `BITNOB_CLIENT_ID`, `BITNOB_CLIENT_SECRET`, `BITNOB_WEBHOOK_SECRET`, `PUBLIC_BASE_URL=<URL publique>`, `SESSION_SECRET=<32+ caractères aléatoires>`.
- **Terminé quand :** `GET <URL publique>/api/health` renvoie `mode:"sandbox"`, `bitnobKeys:true`, `webhookSecret:true`, et le bandeau « Sandbox Mode » est visible dans le tableau de bord Bitnob. **Ne committez rien de cela.**

### B0.3 Capturer les évènements réels  `P0 · S`  ✅ fait (variable `CAPTURE_WEBHOOKS=1`, `server/capture.ts`)
- Ajouter, dans `src/app/api/webhooks/bitnob/route.ts`, une capture **activée seulement si `CAPTURE_WEBHOOKS=1`** : écrire dans `.data/webhook-captures/<horodatage>.json` les en-têtes (signature masquée) et le corps brut. `.data/` est déjà ignoré par Git.
- **Terminé quand :** tout évènement reçu laisse un fichier lisible, sans changer le comportement quand la variable est absente.

### B0.4 Facture Lightning réelle  `P0 · M`  ✅ facture `lntb` créée par l'application, forme confirmée
- Créer un projet, ouvrir « Financer », générer une facture. Comparer **la réponse brute** de `POST /api/lightning/invoices` avec `createInvoice()` (clés `request` / `bolt11`, `id`, `expires_at`, `payment_hash`, unité de `amount` : sats ?, unité de `expiry` : secondes ?).
- Vérifier le préfixe de la facture : **si `lnbc…` (mainnet) → ne pas payer, demander à un mentor**.
- Corriger `bitnob/client.ts` et l'`InvoiceResult` selon la réalité ; enregistrer la réponse (secrets et identifiants retirés) dans `tests/fixtures/bitnob/invoice-create.json`.
- **Terminé quand :** l'écran affiche un QR valide issu de Bitnob et `invoiceStatus()` renvoie `pending`.

### B0.5 Payer la facture en sandbox et recevoir le webhook  `P0 · M`  ⛔ **bloqué** : aucun moyen documenté de payer une facture ou de créditer un solde (voir BITNOB-SANDBOX-REPORT.md)
- Demander à un mentor **comment payer une facture Lightning en sandbox** (l'outil du workshop avait une « simulation » d'environ 2 s ; les références `demo-xxxx` suggèrent un mécanisme interne).
- Capturer l'évènement (B0.3) : nom exact (`btc.lightning.received.success` ?), forme de `data`, présence d'un identifiant d'évènement, champs `reference`, `id`, `payment_hash`, `preimage`, montant.
- Si le routage par expression régulière (`webhooks.ts`) ne reconnaît pas l'évènement, **l'adapter** ; ajouter un test avec la charge réelle signée par vous-même.
- **Terminé quand :** l'écran « Financer » passe seul à « reçus » **par le webhook** (pas par le sondage), l'étape 1 s'ouvre, l'évènement est dans `db.webhooks` avec le résultat `funding_paid`.

### B0.6 Soldes et conversion BTC → USDT  `P0 · M`
- Ajouter `balances()` à l'interface `Gateway` (`GET /api/balances`), dans les deux implémentations ; l'afficher dans `/api/health` (valeurs seulement si `?detail=1` et session démo/admin : jamais en public).
- Tester `convertBtcToStable` (devis puis ordre) : sens (`sell` BTC ?), unité de `quantity`, résultat. Déterminer **si la conversion est nécessaire** : la source de payout est `from_asset: USDT`, mais peut-être qu'un payout peut débiter le portefeuille BTC.
- **Décision à consigner** dans le rapport (B0.10) : le séquestre est-il crédité à la réception des BTC (comportement actuel) ou après conversion en USDT ?
- **Terminé quand :** après un financement, le solde USDT de Bitnob couvre le montant du prochain payout, ou le rapport explique pourquoi ce n'est pas nécessaire.

### B0.7 Pays supportés et bénéficiaire mobile money  `P0 · M`  ✅ réseaux, `sender`, numéro, limite 200 000 XOF (test des deux corps figés)
- `GET /api/payouts/supported-countries` puis `/SN` : relever les **réseaux** acceptés, leurs **codes exacts** et les **champs obligatoires** du bénéficiaire.
- Corriger `NETWORK_LABEL` (valeurs devinées : `wave` / `orange` / `free`) et `buildBeneficiary()` ; format du numéro (`+221…` ou local ?).
- **Terminé quand :** un bénéficiaire Wave et un bénéficiaire Orange Money de test sont acceptés par `initialize`, et un test unitaire fige les deux corps de requête.

### B0.8 Cycle complet d'un payout  `P0 · L`
- Enchaîner : `quotePayout` → `initialize` → `finalize` → évènements → `GET` du statut. Relever la forme exacte de chaque réponse (`quote_id`, `settlement_amount`, `exchange_rate`, `fees`, `expires_at`), le sens de `:id` dans `GET /api/payouts/:id` (identifiant du payout ou du devis ?), l'effet de `callback_url`.
- Vérifier que `finalize` immédiatement après `initialize` est correct ou s'il faut attendre / confirmer autrement.
- Capturer les évènements `payouts.*` (nom, charge) et ajuster `route()` dans `webhooks.ts` ; vérifier que `reference` retombe bien sur notre `payout.reference`.
- **Terminé quand :** valider « Élévation des murs » en sandbox passe `releasing` → `paid` **par webhook**, montants FCFA corrects, et `reconcile()` n'a pas eu à intervenir.

### B0.9 Cas d'échec  `P0 · M`
- Provoquer : devis expiré, solde insuffisant, numéro invalide, réseau coupé, signature de webhook fausse, évènement en double, évènement dans le désordre.
- Faire correspondre chaque erreur Bitnob à un **message français clair** et à un `code` (`gateway_error`, `quote_expired`, `insufficient_escrow`, …) ; vérifier le retour à `proof_submitted` (la preuve reste valable) et l'écriture de `payout_failed` dans le registre.
- **Terminé quand :** chaque cas laisse l'interface dans un état cohérent et un test le couvre.

### B0.10 Rapport, jeux d'essai et tests du client  `P0 · M`  ◐ rapport, fixtures et `tests/bitnob-client.test.ts` faits ; reste à compléter avec paiement, webhooks et conversion
- Écrire `docs/BITNOB-SANDBOX-REPORT.md` : pour chaque appel, requête, réponse (nettoyée), différence avec nos hypothèses, correction faite, **questions restées ouvertes pour Bitnob**.
- Ajouter `tests/fixtures/bitnob/*.json` et `tests/bitnob-client.test.ts` : `fetch` simulé qui rejoue ces réponses ; on vérifie les corps envoyés, les en-têtes signés et l'analyse des réponses (succès et erreurs).
- Mettre à jour `CONTEXTE-PROJET.md` § 8.2 (tableau) : retirer « hypothèse » partout où c'est confirmé.
- **Terminé quand :** les hypothèses restantes sont listées une par une, avec la raison.

### B0.11 Répétition générale et plan B  `P0 · S`
- Dérouler le parcours de démonstration **en sandbox**, chronométré, deux fois de suite, depuis une base neuve.
- Vérifier que le **plan B** marche : `BITNOB_MODE=mock` + « Simuler le paiement », et le bouton « Continuer en simulation » quand le devis sandbox échoue (déjà dans l'interface).
- Préparer : URL du tunnel stable, `.env.local` de secours, base `.data/` de départ sauvegardée, ancrages déjà confirmés pour montrer un vrai bloc Bitcoin.
- **Terminé quand :** deux passages complets sans intervention manuelle dans le code.

---

## Phase 1 : sécurité minimale  `P0 dès qu'une URL publique est montrée, sinon P1`

**Objectif :** qu'on ne puisse pas entrer chez quelqu'un d'autre, ni abuser des routes publiques. Détail des failles : CONTEXTE § 14, D1 à D5.

### B1.1 OTP réel par utilisateur  `P1 · M`  (**devient bloquant** : sans `ALLOW_DEMO=1`, personne ne peut se connecter en sandbox)
- Aujourd'hui : un code unique `DEMO_OTP` pour tous (CONTEXTE § 10). À faire : code à 6 chiffres **aléatoire par demande**, stocké **haché** avec expiration (5 min), 5 essais maximum, délai de renvoi, invalidé après usage. Nouvelle collection `otps` (ou table).
- Interface `SmsProvider` avec deux implémentations : « journal » (écrit le code dans la console, pour le développement) et un fournisseur réel (choix à faire avec le chef de projet : Africa's Talking, Twilio, Vonage, ou WhatsApp Business).
- Le code de démonstration n'est accepté que si `ALLOW_DEMO=1` (B1.2). `POST /api/auth/otp` renvoie `demo:true` + `demoCode` **seulement** dans ce cas. Attention : l'écran (`AuthForm.tsx`, étape du code) affiche **toujours** l'encart « Prototype : aucun SMS n'est envoyé… Code de démonstration » ; il faut le rendre conditionnel à la présence de `demoCode`.
- **Terminé quand :** deux comptes différents ne peuvent pas se connecter l'un chez l'autre ; tests : code faux, code expiré, 6e essai, réutilisation.

### B1.2 Mode démonstration explicite  `P0 · S`  ✅ fait (`ALLOW_DEMO`, CONTEXTE § 10). Écart voulu : absent = autorisé en `mock` (pas « interdit en production »), pour que `npm start` en simulation marche sans réglage
- Variable `ALLOW_DEMO` (défaut **absent = interdit** en `sandbox` et en production). Conditionne : `POST /api/auth/demo`, `DEMO_OTP`, `POST /api/dev/reset`, `POST /api/fundings/:id/simulate`, le bouton « compte démo » (afficher selon `GET /api/health`).
- **Terminé quand :** avec `BITNOB_MODE=sandbox` et sans `ALLOW_DEMO`, ces quatre points renvoient 403 / sont masqués ; avec `ALLOW_DEMO=1`, le comportement actuel revient.

### B1.3 Sessions  `P0 · S`  ✅ fait (CONTEXTE § 10). Refus de démarrer : en `sandbox`, ou en production avec `ALLOW_DEMO=0` ; renouvellement du cookie via les routes d'API
- En production (`NODE_ENV=production`) : refuser de démarrer si `SESSION_SECRET` est absent, par défaut, ou de moins de 32 caractères.
- Cookie `Secure` quand `PUBLIC_BASE_URL` est en `https`. Durée 7 jours glissants. Ajouter une **version de session** par utilisateur pour pouvoir tout révoquer ; « se déconnecter » l'incrémente.
- **Terminé quand :** démarrage refusé avec un secret faible ; cookie `Secure` visible derrière le tunnel.

### B1.4 Limitation de débit  `P0 · M`
- Utilitaire `rateLimit(clé, max, fenêtre)` en mémoire (interface remplaçable par Redis plus tard), réponse **429** avec message français et en-tête `Retry-After`.
- À protéger : `auth/otp` (par numéro **et** par IP), `login`/`register`, dépôt de preuves (par jeton), `POST /api/anchors/:id/refresh` (public, déclenche des appels sortants : par IP + délai minimal par ancrage), `anchors`, création de projets, `webhooks` (large).
- **Terminé quand :** un script qui martèle une route reçoit des 429, un usage normal n'est jamais bloqué.

### B1.5 Validation des entrées  `P1 · M`
- Ajouter `zod` ; un schéma par route (corps, paramètres, longueurs maximales, énumérations). Rejeter les champs inconnus. Garder les messages d'erreur **en français** et la forme `{error, code?}`.
- **Terminé quand :** chaque route valide son entrée au même endroit ; des tests envoient des corps absurdes (types faux, très longs, `NaN`).

### B1.6 Dépôts de fichiers  `P1 · M`
- Contrôler les **octets** (JPEG, PNG, WebP, PDF) au lieu de croire `file.type` ; refuser le reste. SVG : accepté seulement pour les démonstrations (`publicPath`), **pas** en dépôt utilisateur. Nettoyer le nom, limiter le nombre et le poids (déjà 6 × 8 Mo).
- **Terminé quand :** un fichier `.exe` renommé en `.jpg` est refusé (415) ; test.

### B1.7 Jeton de la personne de confiance  `P1 · M`
- Stocker **le hachage** du jeton (comparaison en temps constant), ajouter expiration (ex. 90 jours) et une route pour **régénérer** le lien (`POST /api/projects/:id/manager-token`). Option : code SMS envoyé au numéro du responsable avant le premier dépôt.
- Attention : les jetons de démonstration (`demo-villa-thies`…) doivent rester valables en `ALLOW_DEMO=1`.

### B1.8 Origine, en-têtes, HTTPS  `P1 · S`
- Vérifier `Origin` / `Sec-Fetch-Site` sur les routes qui modifient (POST) ; en-têtes de sécurité dans `next.config.mjs` : `Content-Security-Policy` (polices et scripts propres, `connect-src 'self'`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (géolocalisation autorisée pour soi seulement), HSTS derrière HTTPS.
- **Attention :** la page `/verifier` appelle uniquement `self`, mais la vitrine charge des polices locales et des images locales : la CSP doit rester compatible (tester dans le navigateur).

### B1.9 Journaux et secrets  `P1 · S`
- Un seul journal structuré (`pino` ou équivalent) avec **masquage** : secrets, signatures, en-têtes d'autorisation, corps de webhook entier. Aucun `console.log` d'objet de requête. Les erreurs 500 ne renvoient pas la trace.
- Ajouter un contrôle de secrets dans la CI (B3.5) et un `SECURITY.md` (B5.2).

---

## Phase 2 : fiabilité des flux d'argent  `P0/P1`

**Objectif :** qu'un incident (coupure, doublon, désordre) ne puisse ni perdre ni inventer d'argent. Détail : CONTEXTE § 14, D6 à D11.

### B2.1 Tâche de fond de rapprochement  `P1 · M`
- Retirer `reconcile()` du rendu des pages et de `GET /api/projects/:id/state` (écritures dans des GET, appels Bitnob à chaque rendu). Le remplacer par une **tâche périodique** (toutes les 5 à 10 s en démonstration) : paiements en cours, factures en attente, ancrages en attente.
- Tant que la base est un fichier JSON (un seul processus), exécuter la tâche **dans le même processus** (`src/instrumentation.ts`, option `experimental.instrumentationHook`, ou un `setInterval` initialisé une seule fois via `globalThis`). Un processus séparé exige la Phase 3.
- **Terminé quand :** les pages sont en lecture seule ; le mode `mock` termine toujours un paiement en ~3 s ; le sandbox n'est plus interrogé à chaque rendu.

### B2.2 Reprise des états bloqués  `P0 · M`
- Cas D9 : étape en `releasing` **sans `payoutId`** depuis plus de N minutes (arrêt entre les phases 1 et 3). Rechercher le payout chez Bitnob par `reference` si l'API le permet ; sinon revenir à `proof_submitted` en écrivant `payout_failed` avec la raison « interrompu », **après** avoir vérifié qu'aucun payout n'existe.
- Factures `pending` dont `expiresAt` est passé → `expired` par la tâche (aujourd'hui seulement quand l'écran interroge).
- **Terminé quand :** un test coupe volontairement le processus entre deux phases (simulé) et l'étape se rétablit seule.

### B2.3 Contrôle des montants  `P0 · S`  (webhook de réception fait, voir CONTEXTE § 8.3 ; reste le repli par interrogation et les payouts)
- Webhook de réception : comparer le montant reçu (sats) au `funding.amountSats` (tolérance à définir). Écart → résultat `amount_mismatch`, **pas de crédit**, journal d'alerte. Webhook de payout : comparer le montant.
- **Terminé quand :** deux tests (sous-paiement, sur-paiement) et un message clair dans `db.webhooks`.

### B2.4 Conversion BTC → USDT fiable  `P0 · M`
- Aujourd'hui (D7) la conversion n'est tentée que quand l'écran interroge (`refreshFunding`). La déplacer **après le crédit**, dans la tâche B2.1 : machine d'états sur `funding.conversion` (`pending` → `done` / `failed`), clé d'idempotence `nobpay:conv:<fundingId>`, reprises, journal.
- Selon la décision B0.6 : soit le séquestre n'est crédité qu'une fois la conversion faite, soit un payout est refusé tant que le solde USDT est insuffisant (message clair).
- **Terminé quand :** fermer l'onglet après paiement n'empêche pas la conversion ; test avec passerelle simulée qui échoue puis réussit.

### B2.5 Rapprochement des soldes  `P1 · M`
- Invariant à surveiller : `somme des séquestres NobPay ≤ solde Bitnob` (USDT + BTC valorisé). Calculé par la tâche, exposé dans `/api/health?detail=1` (accès restreint), alerte dans les journaux, et **blocage des nouveaux paiements** si violé.
- **Terminé quand :** un test force un écart et vérifie le blocage.

### B2.6 Appels sortants robustes  `P1 · M`
- Dans `client.ts` : nouvelle tentative (3 essais, attente exponentielle avec gigue) pour erreurs réseau / 5xx / 429, **jamais** pour 4xx. Classer `GatewayError` en `retryable: boolean`. Utiliser `reference` comme clé d'idempotence là où l'API la supporte. Délai de 20 s déjà en place.
- **Terminé quand :** tests avec `fetch` simulé (B0.10) pour chaque classe d'erreur.

### B2.7 Tests d'invariants  `P1 · M`
- Avec une passerelle simulée en mémoire et une base temporaire (comme `tests/webhook.test.ts`) : le séquestre n'est jamais négatif ; libéré ≤ déposé ; jamais deux crédits ni deux payouts pour la même référence ; ordre aléatoire d'évènements (rejeu, désordre) ⇒ même état final.
- Couvrir `services.ts` (createFunding, submitProof, quoteRelease, confirmRelease, rejectProof), aujourd'hui sans test (D15).

### B2.8 Remboursement du séquestre inutilisé  `P2 · L`
- Fonctionnalité manquante (D10). **Décision de produit à prendre avec le chef de projet** : à qui, par quel rail (facture Lightning fournie par le financeur ? adresse USDT ?), après quel délai ou quelle action. Nouveaux évènements de registre (`escrow_refunded`), nouvel écran.

---

## Phase 3 : persistance et hébergement  `P1 (après le Demo Day)`

**Objectif :** sortir du fichier JSON (D4) sans toucher au frontend.

### B3.1 Couche de stockage  `P1 · M`
- Extraire l'interface `Store` de l'usage actuel de `readDb` / `withDb` (lecture d'un instantané ; écriture transactionnelle sur un brouillon). Garder l'adaptateur JSON. Les pages et services ne doivent plus connaître le fichier.

### B3.2 PostgreSQL  `P1 · L`
- Schéma tiré de `src/lib/types.ts`. Contraintes : `ledger (project_id, seq)` unique, `fundings.reference` unique, `webhooks.event_id` unique, **registre en ajout seul** (pas de `UPDATE`/`DELETE`, par déclencheur), clés étrangères.
- Verrou par projet (`SELECT … FOR UPDATE`) pendant validation et paiement ; l'intérieur de `withDb` devient une transaction SQL. Migrations versionnées ; script d'import depuis `.data/db.json` ; `resetDb` conservé pour les tests.
- Choix de l'outil (Drizzle, Kysely, Prisma) : à décider, justification en une phrase. Alternative plus rapide : SQLite/libSQL d'abord.

### B3.3 Stockage des fichiers  `P1 · M`
- Remplacer `files.ts` (disque) par un stockage compatible S3 (Cloudflare R2, Backblaze, MinIO). Garder la route `/api/files/...` comme **point de contrôle d'accès** (propriétaire ou jeton).

### B3.4 Déploiement  `P1 · M`
- `Dockerfile` + `docker-compose.yml` (application + Postgres), hébergeur au choix (VPS, Railway, Fly, Render). **Vercel seulement** si base et fichiers sont externes ; les webhooks et la tâche de fond demandent un processus durable. HTTPS, variables via le gestionnaire de secrets de l'hébergeur, route `/api/health` pour la supervision.

### B3.5 Intégration continue  `P1 · S`
- GitHub Actions : installation, `typecheck`, `test`, `build` ; analyse de secrets ; mises à jour automatiques des dépendances.

### B3.6 Observabilité et sauvegardes  `P1 · M`
- Journaux structurés avec identifiant de requête, métriques de paiements (réussis, échoués, bloqués), sauvegarde quotidienne de la base **et test de restauration**.

---

## Phase 4 : fonctions produit  `P2`

| ID | Tâche | Notes | Taille |
|---|---|---|---|
| B4.1 | Dépôts **USDT / USDC** | Adresses de dépôt Bitnob, évènement `transfer.success`. `FundingMethod` contient déjà `usdt`/`usdc` ; l'écran affiche « Bientôt ». | L |
| B4.2 | Approbation **2 sur 3** | Table d'approbations, invitations, `proof_submitted` exige k accords, évènement de registre `approval_given`. | L |
| B4.3 | **Notifications** (e-mail, SMS, WhatsApp, push) | Preuve reçue, paiement terminé, ancrage confirmé ; modèles en français. Aujourd'hui rien n'est envoyé. | M |
| B4.4 | **Multi-pays** | Piloter le formulaire fournisseur par `supported-countries` ; `quotePayout` et `buildBeneficiary` supposent `SN` en dur. | L |
| B4.5 | **Un client / sous-compte Bitnob par projet** (`POST /api/customers`) | Seul moyen de rendre vraie l'idée d'un « portefeuille par projet » ; aujourd'hui l'interface dit « comptés projet par projet ». | L |
| B4.6 | **Lecture EXIF côté serveur** | Comparer date et position déclarées à l'EXIF ; signaler les écarts au financeur ; ne pas promettre plus que « déclaré par le téléphone » (D12). | M |
| B4.7 | **Ancrage automatique** | Ancrer après chaque `payout_completed` ; tâche `upgrade` jusqu'à confirmation ; secours de recoupement de bloc (mempool.space) ; confirmer l'hypothèse d'ordre des octets (CONTEXTE § 7.4). | M |
| B4.8 | **Certificat PDF** | Export du dossier lisible, avec QR vers `/verifier/<id>`. | M |
| B4.9 | **Back-office minimal** | Liste des payouts, états bloqués, webhooks reçus, rejouer / annuler. | L |
| B4.10 | **Litiges et annulations d'étape** | Nouveaux états et évènements. | L |

## Phase 5 : open source et jury  `P1, en parallèle`

- **B5.1 « Kit Bitnob » publiable** `P1 · M` : extraire `sign.ts`, `client.ts`, `types.ts`, le vérificateur de webhooks et les jeux d'essai de B0.10 dans `packages/bitnob-kit` (espace de travail npm), avec son README, ses tests et la licence MIT. C'est la contribution open source annoncée.
- **B5.2** `P1 · S` : `CONTRIBUTING.md`, `SECURITY.md` (comment signaler une faille, ce qui est hors périmètre), `ARCHITECTURE.md` (schéma de CONTEXTE § 5.1), modèles de tickets.
- **B5.3** `P1 · S` : mettre dans le `README.md` les **résultats réels de la sandbox** (ce qui marche, ce qui reste simulé).
- **B5.4** `P1 · S` : script de démonstration écrit (5 minutes) et **vidéo de secours** enregistrée.

---

## 3. Décisions à prendre avec le chef de projet (ne bloquez pas dessus : proposez et avancez)

1. **Hébergement de la démonstration** : machine locale + tunnel (recommandé pour demain) ou serveur ?
2. **Fournisseur de SMS** pour B1.1 (coût, couverture Sénégal / France).
3. **Moment du crédit du séquestre** : à la réception des BTC ou après conversion en USDT ? (B0.6)
4. **Un sous-compte Bitnob par projet** ? (B4.5) Tant que non, l'interface ne doit pas dire « portefeuille du projet ».
5. **Politique de remboursement** (B2.8).
6. **Base de données** : PostgreSQL ou SQLite d'abord ? (B3.2)

## 4. Risques

| Risque | Effet | Parade |
|---|---|---|
| La sandbox ne permet pas de payer une facture Lightning ou de lancer un payout au Sénégal | Pas de parcours réel complet | Demander tôt à un mentor ; documenter ce qui est réel (webhook signé, devis, etc.) ; plan B `mock` clairement étiqueté |
| Formes de webhooks différentes de nos hypothèses | Paiements non crédités | B0.3 et B0.5 en tout premier ; tests avec charges réelles |
| Une facture `lnbc…` (mainnet) | Perte d'argent réel | Règle § 1 : ne pas payer |
| Coupure pendant un paiement | Étape bloquée en `releasing` | B2.2 |
| Fichier JSON corrompu ou écrit par deux processus | Perte de données | Un seul processus jusqu'à B3.2 ; sauvegarder `.data/` avant la démonstration |
| Mentors rejouant des attaques | Atteinte à la crédibilité | Tests de webhooks (déjà verts) ; ne jamais régresser l'ordre des contrôles |
| Un texte de l'interface promet plus que le code | Perte de confiance du jury | `COPY-RULES.md`, relecture avant chaque démonstration |

## 5. Compte rendu attendu

À la fin de chaque session de travail, un message **court** au chef de projet : ce qui est fait (ID de tâche), ce qui marche en sandbox (preuve : capture ou extrait de journal sans secret), ce qui a changé dans l'API ou le frontend, ce qui reste, ce dont vous avez besoin de sa part.
