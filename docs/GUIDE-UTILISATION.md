# NobPay : guide d'utilisation

> **Pour qui :** toute personne qui utilise NobPay (financeur, personne de confiance sur place, fournisseur, administrateur, vérificateur) et le jury qui veut le tester seul.
> **Version décrite :** prototype du hackathon Code & Chain Dakar (Bitnob × Btrust), en **mode démonstration**. Ce que le mode démonstration simule et ce qui est réel est expliqué au chapitre 9.

---

## 1. NobPay en deux minutes

Quand quelqu'un de la diaspora envoie de l'argent pour construire une maison, lancer une culture ou acheter du stock, rien ne lui dit à quoi l'argent sert vraiment. NobPay change l'ordre des choses :

1. Le **financeur** crée un projet découpé en **étapes** (par exemple : fondations, murs, toiture) et met l'argent **en séquestre**.
2. Une **personne de confiance sur place** envoie, pour chaque étape, des **preuves** : photos géolocalisées et facture du fournisseur.
3. Le financeur regarde les preuves, puis **valide** ou **refuse**. Rien n'est payé sans son accord.
4. Une fois validé, le **fournisseur est payé directement** sur son mobile money (Wave, Orange Money, Free Money).
5. Chaque évènement s'inscrit dans un **registre infalsifiable**, dont l'empreinte est **ancrée sur Bitcoin**. N'importe qui peut le **vérifier**, sans compte.

Une seule étape est ouverte à la fois, et seulement si l'argent en séquestre couvre son montant.

### Les cinq personnes, et leur page

| Qui | Où | Compte ? | Ce qu'elle fait |
|---|---|---|---|
| **Financeur** | `/app` | oui (téléphone + code SMS) | crée et finance les projets, valide les paiements |
| **Personne de confiance** | `/terrain/<lien privé>` | non, un lien suffit | envoie les photos et factures, suit l'avancement |
| **Fournisseur** | `/recu/<lien>` | non | consulte le reçu de son paiement |
| **Administrateur** | `/app/admin` | oui, désigné par configuration | surveille ce qui est bloqué (lecture seule) |
| **Vérificateur** | `/verifier` | non | contrôle un dossier sans faire confiance à NobPay |

---

## 2. Essayer rapidement (compte démonstration)

1. Ouvrez l'adresse de l'application (en local : `http://localhost:3000`).
2. Cliquez sur **Essayer la démo**, puis **Essayer avec le compte démo**. Vous arrivez connecté sur le compte d'Aminata Sow, avec trois projets déjà remplis.
3. Si l'on vous demande un code SMS : `123456`.

Les trois projets de démonstration :

| Projet | Secteur | Budget | Où il en est |
|---|---|---|---|
| Résidence à Thiès | Immobilier | 24 000 $ | étapes 1 et 2 payées, **étape 3 : preuve à valider** |
| Pépinière à Kaolack | Agricole | 9 000 $ | plusieurs étapes payées |
| Import de stock à Dakar | Commerce | 5 000 $ | première étape payée |

Pour repartir de zéro à tout moment : **Profil → Réinitialiser les données** (compte démo seulement).

---

## 3. Le financeur

### 3.1 Créer un compte et se connecter

- **Créer un compte** : prénom, nom, pays de résidence, numéro de téléphone, puis le **code SMS** reçu.
- **Se connecter** : numéro de téléphone, puis code SMS. Le code est valable 5 minutes, à usage unique, avec 5 essais.
- Vous restez connecté 7 jours. **Se déconnecter** (dans Profil) ferme votre session sur tous vos appareils.

> En démonstration, il n'y a pas de vrai envoi de SMS : le code partagé `123456` est utilisé. N'utilisez pas de vraies données.

### 3.2 L'écran d'accueil

Il montre le total en séquestre, la liste de vos projets et, en haut, ce qui attend votre décision (« 1 preuve attend votre décision »). Un clic sur cette carte ouvre directement la preuve à examiner.

