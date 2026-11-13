# Revue de sécurité du code — 12 novembre 2026

> **Pour qui :** l'équipe NobPay. La section 5 peut servir de base pour le critère « sécurité par conception » du jury.
> **Nature :** revue **défensive** du code du dépôt : lecture du code, outils d'audit, tests locaux. **Aucune attaque** n'a été lancée contre nobpay.onrender.com ni contre un autre site.
> **Limite importante :** cette revue est faite par l'assistant IA (Claude) qui a écrit une grande partie du code. Ce n'est pas un regard indépendant, et elle ne remplace pas un audit externe avant de manipuler de vrais sats.

## 1. En bref

- **Aucune faille critique trouvée** : rien qui permette de voler de l'argent, de lire les données d'un autre utilisateur, de prendre un compte sans son code, ni d'exécuter du code sur le serveur. (Exception voulue : en mode démonstration, le code de connexion est public par construction ; ce mode est réservé aux instances sans argent réel et le démarrage le refuse avec de vrais sats.)
- **Six constats, tous corrigés** (F-1 à F-6, dont F-3 le 13 novembre). Les plus utiles : un envoi de photos trop gros ou trop nombreux pouvait faire tomber la démo gratuite (F-1) ; une configuration précise ouvrait la page d'administration à quiconque connaît un numéro (F-2).
- **Le point F-3 (position GPS précise des photos dans le dossier public) est réglé le 13 novembre** : le registre public ne contient plus ni position ni texte libre, seulement des empreintes scellées (voir F-3).
- **Les corrections ne sont que dans votre ordinateur** (commit local). La démo en ligne ne change qu'après un `git push` **et** un « Manual Deploy » sur Render (section 7).

## 2. Ce qui a été fait, et pas fait

**Lu en détail :** connexion et sessions, codes SMS, jetons (gérant de terrain, témoin, famille, récupération d'invité), téléversements et lecture de fichiers, appels sortants (protection contre l'accès aux adresses internes), webhooks, limiteur de débit, validation des entrées, en-têtes de sécurité, page d'administration, base de données JSON, routes sensibles (réinitialisation, preuves, paiement, remboursement).

**Outils lancés le 12 novembre 2026 :**

| Contrôle | Résultat |
|---|---|
| `npm audit --omit=dev --audit-level=high` | 0 vulnérabilité connue |
| `node scripts/check-secrets.mjs` | 628 fichiers suivis par Git, rien de suspect |
| Recherche de motifs de secrets (clé Anthropic, chaîne NWC avec secret, clé privée, `nsec`, clé Bitnob « live », jetons GitHub et AWS) dans les 114 commits | une seule correspondance : `tests/logger.test.ts`, des valeurs factices (`'ab'.repeat(32)`…) qui vérifient le masquage des journaux |
| Recherche de zones dangereuses dans `src/` (`dangerouslySetInnerHTML`, `eval`, `new Function`, `child_process`, redirections, chemins de fichiers) | un seul `dangerouslySetInnerHTML`, sur une constante du code ; aucun appel système ; redirections internes seulement ; chemins de fichiers nettoyés (`[^a-zA-Z0-9_-]` retiré) |
| `tsc --noEmit` | aucune erreur |
| Tests (vitest) | 986 réussis, 31 ignorés (avant : 898 réussis) |
| Matrice d'autorisation, nouvelle (`tests/authorization.test.ts`) : 19 appels sur les routes qui touchent un projet, une étape, un versement ou un fichier de preuve, faits par le propriétaire, par un inconnu connecté, par personne et par un détenteur de lien de terrain | 75 vérifications passées : l'inconnu reçoit 403/404 et **la base ne change pas d'un octet** ; personne reçoit 401 ; un lien de terrain n'ouvre pas les routes du financeur ni un autre projet. Contrôle par mutation : en retirant la vérification de propriétaire dans `services.ts`, 6 vérifications échouent, puis le fichier a été remis à l'identique |
| Mesure mémoire d'un envoi de preuves (Node 22.20) | 56 Mo envoyés → le processus grossit de 215 à 270 Mo (environ 4 fois) |

