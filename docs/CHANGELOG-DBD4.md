# Nouveau depuis l'ouverture du hackathon (26 octobre 2026)

> NobPay est né au hackathon **Code & Chain Dakar** (17-18 octobre 2026). Ce journal liste **uniquement** ce qui a été ajouté ou corrigé pour le **Dakar Bitcoin Hack #4**, pour que le jury puisse le distinguer de la base.
> Point de départ : l'étiquette Git **`pre-dbd4`** (commit `63fcaed`). Voir tout ce qui a changé : `git diff pre-dbd4..HEAD`.
> Les identifiants (A1, B2…) renvoient aux constats de [`AUDIT-HACKATHON-4.md`](AUDIT-HACKATHON-4.md).

## Jalon M0 : fondations (1er novembre 2026)

### Sécurité et dépendances
- **Next.js 14.2.35 → 16.4.3, React 18 → 19, zod 3 → 4, vitest 3 → 5** (A1). `npm audit` : **0 faille** en production comme en développement (avant : 1 critique et 2 élevées en production). `middleware.ts` devient `proxy.ts` ; les API de requête sont asynchrones (cookies, paramètres).
- **Les corps de requête sont lus avec un plafond compté au fil des octets** (A3) : preuve (60 Mo), JSON (100 Ko), webhook (256 Ko). **Qui appelle, et si l'étape accepte une preuve, est vérifié avant de lire un seul octet** ; le jeton de la personne sur place passe en en-tête `x-manager-token`. Une seconde preuve pour la même étape est refusée.
- **Le compte démo partagé ne voit plus que des données de démonstration** dans l'administration (A2). Les administrateurs listés dans `ADMIN_PHONES` voient tout.
- **Calendriers OpenTimestamps** : un fichier `.ots` ne peut plus faire appeler un autre site que les calendriers connus (A4, SSRF).
- **Numéro de téléphone au format international exigé côté serveur** et **plafond quotidien de SMS** (`SMS_DAILY_CAP`, 300 par défaut) (A6).
- **La base écrit sur le disque avant de mettre à jour la mémoire** (B1) : un disque plein ne laisse plus un paiement « fantôme ».
- **Facture Lightning valable 1 h au lieu de 24 h** (B3, `FUNDING_INVOICE_TTL_SECONDS`) : le séquestre est crédité en dollars, le cours du Bitcoin bouge.

### Accessibilité et performance
- **Police d'icônes de 1,1 Mo supprimée** : 112 icônes en SVG en ligne (71 Ko), générées par `scripts/build-icons.mjs` ; un test échoue si une icône utilisée manque (E1).
- **Page 404 en français** avec le chemin du retour ; **lien « Aller au contenu »** ; barres de progression et champs fichier nommés (E1).

### Démonstration diaspora
- **Taux réel** : 593 FCFA pour 1 $ (observé chez Bitnob le 18 oct.) au lieu de 760 inventé (E4).
- **Sept factures dessinées, une par étape**, avec le bon fournisseur, des lignes qui s'additionnent exactement au total, et un montant identique à celui saisi dans la preuve (B6). `scripts/build-demo-invoices.mjs` les génère ; `tests/seed.test.ts` échoue si le jeu de démonstration et les images divergent.

### Exploitation
- **Déploiement reproductible** : `frontend/Dockerfile` (Node 22, sortie « standalone »), `deploy/docker-compose.yml` avec Caddy (HTTPS automatique), `deploy/backup.sh`, [`DEPLOIEMENT.md`](DEPLOIEMENT.md) (instances démo et pilote séparées).
- **CI** : Node 22 et contrôle `npm run audit:prod`.
- Ménage : fichier vide `lab3.mjs` supprimé ; documentation mise à jour (versions, nombre de tests).

### Tests
- **357 tests verts** (avant : 323), dont ceux qui prouvent chaque correctif ci-dessus : refus avant lecture du corps, plafond sans `Content-Length`, étape fermée, vue admin de démonstration, SSRF, format du numéro, plafond SMS, durabilité de la base, icônes, cohérence des factures.

## Jalon M1 : vrais bitcoins sur Lightning (2 novembre 2026)

> Branche `dbd4/m1-real-bitcoin`. Tout ce chemin est **testé contre un portefeuille simulé**, pas encore avec un vrai portefeuille (il faut une connexion NWC de l'équipe : voir §11 de l'audit). **Ajout du 2 nov. :** l'adaptateur NWC est aussi testé contre un **vrai service de portefeuille NIP-47** (celui du SDK d'Alby, avec le chiffrement réel) sur un relais simulé : `tests/nwc-integration.test.ts` (12 tests : information, solde, facture, consultation, paiement, refus, mauvaise preuve).

