# Premier test Docker, dans un Codespace (9 novembre 2026)

> Branche de travail `dbd4/m1-real-bitcoin`, départ au commit `5f999c0`. Mené par Claude Code à partir de [`PROMPT-CODESPACE-DOCKER.md`](PROMPT-CODESPACE-DOCKER.md), en deux passages : le test et ses trois premières corrections, puis l'application des quatre décisions du propriétaire sur les constats laissés ouverts.
> **Profil démo seulement** : tout est simulé, données fictives, `BITNOB_MODE` est resté `mock`, aucun port Codespaces n'a été rendu public, aucun secret n'a été écrit dans un fichier suivi par Git ni affiché. Les commits sont destinés à la branche `dbd4/docker-test` (décision du propriétaire), pas à `dbd4/m1-real-bitcoin`.
> Les paragraphes « Limite connue » de [`DEPLOIEMENT.md`](DEPLOIEMENT.md) donnent la même liste de ce qui est vérifié ou non.

## En bref

- **L'image se construit du premier coup et l'application tourne** : conteneur sain, utilisateur non-root, pages publiques, parcours de démonstration, persistance, sauvegarde et restauration dans un volume neuf, `Caddyfile` valide. Aucune étape n'a échoué.
- **Sept défauts corrigés, un commit chacun, chaque fois avec un test qui échoue sur l'ancien code** (tableau ci-dessous).
- **Tests : 884 → 929**, 62 → 68 fichiers, tous verts ; `tsc` propre ; contrôle des secrets de la CI : rien.
- **Ce qui reste non vérifié** (section 8) : le HTTPS réel avec un vrai domaine, un vrai navigateur, l'adresse Codespaces vue de l'extérieur, les profils bac à sable et vrais sats.

| Commit | Sujet | Test |
|---|---|---|
| `9abac15` | `deploy/.env` lisible par tous : `bootstrap.sh` perdait son `chmod 600` au renommage | `deploy-bootstrap.test.ts` |
| `a84feb3` | Cache de build perdu : `tsbuildinfo` et `next-env.d.ts` entraient dans le contexte | `dockerignore.test.ts` |
| `de8576e` | Quatre pages d'onglets journalisaient un `TypeError` sans session | `session-guard.test.ts` |
| `fb9ded1` | Documentation du premier passage | — |
| `19dbcdc` | `/en` sert `<html lang="en">` quelle que soit la langue du navigateur | `lang-header.test.ts` |
| `efff1c6` | Un refus de démarrage arrête le processus (code 1) ; `bootstrap.sh` affiche les journaux | `startup-refusal.test.ts`, `deploy-bootstrap.test.ts` |
| `c4ff3c6` | Archives de sauvegarde en 600, dossier en 700 | `deploy-backup.test.ts` |
| `79a6ff9` | `bootstrap.sh` accepte `:80` pour le profil démo seulement | `deploy-bootstrap.test.ts` |

## 1. Environnement

| | |
|---|---|
| Docker / Compose | 29.8.2-1 / v5.6.0, pilote `overlayfs`, cgroup v2 |
| Machine | Ubuntu 24.04 (Codespace), 2 CPU, 7,8 Go de mémoire, 18 Go libres |
| Node de l'hôte | **24.21.0 par défaut** (le prompt attend 22). Node **22.23.3** était déjà installé via `nvm` : utilisé pour l'étape 2, comme la CI |
| Node de l'image | 22.23.4 |
| Navigateur | **aucun** (ni Chromium, ni Playwright) : les pages ont été lues avec `curl` |

## 2. Base de référence sous Linux (Node 22.23.3)

| Commande | Résultat |
|---|---|
| `npm ci` | 20 s, 182 paquets, **0 faille** |
| `npx tsc --noEmit` | 14 s, code 0, aucune ligne |
| `npm test` | **884 tests, 62 fichiers**, verts, 32 s, sans souci de mémoire |
| `npm run build` | 38 s, 65 routes, code 0 |

Aucune différence avec Windows (chemins, casse, fins de ligne). **Précaution :** `frontend/.env.local` contient de vraies variables Bitnob (noms relevés, valeurs jamais lues). Pour que le build de l'hôte ne les charge pas, elles ont été neutralisées par des valeurs vides et `BITNOB_MODE=mock`. L'image, elle, ne le voit pas (voir 3).

## 3. Image Docker

`docker build -t nobpay-app ./frontend` : **92 s à froid**, code 0, aucun avertissement.

