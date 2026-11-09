# Déploiement : mettre NobPay en ligne sur un petit serveur

> **But :** une URL publique en HTTPS, reproductible, avec sauvegardes. Le règlement du hackathon demande « un MVP accessible par Internet ». Compter 30 à 45 minutes la première fois.
> **Limite connue (mise à jour le 9 novembre 2026, après le premier test sous Docker, dans un Codespace, puis l'application des décisions qui en sont sorties) :** le détail, avec les sorties, est dans [`RAPPORT-TEST-DOCKER-2026-11-09.md`](RAPPORT-TEST-DOCKER-2026-11-09.md).
> **Vérifié sous Docker 29 et Compose 5.6, profil démo, Caddy en HTTP simple (`SITE_ADDRESS=:80`) :** la construction de l'image (utilisateur `nobpay`, `HEALTHCHECK`, `public/` et `.next/static` présents, aucun fichier `.env`) ; **`bootstrap.sh demo` avec `:80` jusqu'à son message final**, son refus de `:80` pour le profil `real`, et son affichage de l'état et du journal quand l'application redémarre en boucle ; le démarrage, `/api/health`, les pages `/` et `/en` (**`<html lang="en">` sur `/en` quelle que soit la langue du navigateur**), la 404 en français, les en-têtes de sécurité et la compression ; le parcours de démonstration jusqu'au paiement simulé et à l'ancrage, **piloté par l'API** ; les plafonds d'envoi à travers Caddy (65 Mo refusés par l'application, 75 Mo par Caddy) ; le garde-fou contre les requêtes d'un autre site ; une limitation de débit que l'adresse forgée dans `X-Forwarded-For` ne contourne pas ; **un refus de démarrage qui arrête le processus avec le code 1 et un message clair (0,8 s)** ; la persistance (`restart`, `down` puis `up`, recréation du conteneur) ; la sauvegarde en **fichiers `600` et dossier `700`** (un utilisateur étranger ne peut ni la lire ni lister le dossier) et la **restauration dans un volume neuf** (état, photo et dossier identiques, registre validé) ; `docker compose config`, `caddy validate`, `sh -n`.
> **Toujours pas vérifié :** le HTTPS réel avec un nom de domaine (certificat Let's Encrypt, DNS, ports 443 : `bootstrap.sh` avec un domaine n'a été joué qu'avec de faux `docker` et `curl`) ; un vrai navigateur (aucun n'était installé : les pages ont été lues avec `curl`) ; l'adresse du port redirigé de Codespaces depuis l'extérieur ; les profils « bac à sable » et « vrais sats » ; `bootstrap.sh real` jusqu'au bout (seul son refus de `:80` l'est) ; la tenue en charge. **Le premier `docker compose up` sur le vrai serveur avec son domaine reste donc le dernier test** : lisez ses journaux.

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

Ce que le serveur vérifie tout seul : un versement n'est crédité que lorsque le **portefeuille** confirme la facture réglée, au montant exact de la facture ; un paiement n'est cru qu'avec la **preuve de paiement** (la préimage dont l'empreinte est celle de la facture) ; une réponse perdue garde l'argent **réservé** jusqu'à ce que le portefeuille dise ce qu'il en est (jamais payé deux fois) ; un « paiement échoué » annoncé par le portefeuille n'est cru qu'après vérification par l'empreinte du paiement (certains portefeuilles l'annoncent alors que le paiement est encore en route) ; un paiement que le portefeuille ne connaît pas n'est déclaré « jamais parti » qu'une fois la facture du fournisseur périmée (au moins 5 minutes, au plus 6 heures), parce qu'un portefeuille resté hors ligne peut traiter plus tard la requête reçue ; le cours du bitcoin vient de deux sources qui doivent concorder à 5 % près, et **aucun vrai versement ni paiement ne se fait sur un cours de repli** (`BTC_USD_RATE` ne sert qu'à l'affichage) : sans cours fiable, l'écran répond « cours indisponible, réessayez » ; la somme due ne doit jamais dépasser ce que contiennent les portefeuilles (sinon versements et paiements sont suspendus, voir `/api/health`).

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

### L'avis de l'IA sur une preuve (optionnel)

Avec `AI_REVIEW=1` et une clé `ANTHROPIC_API_KEY`, le financeur peut demander à Claude de regarder les photos et de lire la facture d'une preuve. **L'IA lit, le code compare, le financeur décide** : le modèle décrit et recopie (ce que montrent les photos, le total, le fournisseur et la date de la facture) ; ce sont des règles écrites en code qui comparent avec ce qui a été saisi et affichent des points d'attention. L'avis ne bloque et ne déclenche jamais un paiement.

- **Ce qui part chez Anthropic, uniquement à la demande du financeur** : les photos et la facture de cette preuve, le titre et le montant de l'étape, le nom du fournisseur saisi et le message de l'équipe sur place. Ni le nom ou le téléphone du financeur, ni les positions GPS. L'écran le dit avant le clic.
- **Un avis coûte de l'argent** : **fixez une limite de dépense sur la clé** dans la console Anthropic. Plafonds côté serveur : `AI_DAILY_CAP` (50 par jour pour toute l'instance), 10 par heure et par compte, un seul avis par preuve (redemander ne coûte rien).
- Modèle : `claude-opus-5-5` par défaut ; `AI_MODEL` le change (essayez un modèle moins cher sur quelques vraies preuves et gardez celui dont l'avis vous convainc).
- Contenu des fichiers traité comme des **données** : le message système interdit de suivre une consigne trouvée dans une image, une facture ou le message de l'équipe, et la signale en point d'attention.
- **Les contrôles sans IA sont toujours affichés**, clé ou pas : fichier déjà utilisé ailleurs (photo ou facture réutilisée), position des photos (au Sénégal ?), date des photos, montant de la facture comparé à l'étape.
- Limite connue : les images de plus de 5 Mo ne sont pas envoyées (l'écran le dit) et seules les 4 premières photos sont lues.

### Les proches : témoin indépendant, lien famille, notifications

Trois fonctions pour que le projet ne repose pas sur une seule personne. Elles sont **toujours disponibles** (sauf les notifications, qui demandent des clés) et ne touchent pas à la route de l'argent.

- **Témoin indépendant.** Le financeur nomme quelqu'un (un voisin, un maçon, un proche) depuis la page du projet. Il reçoit un lien signé (`/temoin/…`, 90 jours, renouvelable, sans compte) où il voit **la preuve qui attend une décision** (photos, facture, nom du fournisseur : jamais l'adresse ni le numéro à payer) et répond « je confirme » ou « je conteste », avec un mot facultatif réservé au financeur. La réponse entre dans le registre (nom et verdict, jamais le mot). Si le financeur a coché « ne rien payer sans sa confirmation », **le devis est refusé** tant que le témoin n'a pas confirmé, et la vérification est refaite **dans la transaction qui réserve l'argent** : une condition posée après le devis tient encore. Sans cette case, l'avis du témoin est un conseil.
- **Lien famille (cotisation).** Un lien public (`/contribuer/…`, 90 jours, renouvelable ou fermé par le financeur) permet à un proche d'**ajouter de l'argent** au séquestre depuis n'importe quel portefeuille Lightning. Il ne montre ni le solde ni les preuves et ne débloque rien ; le financeur reste seul à décider **et seul à pouvoir reprendre le reste** (la page le dit). Le prénom, facultatif, est écrit dans le registre public à côté du montant, et la page le dit avant la facture. Garde-fous : 12 factures par heure et par adresse IP, 5 factures en attente par projet, plafonds de la phase pilote, aucune vraie facture pour un projet de démonstration.
- **Notifications (Web Push).** Le financeur est prévenu quand une preuve arrive, qu'un paiement aboutit ou qu'un proche cotise ; la personne sur place, quand une étape est financée ou une preuve refusée ; le témoin, quand il y a quelque chose à regarder. Pas de SMS à payer ni de compte : l'application installée suffit (sur iPhone, **seulement une fois ajoutée à l'écran d'accueil**). Mise en route : `node scripts/vapid-keys.mjs`, puis `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` dans `deploy/.env` ; le serveur refuse de démarrer avec une clé ou un sujet mal formé. **Les notifications sont fabriquées à partir du registre, après coup** (une tâche lit les événements écrits depuis le dernier tour) : aucun paiement n'attend un service de notification ni n'échoue à cause de lui. Une notification contient un titre, une phrase et un chemin du site, jamais un solde, une adresse ou un fichier ; les événements de plus de 10 minutes ne sont jamais annoncés. Les adresses de notification ne sont acceptées que des services des navigateurs (Google, Mozilla, Apple, Microsoft) : sinon l'inscription ferait appeler n'importe quelle adresse par le serveur.

### Démarrage rapide : `deploy/bootstrap.sh`

Sur le serveur (Docker installé, DNS déjà pointé), depuis la racine du dépôt :

```bash
sh deploy/bootstrap.sh demo    # tout simulé : jury et vote du public, données fictives
sh deploy/bootstrap.sh real    # vrais sats : demande les deux chaînes NWC (saisie masquée), plafonds bas, comptes invités
```

Il génère `SESSION_SECRET`, `BITNOB_WEBHOOK_SECRET` et `NOSTR_MASTER_KEY` **sur le serveur** (jamais affichés), écrit `deploy/.env` en `600`, lance `docker compose`, attend `/api/health` et rappelle quoi sauvegarder. Il refuse d'écraser un `deploy/.env` existant. **Essayé** avec de faux `docker` et `curl` (test automatique `frontend/tests/deploy-bootstrap.test.ts`) et pour de bon sous Docker, en HTTP simple (`:80`) : il va jusqu'à son message final, le fichier est en `600`, et quand l'application redémarre en boucle il le dit avec l'état des conteneurs et le journal. **Pas encore sur un vrai serveur avec un vrai domaine** : lisez sa dernière sortie et `/api/health`. L'adresse est un nom de domaine (HTTPS automatique) ou `:80` (HTTP simple, **profil démo seulement** : le profil `real` le refuse) ; voir « Essai sans domaine » plus bas.

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
4. Le serveur **refuse de démarrer** avec un `SESSION_SECRET` faible en mode sandbox ou si `ALLOW_DEMO=0` : c'est voulu. **Comment ce refus se voit** : le processus **s'arrête avec le code 1** après avoir écrit dans le journal `Démarrage refusé` et chaque raison (il ne reste pas lancé à répondre 500 : c'était le comportement avant le 9 novembre). Avec `restart: unless-stopped`, Docker le relance en boucle : `docker compose … ps` montre `Restarting`, `docker compose … logs app` donne la raison. `bootstrap.sh` affiche lui-même l'état des conteneurs et les 40 dernières lignes du journal si l'application ne devient pas saine.
5. Webhook Bitnob (sandbox) : créer dans le tableau de bord Bitnob un webhook vers `https://<domaine>/api/webhooks/bitnob` avec le secret choisi.

### Essai sans domaine : Codespace ou poste local (HTTP simple, profil démo)

`bootstrap.sh` accepte `:80` pour le **profil démo seulement** (le profil « vrais sats » le refuse : de l'argent réel exige un domaine et HTTPS) :

```bash
sh deploy/bootstrap.sh demo                  # répondre « :80 » à la question de l'adresse
SITE_ADDRESS=:80 sh deploy/bootstrap.sh demo # ou la donner dans l'environnement : aucune question d'adresse
```

Caddy sert alors en **HTTP simple, sans certificat**, et le script l'écrit : « HTTP simple : essai local uniquement ». L'adresse publique (`PUBLIC_BASE_URL`) est celle du port redirigé dans un Codespace, sinon `http://localhost` ; `PUBLIC_BASE_URL=http://192.168.1.20 SITE_ADDRESS=:80 sh deploy/bootstrap.sh demo` en impose une autre. Le script attend `http://localhost/api/health` ; s'il ne répond pas, il affiche l'état des conteneurs et les 40 dernières lignes du journal. Secrets générés sur place et jamais affichés, fichier en `600`, comme pour un domaine.

À la main, c'est possible aussi (jamais dans Git, droits `600`) :

```bash
cp deploy/.env.example deploy/.env && chmod 600 deploy/.env
#   SITE_ADDRESS=:80                       Caddy en HTTP simple, sans certificat
#   PUBLIC_BASE_URL=https://<CODESPACE_NAME>-80.<GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN>   (poste local : http://localhost)
#   SESSION_SECRET, BITNOB_WEBHOOK_SECRET, NOSTR_MASTER_KEY : un `openssl rand -hex 32` chacun
#   NOSTR_PUBLISH=                         VIDE : l'exemple l'active (=1) et publierait sur des relais publics
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

Le port 80 est redirigé en **privé** par Codespaces : ne le rendez pas public sans l'avoir décidé. `AUTO_ANCHOR=1` (l'exemple) envoie les empreintes (SHA-256) du registre aux calendriers OpenTimestamps publics **même en démonstration** : la base en contenait 5 à la fin du test, dont un seul demandé à la main, et le calendrier les a acceptés (le conteneur sort bien sur Internet). Videz la variable pour l'éviter.

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

**Essayé le 9 novembre 2026, dans un volume neuf** (le volume de données avait été supprimé avant) : la commande ci-dessus suffit. `tar` rétablit le propriétaire (`nobpay`) de `/data`, l'application redémarre en bonne santé et peut écrire, l'état des projets, la photo de preuve et le dossier ancré sont identiques à l'original, et le vérificateur de l'application valide la chaîne du registre.

**Les sauvegardes contiennent des données personnelles** : numéros de téléphone, noms, fournisseurs, positions des photos, et toutes les preuves envoyées. Traitez-les comme la base elle-même. `backup.sh` les écrit **lisibles par leur seul propriétaire** (fichiers `600`, dossier de destination `700`, propriétaire = l'utilisateur qui lance le script) ; avant le 9 novembre 2026 elles étaient créées par `root` en `644`, lisibles par tous les utilisateurs du serveur : si vous en avez, le dossier en `700` les met déjà à l'abri, et `chmod 600` les resserre. **Chiffrez la copie qui sort du serveur** (par exemple `restic`, ou `rclone` avec `crypt`).

## 6. Pendant le jury (21 au 26 novembre)

- **Pas de mise à jour non critique.** Gel des fonctionnalités le 18 novembre au soir.
- Surveiller `docker compose … logs --tail 100 app` et `/api/health`.
- Une vidéo de démonstration et une instance locale en mode simulé restent le **plan B** si le serveur tombe.

## 7. Ce que cette configuration ne fait pas encore

- La base est toujours un fichier JSON dans le volume : **un seul conteneur**, jamais deux (voir `docs/AUDIT-HACKATHON-4.md`, D1). La migration vers SQLite est prévue au jalon suivant.
- La limitation de débit est en mémoire (un seul processus, comme la base).
- Les clés et secrets restent dans `deploy/.env` (droits `600`) : ne les mettez ni dans Git, ni dans une conversation.
