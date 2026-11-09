# Prompt pour la session Claude Code dans le Codespace (Docker)

> À coller dans Claude Code, dans un Codespace ouvert sur la branche `dbd4/m1-real-bitcoin`. Le Codespace a Docker ; la machine de développement Windows n'en avait pas.

---

Tu reprends un projet que j'ai développé sur une autre machine, sans Docker. Ta mission : **le premier vrai test Docker**, puis corriger ce qui casse. Réponds-moi en français, court et concret ; le long va dans `docs/`.

## Le projet en trois lignes
- **NobPay** (le nom va changer, voir « À ne pas faire »), application web de séquestre : un financeur (souvent de la diaspora) verse des sats par Lightning, l'argent sort étape par étape quand la preuve (photos, facture) arrive. Next.js 16 (App Router), React 19, Node 22, dans `frontend/`. Base = **un seul fichier JSON** dans le volume `/data` (donc **un seul conteneur**, jamais deux).
- C'est une candidature au **Dakar Bitcoin Hack #4** (dépôt de la candidature avant le **20 novembre 2026, 20 h GMT** ; vote du public du 9 au 24 novembre). Le jury juge d'abord un MVP **testable en ligne**.
- Dépôt : `mouhaa-md/NobPay`, branche `dbd4/m1-real-bitcoin`, étiquette de départ `pre-dbd4`.

Lis d'abord : `ARCHITECTURE.md`, `docs/DEPLOIEMENT.md`, `docs/CHANGELOG-DBD4.md`, `docs/AUDIT-2026-11-03.md`, `docs/DEMO-SCRIPT.md`.

## Ce qui est vérifié, et ce qui ne l'est pas
- **Vérifié sous Windows, en simulation :** `npx tsc --noEmit` propre, `npm test` = **884 tests / 62 fichiers** verts, `next build` OK, et le mode « standalone » de Next démarre et répond sur `/api/health`.
- **Jamais fait :** construire l'image Docker, lancer `docker compose`, tester `deploy/bootstrap.sh`, `deploy/backup.sh` et le `Caddyfile`. Tout ce qui touche Docker est écrit mais **non exécuté**. C'est ton travail.

## Ce que je te demande, dans l'ordre
1. **Environnement** : `docker --version`, `docker compose version`, `node -v` (Node 22 attendu). Dis-moi ce qui manque avant d'aller plus loin.
2. **Base de référence sous Linux** : dans `frontend/`, `npm ci`, `npx tsc --noEmit`, `npm test`, `npm run build`. Les chiffres attendus sont ci-dessus ; toute différence avec Windows (chemins, casse des noms de fichiers, fins de ligne) est un bogue à signaler et corriger. Si la mémoire manque, lance les tests fichier par fichier.
3. **Construire l'image** : `docker build -t nobpay-app ./frontend`. Le `Dockerfile` (3 étapes, utilisateur non-root `nobpay`, volume `/data`, `HEALTHCHECK` sur `/api/health`) n'a jamais été exécuté. Vérifie : le build passe, la taille de l'image, que `public/` et `.next/static` sont bien copiés, que `frontend/.dockerignore` n'exclut rien de nécessaire.
4. **Lancer le profil démo** (tout est simulé, données fictives seulement). Les variables sont dans `deploy/.env.example` ; lis aussi `frontend/src/server/startup.ts` : certaines combinaisons **refusent volontairement de démarrer** (par exemple `ALLOW_DEMO=1` avec de vrais sats). Pour le Codespace : `SITE_ADDRESS=:80` (Caddy en HTTP simple, sans certificat) et `PUBLIC_BASE_URL` = l'adresse du port redirigé par Codespaces. Soit tu essaies `sh deploy/bootstrap.sh demo` (il écrit `deploy/.env` avec des secrets générés, refuse d'écraser un `.env` existant), soit tu écris `deploy/.env` à la main depuis l'exemple. Dans les deux cas, **ne jamais afficher ni committer un secret** (`deploy/.env` est ignoré par Git, vérifie-le).
5. **Contrôles une fois en marche** :
   - le conteneur passe à `healthy` ; `/api/health` répond ; les journaux ne contiennent aucun secret ;
   - la page d'accueil en français et en anglais (`/` et `/en`), le compte démo, puis le parcours de `docs/DEMO-SCRIPT.md` : créer un projet, le financer (route de simulation), envoyer une preuve par le lien « terrain », valider et libérer ;
   - **persistance** : `docker compose restart app`, puis `down` puis `up -d` : les projets sont toujours là (volume `nobpay-data`) ;
   - **sauvegarde** : lis `deploy/backup.sh`, lance-le, restaure dans une instance vide et vérifie que le registre se relit ;
   - le conteneur tourne bien en utilisateur non-root et peut écrire dans `/data` ;
   - `docker compose --env-file deploy/.env -f deploy/docker-compose.yml config` est valide ; le `Caddyfile` est valide (`docker run --rm -e SITE_ADDRESS=:80 -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2 caddy validate --config /etc/caddy/Caddyfile`) ; `sh -n` sur les deux scripts `.sh`.
6. **Corriger** ce qui casse, avec un test quand c'est du code, en petits commits. Mets ensuite à jour le paragraphe « Limite connue » en haut de `docs/DEPLOIEMENT.md` : dis exactement ce qui a été vérifié sous Docker et ce qui ne l'est toujours pas.
7. **Rapport final** (en français) : ce qui a marché, ce qui a cassé, ce que tu as corrigé, ce qui reste. Si une étape échoue, montre la sortie, ne la résume pas en « ça marche ».

## À ne pas faire
- **Ne jamais pousser** (`git push`) sans que je le demande. Les commits locaux sont bienvenus.
- **Ne jamais écrire de secret** (chaînes de connexion NWC, clé Anthropic, clé privée VAPID, `deploy/.env`) dans le chat, un fichier suivi par Git ou un journal. N'utilise pas le profil `real` aujourd'hui : pas de vrais sats dans un Codespace.
- **Ne pas passer Bitnob en clés réelles** (`BITNOB_MODE` reste `mock`).
- **Ne pas renommer le projet** : le nom est en cours de choix. Le renommage se fera en une seule passe, plus tard.
- **Respecter `frontend/design-reference/COPY-RULES.md`** : ne jamais écrire « régulé », « instantané », ni annoncer une intégration qui n'existe pas.
- **Un seul conteneur `app`**, jamais deux (la base est un fichier).
- Ne rends pas un port Codespaces public sauf si je te le demande ; il ne contient que des données fictives, mais c'est à moi de décider.