**Pas fait :** test d'intrusion sur le site en ligne, fuzzing, analyse du code des dépendances au-delà de `npm audit`, revue de la configuration Render, relecture par une autre personne.

## 3. Résultats

| # | Gravité | Sujet | Statut |
|---|---|---|---|
| F-1 | Moyenne (disponibilité) | Envoi de preuves : mémoire non bornée quand plusieurs envois arrivent ensemble | Corrigé |
| F-2 | Moyenne si configuré ainsi ; nulle sur la démo actuelle | Page admin complète ouverte par le code de démonstration public | Corrigé |
| F-3 | Vie privée | Position GPS à 1 m et notes libres dans le dossier public | **Corrigé le 13 novembre** (empreintes scellées) |
| F-4 | Faible | `/api/dev/reset` sans limite : n'importe quel visiteur pouvait effacer la démo en boucle | Corrigé |
| F-5 | Faible | Table du limiteur de débit : clés de taille libre, balayage coûteux, aucune borne | Corrigé |
| F-6 | Hygiène | Un montant à virgule était accepté puis arrondi en silence | Corrigé |

## 4. Détail

### F-1 — Envoi de preuves : la mémoire n'était pas bornée

- **Où :** [`proof/route.ts`](../frontend/src/app/api/projects/%5Bid%5D/steps/%5BstepId%5D/proof/route.ts).
- **Constat :** le corps de la requête (jusqu'à 60 Mo, l'équivalent de 6 photos de 8 Mo et d'une facture) est lu en mémoire, analysé, puis copié fichier par fichier. Mesuré : environ 4 fois sa taille. Les limites existantes (nombre par minute, taille maximale, refus avant lecture si l'étape n'accepte pas de preuve) ne limitaient pas le nombre d'envois **simultanés**. Une instance Render gratuite a 512 Mo.
- **Impact :** quelques envois de 50 à 60 Mo en parallèle, depuis une session de démonstration (gratuite) ou un lien de terrain, suffisent à faire tuer le processus. Sur la démo, les données sont alors remises à zéro.
- **Correction :** un budget de mémoire pour toute l'instance ([`uploadBudget.ts`](../frontend/src/server/uploadBudget.ts), 48 Mo par défaut, réglable avec `UPLOAD_MEMORY_MB`). Un envoi qui dépasserait le budget reçoit tout de suite **503 + « Réessayez dans quelques secondes »**, avant la lecture de son corps. Un envoi seul passe toujours, quelle que soit sa taille. La part réservée est rendue dans un `finally`, quelle que soit l'issue.
- **Tests :** `upload-budget.test.ts` (4 cas) et 2 cas dans `validation.test.ts` (503 sans lecture du corps ; part rendue après un refus, une coupure à 60 Mo et un succès).
- **Reste :** avec 48 Mo, deux personnes qui envoient en même temps six grosses photos peuvent devoir réessayer. Sur un serveur de 2 Go, mettre `UPLOAD_MEMORY_MB=160`.

### F-2 — La page admin complète s'ouvrait avec un code public

- **Où :** [`admin.ts`](../frontend/src/server/admin.ts), fonction `adminScope`.
- **Constat :** un numéro listé dans `ADMIN_PHONES` ouvre la vue sur toute la base (lecture seule) et `/api/health?detail=1` (soldes des portefeuilles). Or, quand `ALLOW_DEMO=1` et qu'aucun fournisseur SMS n'est configuré, le code de connexion est le code de démonstration **partagé et affiché à l'écran**. Connaître un numéro suffisait donc à ouvrir ce compte, administrateur compris.
- **Impact :** lecture des projets, versements, fournisseurs (numéros masqués), ancrages et soldes de l'instance. Aucun mouvement d'argent n'est possible depuis cette page. **La démo Render n'est pas touchée** : `ADMIN_PHONES` n'y est pas défini (voir [GUIDE-RENDER.md](GUIDE-RENDER.md)).
- **Correction :** tant que le code est public, `ADMIN_PHONES` ne donne plus la vue complète (le compte de démonstration garde sa vue « démo »). Un avertissement est écrit au démarrage si les deux sont réunis.
- **Tests :** 3 cas dans `admin.test.ts`, 1 dans `startup.test.ts`. Le test qui attendait l'ancien comportement a été corrigé.

### F-3 — Position GPS précise et notes dans le dossier public (corrigé le 13 novembre)

- **Où :** [`services.ts`](../frontend/src/server/services.ts) (événements `proof_submitted` et `step_rejected`), [`ledger.ts`](../frontend/src/server/ledger.ts) (`buildDossier`), page publique de vérification et `/api/anchors/<id>/dossier`.
- **Constat initial :** chaque preuve inscrivait au registre la position des photos (5 décimales, environ 1 mètre, avec la précision annoncée par le téléphone), la note libre de la personne sur place (500 caractères) et la note de refus du financeur (300 caractères). Ce registre forme le dossier ancré, lisible par **quiconque a le lien** de la page publique (lien tiré au hasard, 64 bits). La page n'affichait pas les positions, mais le fichier téléchargeable les contenait. Le dossier doit rester identique octet pour octet à ce qui a été ancré : on ne peut pas masquer à la lecture, il faut changer ce qu'on inscrit.
- **Ce que la recherche a montré**
  - Dans le code, **aucune fonction ne lit la position dans le registre** : les contrôles de preuve (`proofChecks.ts`) lisent le dossier privé et ne comparent qu'à une boîte englobant le Sénégal ; l'écran du financeur lit lui aussi le dossier privé. La précision publique n'avait donc aucun usage.
  - Lignes directrices 02/2025 du Comité européen de la protection des données (CEPD) sur la blockchain : garder les données personnelles hors de la chaîne et n'y inscrire que des preuves cryptographiques ; un condensat non salé n'est pas suffisant ; un condensat peut rester une donnée personnelle. Lignes directrices 01/2025 sur la pseudonymisation : les données pseudonymisées restent des données personnelles tant qu'une information supplémentaire permet de les relier à une personne, et cette information (ici le sel) doit rester séparée. Côté Sénégal, la loi n° 2008-12 sur les données à caractère personnel place la géolocalisation sous le contrôle de la Commission de protection des données (CDP) ; la loi est jugée dépassée et une révision est annoncée (non vérifiée).
  - Précision des coordonnées : 5 décimales = environ 1 m, 4 = 11 m, 3 = 110 m, 2 = 1,1 km. Arrondir à 3 décimales laisse encore voir le pâté de maisons et ne protège pas une ferme isolée : l'arrondi (option B du premier rapport) était insuffisant et supprimait la preuve contre une modification.
- **Choix retenu :** engagement à la source, avec sel. Le registre ne reçoit que `SHA-256(domaine | sel | valeur)` pour chaque position et pour chaque note ; la valeur et son sel (128 bits aléatoires) restent dans le dossier privé de la preuve. Aucune position, même arrondie, aucun mot de texte libre dans le dossier public. L'ajout d'une position approximative n'apporterait rien : la ville du projet est déjà publique.
  - **Vie privée :** personne ne retrouve une position en essayant des valeurs, faute du sel.
  - **Intégrité :** le dossier privé ne peut pas être modifié après coup sans contredire l'empreinte ancrée sur Bitcoin.
  - **Ouverture :** qui détient la valeur et le sel (le financeur) peut ouvrir l'empreinte pour prouver ce qui avait été enregistré (`opensCommitment`).
  - **Effacement :** supprimer le dossier privé laisse des empreintes sans signification.
- **Correction :** [`commitments.ts`](../frontend/src/server/commitments.ts) (`commit`, `proofSubmittedData`) ; `submitProof`, `rejectProof` et les données de démonstration écrivent des empreintes ; la page publique n'affiche plus la raison d'un refus ; la page de l'équipe sur place lit cette raison dans le dossier privé.
- **Tests :** `tests/commitments.test.ts` (11 cas) : le dossier téléchargeable d'une preuve neuve et celui de la démonstration ne contiennent ni coordonnée ni note, les empreintes s'ouvrent avec le dossier privé et plus après une modification, la chaîne de hachage reste valable.
- **Reste, par choix de produit :** sont toujours publics le nom du projet et de la ville, les montants, le nom du fournisseur payé, le prénom d'un proche qui contribue et le nom du témoin. Avant un vrai pilote avec de vraies personnes, les rendre eux aussi privés (même mécanisme). Un export « ouvrir mes empreintes » pour le financeur n'est pas encore écrit : les sels sont gardés pour le permettre.

### F-4 — Réinitialisation de la démo sans limite

- **Où :** [`dev/reset/route.ts`](../frontend/src/app/api/dev/reset/route.ts).
- **Constat :** la session de démonstration est ouverte à tous, et la réinitialisation remet **toute** l'instance à zéro. Un script pouvait donc effacer la démo en boucle pendant que le jury l'essaie. La route n'existe qu'en mode simulé avec `ALLOW_DEMO=1` et pour le compte démo.
- **Correction :** 10 réinitialisations par heure et par adresse (429 au-delà). Le script de vidéo (une réinitialisation par enregistrement) et un juré qui recommence quelques fois ne sont pas gênés. Sur une instance avec `ALLOW_DEMO=0`, la route reste fermée.
- **Test :** `rate-limit.test.ts` (429 au-delà de la limite, une autre adresse n'est pas touchée).
- **Reste :** quelqu'un peut encore effacer 10 fois par heure depuis une adresse. C'est le prix d'une démo ouverte.

### F-5 — Table du limiteur de débit

- **Où :** [`rateLimit.ts`](../frontend/src/server/rateLimit.ts).
- **Constat :** certaines clés contiennent ce que l'appelant envoie (identifiant d'ancrage dans l'adresse, jeton dans un en-tête) et pouvaient peser des kilo-octets chacune. Les compteurs expirés n'étaient retirés qu'au-delà de 10 000 entrées, avec un parcours complet de la table **à chaque requête** tant que la table restait au-dessus. Aucune borne.
- **Impact :** faible : il faut de nombreuses adresses sources pour remplir la table. Mais un ralentissement ou une saturation mémoire devenait possible.
- **Correction :** clés de plus de 96 caractères remplacées par leur SHA-256 (deux clés différentes ne se mélangent pas) ; balayage des compteurs expirés au plus toutes les 30 secondes ; plafond de 20 000 clés ; quand il est atteint, les 2 000 plus anciens compteurs **de courte durée** partent (jamais un plafond journalier comme celui des SMS).
- **Tests :** 3 cas dans `rate-limit.test.ts`.

### F-6 — Montant décimal accepté puis arrondi

- **Où :** `fundingSchema` dans [`validation.ts`](../frontend/src/server/validation.ts).
- **Constat :** `5000.5` passait la validation, puis le service l'arrondissait. Aucun effet sur le registre (l'arrondi est fait avant), mais les autres routes d'argent refusaient déjà les décimales : l'incohérence est supprimée.
- **Correction :** nombre entier exigé. L'écran n'envoie que des entiers (clavier numérique, dollars × 100).
- **Test :** deux montants à virgule ajoutés aux refus de `validation.test.ts`.

## 5. Ce qui est déjà solide

À citer pour « sécurité par conception » :

- **Sessions :** cookie `HttpOnly`, `SameSite=Lax`, `Secure` en https ; signature HMAC, expiration, rotation par version.
- **Jetons de terrain, de témoin, de famille et de récupération :** étiquetés par usage (un jeton de témoin ne sert pas de jeton de gérant), signature de 128 bits comparée en temps constant, expiration à 90 jours, révocation par changement de version.
- **Codes SMS :** tirage aléatoire sûr, stockés hachés et liés au numéro, 5 essais, 5 minutes, usage unique, plafond quotidien global pour ne pas faire exploser la facture.
- **Fichiers :** type reconnu par le **contenu** (JPEG, PNG, WebP, PDF ; SVG exclu), 8 Mo maximum, servis avec `nosniff` et une politique qui interdit tout script (`sandbox`), uniquement à l'ayant droit (propriétaire, gérant ou témoin pour les étapes en attente).
- **Appels sortants (adresses Lightning, etc.) :** https uniquement, pas d'adresse IP en clair, résolution DNS verrouillée et refus des plages privées, pas de redirection, taille et durée limitées.
- **Webhooks :** signature HMAC-SHA512 sur le corps brut, rejeu refusé par identifiant d'événement, corps limité à 256 Ko, limite de débit.
- **Entrées :** schémas zod stricts (champs inconnus refusés), corps JSON limités à 100 Ko, lecture comptée à l'arrivée des octets.
- **Navigateur :** `Content-Security-Policy` (pas d'encadrement, pas d'objets), `X-Frame-Options: DENY`, HSTS, `Referrer-Policy: same-origin`, pas d'en-tête `X-Powered-By`, contrôle d'origine contre les requêtes inter-sites ([`proxy.ts`](../frontend/src/proxy.ts)).
- **Droits :** chaque service vérifie que le projet appartient à l'utilisateur, et c'est maintenant **vérifié route par route** par un test qui échoue si une vérification disparaît (`tests/authorization.test.ts`) ; aucun chemin de fichier ne vient d'une entrée brute (tout passe par un enregistrement de la base).
- **Argent :** crédit du séquestre seulement au montant exact confirmé, une seule sortie par étape (tests de course), plafonds d'une instance en vrais sats, démarrage refusé pour les combinaisons dangereuses (vrais sats avec `ALLOW_DEMO`, clés Bitnob « live », secret de session faible).
- **Chaîne de livraison :** l'intégration continue lance l'audit des dépendances, les types, les tests, la construction et la recherche de secrets.

## 6. Recommandations restantes (non faites)

1. **`script-src 'unsafe-inline'`** dans la politique de contenu : nécessaire aujourd'hui pour les scripts de démarrage de Next.js. Passer à une politique avec **nonce** réduirait l'effet d'une éventuelle faille d'injection (aucune n'a été trouvée). Même remarque pour `connect-src … wss:`, ouvert à tout hôte pour que la page publique interroge les relais Nostr. Travail moyen, à faire avant un vrai pilote.
2. **`TRUSTED_PROXY_HOPS=2` sur Render n'est pas vérifié.** Trop élevé : l'adresse « du visiteur » peut être écrite par le visiteur et les limites se contournent. Trop bas : tous les visiteurs partagent la même adresse. Sans conséquence grave sur une démo sans argent ; à vérifier avec un journal temporaire avant un pilote.
3. **Croissance de la base de démonstration :** la création de projets et d'invités est limitée par heure, pas en volume total. Sur Render gratuit, le redémarrage remet tout à zéro ; sur un serveur durable, prévoir un plafond.
4. **Une seule instance :** la base JSON et le limiteur sont en mémoire d'un seul processus (documenté). Passer à SQLite et à un limiteur partagé avant de dupliquer le service.
5. **Jetons dans l'adresse** (`?t=` pour lire un fichier) : adresse-capacité qui peut se retrouver dans l'historique ou les journaux. Acceptable (`Referrer-Policy: same-origin`), à garder en tête pour les journaux d'un hébergeur.
6. **Audit externe** avant tout pilote avec de vrais fonds, même plafonnés.

## 7. Mettre les corrections en ligne

1. Les corrections sont dans un commit local de la branche `dbd4/m1-real-bitcoin`. Rien n'est poussé sans votre demande.
2. Après un `git push`, ouvrir Render → service NobPay → **Manual Deploy** (le déploiement automatique est coupé).
3. Optionnel sur Render gratuit : ne rien régler, le budget d'envoi par défaut (48 Mo) est fait pour 512 Mo.
4. Vérifier ensuite : `/api/health` répond, « Essayer avec le compte démo » fonctionne, l'envoi d'une preuve fonctionne.