| Contrôle | Résultat |
|---|---|
| Taille | 441 Mo décompressée (110 Mo de contenu) ; `node_modules` 66 Mo, `.next` 11 Mo, `public` 1,6 Mo |
| `public/` | 33 fichiers, **mêmes empreintes** que le dépôt |
| `.next/static` | 44 fichiers, comme le build de l'hôte |
| Utilisateur | `nobpay`, uid/gid 999 ; `/data` lui appartient |
| `HEALTHCHECK` | déclaré (30 s, 5 s, démarrage 25 s) |
| Secrets | **aucun fichier `.env*`** dans `/app` |
| Dossiers exclus par `.dockerignore` | aucune dépendance à l'exécution : le code ne lit que `process.cwd()/public` |

## 4. Profil démo et `bootstrap.sh`

**Premier passage** (le script exigeait alors un nom de domaine) :

| Essai | Résultat |
|---|---|
| sans argument | code 2, message d'usage |
| `demo` avec `:80` | `Nom de domaine invalide.`, code 1, rien d'écrit |
| `demo` avec `localhost` | `deploy/.env` écrit, image construite, conteneurs démarrés, puis attente d'un HTTPS que `localhost` ne peut pas fournir : sans fin possible, coupé à 110 s |

**Second passage** (script corrigé, voir 7.2 et 7.4) :

