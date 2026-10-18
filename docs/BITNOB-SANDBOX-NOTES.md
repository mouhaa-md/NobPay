# Bitnob : ce que dit la spécification officielle de l'API

> **Pour qui :** le développeur backend (et son Claude). À lire **avant** les tâches B0.4 à B0.8 de `ROADMAP-BACKEND.md`.
> **Relevé le :** 18 octobre 2026, dans la spécification OpenAPI v2 de Bitnob (`https://bitnob.dev/api-collections/swagger/bitnob-api-v2.openapi.json`, 642 Ko, serveur indiqué `https://api.bitnob.com`) et dans les pages `https://bitnob.dev/docs/...`.
> **Statut :** ce sont des **lectures de documentation**, pas des essais. Rien ici n'a été testé contre la sandbox. Chaque point est à confirmer (B0.10).

## 1. Comment alimenter la sandbox (BTC, USDT, facture Lightning)

**Résultat de la recherche : la spécification ne propose aucun simulateur de paiement Lightning ni aucune route pour créditer un portefeuille en BTC ou en USDT.** Les seuls simulateurs « sandbox » sont `POST /api/virtual-accounts/{id}/simulate-deposit` (un faux virement entrant sur un compte bancaire **NGN**, il crédite le solde **NGN**) et `POST /api/cards/{cardId}/simulate-webhook`. Ils ne servent pas à NobPay.

| Besoin | Ce que la documentation permet | À vérifier |
|---|---|---|
| **Créditer de l'USDT / USDC** | Générer une adresse de dépôt (`POST /api/addresses`, § 3) puis l'alimenter depuis le **robinet de test de Circle** (https://faucet.circle.com/). Réseaux de test listés par Bitnob : Avalanche Fuji (USDT, USDC), Ethereum Sepolia (USDT, USDC), Polygon Amoy (USDT, USDC), Solana Devnet (USDT, USDC), Base Sepolia (USDC), Stellar Testnet (USDC). Dépôt minimum : 1 $. Évènement `deposit.success`, solde visible par `GET /api/balances`. | À ma connaissance le robinet Circle distribue de l'**USDC** (et de l'EURC), **pas de l'USDT**. Un exemple de réponse de `GET /api/balances` de la spécification montre justement un solde en **USDC**. Tester si `from_asset: "USDC"` est accepté par `POST /api/payouts/quotes`. |
| **Créditer du BTC** | `GET /api/stablecoins/supported-chains` renvoie aussi `bitcoin` ; `POST /api/addresses` avec `chain: "bitcoin"` donne une adresse. Aucune page ne dit comment l'alimenter. | Si l'adresse commence par `tb1` : robinet de **bitcoin testnet** public. Sinon, demander à un mentor. |
| **Payer une facture `lntb…`** | `lntb` est le préfixe des factures **Bitcoin testnet** : **aucun argent réel n'est en jeu** (c'est rassurant, et cela suggère que la sandbox est bien sur testnet). Pour la régler il faut un portefeuille Lightning **testnet avec de la liquidité**, ce qui est lourd (nœud LND ou Core Lightning testnet, canal ouvert, bitcoin testnet). La documentation n'en parle pas. | Alternative propre : `POST /api/lightning/pay` (corps `customer_id`, `request`, `reference`, `max_fee`, tous obligatoires) depuis un **autre client Bitnob** de la sandbox qui a un solde. Il faut alors un solde de départ (voir ligne suivante). |
| **Obtenir un solde de départ** | Rien de documenté. | **Le plus rapide : demander à un mentor Bitnob** de créditer le portefeuille sandbox (USDT / USDC / sats) et de dire comment ils règlent une facture Lightning de test. Au workshop, l'outil des mentors avait une « simulation » qui payait une facture en 2 s : elle existe donc côté Bitnob. |

**Solution de repli sans attendre (déjà possible côté NobPay) :** créer la **facture** et lancer les **paiements** avec la vraie API sandbox, mais déclencher « facture payée » avec **notre propre évènement signé** (le bouton « Simuler le paiement » fait exactement cela en mode `mock` : il passe par le vrai récepteur de webhooks). Aujourd'hui ce bouton est refusé en mode `sandbox` (`simulateFundingPaid` dans `server/services.ts`) ; l'autoriser derrière `ALLOW_DEMO=1`, **clairement étiqueté**, est une petite tâche. Attention : le portefeuille Bitnob ne contiendra alors pas les fonds, donc un paiement fournisseur réel échouera faute de solde tant qu'un mentor n'a pas crédité le compte.

## 2. Écarts entre notre code et la spécification (à corriger)

