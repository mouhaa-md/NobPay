# Commander le serveur OVHcloud VPS-1, pas à pas

> **Pour qui :** vous (qui n'avez pas de carte) et la personne de confiance qui paie. Chacun a sa partie. Vous pouvez lui envoyer ce fichier.
> **Compter :** 10 minutes pour vous (partie 1), 20 minutes pour la personne qui paie (partie 2, plus l'attente d'OVH), 40 minutes pour vous (partie 3).
> **Limite connue :** je n'ai pas pu ouvrir le site d'OVHcloud (mes outils sont bloqués dessus). Les menus viennent de la [documentation d'OVHcloud](https://docs.ovhcloud.com/en/guides/bare-metal-cloud/virtual-private-servers/starting-with-a-vps) et peuvent porter un nom un peu différent à l'écran. Le prix vient de sites de comparaison qui ne sont pas d'accord entre eux : **lisez le total sur la page de commande avant de payer.**

## Avant de commencer : ce que ça coûte

| | |
|---|---|
| Offre | **VPS-1** (la plus petite offre d'OVHcloud). D'après un site de comparaison : 2 cœurs, 4 Go de mémoire, 40 Go de disque |
| Prix par mois, sans engagement | **de 5 à 6,5 € hors taxe** selon les sources (une source donne 5,35 $, une autre 6,49 €), **plus la TVA** du pays de la personne qui paie |
| À éviter | Le prix « à partir de 3,81 € » ou « 4,54 $ » : il demande 12 mois payés d'avance |
| Durée utile | Du 13 novembre au 28 novembre, soit **environ 2 semaines**. L'abonnement se paie par mois : **un seul mois** suffit, soit **6 à 8 € au total, TVA comprise** (estimation), à condition de résilier avant le renouvellement (vers le 13 décembre) |

**Si l'offre affichée a moins de 2 Go de mémoire, ne la prenez pas.** Entre 2 et 4 Go, ça marche (ajoutez le swap de la partie 3). À partir de 4 Go, c'est confortable.

**Le plus tôt possible :** OVHcloud peut demander une pièce d'identité à la personne qui crée le compte, et la vérification peut prendre un ou deux jours. La date limite du hackathon est le **20 novembre à 20 h (GMT)**.

---

## Partie 1. Vous (10 minutes) : préparer votre clé et votre nom

### 1.1 Créer votre clé SSH (sur votre ordinateur)
La clé SSH remplace le mot de passe. Elle a deux moitiés : une **publique** (que vous donnez) et une **privée** (que vous ne donnez jamais).

Ouvrez PowerShell et regardez si vous en avez déjà une :

```powershell
Test-Path $env:USERPROFILE\.ssh\id_ed25519.pub
```

- Si ça affiche `True`, passez à la commande d'affichage plus bas : vous avez déjà une clé.
- Si ça affiche `False`, créez-la (acceptez les questions avec Entrée ; vous pouvez mettre une phrase secrète, notez-la) :

```powershell
ssh-keygen -t ed25519 -C "nobpay"
```

Affichez la moitié **publique** :

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Cela donne une seule ligne qui commence par `ssh-ed25519 AAAA...` et finit par `nobpay`. **C'est cette ligne que vous envoyez** à la personne qui paie (WhatsApp, e-mail, peu importe : elle est faite pour être partagée).

**Ne partagez jamais le fichier `id_ed25519` sans `.pub`** : c'est la clé privée.

Si PowerShell dit que `ssh-keygen` n'existe pas : Paramètres Windows, Applications, Fonctionnalités facultatives, ajoutez « Client OpenSSH ».

### 1.2 Réserver votre nom gratuit
1. Allez sur [duckdns.org](https://www.duckdns.org) et connectez-vous avec un compte que vous avez déjà (Google, GitHub, etc.).
2. Dans « domains », tapez un nom (par exemple `nobpay`) et cliquez sur « add domain ».
3. **Ne remplissez pas encore l'adresse IP** : vous l'aurez à la partie 3.

Si `nobpay` est pris, prenez `nobpay-dakar` ou autre : il faudra utiliser ce nom partout plus bas.

### 1.3 Envoyer la demande à la personne qui paie
Copiez ce message et adaptez-le :

> Bonjour, j'ai besoin de ton aide pour mon projet NobPay (hackathon Dakar Bitcoin Hack). Il me faut un petit serveur en ligne pour le montrer au jury, et je n'ai pas de carte bancaire. Peux-tu commander pour moi un serveur « VPS-1 » chez OVHcloud (environ 6 € pour un seul mois, sans engagement) puis le résilier après le 28 novembre ? Tu n'as rien à installer. Je ne te demande jamais ton mot de passe OVH, seulement l'adresse IP du serveur à la fin. Le serveur ne contiendra que des données de démonstration. Les étapes sont dans le fichier joint (partie 2), et voici ma clé publique : `ssh-ed25519 AAAA…` [collez votre ligne]

---

## Partie 2. La personne qui paie (20 minutes)

Ce que vous faites est simple : créer un compte, commander un petit serveur, enregistrer la clé publique, puis réinstaller le serveur avec cette clé. **Vous ne partagez jamais votre mot de passe OVH, ni le mot de passe temporaire reçu par e-mail.**

### 2.1 Choisir l'offre
1. Allez sur le site d'OVHcloud (ovhcloud.com), rubrique **VPS** (serveurs privés virtuels).
2. Choisissez l'offre **VPS-1**.
3. Réglez les options comme ceci :
   - **Localisation :** en Europe (France ou Allemagne, peu importe).
   - **Système :** **Ubuntu 24.04** (pas Windows, pas une version avec panneau de contrôle payant comme cPanel ou Plesk).
   - **Durée / engagement :** **1 mois, sans engagement.** Si la page propose « 12 mois » ou « 24 mois » moins chers, ne les prenez pas.
   - **Options (sauvegardes automatiques, snapshot, etc.) :** aucune.
4. Si le formulaire de commande a un champ **« clé SSH »**, choisissez la clé de votre ami (ou ajoutez-la ici). Dans ce cas, vous pourrez sauter 2.4 et 2.5.

### 2.2 Créer le compte et payer
1. Créez un compte OVHcloud (adresse e-mail, nom, adresse postale, téléphone) et confirmez l'adresse e-mail.
2. **OVHcloud peut demander une photo d'une pièce d'identité.** C'est normal chez eux.
3. **Lisez le total** (prix hors taxe + TVA) avant de payer. S'il dépasse nettement 8 à 9 € pour le premier mois, ou s'il parle de 12 mois ou plus, arrêtez et prévenez votre ami.
4. Payez par carte, puis acceptez le contrat.

> Le service se renouvelle tout seul chaque mois. C'est voulu jusqu'au 28 novembre : voir 2.6 pour résilier.

### 2.3 Attendre la livraison
OVHcloud envoie un e-mail « livraison du VPS » : de quelques minutes à une heure en général. Il contient l'adresse IP (IPv4), le nom d'utilisateur (`ubuntu` pour Ubuntu) et un lien vers un mot de passe temporaire. **Ne transmettez pas ce mot de passe.**

### 2.4 Enregistrer la clé publique de votre ami
Dans l'espace client OVHcloud :
1. Allez dans **« Mes services »** (ou dans le menu du compte), page **« Clés SSH »**.
2. Cliquez sur **« Ajouter une clé SSH »** et choisissez le type **« Dédié »** (c'est le nom du menu, mais la clé servira aussi pour un VPS).
3. Donnez-lui le nom `nobpay`, collez la ligne `ssh-ed25519 AAAA...` reçue, puis validez.

### 2.5 Réinstaller le serveur avec la clé
Le serveur est neuf et vide : réinstaller n'efface rien d'important.
1. Allez dans **Bare Metal Cloud**, **Virtual Private Servers**, puis cliquez sur votre VPS.
2. À côté de « Système d'exploitation / Distribution », ouvrez le menu **« … »** et choisissez **« Réinstaller mon VPS »**.
3. Choisissez **Ubuntu 24.04**, et dans la liste **« Clé SSH à pré-installer »** choisissez `nobpay`.
4. Confirmez, puis attendez environ 10 minutes que l'état redevienne « En fonctionnement ».

### 2.6 Envoyer l'adresse IP et prévoir la résiliation
1. Envoyez à votre ami **seulement** : l'adresse IPv4 (page du VPS, ou e-mail de livraison) et le nom d'utilisateur (`ubuntu`).
2. Mettez un rappel dans votre agenda **pour le 29 novembre** : résiliez alors le VPS dans l'espace client (rubrique renouvellement/facturation de « Mes services », puis « résilier »). Sans cela, OVHcloud continue de prélever chaque mois.

---

## Partie 3. Vous (40 minutes) : mettre NobPay en ligne

Vous avez reçu l'adresse IP (par exemple `51.xx.xx.xx`).

### 3.1 Brancher votre nom sur le serveur
1. Sur [duckdns.org](https://www.duckdns.org), mettez l'adresse IP dans la case « current ip » de votre nom, puis cliquez sur « update ip ».
2. Vérifiez dans PowerShell (le résultat doit montrer votre IP) :

```powershell
Resolve-DnsName nobpay.duckdns.org
```

### 3.2 Vous connecter
```powershell
ssh ubuntu@ADRESSE_IP
```

- La première fois, SSH demande de confirmer l'empreinte du serveur : tapez `yes`.
- Il ne doit **pas** demander de mot de passe (seulement votre phrase secrète si vous en avez mis une).
- Vous voyez ensuite un message de bienvenue d'Ubuntu : vous êtes sur le serveur.

Puis, sur le serveur, passez administrateur (il ne doit pas demander de mot de passe) :

```bash
sudo -i
```

### 3.3 Préparer le serveur
Copiez ces lignes une par une. Si une fenêtre rose ou bleue vous demande de redémarrer des services, appuyez sur Entrée.

```bash
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh
apt -y install git ufw
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
docker --version && docker compose version
```

**Si le serveur a moins de 4 Go de mémoire**, ajoutez du swap avant la suite :

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 3.4 Lancer NobPay
```bash
git clone --branch dbd4/m1-real-bitcoin https://github.com/mouhaa-md/NobPay.git
cd NobPay
SITE_ADDRESS=nobpay.duckdns.org sh deploy/bootstrap.sh demo
```

Remplacez `nobpay.duckdns.org` par votre nom. Le script fabrique les secrets sans les afficher, construit l'application (plusieurs minutes), la démarre et dit quoi faire. À la question « publier le registre sur des relais Nostr publics ? » répondez **non**.

### 3.5 Vérifier
1. `https://VOTRE-NOM.duckdns.org/api/health` répond.
2. `https://VOTRE-NOM.duckdns.org/` et `/en` s'ouvrent en HTTPS sans alerte du navigateur.
3. Sur votre téléphone, en réseau mobile (pas le Wi-Fi de la maison), « Essayer avec le compte démo » ouvre le tableau de bord.

Une fois que c'est bon, mettez le lien dans votre soumission Devpost.

---

## Si ça bloque

| Ce que vous voyez | Cause probable | Que faire |
|---|---|---|
| `Connection timed out` | Le serveur n'est pas encore démarré, ou mauvaise IP | Attendez 5 minutes, vérifiez l'IP et l'état « En fonctionnement » |
| `Permission denied (publickey)` | La clé n'est pas installée, ou mauvais utilisateur | Vérifiez que vous tapez `ubuntu@...` ; demandez de refaire 2.5 avec la bonne clé |
| `REMOTE HOST IDENTIFICATION HAS CHANGED` | Le serveur a été réinstallé depuis votre dernière connexion | `ssh-keygen -R ADRESSE_IP` puis reconnectez-vous |
| `sudo` demande un mot de passe | Compte sans accès administrateur sans mot de passe | Écrivez-moi, ne cherchez pas de mot de passe temporaire |
| La construction s'arrête avec « Killed » | Pas assez de mémoire | Ajoutez le swap (3.3) et relancez la commande du 3.4 |
| Le navigateur dit « connexion non sécurisée » | Le certificat HTTPS n'est pas encore obtenu | Vérifiez 3.1 (le nom doit pointer vers l'IP), les ports 80 et 443, puis regardez les journaux : `docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs --tail 100 caddy` |

Ne relancez pas dix fois de suite l'obtention du certificat : Let's Encrypt limite les essais ratés.

## Après
Pour la sauvegarde, les mises à jour et ce qu'il ne faut pas mettre sur ce serveur (de vrais sats, votre clé privée, `deploy/.env`), voir [GUIDE-SERVEUR-SANS-CARTE.md](GUIDE-SERVEUR-SANS-CARTE.md) section 7 et [DEPLOIEMENT.md](DEPLOIEMENT.md).