La navigation (barre du bas sur téléphone, menu à gauche sur ordinateur) donne accès à : **Accueil · Projets · Portefeuille · Notifications · Profil**. Le bouton **Nouveau projet** est toujours à portée de main.

### 3.3 Créer un projet

**Projets → Nouveau projet**, puis dans l'ordre :

1. **Secteur** : Immobilier, Agricole ou Commerce. Chaque secteur propose des étapes types (par exemple, Immobilier : titre foncier, fondations, murs, dalle, toiture, finitions).
2. **Informations** : nom du projet, ville, budget en dollars (de 100 $ à 500 000 $).
3. **Étapes** : NobPay répartit le budget sur les étapes proposées. Vous pouvez changer les titres et les montants, ajouter ou supprimer des étapes (de 1 à 12). **La somme des étapes doit être égale au budget.**
4. **Personne de confiance** : son nom (et son numéro, facultatif). C'est elle qui recevra le lien privé.
5. **Règle d'approbation** : « Moi seul ». L'option « 2 personnes sur 3 » est affichée comme **Bientôt**.
6. **Créer le projet.**

À la création, l'étape 1 n'est pas encore ouverte : il faut d'abord alimenter le séquestre.

### 3.4 Alimenter le séquestre (financer)

Dans le projet, bouton **Financer**.

1. Saisissez le montant (minimum 5 $).
2. Choisissez **Bitcoin Lightning**. Le dépôt en USDT / USDC est affiché comme **Bientôt**.
3. **Générer la facture** : NobPay affiche une facture Lightning (texte et QR code), valable 24 heures. Payez-la avec un portefeuille Lightning.
4. Quand le paiement est reçu, Bitnob prévient NobPay par un message signé et le séquestre du projet est crédité. L'étape 1 s'ouvre si le montant la couvre.

> **En démonstration**, la facture n'est pas payable. Cliquez sur **Simuler le paiement** : NobPay reçoit alors le même message signé que Bitnob enverrait.

### 3.5 Envoyer le lien à la personne de confiance

