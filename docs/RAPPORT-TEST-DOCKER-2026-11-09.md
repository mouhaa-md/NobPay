# Premier test Docker, dans un Codespace (9 novembre 2026)

> Branche `dbd4/m1-real-bitcoin`, départ au commit `8259b92`. Mené par Claude Code à partir de [`PROMPT-CODESPACE-DOCKER.md`](PROMPT-CODESPACE-DOCKER.md).
> **Profil démo seulement** : tout est simulé, données fictives. Rien n'a été poussé, aucun secret n'a été écrit dans un fichier suivi par Git ou affiché, `BITNOB_MODE` est resté `mock`, aucun port Codespaces n'a été rendu public.
> Les paragraphes « Limite connue » de [`DEPLOIEMENT.md`](DEPLOIEMENT.md) ont été mis à jour avec la même liste de ce qui est vérifié ou non.

## En bref

- **L'image se construit du premier coup et l'application tourne** : conteneur sain, utilisateur non-root, pages publiques, parcours de démonstration, persistance, sauvegarde et restauration dans un volume neuf, `Caddyfile` valide. Aucune étape n'a échoué.
- **Trois défauts trouvés et corrigés**, chacun avec un test qui échoue sur l'ancien code (commits locaux, non poussés) :
  1. `deploy/bootstrap.sh` écrivait `deploy/.env` **lisible par tous** alors qu'il annonce `600` ;
  2. le cache de build Docker était invalidé par des fichiers de la machine du développeur (`.dockerignore` incomplet) ;
  3. quatre pages d'onglets **journalisaient une exception à chaque visite sans session** (la redirection, elle, marchait).
- **Quatre constats que je n'ai pas tranchés** (section 7), dont `<html lang="fr">` servi sur `/en` à un navigateur français et un refus de démarrage qui n'arrête pas le processus.
- **Tests : 884 → 898**, 62 → 65 fichiers, tous verts ; `tsc` propre ; contrôle des secrets de la CI : rien.

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

## 4. Profil démo

**`bootstrap.sh`**

