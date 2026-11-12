# Mettre NobPay en ligne gratuitement sur Render

> **Pour qui :** vous, sans carte bancaire. **Coût :** 0 €. **Compter :** 30 à 40 minutes, dont 5 à 15 minutes d'attente pendant la construction.
> **Ce que vous obtenez :** une adresse publique en HTTPS (du genre `https://nobpay.onrender.com`) à mettre dans Devpost.
> **Ce que vous acceptez (lisez avant de commencer) :**
> - Le service **s'endort après 15 minutes sans visite** et met **environ 1 minute** à se réveiller. Le jury verra une page d'attente.
> - Le disque est **effacé à chaque réveil, redémarrage ou nouveau déploiement** : les projets créés par un visiteur disparaissent, et les données de démonstration reviennent à zéro. Ce n'est pas un défaut de NobPay : l'offre gratuite n'a pas de disque permanent.
> - Le serveur gratuit est petit : **0,1 cœur et 512 Mo de mémoire**. Les pages peuvent être lentes.
> - Aucune erreur de ma part n'est exclue ici : **je n'ai pas pu ouvrir le tableau de bord de Render**. Les noms des champs viennent de leur documentation et peuvent différer un peu à l'écran.
> - **Je ne sais pas si la construction de l'image passera** sur les machines gratuites de Render (leurs limites de mémoire de construction ne sont pas publiées). Le même Dockerfile a été construit et testé dans un Codespace GitHub de 8 Go.

