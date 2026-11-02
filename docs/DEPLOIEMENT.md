# Déploiement : mettre NobPay en ligne sur un petit serveur

> **But :** une URL publique en HTTPS, reproductible, avec sauvegardes. Le règlement du hackathon demande « un MVP accessible par Internet ». Compter 30 à 45 minutes la première fois.
> **Limite connue :** je n'ai pas pu construire l'image Docker sur la machine de développement (Docker n'y est pas installé). Ce qui a été **vérifié** : le mode « standalone » de Next.js (le même que dans l'image) démarre, répond sur `/api/health`, sert la page d'accueil, la page 404 en français et les fichiers publics. **Le premier `docker compose up` sur le serveur est donc le vrai test** : lisez ses journaux.

## 1. Deux instances, deux profils

| | **Démo** (pour le jury et le vote du public) | **Pilote** (de vraies personnes, de vrais sats) |
|---|---|---|
| Adresse | `demo.<votre-domaine>` | `app.<votre-domaine>` |
| `ALLOW_DEMO` | `1` : compte démo, code SMS partagé | **`0`** |
| `BITNOB_MODE` | `mock` (ou `sandbox`) | `sandbox` tant que le parcours n'est pas validé |
| Connexion | bouton « compte démo » | SMS réel (`SMS_PROVIDER=twilio`) ou autre méthode |
| Données | **fictives seulement** | réelles |

**Ne jamais mélanger.** Avec `ALLOW_DEMO=1`, le code de connexion est public et le compte démo ouvre l'administration (limitée, depuis le 1er nov., aux données de démonstration). Une instance qui porte de vraies données doit avoir `ALLOW_DEMO=0`. Chaque instance a **son propre dossier de déploiement, son `.env` et son volume**.

### Troisième profil : instance « vrais sats » (essai par le jury avec quelques centimes)

| | **Vrais sats** |
|---|---|
| Adresse | `essai.<votre-domaine>` |
| `LIGHTNING_RAIL` | **`nwc`** : le séquestre et les paiements passent par de vrais éclairs (Lightning) |
| `ALLOW_DEMO` | **`0` obligatoire** : le serveur refuse de démarrer sinon (le code partagé ouvrirait un compte qui contient de vrais sats) |
| `ALLOW_GUEST` | `1` : bouton « Essayer sans compte », un compte invité privé par visiteur |
| Fournisseur payé | **par adresse Lightning uniquement** (pas de mobile money sur cette instance) |
| Plafonds | `LIGHTNING_MAX_FUNDING_USD` 100, `LIGHTNING_MAX_PAYOUT_USD` 100, `LIGHTNING_MAX_ESCROW_USD` 500 : **baissez-les** (5 à 20 $) pour un jury |

**Deux connexions Nostr Wallet Connect, deux niveaux de droits** (à créer dans votre portefeuille, par exemple Alby Hub) :

1. `NWC_RECEIVE_URL` : droits **créer des factures, les consulter, lire le solde** seulement. Elle ne peut **pas dépenser** : si elle fuit, personne ne vide le portefeuille.
2. `NWC_PAYOUT_URL` : la seule qui dépense (paiements aux fournisseurs, remboursements). **Donnez-lui un budget** dans le portefeuille (par exemple 20 $ par jour). Vide = paiements et remboursements désactivés, les versements restent possibles.

Les deux chaînes sont des **secrets** : elles vont dans `deploy/.env` (droits `600`), jamais dans Git, jamais dans une conversation.

Ce que le serveur vérifie tout seul : un versement n'est crédité que lorsque le **portefeuille** confirme la facture réglée, au montant exact de la facture ; un paiement n'est cru qu'avec la **preuve de paiement** (la préimage dont l'empreinte est celle de la facture) ; une réponse perdue garde l'argent **réservé** jusqu'à ce que le portefeuille dise ce qu'il en est (jamais payé deux fois) ; la somme due ne doit jamais dépasser ce que contiennent les portefeuilles (sinon versements et paiements sont suspendus, voir `/api/health`).

**Contrôle avant d'ouvrir au jury** (5 minutes, avec 1 à 2 $) : financer 1 $ depuis un portefeuille personnel → l'étape se débloque ; envoyer une preuve avec votre propre adresse Lightning comme fournisseur → valider → les sats arrivent chez vous et le reçu montre la preuve de paiement ; demander le remboursement du reste.

### Le registre répliqué sur Nostr (toutes les instances)

Avec `NOSTR_PUBLISH=1`, chaque événement du registre est publié sur des relais Nostr sous forme d'un petit événement signé (type 8421 : le numéro et les deux empreintes, **ni nom, ni montant, ni type d'événement**), par une clé propre au projet. Cela répond à un reproche fait à tout registre tenu par l'opérateur : il pourrait réécrire ou omettre des événements entre deux ancrages Bitcoin. Les relais conservent une copie que l'opérateur ne contrôle pas ; le navigateur d'un visiteur la compare au dossier (page de vérification, ligne « répliqué sur Nostr »).