| Essai | Résultat |
|---|---|
| sans argument | code 2, message d'usage |
| `demo` avec `:80` (l'adresse voulue pour le Codespace) | `Nom de domaine invalide.`, code 1, **rien d'écrit** |
| `demo` avec `localhost` | `deploy/.env` écrit, image construite, volumes et conteneurs créés, puis attente de `https://localhost/api/health` **sans fin possible** (certificat interne de Caddy, que `curl` refuse) ; coupé à 110 s |

Le script exige donc un domaine et un HTTPS public : il ne convient pas à un essai sans domaine. Pour la pile du test, j'ai écrit `deploy/.env` à partir de celui que le script avait généré (secrets conservés, jamais affichés) avec `SITE_ADDRESS=:80` et `PUBLIC_BASE_URL` = adresse du port redirigé. `docker compose config` : **valide**. `up -d --build` : 44 s, conteneur `healthy` dès le premier contrôle.

## 5. Contrôles

| Contrôle | Résultat |
|---|---|
| Santé | `healthy`, 0 redémarrage ; `/api/health` : 200 en direct et à travers Caddy |
| Journaux | **0 ligne contenant un secret** (comparaison en mémoire avec toutes les valeurs de 16 caractères ou plus de `deploy/.env`, rien d'écrit) ; aucun avertissement au démarrage |
| Pages | `/` 200 (142 Ko, **30 Ko en gzip**), `/en` 200, `/verifier` 200, `/app/connexion` 200, `/sw.js`, manifeste, NIP-05 : 200 ; `/n-existe-pas` : **404 en français** |
| En-têtes | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`, `Strict-Transport-Security` ; pas de `X-Powered-By` ; gzip et zstd |
| Règles de texte (`COPY-RULES.md`) | « régulé », « multisig », « garanti », « instantané » : 0 occurrence sur `/` et `/en`. Le mot « Instant » apparaît 2 fois, dans « pour l'instant » / « for now » |
| Compte démo | `POST /api/auth/demo` 200 ; cookie `Secure; HttpOnly; SameSite=lax` ; sans session, `/app/*` redirige (307) vers `/app/bienvenue` |
| Non-root | processus en 999/999 ; écriture dans `/data` : oui ; dans `/app` et `/etc` : refusée |
| `compose config` / `caddy validate` / `sh -n` | valides ; `caddy validate` avec `:80` **et** avec un domaine ; `Caddyfile` conforme à `caddy fmt` |
| Plafonds d'envoi | 65 Mo : **413 de l'application** (`Envoi trop volumineux.`) ; 75 Mo : **413 de Caddy** (`max_size 70MB`) ; l'application reste saine, aucun résidu écrit |
| Garde-fou inter-sites (avec l'adresse Codespaces comme `PUBLIC_BASE_URL`) | `Origin` de cette adresse : 200 ; site étranger : 403 ; `null` : 403 ; sans en-tête : 200 |
| Limitation de débit | 35 connexions démo avec 35 adresses forgées dans `X-Forwarded-For` : 30 passent, 7 sont refusées (429) : **la limite n'est pas contournable** |
| Sortie réseau | calendrier OpenTimestamps et `mempool.space` joignables depuis le conteneur ; l'ancrage a reçu sa preuve |

**Parcours de démonstration (par l'API, 0 échec).** Valider et payer la preuve en attente de « Résidence à Thiès » (devis 6 000 $ à 593 FCFA/$, étape `paid` en ~5 s ; séquestre 18 000 → 12 000 $) ; créer un projet ; le financer 50 $ par la route de simulation ; envoyer une photo par le **lien terrain sans compte** ; valider et libérer ; ancrer ; dossier public (3 015 octets) ; page de vérification. **Un vrai navigateur n'a pas été utilisé.**

**Persistance et restauration.** Cinq vérifications à chaque situation : session toujours valable, état des deux projets, octets du dossier ancré, octets de la photo téléversée.

| Situation | Résultat |
|---|---|
| Recréation du conteneur (`up -d --build`) | 5 sur 5 identiques |
| `docker compose restart app` | 5 sur 5 |
| `down` puis `up -d` | 5 sur 5 |
| **Restauration dans un volume supprimé puis recréé** | 5 sur 5 |

Sauvegarde : `deploy/backup.sh` en 2 s, archive de 102 530 octets, 5 entrées, propriétaires 999/999 conservés, ni `.env` ni clé dedans. Restauration : commande exacte de `DEPLOIEMENT.md` ; `tar` rétablit le propriétaire de `/data` ; l'application démarre, **écrit** (un projet créé après restauration) ; et `verifyDossier`, le vérificateur de l'application (celui de la page publique), valide le dossier relu : empreinte, format, **chaîne de hachage** et tête du registre (6 événements).

## 6. Défauts corrigés (3 commits locaux, non poussés)

### 6.1 `deploy/.env` lisible par tous : `5f5c58d`
**Constat.** Après `bootstrap.sh`, `stat` donne `666` (annoncé : `600`). **Cause :** `chmod 600` sur la copie de `.env.example`, puis chaque `setvar` reconstruit le fichier en `.env.tmp` et le **renomme par-dessus** : le fichier final prend les droits d'un fichier neuf. Il contient la clé de session, la clé maîtresse Nostr et, pour « vrais sats », les deux chaînes NWC (celle de paiement dépense). `umask 077` ne suffirait pas ici : `/workspaces` porte des ACL par défaut qui l'ignorent. **Correction :** le fichier temporaire est créé et passé en `600` avant d'y écrire. **Test :** `frontend/tests/deploy-bootstrap.test.ts` (10 tests) lance le script dans une copie jetable, avec de faux `docker` et `curl` et un `umask 000` : droits `600`, trois secrets de 256 bits distincts jamais affichés, profils démo et « vrais sats », refus d'écraser, refus d'une mauvaise adresse. Il échouait sur les droits avant la correction. Ignoré sur Windows (pas de `sh`).

### 6.2 Cache de build perdu : `4e84045`
**Constat.** `COPY . .` était reconstruit sans changement de source. **Cause :** `tsconfig.tsbuildinfo` (réécrit par chaque `tsc`) et `next-env.d.ts` (par `next build`) ne sont ni suivis par Git ni dans `.dockerignore`. Un clone propre n'en a pas : seul le poste d'un développeur était touché, qui pouvait aussi embarquer une sortie périmée. **Correction :** `*.tsbuildinfo`, `next-env.d.ts`, `out`, `npm-debug.log*`, `.DS_Store`. **Test :** `frontend/tests/dockerignore.test.ts` (3 tests), qui fixe aussi la règle la plus importante : `.env`, `.env.*` (donc `.env.local`, où vivent les vraies clés Bitnob) et `.data` n'entrent jamais dans un contexte de build.

### 6.3 Quatre pages qui plantent sans session : `8ac92cc`
**Constat** (journal de l'application, trouvé en le relisant) :
```
⨯ TypeError: Cannot read properties of null (reading 'id')
    at t (.next/server/chunks/ssr/src_app_app_(shell)_(tabs)_projets_page_tsx_….js:1:871) { digest: '2609372139' }
```
Reproduit à chaque visite sans session de `/app/accueil`, `/app/projets`, `/app/portefeuille` et `/app/profil`, qui répondaient pourtant 307 comme prévu. **Cause :** ces pages écrivaient `(await getSessionUser())!`, en comptant sur la redirection du layout ; dans l'App Router, **un layout et ses pages se rendent côte à côte**, la page s'exécute donc avec un utilisateur nul avant que la redirection l'emporte. Aucun effet visible, mais chaque robot ou session expirée aurait rempli le journal de production. **Correction :** `getSessionUser()` puis `if (!user) redirect('/app/bienvenue')`, comme les sept autres pages connectées. **Test :** `frontend/tests/session-guard.test.ts` parcourt `src/app` et refuse la forme `!` ; il listait exactement les quatre fichiers avant. Vérifié ensuite dans l'image reconstruite : mêmes 307, **0 `TypeError`** dans les journaux.

## 7. Constats non corrigés (à vous de trancher)

1. **`<html lang="fr">` sur `/en`** pour un navigateur français ou sans préférence (`lang="en"` seulement si le navigateur est anglais ou le cookie posé). Le contenu est en anglais : lecteurs d'écran et moteurs de recherche se trompent de langue. La balise est posée dans le layout racine d'après le cookie puis `Accept-Language`. **Piste :** faire poser par `proxy.ts` un en-tête de requête (`x-nobpay-lang`) pour `/` et `/en`, que `getLang()` lirait en premier. Ce n'est pas lié à Docker, d'où l'absence de correction ici.
2. **Un refus de démarrage n'arrête pas le processus.** Avec une clé de notification invalide, le journal dit `Démarrage refusé : VAPID_PUBLIC_KEY n'est pas une clé publique VAPID valable…`, mais le processus reste lancé et répond **HTTP 500 à toutes les requêtes** (`/api/health`, `/`, `/en`, `/app/connexion`). La protection tient (rien n'est servi), mais le conteneur reste « Up », les sondes échouent (code 1), et `restart: unless-stopped` ne le relance pas. J'ai documenté ce comportement dans `DEPLOIEMENT.md` plutôt que de le changer : sortir en erreur (`process.exit(1)`) donnerait une boucle de redémarrage bruyante, c'est un choix d'exploitation.
3. **L'archive de sauvegarde est lisible par tous les utilisateurs du serveur** (créée par `root`, `644`) et contient des données personnelles (`phone`, noms, fournisseurs, positions des photos). Un simple `chmod 600` casserait la copie hors serveur que la documentation conseille (utilisateur non-root). J'ai ajouté la consigne `chmod 700` sur le dossier de destination dans `DEPLOIEMENT.md`.
4. **`bootstrap.sh` n'a pas de mode HTTP simple** (voir 4). Une section « Essai sans domaine » décrit la marche à suivre à la main. Deux réglages de `deploy/.env.example` partent vers l'extérieur même en démonstration : `AUTO_ANCHOR=1` (empreintes SHA-256 vers les calendriers OpenTimestamps ; 5 ancrages en base à la fin du test) et `NOSTR_PUBLISH=1` (engagements vers des relais publics : `bootstrap.sh` pose la question, réponse par défaut « non », mais un `.env` écrit à la main depuis l'exemple l'activerait).

## 8. Non vérifié

- **HTTPS réel** : certificat Let's Encrypt, DNS, ports 443 ouverts ; le certificat interne de `localhost` a seulement montré que Caddy démarre et redirige (308).
- **Un vrai navigateur** : rendu, JavaScript, service worker, caméra et position du formulaire terrain. Piste : `docs/demo/record-demo.mjs` (Playwright) rejoue ce parcours et peut viser `http://localhost`.
- **L'adresse du port redirigé de Codespaces depuis l'extérieur** (le test a été fait avec `Host`/`Origin` simulés depuis l'intérieur).
- **Les profils bac à sable et vrais sats** (volontairement exclus), `bootstrap.sh real`, `bootstrap.sh demo` jusqu'à son message final.
- **Le basculement en `unhealthy`** d'un conteneur refusé : les sondes échouent bien, le conteneur jetable a été supprimé avant la fin du délai de démarrage.
- La tenue en charge, et une instance derrière le relais de Codespaces avec `TRUSTED_PROXY_HOPS=1` (le relais ajoute un saut : les visiteurs y partageraient une même limite de débit).

## 9. État laissé

- Branche `dbd4/m1-real-bitcoin` : **3 commits locaux** (`5f5c58d`, `4e84045`, `8ac92cc`) plus la mise à jour de la documentation, **non poussés**.
- La pile Docker du test **tourne encore** (`deploy-app-1`, `deploy-caddy-1`, ports 80 et 443) sur le volume `deploy_nobpay-data`, qui contient des projets fictifs de test (« Test Docker : boutique », « Après restauration »). Pour repartir d'une base neuve : Profil → « Réinitialiser les données ». Pour tout arrêter : `docker compose --env-file deploy/.env -f deploy/docker-compose.yml down` (ajouter `-v` pour supprimer aussi les volumes).
- `deploy/.env` existe (droits `600`, ignoré par Git, secrets de test générés sur place).

## 10. Reproduire

```bash
# depuis la racine du dépôt, avec Node 22 (nvm) pour l'étape 2
cd frontend && npm ci && npx tsc --noEmit && npm test && npm run build && cd ..
docker build -t nobpay-app ./frontend
# profil démo sans domaine : voir « Essai sans domaine » dans DEPLOIEMENT.md
docker compose --env-file deploy/.env -f deploy/docker-compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
sh deploy/backup.sh /chemin/vers/sauvegardes
docker run --rm -e SITE_ADDRESS=:80 -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2 caddy validate --config /etc/caddy/Caddyfile
```

Appels du parcours par l'API (session = cookie de `POST /api/auth/demo`) : `POST /api/projects/{id}/steps/{stepId}/quote` puis `…/release` ; `POST /api/projects` ; `POST /api/projects/{id}/fundings` puis `POST /api/fundings/{id}/simulate` ; `POST /api/projects/{id}/steps/{stepId}/proof` (multipart, en-tête `x-manager-token`) ; `POST /api/projects/{id}/anchors` ; `GET /api/anchors/{id}/dossier` ; état : `GET /api/projects/{id}/state`.