| # | Ce que fait notre code (`server/bitnob/client.ts`) | Ce que dit la spécification | Tâche |
|---|---|---|---|
| 1 | `POST /api/lightning/invoices` sans `customer_id`. | **`customer_id` est obligatoire** (avec `amount`, `description`, `expiry`, `reference`). La page de documentation le dit « facultatif » : les deux sources divergent, tester. Il faut donc créer un client (`POST /api/customers`, obligatoires : `email`, `customer_type`) et passer son identifiant. | B0.4 |
| 2 | `POST /api/payouts/quotes` sans `payment_reason`. | **`payment_reason` est obligatoire** (avec `from_asset`, `to_currency`, `source`, `amount`, `reference`, `country`). L'exemple de la spécification envoie `settlement_amount` (le montant en monnaie locale) alors que le schéma exige `amount` : **tester les deux**, et vérifier l'unité (USDT ? centimes ?). | B0.8 |
| 3 | `callback_url` envoyé seulement si `PUBLIC_BASE_URL` est en `https`. | Pour `POST /api/payouts/{quoteId}/initialize`, **`callback_url` est obligatoire** (avec `beneficiary` et `reference`). Il faut donc toujours une URL publique HTTPS (le tunnel du B0.2). | B0.8 |
| 4 | Un évènement dont le nom contient `transfer` est traité comme un **paiement fournisseur** (`webhooks.ts`, `route()`). | La page de documentation Lightning dit que le paiement d'une facture Lightning déclenche **`transfer.success`**, et un dépôt on-chain **`deposit.success`**. Avec notre routage, une facture Lightning payée serait classée « payout inconnu » et **jamais créditée**. À corriger : sur tout évènement de succès, chercher **d'abord** un financement correspondant (`reference`, `id`, `payment_hash`), puis un payout ; ajouter `deposit.*` ; écrire le test. | B0.5 |
| 5 | Type de bénéficiaire `mobile_money` et valeurs de réseau devinées. | `GET /api/payouts/supported-countries/{country}` renvoie `destination_types` avec, pour chacun, la liste de `fields` (clé, obligatoire, motif de validation) et les options. Lire la réponse pour `SN` au lieu de deviner. Les autres routes utiles : `GET /api/payouts/limits`, `GET /api/payouts/account-lookup`. | B0.7 |
| 6 | `GET /api/payouts/:id` avec l'identifiant renvoyé par `initialize`. | La spécification donne bien `GET /api/payouts/{id}` (identifiant UUID du payout, distinct du `quote_id` du type `QT2_…`). Son exemple de réponse contient `provider_settlement_id: "sandbox_txn_…"` : **les payouts existent en sandbox** (exemple NGN). | B0.8 |

## 3. Routes utiles non encore utilisées

- `GET /api/whoami` : renvoie `environment` (`"sandbox"` ou production), le nom du client, la méthode d'authentification. **À appeler au démarrage et dans `/api/health`** pour refuser de travailler si l'environnement n'est pas `sandbox` quand `BITNOB_MODE=sandbox`. C'est aussi le meilleur premier appel pour valider la signature HMAC et l'horloge.
- `GET /api/balances` et `GET /api/balances/{currency}` : soldes par monnaie (`ledger_balance`, `available_balance`). Base du rapprochement (B2.5).
- `POST /api/customers`, `GET /api/customers` : clients. Requis pour les factures (écart n° 1) ; c'est aussi la voie vers un portefeuille par projet (B4.5).
- `POST /api/addresses` : corps obligatoire d'après la spécification : `chain`, `customer_id`, `customer_email`, `label`, `reference` (l'exemple n'envoie que `chain`, `label`, `reference` : tester).
- `POST /api/lightning/decode` et `POST /api/lightning/preview` (prévisualiser un paiement) ; `GET /api/lightning/invoices` (liste).
- `GET /api/stablecoins/supported-chains` : réseaux et jetons acceptés (dont `bitcoin`).
- Évènements de webhook **présents dans la spécification** : `payouts.initialized`, `payouts.processing`, `payouts.withdrawal.success`, `payouts.withdrawal.expired`. Les évènements de dépôt et de Lightning ne sont décrits que dans les pages de documentation (`transfer.success`, `deposit.success`), sans charge utile : à capturer (B0.3).

## 4. Questions à poser à un mentor Bitnob

1. Dans la sandbox, comment règle-t-on une facture Lightning créée par `POST /api/lightning/invoices` ? Existe-t-il une simulation côté Bitnob ?
2. Pouvez-vous créditer le portefeuille de notre espace de test en USDT (ou USDC) et en sats ? Quel `from_asset` est accepté pour les payouts de test ?
3. Les payouts mobile money vers le **Sénégal** (Wave, Orange Money, Free Money) fonctionnent-ils en sandbox ? Quels `destination_type` et quels codes de réseau ?
4. `customer_id` est-il obligatoire pour créer une facture ? Un seul client pour tout notre espace suffit-il ?
5. Quel est l'évènement exact (et sa charge utile) envoyé quand une facture Lightning est réglée : `transfer.success`, `btc.lightning.received.success`, autre ?
6. Dans la requête de devis de payout, `amount` est-il exprimé dans l'actif source ou en monnaie locale, et quel est le rôle de `settlement_amount` ?