| Essai | Résultat |
|---|---|
| `demo` avec `:80`, sur le dépôt réel | **code 0 en 8 s**, avertissement « HTTP simple : essai local uniquement », `deploy/.env` en `600` avec `SITE_ADDRESS=:80`, `PUBLIC_BASE_URL` = adresse du port Codespaces, `ALLOW_DEMO=1`, `BITNOB_MODE=mock`, `NOSTR_PUBLISH` vide ; attend `http://localhost/api/health` ; message final affiché |
| `real` avec `:80` (réponse à la question, puis `SITE_ADDRESS` dans l'environnement) | **refusé** dans les deux cas, code 1 : « réservé au profil demo », aucun `.env` créé, aucune question NWC posée |
| `demo` avec une configuration refusée (clé de notification invalide dans une copie jetable du dépôt, sans `.env.local`) | code 1 après 3 redémarrages du conteneur (87 s, construction de l'image comprise) ; le script affiche « le conteneur a redémarré 3 fois », l'état des conteneurs et le journal où figure `Démarrage refusé : VAPID_PUBLIC_KEY…` ; **0 secret** dans sa sortie, `.env` en `600` |

`docker compose config` : valide. `up -d --build` : conteneur `healthy` dès le premier contrôle.

## 5. Contrôles du premier passage

| Contrôle | Résultat |
|---|---|
| Santé | `healthy`, 0 redémarrage ; `/api/health` : 200 en direct et à travers Caddy |
| Journaux | **0 ligne contenant un secret** (comparaison en mémoire avec toutes les valeurs de 16 caractères ou plus de `deploy/.env`, rien d'écrit) ; aucun avertissement au démarrage |
| Pages | `/` 200 (142 Ko, **30 Ko en gzip**), `/en`, `/verifier`, `/app/connexion`, `/sw.js`, manifeste, NIP-05 : 200 ; `/n-existe-pas` : **404 en français** |
| En-têtes | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`, `Strict-Transport-Security` ; pas de `X-Powered-By` ; gzip et zstd |
| Règles de texte (`COPY-RULES.md`) | « régulé », « multisig », « garanti », « instantané » : 0 occurrence sur `/` et `/en`. « Instant » apparaît 2 fois, dans « pour l'instant » / « for now » |
| Compte démo | `POST /api/auth/demo` 200 ; cookie `Secure; HttpOnly; SameSite=lax` ; sans session, `/app/*` redirige (307) vers `/app/bienvenue` |
| Non-root | processus en 999/999 ; écriture dans `/data` : oui ; dans `/app` et `/etc` : refusée |
| `compose config` / `caddy validate` / `sh -n` | valides ; `caddy validate` avec `:80` **et** avec un domaine ; `Caddyfile` conforme à `caddy fmt` |
| Plafonds d'envoi | 65 Mo : **413 de l'application** (`Envoi trop volumineux.`) ; 75 Mo : **413 de Caddy** (`max_size 70MB`) ; l'application reste saine, aucun résidu écrit |
| Garde-fou inter-sites (adresse Codespaces comme `PUBLIC_BASE_URL`) | `Origin` de cette adresse : 200 ; site étranger : 403 ; `null` : 403 ; sans en-tête : 200 |
| Limitation de débit | 35 connexions démo avec 35 adresses forgées dans `X-Forwarded-For` : 30 passent, 7 refusées (429) : **non contournable** |
| Sortie réseau | calendrier OpenTimestamps et `mempool.space` joignables depuis le conteneur ; l'ancrage a reçu sa preuve |

**Parcours de démonstration (par l'API, 0 échec, rejoué sur chaque instance).** Valider et payer la preuve en attente de « Résidence à Thiès » (devis 6 000 $ à 593 FCFA/$, étape `paid` en ~5 s ; séquestre 18 000 → 12 000 $) ; créer un projet ; le financer 50 $ par la route de simulation ; envoyer une photo par le **lien terrain sans compte** ; valider et libérer ; ancrer ; dossier public ; page de vérification. **Un vrai navigateur n'a pas été utilisé.**

**Persistance et restauration.** Cinq vérifications à chaque situation : session toujours valable, état des deux projets, octets du dossier ancré, octets de la photo téléversée. Recréation du conteneur, `restart`, `down` puis `up -d`, et restauration dans un volume supprimé puis recréé : **5 sur 5 à chaque fois**. Restauration : `verifyDossier`, le vérificateur de l'application (celui de la page publique), valide le dossier relu : empreinte, format, chaîne de hachage et tête du registre (6 événements) ; l'application écrit après restauration.

## 6. Défauts corrigés au premier passage

### 6.1 `deploy/.env` lisible par tous : `9abac15`
Après `bootstrap.sh`, `stat` donnait `666` (annoncé : `600`). **Cause :** `chmod 600` sur la copie de `.env.example`, puis chaque `setvar` reconstruit le fichier en `.env.tmp` et le **renomme par-dessus** : le fichier final prend les droits d'un fichier neuf. Il contient la clé de session, la clé maîtresse Nostr et, pour « vrais sats », les deux chaînes NWC (celle de paiement dépense). `umask 077` ne suffirait pas : `/workspaces` porte des ACL par défaut qui l'ignorent. **Correction :** le fichier temporaire est créé et passé en `600` avant d'y écrire. **Test :** le script tourne dans une copie jetable, avec de faux `docker` et `curl` et un `umask 000` ; échouait sur les droits avant la correction.

### 6.2 Cache de build perdu : `a84feb3`
`COPY . .` était reconstruit sans changement de source : `tsconfig.tsbuildinfo` (réécrit par chaque `tsc`) et `next-env.d.ts` (par `next build`) ne sont ni suivis par Git ni dans `.dockerignore`. **Correction :** `*.tsbuildinfo`, `next-env.d.ts`, `out`, `npm-debug.log*`, `.DS_Store`. **Test :** `dockerignore.test.ts` fixe aussi la règle la plus importante : `.env`, `.env.*` (donc `.env.local`, où vivent les vraies clés Bitnob) et `.data` n'entrent jamais dans un contexte de build.

### 6.3 Quatre pages qui plantent sans session : `de8576e`
```
⨯ TypeError: Cannot read properties of null (reading 'id')
    at t (.next/server/chunks/ssr/src_app_app_(shell)_(tabs)_projets_page_tsx_….js:1:871) { digest: '2609372139' }
```
À chaque visite sans session de `/app/accueil`, `/app/projets`, `/app/portefeuille` et `/app/profil`, qui répondaient pourtant 307. **Cause :** `(await getSessionUser())!` en comptant sur la redirection du layout ; dans l'App Router, **un layout et ses pages se rendent côte à côte**. **Correction :** `getSessionUser()` puis `if (!user) redirect('/app/bienvenue')`, comme les sept autres pages. **Test :** `session-guard.test.ts` parcourt `src/app` et refuse la forme `!` ; il listait exactement les quatre fichiers avant. Vérifié dans l'image reconstruite : mêmes 307, 0 `TypeError`.

## 7. Décisions du propriétaire, appliquées au second passage

### 7.1 `/en` sert `<html lang="en">` : `19dbcdc`
**Avant :** `lang="fr"` pour un navigateur français ou muet. **Après :** `proxy.ts` s'exécute aussi pour `/en` et pose l'en-tête de requête `x-nobpay-lang: en` (il remplace une valeur envoyée par le visiteur) ; `getLang()` le lit avant le cookie et le navigateur, en n'acceptant qu'une vraie langue. **Test :** `lang-header.test.ts` (5) : le proxy force l'anglais pour un navigateur français, anglais et muet, écrase une valeur forgée, laisse les autres adresses tranquilles, son `matcher` est exactement l'API et `/en` ; `getLang()` respecte l'ordre ; 4 échouent sur l'ancien code. **Sous Docker :** `/en` donne `lang="en"` avec `Accept-Language` `fr`, `fr-FR`, `en`, `en-US`, absent, avec un cookie français et avec un en-tête forgé ; `/` reste `fr` (et redirige un navigateur anglais vers `/en`), `/app/connexion` suit toujours la langue du navigateur ; titre et contenu de `/en` en anglais.

### 7.2 Un refus de démarrage arrête le processus : `efff1c6`
**Avant :** le processus restait lancé et répondait 500 à tout ; le conteneur restait « Up », la politique `restart` ne voyait rien. **Après :** `refuseIfUnsafe()` écrit `Démarrage refusé` avec chaque raison et une consigne, puis sort avec le **code 1**, avant que la base soit lue et que les tâches de fond démarrent. `bootstrap.sh` ne finit plus par un délai : si le conteneur redémarre, sort, est « unhealthy », ou ne répond pas après l'attente (`BOOTSTRAP_WAIT_TRIES` × `BOOTSTRAP_WAIT_SLEEP`, 200 s par défaut), il s'arrête et affiche l'état des conteneurs et les 40 dernières lignes du journal. **Tests :** `startup-refusal.test.ts` (5) : l'aide ne fait rien sans erreur fatale, journalise puis sort avec 1 ; le vrai hook sort avec 1 avant `readDb` et `startJobs` sur une clé invalide, et démarre les tâches sur une configuration saine ; `deploy-bootstrap.test.ts` (+5) avec un faux `docker` qui joue un conteneur qui redémarre, muet, « unhealthy » ; aucun secret imprimé. **Sous Docker :** clé de notification invalide : **code 1 en 0,8 s**, message clair, **0 ligne de trace de pile** (avant : il tournait encore après 60 s) ; avec la pile `compose`, `bootstrap.sh` détecte les redémarrages (voir 4).

### 7.3 Archives de sauvegarde en 600, dossier en 700 : `c4ff3c6`
**Avant :** archive `root:root` en 646 dans un dossier ouvert (644 sur un serveur ordinaire), avec la base entière (téléphones, noms, fournisseurs, positions des photos) et toutes les preuves. **Après :** dossier créé sous `umask 077` puis `chmod 700` (même s'il existait, ouvert) ; archive écrite **dans le conteneur** sous `umask 077`, puis `chmod 600` (l'umask seul ne suffit pas sur un dossier à ACL par défaut) et `chown` à l'utilisateur qui a lancé le script, qui peut donc la copier hors du serveur. La restauration ne change pas (elle tourne en `root`). **Test :** `deploy-backup.test.ts` (6), avec un faux `docker run` qui exécute la commande du conteneur sous `umask 000` : archive 600, dossier 700 (neuf et préexistant ouvert), propriétaire = appelant, base et preuves dedans, les `KEEP` dernières gardées, message d'usage. **Sous Docker :** dossier `700` et archive `600` pour `codespace`, y compris dans un dossier préexistant en 755 ; un **uid étranger** (65534 dans un conteneur) lit l'ancien style (dossier 755, fichier 644, témoin positif) mais **ne peut ni lister le dossier ni lire l'archive** ; restauration de cette archive 600 dans un volume neuf : 5 sur 5 et registre validé. `DEPLOIEMENT.md` dit que les sauvegardes contiennent des données personnelles. *Note :* la commande de restauration de `DEPLOIEMENT.md` (avec son `rm -rf /data/*`) a été exécutée en entier au premier passage ; au second, le contrôle de sécurité de l'outil l'a bloquée et la restauration s'est faite sans l'étape de vidage, dans un volume neuf d'un autre projet Compose (où elle n'aurait rien vidé).

### 7.4 `bootstrap.sh` accepte `:80` pour le profil démo seulement : `79a6ff9`
**Avant :** un domaine était obligatoire et le script attendait un HTTPS public. **Après :** l'adresse vient de `SITE_ADDRESS` ou de la question ; `:80` est accepté pour `demo` seulement (le profil `real` le refuse avant de demander une chaîne NWC ou d'écrire quoi que ce soit), avec l'avertissement « HTTP simple : essai local uniquement ». `PUBLIC_BASE_URL` est l'adresse du port redirigé d'un Codespace, sinon `http://localhost`, ou la valeur de `PUBLIC_BASE_URL` dans l'environnement après vérification (`http://` ou `https://` puis un hôte seul) ; l'attente porte sur `http://localhost/api/health`. **Tests :** `deploy-bootstrap.test.ts` (25 au total) : accepté pour `demo` avec avertissement, depuis l'environnement, avec adresse Codespaces ou surcharge ; surcharge invalide refusée ; refusé pour `real` (saisi ou en variable) avant toute question ; un nom de domaine garde `https` et n'avertit pas. **Sous Docker :** voir 4.

## 8. Non vérifié

- **HTTPS réel** : certificat Let's Encrypt, DNS, ports 443 ouverts. Le certificat interne de `localhost` n'a montré que le démarrage de Caddy et sa redirection (308). `bootstrap.sh` avec un nom de domaine n'a été joué qu'avec de faux `docker` et `curl`.
- **Un vrai navigateur** : rendu, JavaScript, service worker, caméra et position du formulaire terrain. Piste : `docs/demo/record-demo.mjs` (Playwright) rejoue ce parcours et peut viser `http://localhost`.
- **L'adresse du port redirigé de Codespaces depuis l'extérieur** (testé avec `Host` et `Origin` simulés depuis l'intérieur).
- **Les profils bac à sable et vrais sats** (volontairement exclus) ; `bootstrap.sh real` jusqu'au bout (seul son refus de `:80` est vérifié).
- Le basculement réel en `unhealthy` : avec la sortie du processus, ce n'est plus le chemin d'un refus ; la branche « unhealthy » de `bootstrap.sh` n'est jouée que par le faux `docker` des tests.
- La tenue en charge, et une instance derrière le relais de Codespaces avec `TRUSTED_PROXY_HOPS=1` (le relais ajoute un saut : les visiteurs y partageraient une même limite de débit).
- Deux réglages de `deploy/.env.example` partent vers l'extérieur même en démonstration quand on écrit le `.env` à la main : `AUTO_ANCHOR=1` (empreintes SHA-256 vers les calendriers OpenTimestamps) et `NOSTR_PUBLISH=1` (engagements vers des relais publics). `bootstrap.sh` pose la question Nostr (« non » par défaut) ; ils n'ont pas été modifiés.

## 9. État laissé

- Neuf commits locaux sur `dbd4/m1-real-bitcoin` depuis `5f999c0`, destinés à la branche `dbd4/docker-test`.
- La pile Docker est **arrêtée** (`down`, volumes conservés) : `deploy_nobpay-data` contient les projets fictifs de test (« Test Docker : boutique ») ; `down -v` les supprime. Les piles d'essai jetables (`nobpaytest`, `nobpayrestore`) et leurs volumes ont été supprimés.
- `deploy/.env` existe (droits `600`, ignoré par Git, secrets de test générés sur place).

## 10. Reproduire

```bash
# depuis la racine du dépôt, avec Node 22 (nvm) pour la première ligne
cd frontend && npm ci && npx tsc --noEmit && npm test && npm run build && cd ..
docker build -t nobpay-app ./frontend
sh deploy/bootstrap.sh demo      # répondre « :80 » (ou SITE_ADDRESS=:80) pour un essai sans domaine
docker compose --env-file deploy/.env -f deploy/docker-compose.yml ps
sh deploy/backup.sh /chemin/vers/sauvegardes       # fichiers 600, dossier 700
docker run --rm -e SITE_ADDRESS=:80 -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2 caddy validate --config /etc/caddy/Caddyfile
docker compose --env-file deploy/.env -f deploy/docker-compose.yml down
```

Appels du parcours par l'API (session = cookie de `POST /api/auth/demo`) : `POST /api/projects/{id}/steps/{stepId}/quote` puis `…/release` ; `POST /api/projects` ; `POST /api/projects/{id}/fundings` puis `POST /api/fundings/{id}/simulate` ; `POST /api/projects/{id}/steps/{stepId}/proof` (multipart, en-tête `x-manager-token`) ; `POST /api/projects/{id}/anchors` ; `GET /api/anchors/{id}/dossier` ; état : `GET /api/projects/{id}/state`.