Sur la page du projet (et sur chaque page d'étape), la section consacrée à la personne de confiance contient le lien privé.

- **Envoyer le lien** : partage par WhatsApp ou par le menu de partage du téléphone.
- **Copier** : copie le lien.
- **Renouveler le lien** (avec confirmation) : crée un nouveau lien et **désactive l'ancien**. À faire si le lien a été perdu ou transmis à quelqu'un d'autre.

Le lien est valable 90 jours. La personne de confiance n'a besoin ni de compte ni d'application.

### 3.6 Examiner une preuve et payer

Quand la personne de confiance a envoyé sa preuve, l'étape passe à **Preuve à valider** et vous recevez une alerte dans **Notifications**. Ouvrez l'étape :

- **Photos** : chacune est marquée « Géolocalisée », avec la date, la position et la précision déclarées par le téléphone.
- **Facture du fournisseur** : montant et contrôle de cohérence avec le montant prévu.
- **Sera payé directement** : le nom du fournisseur, son opérateur et son numéro.
- le **message de l'équipe sur place**, s'il y en a un.
- **Empreintes des fichiers** (SHA-256) : elles sont enregistrées dans le registre.

Deux choix :

- **Valider et payer** : NobPay demande un **devis** à Bitnob (montant débité, taux, frais, montant reçu, durée de validité). Lisez-le, puis **Confirmer et payer**. Le devis expire vite (60 secondes en démonstration) : s'il expire, redemandez-le.
- **Refuser cette preuve** : avec une note facultative. L'étape revient en **À refaire** et la personne de confiance voit votre motif sur sa page. Elle peut renvoyer une nouvelle preuve.

Après confirmation, l'étape passe à **Paiement en cours**, puis à **Payée** dès que Bitnob confirme. La page affiche le suivi en trois temps : preuve validée, paiement demandé, reçu par le fournisseur. L'étape suivante s'ouvre automatiquement si le séquestre la couvre.

Si le paiement échoue clairement, l'étape revient à « Preuve à valider » : la preuve reste valable, vous pouvez réessayer. Si Bitnob ne répond pas clairement, l'argent reste **réservé** et NobPay vérifie le vrai statut ; ne relancez pas à la main.

### 3.7 Envoyer le reçu au fournisseur

Une fois le paiement lancé, la page de l'étape affiche **Reçu pour <fournisseur>**. **Envoyer le reçu** le partage par WhatsApp ou par le menu de partage ; **Copier** copie le lien ; **Voir le reçu** l'ouvre. Le fournisseur n'a rien d'autre à faire (chapitre 5).

### 3.8 Portefeuille, notifications, profil

- **Portefeuille** : le total en séquestre et le détail, projet par projet, des versements et des paiements. Les fonds sont comptés projet par projet dans NobPay, mais le portefeuille Bitnob sous-jacent est commun.
- **Notifications** : la section **À traiter** (preuves en attente) puis l'historique. Les alertes restent dans l'application : il n'y a pas encore de notification push sur le téléphone.
- **Profil** : vos informations, le mode de fonctionnement (démonstration ou sandbox), les liens de vos équipes sur place, l'installation de l'application sur l'écran d'accueil, **Réinitialiser** (démo) et **Se déconnecter**. Pour un administrateur, une carte **Administration** apparaît aussi.

### 3.9 Installer NobPay comme une application

NobPay est une application web installable (PWA). Dans **Profil**, la carte d'installation explique comment l'ajouter à l'écran d'accueil de votre téléphone ou de votre ordinateur.

---

## 4. La personne de confiance sur place

Elle n'a pas de compte : elle ouvre le **lien privé** reçu du financeur (par exemple par WhatsApp). Ce lien est personnel, à ne pas partager.

### 4.1 Ce que montre la page

- **Un résumé du projet** : nom, ville, secteur, et pour qui elle travaille.
- **Ce qu'il faut faire maintenant** : l'étape ouverte, son montant et les preuves attendues.
- **Avancement** : nombre d'étapes payées sur le total.
- **Dernières nouvelles** : preuve envoyée, validée ou refusée, fournisseur payé.
- **Les étapes et mes envois** : pour chaque étape, ce qui a été envoyé (miniatures des photos), le fournisseur à payer, l'état du paiement et un lien vers le reçu.

Elle **ne voit pas** le solde du financeur et ne peut **pas** débloquer d'argent.

### 4.2 Envoyer une preuve

1. Ajoutez la **photo ou les photos** prises sur place. Le téléphone enregistre la position et l'heure ; autorisez la localisation quand le navigateur le demande.
2. Ajoutez la **facture** du fournisseur (image ou PDF).
3. Indiquez le **fournisseur à payer** : son nom, son téléphone mobile money et son opérateur (Wave, Orange Money ou Free Money), puis le montant de la facture.
4. Ajoutez un court message (facultatif, 500 caractères), par exemple « Les fondations sont coulées, le béton a séché trois jours ».
5. **Envoyer la preuve.**

Formats acceptés : photos en **JPEG, PNG ou WebP** (les photos au format HEIC ou SVG sont refusées : réglez l'appareil photo sur « le plus compatible »). Facture en image ou en PDF.

La page indique ensuite **Preuve reçue** et se met à jour toute seule. Si la preuve est refusée, le motif du financeur s'affiche et le formulaire revient pour renvoyer une nouvelle preuve. Une fois le paiement fait, la page montre **Dernier paiement** avec le reçu à envoyer au fournisseur.

### 4.3 Si le lien ne marche plus

Le lien expire au bout de 90 jours et s'invalide si le financeur le renouvelle. Demandez-lui un nouveau lien.

---

## 5. Le fournisseur

Il reçoit son argent sur son mobile money. S'il le souhaite, il peut ouvrir le **lien de reçu** que lui envoie le financeur ou la personne de confiance. La page affiche :

- l'état du paiement : **Paiement en cours**, **Paiement envoyé** ou **Paiement non abouti** ;
- le **montant en FCFA** ;
- de la part de qui, pour quelle étape de quel projet ;
- l'opérateur et son **numéro partiellement masqué** ;
- la date et la **référence** du paiement ;
- un suivi en trois temps : travail validé, ordre envoyé à l'opérateur, paiement confirmé par Bitnob.

Si l'argent n'apparaît pas sur le téléphone au bout de quelques minutes, le fournisseur contacte la personne qui le paie en lui donnant la **référence**. La page ne se met à jour que pendant le paiement ; si le paiement échoue, elle le dit et rien n'est retiré de son côté.

Le fournisseur ne voit rien d'autre : ni le dossier du projet, ni les soldes.

---

## 6. L'administrateur

Page **Administration** (`/app/admin`), en **lecture seule** : elle montre ce qui est bloqué, elle ne déplace jamais d'argent.

- **Qui y a accès :** les numéros listés dans la variable `ADMIN_PHONES` du serveur. En démonstration, le compte démo y a aussi accès. Pour tous les autres, la page n'existe pas.
- **Chiffres clés** : comptes, projets, versements reçus, paiements terminés, ancrages confirmés, évènements Bitnob reçus.
- **À surveiller** : paiement en cours depuis plus de 5 minutes, paiement incertain ou refusé, conversion en stablecoin abandonnée, versement non crédité, ancrage Bitcoin en attente depuis plus de 24 h, évènements Bitnob non appliqués.
- **Tableaux** : paiements aux fournisseurs, versements des financeurs, ancrages Bitcoin, et le journal des 25 derniers évènements Bitnob.

Un message vert « Rien ne bloque » veut dire qu'aucune de ces alertes n'est active.

---

## 7. Le certificat de preuve et la vérification publique

### 7.1 Le registre et l'ancrage (côté financeur)

Depuis un projet, la ligne **Certificat de preuve** ouvre le certificat : la liste des évènements du projet (projet créé, versement, preuve envoyée, étape validée ou refusée, paiement). Chaque évènement est lié au précédent par une empreinte (SHA-256) : modifier le passé casserait toute la chaîne.

**Ancrer l'état actuel sur Bitcoin** envoie l'empreinte du dossier à OpenTimestamps, qui l'inscrit dans un bloc Bitcoin. L'ancrage reste **en attente** quelques heures, le temps qu'un bloc l'inclue, puis passe à **confirmé**. Seule l'empreinte quitte l'application, jamais vos photos ni vos montants.

Après l'ancrage, **Page publique** ouvre la page de vérification, et **Copier le lien** permet de la partager.

### 7.2 Vérifier un dossier (tout le monde)

La page **/verifier** (aussi accessible depuis l'accueil du site et le menu) ne demande aucun compte. Collez un lien d'ancrage ou ouvrez-en un : **votre navigateur refait tous les calculs lui-même** (chaîne d'empreintes, empreinte du dossier, preuve OpenTimestamps). Le principe est « vérifiez, ne faites pas confiance ».

### 7.3 Ce que la vérification prouve, et ce qu'elle ne prouve pas

- Elle prouve que le dossier **n'a pas été modifié** depuis la date de l'ancrage.
- Elle **ne prouve pas** qu'une photo montre le bon chantier : c'est au financeur d'en juger.
- La **position et l'heure** des photos sont **déclarées par le téléphone** : elles peuvent être falsifiées. L'interface dit « géolocalisée », rien de plus.

---

## 8. Questions fréquentes et dépannage

**Je ne vois pas le formulaire d'envoi de preuve.**
Il n'apparaît que sur l'étape **ouverte** (« À envoyer maintenant » ou « À refaire »). Si une preuve est déjà en attente de validation, ou si l'étape précédente n'est pas payée, il n'y en a pas.

**L'étape 1 d'un nouveau projet n'est pas ouverte.**
Il faut d'abord alimenter le séquestre pour couvrir son montant (chapitre 3.4).

**Le bouton « Valider et payer » est grisé ou le paiement refuse.**
Le séquestre du projet doit couvrir le montant de l'étape. Financez le projet, puis réessayez.

**Le devis a expiré.**
Fermez-le et redemandez-le avec **Valider et payer**. Le devis est volontairement court : le taux de change bouge.

**La photo est refusée à l'envoi.**
Seuls JPEG, PNG et WebP sont acceptés pour les photos. Sur iPhone, réglez l'appareil photo sur « Le plus compatible » (Réglages → Appareil photo → Formats).

**Le paiement est « en cours » depuis longtemps.**
Attendez quelques minutes. Au-delà de 5 minutes, l'administrateur le voit dans **À surveiller**. Ne relancez pas le paiement : NobPay vérifie lui-même le statut réel auprès de Bitnob.

**Le fournisseur dit n'avoir rien reçu.**
Demandez-lui la **référence** du reçu : elle permet de retrouver le paiement. Vérifiez aussi son numéro et son opérateur sur la page de l'étape.

**Le lien terrain ne marche plus.**
Il expire après 90 jours, ou a été renouvelé. Envoyez le nouveau lien (chapitre 3.5).

**J'ai fait des essais et je veux repartir de zéro.**
Compte démo : **Profil → Réinitialiser**. Les données de test sont remises à l'état d'origine.

---

## 9. Ce qui est réel, ce qui est simulé

| Élément | Mode démonstration (`mock`) | Mode sandbox Bitnob |
|---|---|---|
| Argent | **Aucun argent réel** | argent de test, pas de vrai argent |
| Facture Lightning | simulée, payable par bouton | créée chez Bitnob ; **non payable en sandbox**, simulée et marquée comme telle |
| Paiement mobile money | simulé | exécuté chez Bitnob (sandbox) |
| Messages de paiement (webhooks) | signés comme ceux de Bitnob | reçus de Bitnob |
| Registre infalsifiable | **réel** | **réel** |
| Ancrage sur Bitcoin (OpenTimestamps) | **réel** | **réel** |
| Vérification publique | **réelle** | **réelle** |
| Code SMS | code partagé `123456` | fournisseur SMS à choisir |

Le reçu du fournisseur affiche « **Démonstration : aucun argent réel** » dès que le paiement a été simulé.

**Limites à connaître :**

- NobPay est un **prototype**. Le séquestre est une **règle logicielle** : les fonds sont dans des portefeuilles Bitnob et NobPay tient la comptabilité projet par projet. Ce n'est ni un contrat intelligent, ni une garantie légale.
- La limite d'un paiement mobile money observée en sandbox est d'environ **330 $** par étape.
- La position et l'heure des photos sont déclarées par le téléphone (voir 7.3).
- Il n'y a pas encore de rôles distincts à l'inscription : tout compte est un financeur. La personne de confiance passe par son lien privé, l'administrateur est désigné par configuration.
- Pas de notification push sur téléphone pour l'instant.

---

## 10. Pour les développeurs et les organisateurs

- Lancer en local : voir le [README](../README.md) (`cd frontend && npm run build && npm start`, puis `http://localhost:3000`).
- Parcours de démonstration de 5 minutes : [DEMO-SCRIPT.md](DEMO-SCRIPT.md).
- Architecture, règles métier, routes et variables : [CONTEXTE-PROJET.md](CONTEXTE-PROJET.md) et [ARCHITECTURE.md](../ARCHITECTURE.md).
- Variables utiles pour l'utilisateur final : `ADMIN_PHONES` (qui voit l'administration), `ALLOW_DEMO` (compte démo et code partagé), `BITNOB_MODE` (`mock` ou `sandbox`).
