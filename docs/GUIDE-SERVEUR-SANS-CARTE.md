# Mettre NobPay en ligne sans carte bancaire

> **Pour qui :** vous, qui n'avez pas de carte qui paie à l'étranger. On paie le serveur en Bitcoin (Lightning), le nom de domaine est gratuit ou payé en Bitcoin aussi.
> **Compter :** environ 1 heure, et de l'ordre de 5 à 15 $ en sats.
> **Limite connue :** les prix et l'acceptation de Lightning viennent de pages d'autres sites, pas des hébergeurs eux-mêmes, et certaines ont plusieurs mois. **Confirmez au moment de payer.** Je ne peux ni créer un compte ni payer à votre place.

## 1. Avoir des sats
Si vous avez déjà un portefeuille Lightning avec quelques dollars, passez à l'étape 2. Sinon, Banxaas (qui transforme le mobile money en Lightning, et qui sponsorise la conférence) est une piste : je n'ai pas vérifié son fonctionnement actuel, regardez ce que l'application propose pour votre pays.

## 2. Louer le serveur
Hébergeurs trouvés qui disent accepter Lightning : [LunaNode](https://www.lunanode.com), [Cloudzy](https://cloudzy.com/lightning-vps/), VPS4Crypto. Mon ordre de préférence : LunaNode (paiement par BTCPay, Bitcoin ou Lightning), puis Cloudzy.

À choisir au moment de la commande :
- **2 Go de mémoire**, 1 cœur, 20 Go de disque. Pourquoi 2 Go : construire l'image de l'application consomme beaucoup de mémoire. Avec 1 Go seulement, ajoutez du swap (voir l'étape 4).
- **Ubuntu 24.04** (ou Debian 12).
- **Un emplacement en Europe** (le plus proche de Dakar).
- **Votre clé SSH** (étape suivante).

### Créer votre clé SSH (sur votre ordinateur Windows)
Dans PowerShell :

```powershell
ssh-keygen -t ed25519 -C "nobpay"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Acceptez les questions par Entrée. La deuxième commande affiche la **clé publique** : c'est elle que vous collez chez l'hébergeur. **Le fichier `id_ed25519` (sans `.pub`) est votre clé privée : ne le montrez à personne, ne le collez nulle part.**

## 3. Le nom de domaine
- **Gratuit :** [DuckDNS](https://www.duckdns.org) : vous vous connectez avec un compte existant, vous choisissez un nom (par exemple `nobpay`), vous indiquez l'adresse IP du serveur. Cela donne `nobpay.duckdns.org`. Pas de carte. Moins sérieux qu'un vrai domaine, mais suffisant pour le jury.
- **Payé en Bitcoin :** `nobpay.org` et `nobpay.app` sont libres d'après les registres au 9 novembre (`nobpay.com` est pris). Certains vendeurs de domaines acceptent Bitcoin ou Lightning ([NiceNIC](https://nicenic.com) l'annonce, à confirmer au paiement). Comptez une dizaine de dollars par an. Ensuite, créez un enregistrement DNS de type `A` qui pointe vers l'adresse IP du serveur.

Le nom doit déjà pointer vers le serveur **avant** l'étape 5 : c'est ce qui permet à Caddy d'obtenir le certificat HTTPS tout seul.

## 4. Préparer le serveur
Connectez-vous (l'adresse IP et l'utilisateur sont donnés par l'hébergeur, souvent `root` ou `ubuntu`) :

```bash
ssh root@ADRESSE_IP
```

Puis, sur le serveur :

```bash
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh      # installe Docker (script officiel)
apt -y install git ufw
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
docker --version && docker compose version
```

**Avec 1 Go de mémoire seulement**, ajoutez 2 Go de swap avant de construire :

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 5. Lancer NobPay
```bash
git clone --branch dbd4/m1-real-bitcoin https://github.com/mouhaa-md/NobPay.git
cd NobPay
SITE_ADDRESS=nobpay.duckdns.org sh deploy/bootstrap.sh demo
```

(Remplacez `nobpay.duckdns.org` par votre nom.) Le script génère les secrets sur place sans jamais les afficher, construit l'image (quelques minutes), démarre, attend que l'application réponde et vous dit quoi faire. Il demande si vous voulez publier le registre sur des relais Nostr publics : répondez **non** pour une démonstration.

L'ancrage OpenTimestamps reste actif : il n'envoie que des empreintes (jamais de contenu), et montre au jury la preuve Bitcoin en action.

## 6. Vérifier
1. `https://<votre-nom>/api/health` répond.
2. `https://<votre-nom>/` et `https://<votre-nom>/en` s'affichent en HTTPS, sans alerte du navigateur.
3. « Essayer avec le compte démo » ouvre le tableau de bord ; créer un projet, le financer avec la simulation, envoyer une preuve par le lien « terrain ».
4. Ouvrez la page depuis un téléphone, avec le réseau mobile (pas le Wi-Fi de la maison).

Si ça ne répond pas : `docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs --tail 100 app` dit pourquoi. Si le certificat HTTPS tarde, vérifiez que le nom pointe bien vers l'IP du serveur et que les ports 80 et 443 sont ouverts chez l'hébergeur.

## 7. Après
- **Sauvegarde :** planifiez `deploy/backup.sh` et essayez UNE FOIS la restauration dans un volume neuf (voir `docs/DEPLOIEMENT.md`).
- **Mise à jour :** `git pull` puis `docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build`.
- **Ne mettez pas de vrais sats** sur cette instance. Le profil « vrais sats » (deux connexions de portefeuille, plafonds bas) se prépare à part, plus tard.
- **Ne partagez jamais** `deploy/.env` ni votre clé privée.