### Le séquestre et les paiements passent par de vrais éclairs
- **`LIGHTNING_RAIL=nwc`** : Nostr Wallet Connect (NIP-47, `@getalby/sdk`), sans intermédiaire de paiement. **Deux connexions de droits différents** : *réception* (créer et consulter des factures, ne peut pas dépenser) et *paiement* (seule à dépenser, avec un budget fixé dans le portefeuille).
- **Versement** : facture au montant en dollars converti au cours du moment (mempool.space, Coinbase en secours), valable 1 h. Le séquestre n'est crédité que lorsque **le portefeuille confirme** la facture réglée, **une seule fois**, au montant de la facture ; un montant inférieur ou une preuve de paiement qui ne correspond pas ne créditent rien.
- **Paiement du fournisseur à son adresse Lightning** (`nom@domaine`, LNURL-pay) : la facture rendue par le domaine du fournisseur est **vérifiée avant d'être payée** (montant exact, bon réseau Bitcoin, empreinte de description conforme aux métadonnées annoncées, durée restante). Un décodeur BOLT11 maison (validé sur le vecteur officiel de la spécification) lit ces factures.
- **Une réponse perdue ne fait jamais payer deux fois ni perdre l'argent** : le paiement n'est cru qu'avec une **préimage dont l'empreinte est celle de la facture** (elle devient la preuve de paiement du reçu et du registre public) ; si la réponse est inconnue, les fonds restent réservés et on interroge le portefeuille par l'empreinte du paiement ; « jamais envoyé » n'est conclu qu'après 5 minutes sans trace.
- **Remboursement du séquestre inutilisé** vers l'adresse Lightning du financeur, avec la même discipline (la somme quitte le séquestre avant l'envoi, revient en cas de refus, reste réservée si le résultat est inconnu). Refusé tant qu'une preuve attend une décision.
- **Sur une instance de vrais sats, le fournisseur est payé par Lightning uniquement** et le démarrage est **refusé** si `ALLOW_DEMO` est actif (le code partagé ouvrirait un compte qui contient de vrais sats), si le secret de session est faible ou si une chaîne NWC est illisible (sans jamais l'imprimer).
- **Plafonds de phase pilote** (`LIGHTNING_MAX_FUNDING_USD`, `_PAYOUT_USD`, `_ESCROW_USD`) et **contrôle de solvabilité chaque minute** : si ce que l'instance doit dépasse ce que contiennent ses portefeuilles (une même connexion comptée une seule fois), versements et paiements sont suspendus (visible dans `/api/health` pour les administrateurs).
- **Comptes invités** (`ALLOW_GUEST=1`) : « Essayer sans compte » crée un compte privé par visiteur, sans téléphone, jamais administrateur, avec limite par adresse IP. C'est ainsi que le jury essaie une instance de vrais sats.

### Sécurité du nouveau code
- **Client HTTPS anti-SSRF** pour les adresses Lightning (qu'un utilisateur tape) : HTTPS seulement, domaine seulement (ni IP, ni `localhost`, ni suffixe interne, ni port), **la vérification est la résolution DNS de la connexion elle-même** (pas de « public puis privé »), adresses IPv4 enveloppées dans de l'IPv6 jugées comme IPv4, redirections refusées, réponse bornée en taille et en temps, y compris l'adresse de rappel donnée par le domaine.
- Les messages d'erreur d'un portefeuille sont traduits en français et ne répètent jamais son texte brut.

### Écrans
- La page dit **toujours dans quel mode elle tourne** (simulation, test Bitnob, bitcoin réel) ; les jetons USDT/USDC qui n'existaient pas sont retirés ; le versement explique « Comment payer avec Lightning ? » ; le fournisseur se saisit par adresse Lightning ; le devis, le suivi, le reçu et la page terrain montrent les sats, le cours et la preuve de paiement ; panneau de remboursement.

### Essai rapide
- **Un bouton « Essai rapide »** dans l'assistant de création : un projet de 15 $ en 3 étapes de 5 $ (preuve par photo seule), prêt à créer en un clic, pour que le jury voie tout le parcours en quelques minutes (versement → preuve → paiement → reçu). Sur l'instance de vrais sats, 15 $ de sats entrent en séquestre ; en indiquant sa propre adresse Lightning comme fournisseur, on les retrouve à chaque étape payée, et le séquestre non utilisé peut être remboursé.
- **Budget minimum par instance** (`MIN_BUDGET_USD`) : 10 $ par défaut, 100 $ sur le bac à sable Bitnob (où un paiement a de vraies limites). Le plancher absolu de 10 $ est dans la validation, le minimum de l'instance dans la création du projet.

### Corrigé en chemin
- `resetDb` ne vidait pas les collections optionnelles que le jeu de démonstration ne contient pas (les remboursements d'un test ou d'une réinitialisation survivaient).

### Tests
- **560 tests verts sur 40 fichiers** (avant M1 : 357), `tsc --noEmit` sans erreur.
- Nouveaux : `bolt11` (15), `lnurl` (26), `safe-fetch` (60), `nwc-adapter` (51), **`lightning-flows` (34 : versement, paiement, réponses perdues, factures falsifiées, remboursements, solvabilité, intégrité du registre)**, `guest` (4), démarrage (+14).

## Jalon M2 : le registre répliqué sur Nostr (2 novembre 2026)

> Branche `dbd4/m1-real-bitcoin`. Testé contre de faux relais et en lecture seule contre trois relais publics ; **la publication réelle n'a pas encore été essayée** (`scripts/nostr-smoke.mjs`, sur décision de l'équipe).

- **Engagements** (`NOSTR_PUBLISH=1`, désactivé par défaut) : chaque événement du registre est publié sur des relais (`NOSTR_RELAYS`, par défaut damus, nos.lol, primal) comme un événement Nostr signé de type **8421** qui ne contient que `{numéro, empreinte, empreinte précédente}` : **ni nom, ni montant, ni type**. Type ordinaire, pas remplaçable : une seconde version contradictoire ne prend pas la place de la première, elle apparaît à côté. (8173, premier choix, était déjà utilisé par une autre application sur les relais ; vérifié en lecture.)
- **Une clé par projet**, dérivée (HKDF-SHA256) de `NOSTR_MASTER_KEY` et de l'identifiant du projet : une seule valeur à sauvegarder, aucun lien public entre deux projets. **La clé publique est inscrite dans le premier événement du registre**, donc dans l'ancrage Bitcoin du dossier. Une clé maîtresse qui a changé est signalée et n'est jamais utilisée pour signer sous une autre clé.
- **Publication fiable** : en tâche de fond à côté des paiements (jamais devant), un même événement signé renvoyé tel quel, reprise avec pauses croissantes, un engagement compte comme publié quand `NOSTR_MIN_ACKS` relais (2) l'ont accepté ; un relais qui l'a déjà compte comme ayant accepté.
- **Vérification sans notre serveur** : la page publique et le contrôle d'un fichier de dossier interrogent les relais **depuis le navigateur**, vérifient chaque signature, et disent : confirmé, partiel (événement absent, ou en cours de publication s'il a moins de 3 minutes), **conflit** (un engagement signé dit autre chose que le registre, ou le premier événement suivant ne prolonge pas le dernier) ou relais injoignables. Les adresses de relais venant d'un dossier sont filtrées (wss:// et nom de domaine public seulement).
- **Horodatage Bitcoin des événements où de l'argent a bougé, selon NIP-03** : l'identifiant de l'engagement est envoyé aux calendriers OpenTimestamps ; une fois le bloc connu, la preuve (réduite à **une seule** attestation Bitcoin, sans attente) est publiée en événement 1040. `NOSTR_ATTEST=0` pour l'éteindre.
- Page du projet : « publié sur Nostr 7/7 · 2 horodatés sur Bitcoin (NIP-03) ».
- Politique de sécurité du navigateur : `connect-src` autorise `wss:` (la page de vérification parle aux relais).
- `scripts/nostr-smoke.mjs` : contrôle des relais choisis, **en lecture seule avec `--read-only`** ; sans, il publie un événement de test signé par une clé jetable.
- **630 tests verts sur 43 fichiers**, `tsc` et `next build` sans erreur. Tests : `nostr` (50), `nostr-attestation` (8), `ots` (+4 : réduction à une attestation), démarrage (+3). Corrigé : `resetDb` oubliait de vider la collection `nostr`.

