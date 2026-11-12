# Mettre NobPay en ligne sans carte bancaire

> **Pour qui :** vous, qui n'avez pas de carte bancaire. Deux façons de payer le serveur : **(A) une personne de confiance qui a une carte le paie pour vous** (la plus simple, recommandée), ou **(B) vous le payez en Bitcoin (Lightning)**. Le nom de domaine est gratuit.
> **Compter :** environ 1 heure, et de l'ordre de 5 € par mois pour le serveur.
> **Limite connue :** les prix et l'acceptation de Lightning viennent de pages d'autres sites, pas des hébergeurs eux-mêmes, et certaines ont plusieurs mois. **Confirmez au moment de payer.** Je ne peux ni créer un compte ni payer à votre place.

## 1. Avoir des sats (option B seulement)
Si vous choisissez l'option A, passez à l'étape 2. Si vous avez déjà un portefeuille Lightning avec quelques dollars, passez à l'étape 2. Sinon, Banxaas (qui transforme le mobile money en Lightning, et qui sponsorise la conférence) est une piste : je n'ai pas vérifié son fonctionnement actuel, regardez ce que l'application propose pour votre pays.

## 2. Louer le serveur

### Option A (recommandée) : une personne de confiance avec une carte paie
Le moins cher que j'aie trouvé au 11 novembre 2026 pour un serveur avec assez de mémoire (prix relevés sur les pages des hébergeurs) :

| Offre | Mémoire | Prix par mois | Remarque |
|---|---|---|---|
| **OVHcloud VPS-1** | **4 Go** (2 cœurs, 40 Go NVMe) | de 5 à 6,5 € hors taxe selon les sources, **sans engagement** | « à partir de 3,81 € » suppose 12 mois payés d'avance : à éviter. Étapes détaillées : [GUIDE-OVH-VPS1.md](GUIDE-OVH-VPS1.md) |
| Contabo Cloud VPS 4 | 8 Go | 5,50 € **avec 24 mois d'engagement** | au mois : plus cher, avec des frais d'installation |
| DigitalOcean | 2 Go | 12 $, facturé à l'heure | simple, mais plus cher |
| Hostinger KVM 1 | 4 Go | 6,49 $ mais **24 mois payés d'avance** | à éviter pour un essai |
| Netcup VPS 500 | 4 Go | environ 8,3 € hors taxe | plus cher |
| Hetzner | 4 Go | à partir de 5,99 € hors taxe | « actuellement indisponible » le 11 novembre |

Le prix mensuel d'OVH vient de sites de comparaison, pas de sa page de commande, et ils ne sont pas d'accord entre eux (5,35 $ pour un modèle, 6,49 € pour un autre) : **confirmez-le au moment de commander**. Les étapes complètes, pour vous et pour la personne qui paie, sont dans [GUIDE-OVH-VPS1.md](GUIDE-OVH-VPS1.md).

Ce que la personne fait (15 minutes) :
1. Crée un compte sur ovhcloud.com (une pièce d'identité peut être demandée).
2. Dans son espace client, ajoute **votre clé SSH publique** (voir plus bas), puis commande un **VPS-1** sous **Ubuntu 24.04**, emplacement en Europe, **facturation mensuelle sans engagement** (pas l'offre « 12 mois »), et choisit votre clé à l'installation.
3. Vous envoie l'**adresse IP** et le **nom d'utilisateur** (`ubuntu` chez OVH). **Elle ne vous envoie jamais son mot de passe OVH** : vous n'en avez pas besoin.
4. Met un rappel pour résilier après les résultats (28 novembre) si le projet s'arrête là.

Cette personne reste propriétaire du serveur : choisissez quelqu'un en qui vous avez confiance, et n'y mettez que des données fictives.

### Option B : vous payez en Lightning
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
Connectez-vous (l'adresse IP et l'utilisateur sont donnés par l'hébergeur : `ubuntu` chez OVH, souvent `root` ailleurs) :

```bash
ssh ubuntu@ADRESSE_IP
sudo -i        # seulement si l'utilisateur n'est pas root : tout ce qui suit se fait en root
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
