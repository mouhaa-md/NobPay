# NobPay : contexte complet du projet

> **Pour qui :** le développeur qui reprend le backend, et son assistant Claude.
> **But :** que vous puissiez travailler sans poser de question sur le « pourquoi », le « quoi » et l'état réel du code.
> **Date de rédaction :** 17 octobre 2026 (nuit du jour 1 du hackathon).
> Les chiffres, noms de fichiers et comportements décrits ici ont été relus dans le code avant d'être écrits. Quand une chose n'est **pas vérifiée**, c'est écrit.

**À compléter par le chef de projet avant l'envoi :**

| | |
|---|---|
| Dépôt GitHub | https://github.com/mouhaa-md/NobPay (public ; branche `main` ; collaborateurs : `mouhaa-md`, `Pouye15`) |
| Chef de projet / contact | `<nom, téléphone ou WhatsApp>` |
| Responsable du frontend | `<nom>` (le chef de projet, avec l'aide de Claude) |
| Mentor Bitnob joignable | `<nom ou canal>` |
| Demo Day | probablement **18 octobre 2026** (non confirmé : à vérifier) |

---

## 1. NobPay en une minute

**Idée.** La diaspora africaine envoie des sommes énormes à sa famille, et une partie finance des projets gérés à distance (une maison, un champ, une boutique) sur la parole d'un proche. Un transfert déplace l'argent, il n'en contrôle pas l'usage. NobPay **requalifie le transfert en investissement vérifié** :

1. Le **financeur** (en France, par exemple) crée un **projet** découpé en **étapes** (ex. « Fondations », « Toiture ») et verse de l'argent en **Bitcoin Lightning**. L'argent reste en **séquestre**.
2. La **personne de confiance sur place** ouvre un **lien privé** (sans compte) et envoie la **preuve** d'une étape : photos (avec position et date), facture, titre foncier, et **qui doit être payé** (nom, numéro, opérateur mobile money).
3. Le financeur regarde la preuve, voit un **devis** (taux, frais, montant reçu en FCFA) puis **valide**. NobPay paie **directement le fournisseur** en mobile money (Wave, Orange Money, Free Money) via **Bitnob Payouts**.
4. Chaque évènement s'ajoute à un **registre enchaîné par hachage**. L'empreinte du registre est **ancrée sur Bitcoin** avec **OpenTimestamps**. N'importe qui peut **vérifier** un dossier sans compte, dans son navigateur : « verify, don't trust ».

**Acteurs :** financeur (a un compte), personne de confiance sur place (lien privé), fournisseur (reçoit un paiement mobile money, ne voit rien), vérificateur public (page `/verifier`).

**Portée.** Pan-africaine dans le discours, mais le **prototype ne paie qu'au Sénégal** (XOF, rails Wave / Orange Money / Free Money). **Trois secteurs uniquement** : immobilier, agricole, commerce. Le nom est **NobPay** (pas « Tabax », nom provisoire rejeté).

## 2. Le hackathon

**Code & Chain Dakar**, organisé par **Bitnob** et **Btrust**, 2 jours (17-18 octobre 2026). Cagnotte annoncée : 5 000 $ (d'après le site du hackathon).

- **Règles :** projet développé pendant le hackathon, **usage significatif de l'API Bitnob** + au moins une fonctionnalité Bitcoin, **dépôt GitHub public**, projet original.
- **Critères du jury :** innovation, réalisation technique, usage Bitcoin / API Bitnob, impact concret, UX / design, présentation, **qualité open source**.
- **Ce que cherche le jury technique de Bitnob (workshop du 17 oct.) :** les 5 briques Lightning, Payouts, Stablecoins, Webhooks, Sécurité (authentification + vérification des évènements). Architecture de référence : Utilisateur → Frontend → **Backend (garde les secrets)** → API Bitnob → rail de paiement, avec un **webhook** qui revient au backend pour synchroniser l'état réel. Un bon paiement est fiable, rapide, **traçable**, simple. Conseil donné : « ne commencez pas par l'API, partez d'un vrai problème de paiement ».
- **Ce que cherche Btrust :** open source, « verify, don't trust ».
- **Les mentors rejouent des attaques** sur les projets : « rejouer un webhook » et « forger un faux webhook ». Notre récepteur les gère (§ 8.3) : à ne jamais régresser.

## 3. Décisions de produit (figées, ne pas rouvrir sans le chef de projet)

- **Séquestre = règle logicielle, pas un contrat.** Pas de multisig, pas de smart contract, pas de « on-chain » pour l'argent. Les fonds sont dans des **portefeuilles Bitnob** ; NobPay est la **couche de règles** et tient la comptabilité par projet dans **sa propre base**. Ne jamais écrire « NobPay ne détient pas les fonds » sans nuance.
- **Entrée des fonds :** Bitcoin Lightning uniquement. Dépôt USDT / USDC affiché « Bientôt ». Les fonds sont ensuite censés être convertis en **USDT** (la source des payouts est `from_asset: USDT`).
- **Sortie des fonds :** Bitnob Payouts, mobile money, Sénégal (XOF). Le devis expire (60 s en mock) : on le demande au moment de la validation, jamais avant.
- **Approbation :** « Moi seul » (le financeur). « 2 personnes sur 3 » est affiché « Bientôt ».
- **Étapes :** séquentielles, **une seule ouverte à la fois**, et seulement si le séquestre couvre son montant.
- **Preuves ancrées sur Bitcoin** via OpenTimestamps (pas de transaction Bitcoin faite par NobPay : seules des **empreintes** sont publiées).
- **Contribution open source prévue :** un « kit Bitnob » (client typé, signature HMAC, vérificateur de webhooks, repli par polling). **Pas** un « ln-watcher » : on ne prétend pas combler un manque non confirmé.
- **Vocabulaire de l'interface (français) :** Projet, **Étape** (jamais « Jalon »), En séquestre, Preuve, Libérer le paiement, Certificat de preuve, « personne de confiance sur place ».

## 4. Règles d'honnêteté (le jury relit)

Chaque texte affiché doit être **vrai**. La liste complète des affirmations interdites et de leurs remplaçants est dans `frontend/design-reference/COPY-RULES.md`. À retenir :

- Jamais : « multisig », « smart-contract », « on-chain » pour le séquestre, « audité », « garanti », « zéro fraude », « chiffrement de bout en bout », « réglementé », « instantané » pour le paiement final.
- Les chiffres de marché sont **sourcés** (IFAD, 14 sept. 2026, via ONU Info : 124,2 Md$ vers l'Afrique en 2025, 1 $ sur 3 en zone rurale, 22 Md$/an investis dans l'agroalimentaire rural). Ils décrivent le marché, pas des résultats de NobPay.
- **Limites à ne pas cacher :**
  - La **position GPS et l'heure des photos sont déclarées par le téléphone** (formulaire), pas lues dans l'EXIF côté serveur : elles sont **falsifiables**. L'interface dit « géolocalisée » ; ne rien promettre de plus.
  - L'ancrage Bitcoin prouve qu'**un dossier n'a pas changé** depuis une date. Il ne prouve pas qu'une photo montre le bon chantier : c'est le financeur qui juge.
  - Le mode `mock` simule Lightning et mobile money. Aucun argent réel n'est géré.
  - Le portefeuille Bitnob est **commun** (pas un portefeuille par projet) : l'interface dit « comptés projet par projet ». Si vous créez des clients / sous-comptes Bitnob par projet, vous pourrez durcir la formulation, pas avant.

## 5. Architecture

### 5.1 Pile

Next.js **14.2.35** (App Router) + React 18 + **TypeScript strict** + Tailwind 3.4, **un seul projet** (frontend et backend dans le même dépôt `frontend/`). Tests Vitest 3. Node 20 ou plus (testé avec Node 24). Pas de base de données externe : fichier JSON local.

```
Navigateur (PWA, français)
   │  pages React (serveur + client)            routes /api/*
   ▼                                              ▼
 src/app/**  ───────────────────────────►  src/server/services.ts   (cas d'usage)
                                                │        │         │
                                    domain.ts  ledger.ts  anchors.ts/ots.ts
                                    (règles)   (registre) (OpenTimestamps)
                                                │
                              bitnob/{client.ts | mock.ts}  ← interface Gateway
                                                │
                                      api.bitnob.com   ──webhook signé──►  /api/webhooks/bitnob
                                                │                              (webhooks.ts)
                                       .data/db.json  +  .data/uploads/
```

### 5.2 Carte du dépôt

```
NobPay/
  README.md, LICENSE (MIT), docs/                 ← vous êtes ici
  frontend/
    src/
      app/
        (site)/page.tsx            vitrine  /
        app/(auth)/…               bienvenue, inscription, connexion  (colonne téléphone)
        app/(shell)/…              application connectée (barre latérale sur ordinateur)
          (tabs)/accueil|projets|portefeuille|profil
          projets/nouveau, projets/[id], projets/[id]/financer, projets/[id]/etapes/[stepId]
          certificat/[id], notifications
        terrain/[token]/page.tsx   vue de la personne de confiance (sans compte)
        verifier/…                 vérification publique (sans compte)
        api/**/route.ts            toutes les routes HTTP (§ 9)
      server/                      ★ le backend
        config.ts                  variables d'environnement (lues à la demande)
        db.ts                      base JSON (readDb / withDb / resetDb)
        domain.ts                  règles métier pures (activation, crédit, paiement)
        services.ts                cas d'usage (créer projet, financer, preuve, devis, payer…)
        ledger.ts                  registre enchaîné + dossier canonique
        webhooks.ts                récepteur des évènements Bitnob
        mockEvents.ts              simulateur d'évènements (mode mock seulement)
        auth.ts                    session par cookie signé + OTP de démonstration
        files.ts                   dépôt des photos / factures sur disque
        anchors.ts, ots.ts         ancrage OpenTimestamps (implémentation maison)
        views.ts                   modèles de lecture pour les écrans
        seed.ts                    données de démonstration
        bitnob/{types,client,mock,sign,index}.ts   passerelle Bitnob
      lib/                         types, formats (fr-FR), SHA-256 et vérification partagés avec le navigateur
      components/                  interface
    motion/                        kit d'animations de la vitrine (hors backend)
    design-reference/              maquettes Stitch + COPY-RULES.md
    tests/                         Vitest (102 tests)
    public/                        images, icônes PWA, manifest, sw.js
```

**Le backend, c'est `frontend/src/server/` et `frontend/src/app/api/`.** Les pages appellent les services soit directement (composants serveur qui lisent la base), soit par `fetch('/api/…')` (composants client).

### 5.3 Deux modes (variable `BITNOB_MODE`)

| | `mock` (défaut) | `sandbox` |
|---|---|---|
| Facture Lightning | fausse (`lndemo1…`, non payable) | `POST /api/lightning/invoices` |
| Paiement de la facture | bouton « Simuler le paiement » → évènement **signé** envoyé au **vrai** récepteur | webhook signé de Bitnob + interrogation de repli |
| Devis / paiement mobile money | simulés (taux `USD_XOF_RATE`, validation après ~2,5 s par `reconcile()`) | `POST /api/payouts/quotes`, `initialize`, `finalize` |
| Registre, états, ancrage OTS, vérification | réels | réels |

La passerelle est l'interface `Gateway` (`bitnob/types.ts`) : `btcUsd`, `createInvoice`, `invoiceStatus`, `convertBtcToStable`, `quotePayout`, `startPayout`, `payoutStatus`. Deux implémentations (`client.ts` sandbox, `mock.ts`). `getGateway()` choisit selon le mode ; `gatewayFor(mode)` sert quand une ressource garde le mode dans lequel elle a été créée (un devis `mock` se finalise en `mock`). **Tout nouveau comportement Bitnob passe par cette interface**, et doit exister dans les deux implémentations.

## 6. Modèle de données (`src/lib/types.ts`)

Tout l'argent est en **cents USD entiers** (jamais de flottant). Montants FCFA : entiers.

```
Db { users[], projects[], fundings[], ledger[], anchors[], webhooks[] }

User      { id, firstName, lastName, country(FR…), phone, createdAt, demo? }
Project   { id, ownerId, name, sector(immobilier|agricole|commerce), city, country:'SN',
            budgetCents, coverImage, managerName, managerPhone?, managerToken, approvalRule:'owner',
            steps[], createdAt, demo? }
Step      { id, index(1..), title, amountCents, proofKinds[titre|photos|facture], status,
            proof?, decision?, payout?, quote? }
  status  : upcoming → active → proof_submitted → releasing → paid      (ou rejected → active)
Proof     { photos[{id,name,mime,size,sha256,takenAt,gps?{lat,lng,accuracy}}], invoice?, invoiceAmountFcfa?,
            note?, supplier{name,network(wave|orange_money|free_money),phone}, submittedAt, submittedBy }
Payout    { reference, quoteId, payoutId?, status(initiated|pending|completed|failed), amountUsdCents,
            amountFcfa, rate, feeUsdCents, supplier, mode, startedAt, completedAt?, error? }
Funding   { id, projectId, amountCents, method(lightning|usdt|usdc), status(pending|paid|expired|failed),
            reference, mode, invoiceId?, bolt11?, paymentHash?, amountSats?, btcUsd?, expiresAt?,
            paidAt?, preimage?, conversion?{status,detail}, demo? }
LedgerEvent { seq, id, projectId, type, at, data, prevHash, hash }
Anchor    { id('a_'+16 hex), projectId, upToSeq, digest, dossierJson, submittedAt, status(pending|confirmed|failed),
            calendar?, otsBase64?, bitcoinBlock?, confirmedAt?, error? }
WebhookRecord { eventId, type, at, outcome }
```

Calculs dérivés (purs, dans `types.ts`) : `fundedCents` (financements `paid`), `releasedCents` (étapes `paid`), `reservedCents` (étapes `releasing`), **`escrowCents = funded − released − reserved`**, `currentStep`, `progressPercent = released ÷ budget`.

## 7. Règles métier

### 7.1 Machine d'états d'une étape

```
upcoming ──(séquestre couvre le montant ET aucune autre étape en cours)──► active
active/rejected ──(preuve envoyée par la personne de confiance ou le financeur)──► proof_submitted
proof_submitted ──(devis demandé puis « Confirmer et payer »)──► releasing     (fonds réservés)
proof_submitted ──(« Refuser », note facultative)──► rejected  ──(nouvelle preuve)──► proof_submitted
releasing ──(webhook payout réussi)──► paid     ──► l'étape suivante peut s'ouvrir
releasing ──(webhook / réponse « échec »)──► proof_submitted   (la preuve reste valable : on peut réessayer)
```

`domain.ts` : `activateSteps` (règle d'ouverture), `applyFundingPaid` (crédite **une seule fois**, renvoie `false` si déjà payé), `applyPayoutCompleted`, `applyPayoutFailed`. Toutes mutent un **brouillon** de la base à l'intérieur de `withDb`.

### 7.2 Validation d'un paiement en trois temps (`services.confirmRelease`)

1. **Phase 1 (transaction base)** : vérifier statut + devis non expiré + séquestre suffisant ; passer l'étape en `releasing`, enregistrer le `payout` (`initiated`), écrire `step_approved` et `payout_started` dans le registre.
2. **Phase 2 (hors verrou)** : appeler `gateway.startPayout` (initialize puis finalize chez Bitnob).
3. **Phase 3 (transaction base)** : stocker `payoutId` et le statut renvoyé ; si « terminé » tout de suite, appliquer ; si exception, `applyPayoutFailed` (retour à `proof_submitted`) puis HTTP 502.

La **fin** du paiement arrive normalement par **webhook** (`payouts.withdrawal.success`…). Repli : `reconcile()` (§ 12, point D11).

**Règles de sécurité de l'argent (B2.2).** Seul un refus net de Bitnob (réponse 4xx : solde insuffisant, validation, montant trop élevé) ramène l'étape à `proof_submitted` tout de suite. Si `finalize` reste sans réponse claire (`GatewayError.ambiguous` : réseau, délai, 5xx), le débit a peut-être eu lieu : l'étape reste `releasing` avec `payout.uncertain`, et `reconcile()` suit le statut réel du payout (`GET /api/payouts/:id`). Après `UNCONFIRMED_GRACE_MS` (5 min) elle conclut à l'échec seulement si le payout est encore `INITIATED`/`QUOTE` (jamais finalisé) ou introuvable par `reference`. L'écriture de la phase 3 est hors du `try` de la phase 2, donc une panne de disque après un paiement réussi ne déclare plus d'échec. Chaque décision est revérifiée dans la transaction : un paiement remplacé entre-temps n'est jamais touché.

### 7.3 Financement (`services.createFunding`)

Minimum 5 $. Refus si le montant dépasse le reste du budget de plus de 500 $. Lightning seulement. Montant converti en sats avec `gateway.btcUsd()`, limite **20 000 000 sats** par facture. `reference = nobpay:fund:<id>` sert d'identifiant d'idempotence côté Bitnob et de clé de rapprochement des webhooks. Facture valable 24 h.

### 7.4 Registre enchaîné et ancrage

- `hash = sha256(prevHash | seq | type | at | canonicalJson(data))`, `prevHash` du premier évènement = 64 zéros (`GENESIS`). Un registre **par projet**. Types : `project_created`, `funding_paid`, `proof_submitted`, `step_approved`, `step_rejected`, `payout_started`, `payout_completed`, `payout_failed`.
- **Dossier** (`buildDossier`) : JSON canonique (clés triées, `undefined` supprimé, `canonicalize` dans `src/lib/canonical.ts`, **partagé avec le navigateur**) de `{format:'nobpay-dossier/1', project, ledger, headHash, generatedAt}`. `digest = sha256(json)`. Ce sont **ces octets exacts** qui sont ancrés.
- **Ancrage** (`anchors.createAnchor`) : envoie le digest à un calendrier OpenTimestamps (`alice`/`bob` `.btc.calendar.opentimestamps.org`, `finney.calendar.eternitywall.com`), garde le fichier `.ots` détaché. **Idempotent par `upToSeq`**. Statut `pending` jusqu'à ce que le calendrier ait inclus l'empreinte dans un bloc Bitcoin (en général quelques heures) ; `refreshAnchor` demande l'attestation (`upgrade`) et peut recouper le bloc avec `blockstream.info` (`checkBitcoinBlock`).
- **Vérification publique** : `src/lib/verify.ts` (navigateur, WebCrypto avec repli SHA-256 en JS pur) recalcule le digest et toute la chaîne. L'identifiant d'ancrage (`a_` + 8 octets hex) fait office de lien non devinable.
- **Non vérifié :** la **confirmation Bitcoin réelle** d'un ancrage (aucun n'a encore dépassé l'état `pending`) et l'hypothèse d'**ordre des octets** du recoupement de bloc (racine de Merkle d'affichage inversée = valeur interne). À contrôler dès qu'un ancrage de la nuit est confirmé.

## 8. Intégration Bitnob

Documentation lisible : **https://bitnob.dev** (`docs.bitnob.co` ne se résout pas). Les pages ont été lues par un résumeur automatique : **tout ce qui est marqué « hypothèse » doit être confirmé en sandbox**.

### 8.1 Authentification des requêtes (`bitnob/sign.ts`, testé)

Base `https://api.bitnob.com` pour sandbox **et** production : **l'environnement dépend de la clé utilisée**. En-têtes : `X-Auth-Client` (client id), `X-Auth-Timestamp` (secondes), `X-Auth-Nonce` (16 octets hex), `X-Auth-Signature` = HMAC-SHA256 hex de `CLIENT_ID:TIMESTAMP:NONCE:PAYLOAD` avec le secret client, où `PAYLOAD` est le **corps JSON exact** (chaîne vide sans corps). La méthode et le chemin ne sont pas signés d'après la doc.

### 8.2 Appels faits par `bitnob/client.ts` (observés en sandbox le 18 oct. 2026)

Détail, écarts et hypothèses restantes : **`docs/BITNOB-SANDBOX-REPORT.md`**. Jeux d'essai : `frontend/tests/fixtures/bitnob/`, tests : `tests/bitnob-client.test.ts`.

| Usage | Appel | Corps envoyé | Réponse lue | Statut |
|---|---|---|---|---|
| Facture | `POST /api/lightning/invoices` | `{amount (sats), description, reference, expiry (s)}` | `data.{id, payment_hash, request, expires_at}` | **Confirmé** (facture `lntb…`, testnet) |
| Statut facture | `GET /api/lightning/invoices/:id` | | `data.status`, `preimage` (déjà visible avant paiement) | **Partiel** : valeur de `status` payée non observée |
| Prix BTC | `GET /api/trading/prices` | | `data.prices[]` (`BTC/USDT`) | **Confirmé** |
| Soldes | `GET /api/balances` | | `data.accounts[]` | **Confirmé** (non utilisé par `Gateway`, B0.6) |
| Conversion BTC→USDT | `POST /api/trading/quotes` puis `/orders` | `{base_currency:'BTC', quote_currency:'USDT', side:'sell', quantity}` | `price`, `id` | **Hypothèse** (jamais exécuté : pas de solde) |
| Pays supportés | `GET /api/payouts/supported-countries/SN` | | champs sous `data.destination_types.mobile_money.fields` ; limites 100–200 000 XOF | **Confirmé** (n'est plus appelé à chaque paiement) |
| Devis payout | `POST /api/payouts/quotes` | `{amount, country:'SN', from_asset:'USDT', to_currency:'XOF', source:'offchain', payment_reason, reference}` | `data.payout.{quote_id, settlement_amount, fees, exchange_rate.effective_rate, expires_at}` | **Confirmé** (devis valable ~16 min) |
| Initialiser | `POST /api/payouts/:quoteId/initialize` | `{quote_id, reference, payment_reason, callback_url?, beneficiary{destination_type, country, account_name, account_number, network, sender{account_name, country}}}` | `data.payout.{id, status:'INITIATED'}` | **Confirmé** (`sender` obligatoire ; réseaux `wave`/`orange`/`free`) |
| Finaliser | `POST /api/payouts/:quoteId/finalize` | (vide) | succès : **non observé** ; sans fonds : `422 INSUFFICIENT_FUNDS` | **Partiel** |
| Statut payout | `GET /api/payouts/:payoutId` | | `data.payout.{status, provider_settlement_id}` | **Confirmé** (id du payout) |
| Retrouver un payout | `GET /api/payouts?limit=100` | | `data.items[].{id, reference, status}` (un simple devis y figure avec notre `reference`), pagination `total_count/limit/offset/has_more` | **Confirmé** (utilisé pour reprendre un paiement ambigu) |

Statuts de payout vus : `QUOTE`, `INITIATED` ; documentés : `initiated`, `processing`, `success`, `expired` (webhooks), `PENDING`/`COMPLETED`/`FAILED` acceptés par notre correspondance. **Limite : 200 000 XOF par paiement mobile money au Sénégal** (devis refusé au-delà, ≈ 336 $). Endpoints existants non utilisés : `POST /api/customers`, `POST /api/lightning/decode`, `POST /api/lightning/pay`, `GET /api/payouts/limits`.

Les analyseurs restent **tolérants** là où rien n'a été observé. Rails de payout vus dans la doc (instantané à revalider) : XOF Sénégal (Orange Money, Free Money, Expresso, Wave), Côte d'Ivoire, Niger ; GHS MTN MoMo ; KES M-Pesa ; NGN NIP ; RWF/UGX MTN-Airtel ; XAF Cameroun et Gabon ; USD ACH/wire/SWIFT. **Toujours vérifier `GET /api/payouts/supported-countries` avant de promettre un corridor.**

### 8.3 Récepteur de webhooks (`webhooks.ts`, route `POST /api/webhooks/bitnob`, testé)

Ordre **obligatoire** des contrôles, avant tout crédit :

1. **Signature** : en-tête `x-bitnob-signature` = HMAC-SHA512 du **corps brut** (hex ; base64 et préfixe `sha512=` acceptés), comparaison en temps constant, sur le texte lu **avant** tout `JSON.parse` → sinon **401**. Sans `BITNOB_WEBHOOK_SECRET` : 503.
2. **Rejeu** : l'`event_id` (sinon le SHA-256 du corps) est déjà dans `db.webhooks` → **200** sans rien faire. Un évènement n'est « vu » qu'**une fois appliqué** : ceux classés `unknown_invoice`, `unknown_payout` ou `amount_mismatch` sont journalisés mais **peuvent être retraités** (renvoi depuis le tableau de bord). Le journal garde 500 entrées au plus.
3. **Ressource connue** : facture ou payout inconnu → **200**, rien n'est crédité (Bitnob ne relance donc pas : le repli est l'interrogation, voir D11).
4. **Montant** (factures Lightning) : si l'évènement porte un montant lisible (`amount`, `amount_sats`, `amount_msat`…, lu comme sats, millisats ou BTC, tolérance 0,5 %) qui ne correspond pas à la facture → `amount_mismatch`, **pas de crédit**, raison dans `WebhookRecord.note`. Sans montant lisible, l'évènement signé est crédité : le champ réel sera fixé en B0.5. Le montant des payouts n'est pas comparé.
5. **Application** : idempotente (`applyFundingPaid` ne crédite qu'une fois même avec un nouvel `event_id`).

Un évènement valide reçoit toujours **200** (Bitnob réessaie 3 fois avec attente croissante). La **ressource** visée est trouvée par les **identifiants du contenu** (`id`, `invoice_id`, `payment_hash`, `reference`, `payout_id`, `quote_id`, à n'importe quelle profondeur) et non par le nom de l'évènement : un paiement Lightning reçu peut arriver comme `btc.lightning.received.success` **ou** comme un générique `transfer.success`, un payout comme `payouts.withdrawal.success` ou `transfer.success`. Le nom (expressions régulières : succès `success|completed|paid|received…`, échec `fail|expire|cancel|reject|declin`) ne dit que succès ou échec ; un évènement nommé `payout`/`withdrawal` n'est jamais rapproché d'une facture. Évènement qui ne correspond à rien : `unknown_invoice`, `unknown_payout` ou `unknown_transfer` (retraitable).

**Capture :** avec `CAPTURE_WEBHOOKS=1`, chaque livraison reçue (même rejetée) est écrite dans `.data/webhook-captures/` : corps brut tel quel, en-têtes avec signature masquée, réponse donnée. À utiliser pour récupérer les vraies charges utiles (B0.5, B0.8).

Exemples proposés par les mentors pour tester leur propre serveur : « Rejouer le webhook » et « Forger un faux webhook ». Les tests `tests/webhook.test.ts` couvrent ces deux cas.

### 8.4 Dans le tableau de bord Bitnob (observé au workshop)

Bandeau « **Sandbox Mode** » avec bascule « Live mode » : **ne jamais basculer en live**. Portefeuilles BTC / USDC / USDT, boutons Send / Receive / Convert, onglet Customers. Création d'un webhook : nom, **URL HTTPS publique**, **secret de signature choisi par nous**, 1 à 5 tentatives, **pas de filtre d'évènements** (filtrer dans le code). Création d'une clé API (Settings → API keys) : nom, liste blanche d'IP en CIDR (vide si hébergement sans IP fixe), date d'expiration. Attention : l'exemple Lightning montré au workshop avait une facture `lnbc…` (préfixe **mainnet**) alors que le tableau de bord affichait 0 $ en sandbox. **Vérifier que la sandbox ne dépense pas de vrai bitcoin** avant tout test de paiement. Les références `demo-xxxx` vues dans les transactions suggèrent une simulation : demander à un mentor **comment payer une facture Lightning en sandbox**.

## 9. Routes HTTP internes (contrat avec le frontend)

Erreurs : `{ "error": "message en français", "code"?: "…" }` avec le statut HTTP (400, 401, 403, 404, 409, 413, 415, 502, 503). `respond()` (`http.ts`) fait la conversion. **Ne pas changer ces formes sans prévenir le chef de projet** : les composants client dépendent de `error` (affiché tel quel) et parfois de `code` (`gateway_error`, `quote_expired`, `insufficient_escrow`, `method_unavailable`, `too_large`, `no_quote`).

| Méthode et chemin | Accès | Corps → réponse |
|---|---|---|
| `POST /api/auth/otp` | public | `{phone}` → `{sent, demo:true, demoCode}` (**aucun SMS**, ne valide rien). **503** `sms_unavailable` si `ALLOW_DEMO` est refusé (aucun code n'existe) |
| `POST /api/auth/register` | public | `{firstName,lastName,country,phone,otp}` → cookie + `{user}` |
| `POST /api/auth/login` | public | `{phone, otp}` → cookie + `{user}` |
| `POST /api/auth/demo` | public | → cookie du compte démo `u_aminata`. **403** `demo_disabled` si `ALLOW_DEMO` est refusé |
| `POST /api/auth/logout` | public | → `{ok}` ; déconnecte l'utilisateur **partout** (version de session), sauf le compte démo partagé |
| `POST /api/projects` | session | `{name,sector,city,budgetCents,managerName,managerPhone?,steps[{title,amountCents,proofKinds[]}]}` → `{id, managerToken}` (somme des étapes = budget ; 1 à 12 étapes ; budget 100 $ à 500 000 $) |
| `GET /api/projects/:id/state` | session | → `{escrowCents, releasedCents, steps[{id,status,payoutStatus,payoutError,paidAt}]}` (appelle `reconcile()`) |
| `POST /api/projects/:id/fundings` | session | `{amountCents, method:'lightning'}` → `{funding}` |
| `GET /api/fundings/:id` | session | → `{funding}` (interroge Bitnob en sandbox, puis tente la conversion BTC→USDT) |
| `POST /api/fundings/:id/simulate` | session, **mock seulement** et `ALLOW_DEMO` (403 sinon) | → `{funding}` |
| `POST /api/projects/:id/steps/:stepId/proof` | champ `token` (personne de confiance) **ou** session | `multipart` : `photos[]` (6 max), `photoMeta` (JSON : `takenAt`, `lat`, `lng`, `accuracy`), `invoice`, `invoiceAmountFcfa`, `supplierName`, `supplierPhone`, `supplierNetwork`, `note` → `{step}` |
| `POST /api/projects/:id/steps/:stepId/quote` | session | `{simulate?}` → `{quote}` ; `simulate:true` (repli « Continuer en simulation ») : **403** `demo_disabled` sans `ALLOW_DEMO` |
| `POST /api/projects/:id/steps/:stepId/release` | session | → `{step:{id,status,payout}}` |
| `POST /api/projects/:id/steps/:stepId/reject` | session | `{note?}` → `{step}` |
| `GET /api/files/:projectId/:fileId?t=<token>` | session du propriétaire **ou** `t` = jeton de la personne de confiance | octets ; CSP stricte, `nosniff` |
| `POST /api/projects/:id/anchors` | session | → `{anchor}` (idempotent par état du registre) |
| `POST /api/anchors/:id/refresh` | **public** (id non devinable) | → `{anchor}` (appelle les calendriers OTS et blockstream.info) |
| `GET /api/anchors/:id/ots` · `/dossier` | **public** | fichier `.ots` · JSON canonique exact |
| `POST /api/webhooks/bitnob` | signature | § 8.3 |
| `GET /api/health` | public | `{mode, demo, bitnobKeys, webhookSecret, webhookUrl}` (aucun secret) |
| `POST /api/dev/reset` | session **compte démo**, mock seulement, `ALLOW_DEMO` | remet les données de démonstration |

Les pages serveur (`accueil`, `projets`, etc.) lisent la base directement via `readDb()` et `views.ts` et appellent `reconcile()` : **il n'y a pas d'API de lecture générique**. Quand le backend change de forme de stockage, on garde l'interface `readDb()` / `withDb()` / `resetDb()` (voir roadmap, Phase 3).

## 10. Authentification actuelle (prototype, **à remplacer en partie**)

- Cookie `nobpay_session` = `<userId>.<version>.<expiration>.<HMAC-SHA256>` (HMAC complet, sur les trois champs), `httpOnly`, `sameSite=lax`, **`Secure` quand `PUBLIC_BASE_URL` est en https**, **7 jours**, renouvelé à l'usage (dans les routes d'API, seules à pouvoir écrire un cookie : un utilisateur qui ne ferait que lire des pages sans appeler l'API serait déconnecté au bout de 7 jours). `version` doit égaler `user.sessionVersion` : « Se déconnecter » l'incrémente, ce qui invalide tous les cookies de l'utilisateur sur tous ses appareils (sauf pour le compte démo, partagé). Secret = `SESSION_SECRET`.
- **`SESSION_SECRET` faible refusé** (absent, valeur par défaut, `change-me`, moins de 32 caractères) : le serveur **refuse de démarrer** en `sandbox`, ou en production avec `ALLOW_DEMO=0` (`src/instrumentation.ts` → `server/startup.ts`) ; en pratique Next répond alors 500 à toute requête, webhooks compris. Un second contrôle a lieu à chaque signature de cookie. En `mock` (y compris `npm start`), la valeur par défaut est tolérée avec un avertissement : c'est le plan B de la démonstration.
- **`ALLOW_DEMO`** : `1` autorise, `0` refuse, absent = autorisé **en `mock` seulement**. Conditionne : le compte démo, le code SMS unique `DEMO_OTP`, `POST /api/dev/reset`, `POST /api/fundings/:id/simulate` et le paiement « Continuer en simulation ». Les boutons correspondants sont masqués. **Conséquence : sans `ALLOW_DEMO=1`, en `sandbox`, personne ne peut se connecter**, car il n'existe pas encore de vrai envoi de SMS (B1.1). Avec `ALLOW_DEMO=1` en sandbox, un avertissement est affiché au démarrage.
- **Reste faux :** le code SMS est la valeur unique `DEMO_OTP` (123456) pour tout le monde et `POST /api/auth/otp` ne mémorise rien : **n'importe qui connaissant un numéro peut ouvrir ce compte** dès que `ALLOW_DEMO` est autorisé. Acceptable en démonstration devant des personnes de confiance, **inacceptable** avec de vraies données (B1.1).
- Garde-fou « jamais de clés live » : en `sandbox`, le démarrage est refusé si `BITNOB_CLIENT_ID` ou `BITNOB_CLIENT_SECRET` ressemble à une clé de production (`prd:…`, `live_…`). C'est une heuristique sur le préfixe, pas une preuve.
- La personne de confiance n'a pas de compte : elle possède un **jeton** (`managerToken`, 24 caractères hex, aussi dans l'URL `/terrain/<jeton>`), valable indéfiniment, qui donne accès aux fichiers du projet et au dépôt de preuves.

## 11. Configuration (`frontend/.env.example` → `frontend/.env.local`, jamais committé)

| Variable | Rôle | Défaut |
|---|---|---|
| `BITNOB_MODE` | `mock` ou `sandbox` | `mock` |
| `BITNOB_BASE_URL` | hôte de l'API | `https://api.bitnob.com` |
| `BITNOB_CLIENT_ID`, `BITNOB_CLIENT_SECRET` | clés API (sandbox) | vide |
| `BITNOB_WEBHOOK_SECRET` | secret de signature des webhooks (celui choisi dans le tableau de bord) | vide ; en mock : `nobpay-mock-webhook-secret` |
| `PUBLIC_BASE_URL` | URL publique (webhook, liens) | `http://localhost:3000` |
| `SESSION_SECRET` | signe le cookie de session ; aussi graine des préimages simulées. **32 caractères au moins, obligatoire en sandbox** (§ 10) | valeur de dev publique, tolérée en `mock` seulement |
| `ALLOW_DEMO` | `1` / `0` / absent : facilités de démonstration (§ 10) | absent = autorisé en `mock` seulement |
| `DEMO_OTP` | code SMS unique de démonstration (utilisé seulement si `ALLOW_DEMO` autorise) | `123456` |
| `USD_XOF_RATE`, `BTC_USD_RATE` | taux indicatifs (mock + repli) | 760 ; 81500 |
| `DATA_DIR` | dossier de la base et des dépôts | `./.data` |
| `CAPTURE_WEBHOOKS` | `1` : enregistre chaque webhook reçu dans `.data/webhook-captures/` (débogage sandbox) | absent |

`GET /api/health` indique le mode, la présence des clés et l'URL de webhook attendue.

## 12. Lancer, tester, déboguer

```bash
cd frontend
npm install
npm run dev                # http://localhost:3000   (le service worker n'existe qu'en production)
npm run typecheck
npm test                   # 102 tests Vitest
npm run build && npm start # production locale
```

- **Compte démo :** bouton « Essayer avec le compte démo » (ou `POST /api/auth/demo`). Code SMS `123456`. Projets : `p_villa` (Résidence à Thiès, 24 000 $, preuve de l'étape 3 en attente), `p_champ` (Pépinière à Kaolack, 9 000 $), `p_boutique` (Import de stock à Dakar, 5 000 $). Jetons terrain : `demo-villa-thies`, `demo-champ-kaolack`, `demo-boutique-sandaga` (ex. `/terrain/demo-villa-thies`).
- **Réinitialiser :** supprimer `frontend/.data/` (la base est recréée depuis `seed.ts`) ou Profil → « Réinitialiser les données » (mock + compte démo).
- **Tests existants :** `sign` (signatures Bitnob), `webhook` (forgé, rejeu, idempotence, JSON invalide ; base temporaire en mode sandbox), `ledger` (chaîne, jeu de démonstration), `ots` (format `.ots`), `verify` (SHA-256 navigateur, dossier falsifié).
- **Parcours de démonstration (5 min)** : décrit dans le `README.md` à la racine.
- Le site a été testé de bout en bout dans **Edge (Chromium) en mode headless**, téléphone (390 px) et ordinateur (1440 px), en mode `mock`. **Safari, Firefox et iOS ne sont pas testés.**
- Environnement du chef de projet : Windows, PowerShell, Node et Git **portables** (sans droits administrateur). Les fichiers `.ps1` doivent être enregistrés en **UTF-8 avec BOM** (PowerShell 5.1).

## 13. État de vérification (honnête)

| Élément | Statut |
|---|---|
| Signature des requêtes Bitnob, récepteur de webhooks, registre, format `.ots`, vérification navigateur | **Testé** (tests automatiques) |
| Parcours complet financeur + terrain + vérification | **Testé** en mode `mock`, Edge, téléphone et ordinateur |
| Dépôt d'une empreinte chez un vrai calendrier OpenTimestamps | **Testé** (statut `pending` atteint) |
| Confirmation Bitcoin d'un ancrage, recoupement de bloc | **Non vérifié** (attendre quelques heures) |
| Appels à l'API Bitnob sandbox : facture, prix, soldes, pays, devis, initialisation | **Testés en vrai le 18 oct. 2026** (rapport + tests rejoués). **Jamais vus** : paiement d'une facture, `finalize` réussi, webhooks réels, conversion BTC→USDT (aucun solde en sandbox). |
| Charges utiles réelles des webhooks Bitnob | **Jamais vues** (formes documentées dans le rapport) |
| Safari / Firefox / iOS / installation PWA sur téléphone | **Non testé** |
| Charge, concurrence multi-processus, sécurité en production | **Non évalué** |

## 14. Dette technique et risques connus

Gravité : **S1** = bloque toute exposition publique, **S2** = peut perdre ou bloquer de l'argent, **S3** = qualité / confiance. Les numéros D# sont repris dans la roadmap.

| # | Gravité | Problème |
|---|---|---|
| D1 | S1 | **OTP unique global** ; `/api/auth/otp` ne valide rien (§ 10). Atténué : fermé hors `mock` sans `ALLOW_DEMO=1`. **Reste ouvert** tant que B1.1 n'est pas fait. |
| D2 | S1 | ~~`/api/auth/demo` actif dans tous les modes ; `SESSION_SECRET` par défaut ; cookie non `Secure` ; pas de révocation de session.~~ **Corrigé** (B1.2, B1.3, § 10). Reste : renouvellement du cookie seulement via les routes d'API. |
| D3 | S1 | ~~Aucune limitation de débit~~ **Corrigé (B1.4)** : `server/rateLimit.ts`, en mémoire (un seul processus ; à remplacer par Redis si plusieurs instances). Limites dans `LIMITS` : code SMS (5 / 10 min par numéro, 20 par adresse), connexion et inscription (8 par numéro, 20 par adresse), compte démo, dépôt de preuves (20 / 10 min par jeton ou compte), création de projet / financement / ancrage, lecture publique (dossier, `.ots`, fichiers), `anchors/:id/refresh` (30 / 10 min par adresse **et** une vérification toutes les 20 s par ancrage), webhook (600 / min, large : Bitnob réessaie sur un 429). Réponse **429** `rate_limited`, message français, en-tête `Retry-After`. `RATE_LIMIT=0` désactive (tests). Adresse du client : entrée `X-Forwarded-For` ajoutée par notre proxy (`TRUSTED_PROXY_HOPS`, défaut 1). |
| D4 | S1 | Base = **un fichier JSON** (`db.ts`) : un seul processus, réécriture complète à chaque écriture, pas de sauvegarde, pas de migration. Inadapté aux hébergements sans disque partagé. |
| D5 | S1 | Dépôts de fichiers : type MIME **fourni par le client**, pas de contrôle des octets (magic bytes) ; stockage sur disque local. |
| D6 | S2 | **Le séquestre est un nombre dans notre base**, jamais rapproché du solde Bitnob (`GET /api/balances` non utilisé). Portefeuille Bitnob commun à tous les projets. |
| D7 | S2 | La **conversion BTC→USDT** n'est tentée que dans `refreshFunding` (quand l'écran de financement interroge), **pas** quand le webhook crédite. Le paiement fournisseur part d'USDT : fonds insuffisants possibles. De plus, un résultat `failed` est stocké dans `funding.conversion` et **empêche toute nouvelle tentative**, et deux sondages simultanés passent tous deux le test `!funding.conversion` (instantané périmé) : **double vente possible**. |
| D8 | S2 | ~~Le webhook ne compare pas le montant reçu~~ : **fait pour les factures** (§ 8.3, point 4), avec le champ réel à confirmer en B0.5. Reste : le **repli par interrogation** (`refreshFunding`) crédite sur le seul statut, sans montant ; le montant des payouts n'est pas comparé. |
| D9 | S2 | ~~Pas d'idempotence ni de reprise sur `initialize` → `finalize`~~ **Corrigé (B2.2, § 7.2)** : un `finalize` sans réponse claire (réseau, délai, 5xx) laisse l'étape `releasing` et le séquestre réservé (`payout.uncertain`) ; la reprise interroge Bitnob et ne conclut à l'échec que s'il le dit, ou si le paiement n'a **jamais démarré** (non finalisé ou référence inconnue) après **5 minutes**. Un arrêt du processus entre les deux écritures est repris par recherche de la `reference`. **Reste :** une référence neuve est créée à chaque nouveau devis, donc si un `finalize` perdu s'exécutait chez Bitnob plus de 5 minutes plus tard, un double paiement resterait possible (très improbable ; à surveiller avec les soldes, B2.5). |
| D10 | S2 | Aucun **remboursement** : le financeur ne peut pas récupérer un séquestre inutilisé (projet abandonné). Fonctionnalité produit manquante. |
| D11 | S2 | `reconcile()` s'exécute **pendant le rendu des pages et le sondage `/state`** (écritures dans des requêtes GET ; en sandbox, un appel Bitnob par rendu pour chaque payout en cours). À sortir dans une tâche de fond. |
| D12 | S3 | **Position GPS et heure déclarées par le client** (§ 4) ; l'EXIF n'est pas lu. |
| D13 | S3 | Jeton de la personne de confiance **sans expiration ni rotation**. |
| D14 | S3 | Ancrages créés **à la main** (bouton) ; pas de tâche qui appelle `upgrade` et confirme tout seul. Dépendance à `blockstream.info` pour le recoupement. |
| D15 | S3 | `services.ts` (financement, devis, paiement) et `bitnob/client.ts` **n'ont pas de test automatique** (pas de `fetch` simulé). |
| D16 | S3 | Dates relatives (« Hier ») calculées avec le **fuseau du serveur**. |
| D17 | S3 | Une seule règle d'approbation ; aucune notification (ni e-mail, SMS, WhatsApp, push). |
| D18 | S3 | Le **registre ne note pas le mode** (`mock` / `sandbox`) : un paiement fait via « Continuer en simulation » en sandbox (`payout.mode = 'mock'`) est identique à un vrai dans le dossier ancré et vérifiable publiquement. Contraire à la règle d'honnêteté. Corriger = ajouter un champ aux données des évènements : **décision du chef de projet** (format du registre). |
| D19 | S3 | `npm audit --omit=dev` : Next.js 14.2.35 a des avis critiques / élevés (déni de service, SSRF des Server Actions, empoisonnement de cache…). Correctif = changement de version majeure. Peu pertinent pour une démonstration locale, à traiter avant un hébergement public. |
| D20 | S3 | `db.ts` : `holder.db` est remplacé **avant** l'écriture sur disque ; si l'écriture échoue, la mémoire a une avance sur le fichier. |

## 15. Conventions de travail avec le chef de projet

- **Réponses en français, courtes et concrètes.** Le chef de projet a déjà dit « c'est trop long » : pas de pavés.
- **Chiffres toujours sourcés**, aucune affirmation inventée, incertitudes signalées.
- Le chef de projet **valide les choix de produit** ; vous décidez des choix techniques internes, en les justifiant en une phrase.
- **Ne jamais committer de secret** (`.env*` est ignoré). Ne jamais coller une clé ou un secret dans une conversation, un fichier suivi par Git, un message de commit ou un journal.
- Commits petits, message en anglais à l'impératif (`Fix …`, `Add …`), une branche par sujet (`backend/<sujet>`), pas de `push --force` sur `main`.
- **Avant** : `npm run typecheck && npm test`. **Après un changement visible côté écran** : relancer le parcours dans le navigateur (mock **et** sandbox si possible).
- **Ne cassez pas le mode `mock`** : c'est la démonstration de secours devant le jury.
- Le code existant est commenté en anglais, l'interface en français. Gardez cette séparation.
- Si un doute porte sur de l'argent réel, des données personnelles ou une action irréversible : **demandez** au chef de projet.

## 16. Glossaire

**Séquestre** : argent conservé et libéré seulement sur validation. **Étape** : une tranche du budget payée contre une preuve. **Preuve** : photos + facture (+ titre foncier) + bénéficiaire à payer. **Personne de confiance / terrain** : celui qui envoie les preuves depuis un lien privé. **Devis** : taux, frais et montant FCFA garantis quelques secondes avant un paiement. **Registre** : chaîne d'évènements hachés d'un projet. **Dossier** : export JSON canonique du projet et de son registre. **Ancrage** : publication de l'empreinte du dossier sur Bitcoin (OpenTimestamps). **`.ots`** : preuve OpenTimestamps détachée. **Sats** : satoshis (1 BTC = 10⁸ sats). **XOF / FCFA** : franc CFA d'Afrique de l'Ouest. **Mock / sandbox** : modes § 5.3.

## 17. Autres fichiers à lire

- `docs/ROADMAP-BACKEND.md` : le plan de travail complet, tâche par tâche.
- `docs/PROMPT-CLAUDE-BACKEND.md` : le message à donner à Claude pour démarrer.
- `README.md` : démarrage, parcours de démonstration, passage en sandbox.
- `frontend/design-reference/COPY-RULES.md` : règles de rédaction et jeu de données de démonstration.
- `frontend/src/server/` : le code ; commencer par `services.ts`, `domain.ts`, `webhooks.ts`, `bitnob/client.ts`.