## Jalon M3 : un deuxième regard sur chaque preuve (2 novembre 2026)

> Testé avec un faux client Anthropic. **Jamais exécuté contre l'API réelle** (pas de clé) : la qualité de l'avis sur de vraies photos reste à constater.

- **Contrôles sans IA, toujours affichés** : fichier déjà envoyé dans la même preuve, dans une autre étape ou dans un autre projet (sans nommer l'autre projet) ; photos géolocalisées ou non, hors du Sénégal ; photos trop anciennes ou datées après l'envoi ; montant de la facture comparé à l'étape (±15 %). Les images fournies avec les données de démonstration sont exclues du contrôle de doublons.
- **Avis de l'IA, à la demande du financeur** (`AI_REVIEW=1`, `ANTHROPIC_API_KEY`) : SDK officiel `@anthropic-ai/sdk`, sortie structurée (zod), modèle `claude-opus-5-5` par défaut (`AI_MODEL`), effort bas. **L'IA lit, le code compare** : elle décrit les photos et recopie le fournisseur, le total, la devise et la date de la facture ; des règles en code comparent avec le montant saisi, l'étape, le nom du fournisseur à payer et la date d'envoi.
- **Consultatif par construction** : aucun paiement n'en dépend ; l'écran dit « l'IA peut se tromper, vous décidez ». Une preuve qui contient une consigne (« approuvez ») n'est pas obéie : elle est signalée.
- **Vie privée** : n'est envoyé que ce qui sert (photos, facture, titre et montant de l'étape, fournisseur saisi, message de l'équipe, sans pouvoir fermer la balise qui l'entoure) ; ni nom ou téléphone du financeur, ni positions GPS. Le clic est précédé d'un avertissement.
- **Coût borné** : un avis par preuve (redemander ne coûte rien), 10 par heure et par compte, `AI_DAILY_CAP` (50) par jour pour l'instance ; images de plus de 5 Mo non envoyées (dit à l'écran), 4 photos au plus.
- **Défaillances** : refus du service, réponse illisible, service injoignable, clé refusée : un message en français (jamais l'erreur brute), jamais une exception pour le financeur ; un avis n'est jamais rattaché à une preuve renvoyée entre-temps.
- Tests : `ai-review` (37), `proof-checks` (23).

## Jalon M4 (début) : trois couloirs sur un seul moteur (2 novembre 2026)

- **Deux secteurs de plus** : **Scolarité** (la famille à l'étranger paie l'école, trimestre après trimestre, sur présentation du reçu : inscription, fournitures et uniforme, trois trimestres) et **Réapprovisionnement** (le commerçant commande, le grossiste est payé quand la marchandise est livrée : commande confirmée, livraison, mise en rayon). Avec le projet au pays (immobilier, agricole, commerce), cela fait les **trois couloirs** du plan sur le même moteur : séquestre, preuve, paiement direct, registre, Nostr, IA.
- Un seul endroit liste les secteurs (`templates.ts`) : la validation du serveur en dérive. Deux illustrations originales (SVG dessinés pour le projet, donc sans question de provenance d'image).
- **Défaut corrigé** : avec le budget minimum abaissé à 10 $ (essai rapide), le découpage automatique d'un secteur à six étapes donnait une étape à 0 $ ; `allocateBudget` n'en produit plus sous 1 $ (les dollars manquants sont repris sur les plus grosses étapes).
- Page d'accueil, assistant, filtre des projets et textes mis à jour (cinq cartes, deux lignes centrées).
- **Contrôle visuel dans un vrai navigateur** (serveur de production local, données jetables) : page d'accueil (cinq cartes), assistant avec l'essai rapide, page d'une preuve en attente (contrôles), page de vérification publique avec la ligne Nostr **interrogeant de vrais relais en lecture depuis le navigateur** (la CSP autorise bien `wss:`). Corrigés grâce à lui : formulation « juste avant l'envoi » (le seuil est d'une semaine), « 1 événements », « donner à Moi-même son lien », texte inutilement alarmiste quand les engagements sont seulement en cours de publication. **Pas vu en navigateur** : le panneau d'avis de l'IA une fois la clé configurée, les écrans de vrais bitcoins (pas de portefeuille), le rendu mobile.
- Tests : `sectors` (13). **Pas encore fait de M4** : version anglaise, wolof, gabarits propres à chaque couloir (libellés « reçu de l'école »).

## Jalon M4 (suite) : l'application en anglais, et une page d'accueil à jour (2 novembre 2026)

- **Page d'accueil refondue, en français (`/`) et en anglais (`/en`)** : tout le texte vient d'un dictionnaire (`landingCopy.ts`), la mise en page est la même. Le contenu décrit maintenant le produit tel qu'il est : Lightning pour entrer et sortir, séquestre tenu par l'opérateur (dit sans détour), Nostr, IA consultative. Plus de « USDT bientôt » ni de séquestre « Bitnob » seul : l'esprit « bitcoin-only » des organisateurs est respecté.
- **Toute l'application est traduisible** : le texte reste écrit en français dans le code, et un dictionnaire unique (`src/lib/i18n/en.ts`, plus de 600 phrases) donne l'anglais. Une phrase sans traduction s'affiche en français (un trou, jamais un écran cassé). Une langue de plus (le wolof, aide bienvenue) = un dictionnaire de plus.
- **Langue choisie** par le visiteur (cookie, via `/lang/<code>`), sinon celle de son navigateur, sinon le français ; un navigateur anglophone arrivant sur `/` est dirigé vers `/en`. Le choix fait sur la page d'accueil suit le visiteur dans l'application. La redirection ne peut mener qu'à une page du site.
- **Les pluriels sont des phrases entières** (« 3 événements enchaînés », « 1 événement enchaîné ») : l'accord français ne se transpose pas en anglais.
- **Un test échoue si une phrase affichée n'a pas de traduction**, et si une table de libellés du code (secteurs, étapes types, événements du registre, preuves, modes d'instance) n'en a pas. `scripts/i18n-missing.mjs` les liste.
- **Outils de migration conservés** : `scripts/i18n-wrap.mjs` (texte JSX) et `i18n-wrap-strings.mjs` (attributs, conditions, gabarits) ont enveloppé 680 textes ; ils ne changent rien s'ils sont relancés. Fichiers non traduits exprès : le tableau de bord administrateur (outil de l'opérateur).
- **Côté serveur aussi** : les messages d'erreur à texte fixe (une soixantaine), les contrôles « À regarder avant de payer » et les points tirés de la lecture de la facture par l'IA sont produits dans la langue du visiteur ; l'IA reçoit la consigne de répondre dans cette langue. Les statuts et libellés issus de tables du code (secteurs, étapes types, événements du registre) passent par le même dictionnaire.
- **Limites connues** : les montants et les dates gardent le format français (« 6 000,00 $ », « 1 nov. ») ; les messages d'erreur à texte variable (avec un nombre) restent en français ; les titres de pages (onglet du navigateur) aussi ; les noms de projets, d'étapes personnalisées et les messages de l'équipe sur place sont affichés tels qu'écrits.
- `README.en.md` : un README anglais ; `docs/TRADUIRE.md` : comment corriger l'anglais ou ajouter une langue (le wolof : aide bienvenue, une traduction n'a de valeur que par quelqu'un qui le parle).
- **`deploy/bootstrap.sh demo|real`** : prépare `deploy/.env` sur le serveur (secrets générés sur place, jamais affichés ; chaînes NWC saisies masquées), lance Docker et attend `/api/health`. Essayé avec de faux `docker`/`curl`, pas sur un vrai serveur.
- Tests : `i18n` (10), `landing-copy` (7), `server-i18n` (5). **737 tests verts sur 50 fichiers.**

## Relecture contradictoire des derniers jours (2 novembre 2026)

Une relecture du code écrit depuis le début de M1, en cherchant ce qui casse en conditions réelles, a trouvé et fait corriger :

- **Argent perdu pour le financeur (le plus grave).** Une facture réglée dans les dernières secondes de sa vie pouvait être refermée « expirée » par la tâche de fond **avant** que le paiement soit vu ; le séquestre n'était alors jamais crédité alors que les sats étaient arrivés. Désormais une facture expirée depuis moins de 24 h est encore interrogée (une fois par minute) et créditée si le portefeuille dit qu'elle a été payée. Deux tests.
- **Paiement échoué enregistré deux fois, ou sur une nouvelle tentative.** Si `reconcile()` concluait pendant que le portefeuille répondait encore, la réponse tardive refusait une seconde fois le même paiement ; elle ne touche plus qu'un paiement encore en cours et de même référence.
- **Un titre d'étape appelé « constructor »** (ou `toString`, `__proto__`…) faisait afficher du code JavaScript dans l'interface anglaise : le dictionnaire ne cherche plus que ses propres entrées.
- **Les liens de changement de langue se préchargeaient** : le simple fait de voir la page d'accueil pouvait changer la langue du visiteur, parce que la route de langue pose un cookie. Ils ne sont plus préchargés (un test le vérifie).
- **Clés Nostr devinables.** Publier sans `NOSTR_MASTER_KEY` avec un secret de session absent, par défaut ou court laissait n'importe qui signer des engagements au nom d'un projet : le serveur refuse maintenant de démarrer dans ce cas.
- **Parcours d'un juge.** « Essai rapide » est proposé directement sur le tableau de bord vide (`/app/projets/nouveau?essai=1` ouvre le récapitulatif de l'essai).
- 742 tests verts sur 50 fichiers.

## À venir (voir le plan du rapport d'audit)
Architecture en ports/adaptateurs et SQLite (à sacrifier en premier si le temps manque) · M4 couloirs scolarité et commerçant, anglais, finition · M5 gel et soumission.
