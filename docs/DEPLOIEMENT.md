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
