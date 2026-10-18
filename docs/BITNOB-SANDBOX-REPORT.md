# Rapport sandbox Bitnob (B0.10, partiel)

> Observé le **18 octobre 2026** avec une clé **sandbox** (`GET /api/whoami` → `environment: "sandbox"`, `auth_method: "hmac"`), depuis un Codespace GitHub. Aucun argent réel, aucune facture mainnet : les factures commencent par `lntb` (testnet).
> Les réponses rejouées par les tests sont dans `frontend/tests/fixtures/bitnob/` (identifiants remplacés, facture masquée). Aucun secret n'est enregistré.
> **Mise à jour : la sandbox a maintenant des fonds** (voir « Financer le sandbox ») et **un paiement mobile money réel a été exécuté de bout en bout**, par un appel direct puis par l'application. **Reste à observer :** le paiement d'une facture Lightning (aucun moyen trouvé), le nom réel de l'évènement de réception Lightning, la vente BTC→stablecoin (pas de BTC), un paiement en échec (`payouts.withdrawal.expired`).

## Financer le sandbox (résolu pour les stablecoins)

1. `GET /api/stablecoins/supported-chains` donne la liste des chaînes du sandbox. Table de la doc ([Receiving Stablecoin Deposits](https://bitnob.dev/docs/stablecoins/receiving-stablecoin-deposits)) : `ethereum`→**Sepolia**, `polygon`→Amoy, `avalanche`→Fuji, `base`→Base Sepolia, `solana`→Devnet, `stellar`→Testnet.
2. `POST /api/addresses` (`chain` en lettres et chiffres, ex. `ethereum`) crée une adresse de dépôt **par chaîne**. Le faucet [Circle](https://faucet.circle.com/) envoie 20 USDC de test.
3. **Piège :** une adresse `0x…` est identique sur tous les réseaux EVM, mais Bitnob ne surveille une adresse que **sur sa chaîne**. Envoyer sur Avalanche Fuji vers l'adresse créée pour `polygon` ne crédite rien. Il faut le même réseau que la chaîne de l'adresse.
4. **Délai observé : ~10 minutes** entre la transaction (52 confirmations) et le crédit. Bitnob envoie alors `deposit.success` et crée une transaction `DEPOSIT_CONFIRMED` / `SETTLED`.
5. Il n'existe toujours **aucun moyen de payer une facture Lightning `lntb`** ni de créditer du BTC : la réception Lightning n'a pas pu être vue en vrai. (Le crédit du séquestre, dans les tests de bout en bout, a été fait avec **notre propre évènement signé**, clairement distinct d'une livraison Bitnob.)

## Webhooks réels capturés (18 oct. 2026)

- En-têtes : `x-bitnob-signature` (**128 caractères hexadécimaux : HMAC-SHA512 du corps brut, vérifié par notre récepteur**, donc le secret et l'algorithme sont bons), `x-bitnob-event-id` (= `event_id`), `user-agent: Wand-Webhook-Delivery/1.0`, `x-delivery-service: wand`, `content-type: application/json, application/json` (dupliqué), adresse source `18.135.67.154`. Les deux pages de la doc qui se contredisaient (SHA-256 ou SHA-512) : **SHA-512 est le bon**.
- `deposit.success` : `data.{address, amount (unités minimales : 20000000 = 20 USDC), chain, currency, fee, from_address, hash, reference "RCV_USDC_…", timestamp, transaction_id}`. Non utilisé comme source de séquestre (les dépôts stablecoin ne sont pas encore pris en charge, B4.1) : réponse 200, résultat `unknown_transfer`.
- `payouts.initialized`, `payouts.processing`, `payouts.withdrawal.success` : `data.{id (id du payout), quote_id, reference (la nôtre), status (initiated / processing / success), amount, from_asset ("usdc"), to_currency, settlement_amount, fees, beneficiary (numéro masqué ****4567), created_at, updated_at, completed_at}`. **Pas de `payout_id`** : l'identifiant est `data.id`.
- **Rapidité :** les 3 évènements arrivent dans la **même seconde** que la réponse de `finalize`, et `completed_at` est à ~0,6 s de `created_at`. Le webhook de succès peut donc précéder l'enregistrement de la réponse de `finalize` (défaut corrigé, voir `tests/payout-race.test.ts`).

## Paiement réel de bout en bout (observé)

`quotes` (10 $ USDC → 5 948 XOF, taux effectif 594,8, frais 0) → `initialize` (`INITIATED`) → `finalize` (**200 `PENDING`**, `provider_settlement_id: sandbox_txn_…`) → `GET /api/payouts/:id` = `SUCCESS` en quelques secondes. Transaction de débit `PAYOUT` / `SETTLED` (`-10.0 USDC`). Même parcours **par l'application** : projet, vraie facture `lntb`, preuve (photo + PDF), devis, paiement 5 $ → étape `paid`, séquestre et registre cohérents.

## `GET /api/balances` n'est pas fiable en sandbox

Après un dépôt de 20 USDC et un paiement de 10, l'endpoint a affiché tantôt `0`, tantôt `10000000`, tantôt `0` de nouveau, alors que la liste des transactions (+20, −10) et le fait que `finalize` ait été accepté montraient un solde réel de 10. Les montants sont en **unités minimales** (USDC/USDT : 6 décimales), avec des champs `*_formatted` ("10.0 USDC"). Notre `balances()` lit les champs formatés et prend le **plus élevé** entre l'endpoint et la somme des transactions réglées. **Question pour Bitnob :** pourquoi le solde est-il instable ?

## Appels observés

| Appel | Observé | Écart avec nos hypothèses | Correction |
|---|---|---|---|
| Authentification | HMAC-SHA256 de `CLIENT_ID:TIMESTAMP:NONCE:PAYLOAD`, 4 en-têtes `X-Auth-*` : **conforme**. Le tableau de bord ne montre qu'**un seul** jeton `prd:sandbox_…` : c'est le **secret** ; le Client ID est un UUID fourni à part. Clé avec **liste blanche d'IP** : `403 IP address not whitelisted` tant que l'IP sortante n'y est pas. | Aucun sur la signature. | — |
| `POST /api/lightning/invoices` | `201`, `data.{id, payment_hash, request, amount_sat, description, status:"pending", expires_at (ISO), created_at}`. `amount` = **sats**, `expiry` en secondes. Facture `lntb…` (testnet). | Conforme (`request`, `id`, `payment_hash`, `expires_at`). | Test + fixture. |
| `GET /api/lightning/invoices/:id` | `data.{…, preimage, amount_msat, direction:"incoming", reference, expires_at (**timestamp unix en chaîne**), status}`. Le **`preimage` est déjà présent alors que la facture est `pending`**. `reference` est renvoyée. | `preimage` visible avant paiement (particularité du sandbox) : notre code ne le lit que si `paid`, donc sans effet. Valeur de `status` après paiement : **non observée**. | Test. |
| `GET /api/trading/prices` | `data.prices[]` avec paires `BTC/USDC`, `USDC/USDT`, `BTC/USDT` (prix en chaîne). | Conforme : on prend `BTC/USDT`. | Test. |
| `GET /api/balances` | `data.accounts[]` : `currency`, `ledger_balance`, `available_balance` (chaînes). | — | Pas encore dans `Gateway` (B0.6). |
| `GET /api/payouts/supported-countries/SN` | `data.destination_types.mobile_money.fields` : `account_name`, `account_number` (motif `^(\+?221[7]\d{8}\|[7]\d{8})$`), `network` ∈ **`orange`, `free`, `expresso`, `wave`**, et un groupe obligatoire **`sender`** (`account_name`, `country`). `limits` : **100 à 200 000 XOF**. | Valeurs de `network` : **devinées juste**. Les champs sont sous `data.destination_types.mobile_money.fields`, pas `data.fields` : notre lecture dynamique ne trouvait rien. **`sender` manquait.** | `sender` ajouté (nom et pays du financeur) ; lecture dynamique supprimée ; numéro validé avec le motif de Bitnob avant tout appel. |
| `POST /api/payouts/quotes` | Exige **`payment_reason`** (OpenAPI : `amount, country, from_asset, payment_reason, reference, source, to_currency` obligatoires). Réponse : **`data.payout.{id, quote_id:"QT2_…", status:"QUOTE", amount, settlement_amount, fees, fee_currency:"USD", total_amount, exchange_rate.{rate, btc_rate, effective_rate}, expires_at (≈ +16 min), reference}`**. Exemple : 100 $ → 59 341,08 XOF, `rate` 594,6, `effective_rate` 593,4108, frais 0. | Réponse sous **`data.payout`** (nous lisions `data`) : le devis aurait échoué. `payment_reason` absent de notre requête. Taux réel ≈ **593 XOF/$** (notre simulation : 760). Devis valable ~16 min (nous supposions 60 s). | Lecture de `data.payout`, `payment_reason` envoyé, taux = `effective_rate`. |
| `POST /api/payouts/:quoteId/initialize` | **400 sans `sender`** (« sender: Sender is required »). Avec : `200`, `data.payout.{id, quote_id, status:"INITIATED", beneficiary (numéro normalisé en `221…`), reference, expires_at}`. L'`id` est **celui du payout du devis**. | `sender` obligatoire. Réponse sous `data.payout`. | Corrigé. |
| `POST /api/payouts/:quoteId/finalize` | **422 `INSUFFICIENT_FUNDS`** sans solde. Réponse en cas de succès : **non observée**. | — | `payoutId` pris à `initialize`. Messages d'erreur : `detail` lu, code conservé. |
| `GET /api/payouts/:id` | `200` avec l'**id du payout** ; `data.payout.{status:"INITIATED", provider_settlement_id:"sandbox_txn_…", callback_url, trip.{quote_at, initialized_at}}`. | Hypothèse « id de payout ou de devis » : **id du payout**. Réponse sous `data.payout`. | Corrigé. |
| `GET /api/payouts?limit=100` | `200`, `data.items[]` (mêmes champs qu'un payout, **y compris les simples devis**), `total_count`, `limit`, `offset`, `has_more`. Pas de filtre documenté par `reference` (seulement `status`, `limit`). | Nouveau : permet de retrouver un paiement par sa `reference` (reprise D9). | `findPayoutByReference`. |
| `POST /api/trading/quotes` | `200`, **`data.quote.{id, base_currency, quote_currency, side:"SELL", quantity, price, expires_at (+5 min), exchange.{receive_quantity, receive_currency}}`**. `side` insensible à la casse, quantité en BTC (décimal en chaîne). | Réponse sous **`data.quote`** (nous lisions `data.price` : la conversion échouait toujours). | Corrigé. |
| `POST /api/trading/orders` | Exige `quote_id` (id du devis) et `reference`. Sans solde : **503** « We couldn't process your order right now. **No funds were charged.** » (`upstream_service: trading-service`). Récupération par `GET /api/trading/orders/:id` : l'id doit être un **UUID** (« invalid id » pour une référence) ; la liste `GET /api/trading/orders` renvoie `data.orders[]`. | Ordre jamais exécuté. | Recherche par la liste ; un 409 `DUPLICATE_KEY_ERROR` = déjà passé. |
| `POST /api/addresses` | `chain` = lettres et chiffres seulement (`ethereum` accepté ; `ethereumsepolia`, `sepolia`… refusés « chain is required »). Crée un client et une adresse de dépôt `0x…` ; `reference` unique (409 sinon). | Piste pour du stablecoin de test : robinet Circle vers cette adresse, à essayer (réseau de test de `ethereum` inconnu). | — |
| Limite de montant | Devis de 6 000 $ : **400** « Amount 3567600.00 XOF exceeds maximum of 200000.00 XOF ». 300 $ passe (178 023 XOF) ; 400 $ échoue. | **Aucun paiement mobile money > ≈ 336 $** au Sénégal. | Message français clair. **Décision produit nécessaire** (voir ci-dessous). |

## Webhooks (documentation lue, charges **pas encore vues**)

`https://bitnob.dev/api-reference/payouts/webhooks` : en-tête `x-bitnob-signature` (HMAC-SHA512 de la charge), `x-bitnob-event-id` (= `event_id` du corps), 200 attendu sinon **3 nouvelles tentatives**. Évènements : `payouts.initialized`, `payouts.processing`, `payouts.withdrawal.success`, `payouts.withdrawal.expired` (pas d'évènement « failed » documenté). `data` : `id` (payout), `quote_id`, `reference`, `status` (`initiated`, `processing`, `success`, `expired`), `amount` (**dans `from_asset`**, donc USDT), `settlement_amount` (devise d'arrivée), `fees`, `beneficiary` (numéro masqué `****7654`). Notre routage par expressions régulières et `collectValues` couvre ces noms. À confirmer avec une vraie livraison (capture : `CAPTURE_WEBHOOKS=1`).

## Hypothèses restantes (mises à jour)

_Résolues le 18 oct. : réponse de `finalize` (`PENDING` puis `SUCCESS`), forme des webhooks `payouts.*` et `deposit.success`, algorithme de signature (SHA-512), `GET /api/payouts/:id` avec l'id du payout._

1. Valeur de `status` d'une facture payée, et nom/forme du webhook de réception Lightning (`btc.lightning.received.success` ?). Unité du champ montant de ce webhook (le contrôle de montant est tolérant en attendant).
2. Réponse de `finalize` réussi, et délai de passage à `COMPLETED` en sandbox.
3. Les **frais** s'ajoutent-ils au montant (`total_amount` vs `amount`) quand ils sont non nuls ? Ici `fees` = 0.
4. Conversion BTC→USDT (`/api/trading/quotes` puis `/orders`) : sens, unités, et nécessité (le payout est débité en USDT).
5. Un payout peut-il être retrouvé par `reference` (`GET /api/payouts` filtré ?) : nécessaire pour reprendre un paiement ambigu (D9).
6. Le webhook réel passe-t-il par `callback_url` ou par le webhook du tableau de bord (ou les deux : doublons ?).

## Décisions à prendre avec le chef de projet

- **Limite de 200 000 XOF par paiement mobile money (≈ 336 $).** Les étapes de démonstration (jusqu'à 6 000 $) ne peuvent pas être payées en un seul payout. Options : (a) découper un paiement en plusieurs payouts ≤ 200 000 XOF, (b) réduire les montants des étapes de démonstration en sandbox, (c) autre rail (banque) avec d'autres limites, à vérifier avec `GET /api/payouts/limits`.
- **Taux affiché.** Le taux réel (~593 XOF/$) est inférieur à celui de la simulation (760) : les chiffres en FCFA de la démonstration `mock` ne correspondent pas à la réalité.
