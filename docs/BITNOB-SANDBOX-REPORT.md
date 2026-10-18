# Rapport sandbox Bitnob (B0.10, partiel)

> Observé le **18 octobre 2026** avec une clé **sandbox** (`GET /api/whoami` → `environment: "sandbox"`, `auth_method: "hmac"`), depuis un Codespace GitHub. Aucun argent réel, aucune facture mainnet : les factures commencent par `lntb` (testnet).
> Les réponses rejouées par les tests sont dans `frontend/tests/fixtures/bitnob/` (identifiants remplacés, facture masquée). Aucun secret n'est enregistré.
> **Reste à observer :** le paiement d'une facture Lightning, le webhook réel de réception, `finalize` réussi, le webhook `payouts.*` réel, la conversion BTC→USDT. Tout cela demande un **solde** en sandbox (voir « Bloquant »).

## Bloquant : aucun solde, aucun moyen documenté d'en créer

- `GET /api/balances` : trois comptes (BTC, USDC, USDT), tous à **0**.
- `POST /api/payouts/:quoteId/finalize` sans fonds → **422 `INSUFFICIENT_FUNDS`** (« Insufficient funds to complete the transaction »).
- L'OpenAPI (`/api-collections/swagger/bitnob-api-v2.openapi.json`, 74 chemins) ne contient **aucun simulateur Lightning**. Seuls existent `POST /api/virtual-accounts/{id}/simulate-deposit` (comptes bancaires **nigérians** NGN, client avec BVN : inutilisable pour nous) et `POST /api/cards/{cardId}/simulate-webhook`.
- `POST /api/lightning/pay` exige un `customer_id` et un solde BTC.
- **Question à poser à un mentor Bitnob :** « Comment créditer du BTC ou de l'USDT en sandbox, ou payer une facture `lntb` créée par l'API ? Y a-t-il un bouton de simulation dans le tableau de bord (Lightning → factures) ? »

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
| Limite de montant | Devis de 6 000 $ : **400** « Amount 3567600.00 XOF exceeds maximum of 200000.00 XOF ». 300 $ passe (178 023 XOF) ; 400 $ échoue. | **Aucun paiement mobile money > ≈ 336 $** au Sénégal. | Message français clair. **Décision produit nécessaire** (voir ci-dessous). |

## Webhooks (documentation lue, charges **pas encore vues**)

`https://bitnob.dev/api-reference/payouts/webhooks` : en-tête `x-bitnob-signature` (HMAC-SHA512 de la charge), `x-bitnob-event-id` (= `event_id` du corps), 200 attendu sinon **3 nouvelles tentatives**. Évènements : `payouts.initialized`, `payouts.processing`, `payouts.withdrawal.success`, `payouts.withdrawal.expired` (pas d'évènement « failed » documenté). `data` : `id` (payout), `quote_id`, `reference`, `status` (`initiated`, `processing`, `success`, `expired`), `amount` (**dans `from_asset`**, donc USDT), `settlement_amount` (devise d'arrivée), `fees`, `beneficiary` (numéro masqué `****7654`). Notre routage par expressions régulières et `collectValues` couvre ces noms. À confirmer avec une vraie livraison (capture : `CAPTURE_WEBHOOKS=1`).

## Hypothèses restantes

1. Valeur de `status` d'une facture payée, et nom/forme du webhook de réception Lightning (`btc.lightning.received.success` ?). Unité du champ montant de ce webhook (le contrôle de montant est tolérant en attendant).
2. Réponse de `finalize` réussi, et délai de passage à `COMPLETED` en sandbox.
3. Les **frais** s'ajoutent-ils au montant (`total_amount` vs `amount`) quand ils sont non nuls ? Ici `fees` = 0.
4. Conversion BTC→USDT (`/api/trading/quotes` puis `/orders`) : sens, unités, et nécessité (le payout est débité en USDT).
5. Un payout peut-il être retrouvé par `reference` (`GET /api/payouts` filtré ?) : nécessaire pour reprendre un paiement ambigu (D9).
6. Le webhook réel passe-t-il par `callback_url` ou par le webhook du tableau de bord (ou les deux : doublons ?).

## Décisions à prendre avec le chef de projet

- **Limite de 200 000 XOF par paiement mobile money (≈ 336 $).** Les étapes de démonstration (jusqu'à 6 000 $) ne peuvent pas être payées en un seul payout. Options : (a) découper un paiement en plusieurs payouts ≤ 200 000 XOF, (b) réduire les montants des étapes de démonstration en sandbox, (c) autre rail (banque) avec d'autres limites, à vérifier avec `GET /api/payouts/limits`.
- **Taux affiché.** Le taux réel (~593 XOF/$) est inférieur à celui de la simulation (760) : les chiffres en FCFA de la démonstration `mock` ne correspondent pas à la réalité.