- **`NOSTR_MASTER_KEY`** (`openssl rand -hex 32`) : **à sauvegarder avec la base**. Toutes les clés de projets en sont dérivées ; sans elle, l'instance ne peut plus signer pour les projets existants (le serveur le signale dans ses journaux et ne signe pas sous une autre clé). Sans cette variable, les clés dérivent de `SESSION_SECRET`.
- **Seuls les projets créés avec `NOSTR_PUBLISH=1` ont des engagements** : la clé est inscrite dans le premier événement de leur registre, donc dans l'ancrage Bitcoin.
- **Contrôle des relais avant la mise en ligne** : `node scripts/nostr-smoke.mjs --read-only` (lecture seule). Sans `--read-only`, le script **publie un événement de test** signé par une clé jetable sur chaque relais : à faire une fois, volontairement.
- Un relais peut refuser notre type d'événement ou limiter le débit : le serveur réessaie avec des pauses croissantes, et un engagement compte comme publié dès que `NOSTR_MIN_ACKS` relais (2 par défaut) l'ont accepté.
- **Horodatage Bitcoin des événements où de l'argent a bougé (NIP-03)** : leur identifiant est envoyé aux calendriers OpenTimestamps, et la preuve est publiée en événement 1040 une fois le bloc connu (quelques heures). Désactivable : `NOSTR_ATTEST=0`.
- **Ce que Nostr ne garantit pas** : un relais peut supprimer des événements. Ce qui est garanti, c'est qu'une seconde version contradictoire d'un engagement **apparaît à côté de la première** (type « ordinaire », non remplaçable) et que quiconque a gardé une copie, ou le dossier ancré sur Bitcoin, peut le prouver. Une surveillance indépendante (le jury, un tiers qui archive les relais) renforce encore cette garantie.
- La politique de sécurité du navigateur autorise `wss:` en connexion : la page de vérification interroge les relais elle-même, sans passer par ce serveur.

## 2. Prérequis

- Un serveur Linux avec Docker et Docker Compose (un VPS de 1 à 2 Go de mémoire suffit).
- Un nom de domaine dont l'enregistrement `A` pointe vers le serveur (Caddy obtient le certificat HTTPS tout seul ; ports 80 et 443 ouverts).
- Le dépôt cloné sur le serveur.

## 3. Première mise en ligne

```bash
cd NobPay
cp deploy/.env.example deploy/.env
# remplir deploy/.env :
#   SITE_ADDRESS et PUBLIC_BASE_URL  (le même nom de domaine, https pour PUBLIC_BASE_URL)
#   SESSION_SECRET                   (openssl rand -hex 32, 32 caractères minimum)
#   BITNOB_WEBHOOK_SECRET            (openssl rand -hex 32, le même que dans le tableau de bord Bitnob)
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f app
```

Contrôles :

1. `https://<domaine>/api/health` répond `{"mode":…,"demo":…}`.
2. La page d'accueil s'affiche en HTTPS, `/n-existe-pas` montre la page 404 **en français**.
3. Sur l'instance démo : « Essayer avec le compte démo » ouvre le tableau de bord.
4. Le serveur **refuse de démarrer** avec un `SESSION_SECRET` faible en mode sandbox ou si `ALLOW_DEMO=0` : c'est voulu.
5. Webhook Bitnob (sandbox) : créer dans le tableau de bord Bitnob un webhook vers `https://<domaine>/api/webhooks/bitnob` avec le secret choisi.

## 4. Mettre à jour

```bash
git pull
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

Les données vivent dans le volume `deploy_nobpay-data` : elles survivent aux mises à jour. **Sauvegardez avant** chaque mise à jour importante.

## 5. Sauvegarder et restaurer

Sauvegarde (base et preuves) :

```bash
deploy/backup.sh /var/backups/nobpay        # garde les 14 dernières copies
```

Automatique chaque nuit : `0 3 * * * /chemin/vers/NobPay/deploy/backup.sh /var/backups/nobpay`. **Gardez aussi une copie hors du serveur** (rsync, rclone, restic).

**Restaurer** (à essayer une fois **avant** le jour J : une sauvegarde jamais restaurée n'est pas une sauvegarde) :

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml down
docker run --rm -v deploy_nobpay-data:/data -v /var/backups/nobpay:/backup alpine \
  sh -c "rm -rf /data/* /data/.[!.]* 2>/dev/null; tar xzf /backup/nobpay-AAAAMMJJTHHMMSSZ.tar.gz -C /data"
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d
```

Puis vérifier `/api/health` et ouvrir un projet.

## 6. Pendant le jury (21 au 26 novembre)

- **Pas de mise à jour non critique.** Gel des fonctionnalités le 18 novembre au soir.
- Surveiller `docker compose … logs --tail 100 app` et `/api/health`.
- Une vidéo de démonstration et une instance locale en mode simulé restent le **plan B** si le serveur tombe.

## 7. Ce que cette configuration ne fait pas encore

- La base est toujours un fichier JSON dans le volume : **un seul conteneur**, jamais deux (voir `docs/AUDIT-HACKATHON-4.md`, D1). La migration vers SQLite est prévue au jalon suivant.
- La limitation de débit est en mémoire (un seul processus, comme la base).
- Les clés et secrets restent dans `deploy/.env` (droits `600`) : ne les mettez ni dans Git, ni dans une conversation.