Pour un lien plus solide (données conservées, pas d'attente), voir [GUIDE-OVH-VPS1.md](GUIDE-OVH-VPS1.md). Vous pouvez faire les deux : Render gratuit tout de suite, un vrai serveur ensuite.

---

## 1. Fabriquer votre secret (2 minutes)
Le secret signe les cookies de connexion. Il doit être long et que vous seul connaissiez.

Dans **Git Bash** (la fenêtre qui affiche `MINGW64`) :

```bash
openssl rand -hex 32
```

Cela affiche une ligne de 64 caractères, par exemple `3fa9…`. **Copiez-la** (clic droit, copier) : vous allez la coller dans Render à l'étape 4. **Ne l'envoyez à personne, pas même à moi, et ne l'écrivez dans aucun fichier du projet.**

## 2. Créer le compte Render (5 minutes)
1. Allez sur [dashboard.render.com/register](https://dashboard.render.com/register).
2. Inscrivez-vous avec votre adresse e-mail (ou Google). **Évitez « Sign in with GitHub »** : cela donnerait à Render un accès à votre compte GitHub, dont vous n'avez pas besoin ici.
3. Confirmez l'e-mail, puis répondez aux questions de bienvenue comme vous voulez.
4. **Si Render vous demande une carte bancaire pour continuer, arrêtez** et écrivez-moi ce qui est affiché. L'offre gratuite est annoncée sans carte par Render, mais des utilisateurs disent le contraire, et je n'ai pas pu le vérifier.

## 3. Créer le service (5 minutes)
1. Cliquez sur **New +**, puis **Web Service**.
2. Choisissez l'onglet **Public Git Repository** et collez :

```
https://github.com/mouhaa-md/NobPay
```

Cliquez sur **Connect**.

3. Remplissez le formulaire :

| Champ | Valeur |
|---|---|
| **Name** | `nobpay` (si le nom est pris, Render ajoute des lettres : notez l'adresse finale à l'étape 6) |
| **Language** | **Docker** |
| **Branch** | **`dbd4/m1-real-bitcoin`** (par défaut Render propose `main`, qui est l'ancienne version, **sans** Dockerfile : choisissez bien la bonne branche) |
| **Region** | **Frankfurt (EU Central)**, la plus proche de Dakar |
| **Root Directory** | laissez **vide** |
| **Instance Type** | **Free** |

4. Ouvrez la section **Advanced** et réglez :

| Champ | Valeur |
|---|---|
| **Dockerfile Path** | `./frontend/Dockerfile` |
| **Docker Build Context Directory** | `./frontend` |
| **Health Check Path** | `/api/health` |
| **Auto-Deploy** | sans objet pour un dépôt public (les mises à jour se font à la main) |

## 4. Les variables d'environnement
Toujours dans **Advanced**, section **Environment Variables**. Le plus simple : le bouton **Add from .env**, puis collez ces lignes **en remplaçant la première** par votre secret de l'étape 1 :

```
SESSION_SECRET=COLLEZ_ICI_VOTRE_SECRET_DE_64_CARACTERES
ALLOW_DEMO=1
BITNOB_MODE=mock
PUBLIC_BASE_URL=https://nobpay.onrender.com
PORT=3000
HOSTNAME=0.0.0.0
TRUSTED_PROXY_HOPS=2
```

À quoi elles servent :

| Variable | Rôle |
|---|---|
| `SESSION_SECRET` | signe les connexions (obligatoire, 32 caractères au moins) |
| `ALLOW_DEMO=1` et `BITNOB_MODE=mock` | profil de **démonstration** : paiements simulés, **aucun vrai sat** |
| `PUBLIC_BASE_URL` | l'adresse publique : liens, cookies sécurisés. À corriger à l'étape 6 si Render vous donne une autre adresse |
| `PORT=3000` et `HOSTNAME=0.0.0.0` | disent à l'application d'écouter sur le port 3000 et sur toutes les adresses, sinon Render ne la trouve pas |
| `TRUSTED_PROXY_HOPS=2` | pour que les limites par visiteur voient la vraie adresse du visiteur et non celle de l'intermédiaire de Render (valeur raisonnable mais **non vérifiée** chez Render ; sans conséquence grave sur une démo sans argent) |

Ne mettez **aucune** autre clé (pas de clé Bitnob, pas de chaîne de portefeuille, pas de clé Anthropic).

## 5. Lancer et attendre
1. Cliquez sur **Create Web Service** (ou **Deploy**).
2. Render ouvre les **Logs** : l'image se construit (installation des paquets, puis la construction de l'application). Comptez **5 à 15 minutes** ; la page peut sembler figée longtemps : c'est normal.
3. C'est bon quand le journal dit que le service est **« live »** (en ligne) et que l'état en haut passe à **Live** en vert.

## 6. Vérifier (5 minutes)
Votre adresse est affichée en haut de la page du service (`https://nobpay.onrender.com` ou voisine).

1. Ouvrez `https://VOTRE-ADRESSE/api/health` : vous devez voir une petite ligne de texte qui contient `"mode":"mock"` et `"demo":true`.
2. Regardez dans cette ligne la valeur `webhookUrl` : elle doit commencer par **votre vraie adresse**. Si elle commence par une autre, **corrigez `PUBLIC_BASE_URL`** : page du service, **Environment**, modifiez la valeur avec l'adresse exacte (sans `/` à la fin), **Save Changes**. Render redémarre le service tout seul.
3. Ouvrez `https://VOTRE-ADRESSE/` et `https://VOTRE-ADRESSE/en`.
4. Cliquez sur **Essayer avec le compte démo** : le tableau de bord doit s'ouvrir. Créez un projet, financez-le avec la simulation.
5. Ouvrez le lien depuis votre **téléphone**, en réseau mobile (pas le Wi-Fi de la maison).

## 7. Option : le garder éveillé (10 minutes)
Un service qui reçoit une visite toutes les 5 minutes ne s'endort pas : le jury n'attend plus et les données restent tant que Render ne redémarre pas le service (il peut le faire « à tout moment », selon sa documentation). L'offre gratuite donne 750 heures par mois, assez pour un service allumé toute la journée.

1. Créez un compte gratuit sur [uptimerobot.com](https://uptimerobot.com) (pas de carte).
2. Ajoutez un moniteur **HTTP(s)** sur `https://VOTRE-ADRESSE/api/health`, intervalle de **5 minutes**.

Je n'ai pas vérifié ce que Render pense de ce procédé : l'offre gratuite est faite pour des essais, et Render peut suspendre un service qui reçoit un trafic anormal. Si elle est suspendue, la démonstration s'arrête : **gardez la vidéo de démonstration comme secours**.

## 8. Ce qu'il faut dire au jury
Ajoutez ce paragraphe dans le README et dans Devpost, pour que personne ne croie à un bogue :

> **Démonstration hébergée gratuitement.** Le serveur s'endort après 15 minutes sans visite : le premier chargement peut prendre environ une minute. Les données de démonstration sont remises à zéro à chaque réveil. Aucun vrai bitcoin n'est en jeu sur cette instance (paiements simulés).
> *Free hosting: the server sleeps after 15 minutes of inactivity, so the first load can take about a minute. Demo data resets on each wake-up. No real bitcoin is involved on this instance (simulated payments).*

## Mise à jour plus tard
Page du service, bouton **Manual Deploy**, **Deploy latest commit** (Render reprend la dernière version de la branche sur GitHub). Pour un dépôt public ajouté de cette façon, il n'y a pas de déploiement automatique.

---

## Si ça bloque

| Ce que vous voyez | Cause probable | Que faire |
|---|---|---|
| « Failed to read dockerfile » ou fichier introuvable | Les chemins du Dockerfile | Vérifiez `./frontend/Dockerfile` et `./frontend`. Sinon essayez : Root Directory `frontend`, Dockerfile Path `./Dockerfile`, Build Context `.` |
| Erreur sur `docker/dockerfile` ou `syntax` dès les premières lignes | La première ligne du Dockerfile (`# syntax=…`) n'est pas acceptée par leur constructeur | Écrivez-moi : je retire cette ligne, qui n'est pas nécessaire |
| La construction s'arrête avec « Killed », « out of memory » ou « exit code 137 » | Le constructeur gratuit manque de mémoire pour construire l'application | Écrivez-moi : plan B = construire l'image ailleurs (GitHub) et la faire télécharger par Render, ou prendre un petit serveur payant (guide OVH) |
| « No open ports detected » ou le service reste « Deploying » | Port ou adresse d'écoute | Vérifiez `PORT=3000` et `HOSTNAME=0.0.0.0` dans Environment |
| Le journal contient « Démarrage refusé » | Une variable manque ou est mal écrite | Le journal dit laquelle : le plus souvent `SESSION_SECRET` (au moins 32 caractères). Corrigez, enregistrez |
| La page met plus d'une minute | Service endormi qui se réveille, ou 0,1 cœur | Attendez, puis rechargez. Voir l'option du garder éveillé |
| « Requête refusée : elle ne vient pas de cette application » (403) | L'adresse du site ne correspond pas à `PUBLIC_BASE_URL` | Corrigez `PUBLIC_BASE_URL` (étape 6) |
| Vos projets ont disparu | Le service s'est endormi ou a redémarré : le disque est effacé | Normal sur l'offre gratuite. Pour garder les données, il faut un vrai serveur |

## Après
- Mettez l'adresse dans **Devpost** et dans le **README**.
- Gardez la **vidéo de démonstration** comme secours (c'est aussi le minimum demandé par le règlement).
- Ne mettez **jamais de vrais sats** ici : pas de disque permanent, et les clés ne doivent pas être sur une instance gratuite endormie.
