# Audit complet et plan d'adaptation : Dakar Bitcoin Hack #4

> **Date :** 1er novembre 2026. Dépôt des projets jusqu'au **20 novembre 2026, 20 h GMT**.
> **Portée :** dépôt `mouhaa-md/NobPay` au commit `63fcaed` (42 commits, 454 fichiers suivis, 13 668 lignes de code d'application) ; règles et ressources publiques du hackathon ; recherche sur Bitcoin, Lightning, Nostr, IA et le contexte sénégalais.
> **Pour qui :** le chef de projet et les développeurs qui reprennent NobPay pour ce hackathon.
> **Comment lire les affirmations.** Chaque constat dit d'où il vient : **mesuré** (commande lancée pour cet audit), **code** (lu dans le dépôt, avec `fichier:ligne`), **source officielle** (page lue en direct), **source secondaire** (presse, blog, moteur de recherche : à confirmer avant de s'appuyer dessus), **non vérifié**. Les jugements (gravité, priorité, recommandations) sont les miens.

## 1. En bref

**Verdict.** NobPay est une très bonne base : règles d'argent testées (323 tests verts, dont des centaines de séquences aléatoires), récepteur de webhooks soigné, registre vérifiable ancré sur Bitcoin, interface déjà au niveau d'un produit. Il ne faut **pas** le réécrire. Mais, pris tel quel, il est **hors cible** pour ce hackathon et **pas publiable** en l'état.

| # | Écart | Pourquoi ça compte pour le jury |
|---|---|---|
| 1 | **Pas de Nostr, pas d'IA, Lightning jamais payable en vrai** (la sandbox Bitnob ne permet pas de payer une facture `lntb`) | Le thème est « Bitcoin, Lightning, Nostr et IA » ; le jury veut un **MVP testable** |
| 2 | **Pas de MVP en ligne** : application locale, base = un fichier JSON, **Next.js 14.2.35 avec 1 faille critique et 2 élevées** (`npm audit`) | Livrable minimal du règlement : « un MVP accessible par Internet (ou une vidéo) » |
| 3 | **Le récit parle de diaspora et d'investissement ; l'annonce parle du commerçant, de l'étudiant et de la boutique** | Critère n° 1 : utilité et impact social, pitch clair |
| 4 | **Confiance** : le séquestre est une écriture dans notre base, il n'y a pas de remboursement, le dossier public expose GPS et noms, la vérification Bitcoin passe par notre serveur | Critère : sécurité dès la conception (et l'esprit « verify, don't trust » de Btrust) |
| 5 | **Finition** : les correctifs P1 de l'audit design du 18 octobre ne sont pas appliqués (404 en anglais, pas de lien d'évitement, police d'icônes de 1,1 Mo) ; aucune version anglaise | Critère : qualité UX/UI ; jury international |

**Décision d'architecture (je tranche, voir § 7).** Garder le monolithe TypeScript et son cœur métier, et changer cinq choses : **Next 16 + Node 22** (sécurité), **SQLite** à la place du fichier JSON (durabilité, contraintes, sauvegardes), **ports et adaptateurs** pour les rails de paiement (Lightning réel via **NWC**, paiement vers **adresse Lightning**, Bitnob conservé pour le mobile money), une **couche Nostr** (engagements du registre sur relais + attestations NIP-03 + vérification sans notre serveur), et une **IA consultative** (revue de preuve, planificateur de projet).

**Direction produit recommandée** (à valider, § 8) : *un seul moteur, « l'argent ne bouge que sur preuve, au coût du Lightning », trois couloirs* : diaspora → projet (démo principale), famille → **scolarité** (l'étudiant sans accès bancaire), commerçant → **fournisseur** (réassort payé sur preuve de livraison, la boutique garde sa commission).

**Calendrier** (§ 9) : fondations et premier déploiement public d'ici le **4 nov.**, Lightning réel et **soumission préliminaire le 8 nov.** (le vote du public ouvre le **9 nov.**), Nostr le 12, IA le 16, finition le 18, **gel le 18 au soir, soumission finale le 19**.

## 2. Le hackathon : ce que disent les sources

| Fait | Source | Statut |
|---|---|---|
| Hackathon en ligne, ouvert aux participants **résidant en Afrique** ; ~100 participants attendus ; résultats open source | [Devpost, règles](https://dakar-bitcoin-hack-2026.devpost.com/rules) | officielle |
| **Soumissions** : 26 oct. 8 h → **20 nov. 20 h GMT** ; **vote du public** : 9 nov. 9 h → 24 nov. 17 h ; **jury** : 21 nov. 9 h → 26 nov. 17 h ; **résultats** : 28 nov. 17 h GMT | [Devpost, calendrier](https://dakar-bitcoin-hack-2026.devpost.com/details/dates) | officielle |
| **Livrables minimaux** : une présentation (texte ou vidéo), **un dépôt GitHub public**, **un MVP accessible par Internet (ou une vidéo de démo)** | règles | officielle |
| **Prix** : 500 000 / 250 000 / 100 000 sats (850 000 sats ; l'annonce dit ≈ 900 $) | règles | officielle |
| **Critères** : surtout un **MVP testable qui montre son potentiel** ; puis originalité, utilité, technicité. « Nous cherchons » : utilité et impact social, **sécurité dès la conception**, qualité UX/UI, MVP, pitch clair | règles | officielle |
| **Outils cités** : Bitcoin Core, BDK, BTCPay Server, Electrum/Fulcrum, LDK, Core Lightning, **USSD**, **LNURLPoS**, mempool.space, **API Mobile Money**, Sparrow, **Nostr**, **Nostr Wallet Connect**, **IA** | [Devpost, ressources](https://dakar-bitcoin-hack-2026.devpost.com/resources) | officielle |
| « Participer, **construire en public** et **communiquer sur son parcours** » ; objectifs : contribuer à l'écosystème Bitcoin libre, résoudre des problèmes locaux avec Bitcoin/Nostr/IA | [Devpost, accueil](https://dakar-bitcoin-hack-2026.devpost.com/) | officielle |
| **Dakar Bitcoin Days IV** au cinéma Seanema (Sea Plaza). Soutiens : Btrust, **Wave**, Banxaas, Sentartup, Alliance Fintech UEMOA, Optic. Thèmes : approche institutionnelle des crypto-actifs ; **paiements transfrontaliers décentralisés, dont les transferts de fonds des diasporas** | [Luma](https://luma.com/5q43x47y?locale=fr) | officielle |
| Dates de l'événement : **27-28 novembre 2026** (page d'appel à intervenants, en-tête Luma et annonce du hackathon concordent ; les descriptions de billets Luma disent encore 6-7 nov. : périmées). **Appel à intervenants ouvert jusqu'au 13 novembre, 23 h 59 UTC** | [Sessionize](https://sessionize.com/dakar-bitcoin-days-iv), Luma | officielle |
| Édition 2025 : en ligne, 22 sept. → 24 oct. 2025, 1 750 $ en BTC (1 000 / 500 / 250) | [allhackathons](https://allhackathons.com/hackathon/dakar-bitcoin-hack) | secondaire |
| **Non vérifié** : galerie des projets (pas encore publiée), liste des participants (connexion requise, je ne me suis pas connecté), composition du jury, poids du vote du public, règle sur le travail antérieur, vainqueurs 2025 (le site 2025 m'a répondu 403) | | |

**Ce que j'en déduis.**

1. Le jury est composé de gens de l'écosystème Bitcoin libre (Btrust) et de l'écosystème mobile money (Wave, UEMOA). Ils veulent voir : du **vrai Bitcoin** (pas une simulation), un **MVP qu'ils peuvent tester eux-mêmes en deux minutes**, une réponse à un **problème local concret**, et de la rigueur de sécurité.
2. Le **vote du public commence le 9 novembre**, onze jours avant la fin du dépôt : il faut une page Devpost, une vidéo et une URL publique **avant** le 9.
3. **Inscription Devpost** : à faire par vous (je ne crée pas de compte). Vérifiez aussi que l'équipe remplit « résider en Afrique ».
4. **Travail antérieur.** NobPay est né au hackathon Code & Chain Dakar (17-18 oct.), une semaine avant l'ouverture de celui-ci. Rien de ce que j'ai lu n'interdit de repartir de cette base, mais la bonne pratique est de **le dire** : poser une étiquette Git de départ et un journal « ce qui est nouveau depuis le 26 octobre » (§ 9).

## 3. État de NobPay (mesuré)

| Mesure | Résultat |
|---|---|
| `npm run typecheck` | **OK** |
| `npm test` | **31 fichiers, 323 tests, tous verts** (25 s). La doc annonce 281 : elle est en retard |
| `npm run build` | **OK** (Next 14.2.35) |
| `npm audit --omit=dev` | **3 vulnérabilités : 1 critique** (`next`, 25 avis dont DoS, SSRF, empoisonnement de cache, XSS avec nonces CSP, exécution de code à distance dans l'optimiseur d'images et sur serveurs Windows), **2 élevées** (`postcss` imbriqué ; `zod` < 4.6.6, toute la ligne 3.x comprise) |
| Taille | 23 routes API, 20 pages, 31 fichiers de tests (3 726 lignes), 3 826 lignes de docs ; `.git` = 31 Mo (surtout PDF et captures de la vidéo) |
| Secrets | **Aucun trouvé dans l'historique** (motifs courants : clés Bitnob, Anthropic, AWS, GitHub, Slack, clés privées, `*_SECRET=`) ; un seul résultat : une chaîne de test du masquage de journaux. Aucun fichier `.env` ou `.data/` suivi. Recherche par motifs, pas exhaustive |
| Interface | Parcours vérifié dans un vrai navigateur, mode simulé : vitrine, bienvenue, tableau de bord, projet, validation d'étape, certificat, espace terrain. **Cohérent et abouti.** Je n'ai pas testé : téléphone réel, Safari/Firefox, lecteur d'écran, mode sandbox (pas de clés) |
| Ce qui est réel ou simulé | Voir le tableau du `README.md` (relu, exact d'après le code) : registre, ancrage OpenTimestamps et vérification sont réels ; **réception Lightning et vente BTC→stablecoin n'ont jamais été vues en vrai** ; paiement mobile money (Wave) vu en vrai en sandbox |

**Relu pour cet audit** : `services.ts`, `webhooks.ts`, `db.ts`, `auth.ts`, `otp.ts`, `config.ts`, `middleware.ts`, `rateLimit.ts`, `files.ts`, `managerToken.ts`, `receipt.ts`, `ledger.ts`, `anchors.ts`, `ots.ts`, `domain.ts`, `jobs.ts`, `bitnob/client.ts`, `bitnob/sign.ts`, `sms.ts`, `capture.ts`, `lib/verify.ts`, `next.config.mjs`, les routes de preuve, de fichiers, de webhook, de santé et de rafraîchissement d'ancrage, `VerifyAnchor.tsx`, l'en-tête de `admin.ts`, la CI, ainsi que toute la documentation. **Survolés ou non relus** : `views.ts`, `seed.ts`, `mock.ts`, `mockEvents.ts`, `logger.ts`, la plupart des composants d'interface, le kit d'animations `motion/`, les scripts de la vidéo.

## 4. Audit technique

Gravité : **S1** bloque toute URL publique ; **S2** peut perdre de l'argent ou des données ; **S3** qualité, confiance, finition. Effort : **S** ≤ 2 h, **M** ½ à 1 j, **L** 2 à 3 j.

### 4.1 Sécurité et dépendances

| # | Gravité | Constat | Preuve | Correctif (effort) |
|---|---|---|---|---|
| A1 | **S1** | Dépendances vulnérables (voir § 3). Plusieurs avis ne s'appliquent pas à notre configuration (images non optimisées : `next.config.mjs:41` ; pas de Server Actions), mais je n'ai pas évalué les 25 un par un, et le correctif est de toute façon requis avant une URL publique | mesuré | Next **16.4.3**, React 19, **zod 4.6.7**, Node 22 ; les branches Dependabot (`next-16.4.1`, `zod-4.6.7`, `vitest-5.0.4`) sont dépassées ou partielles : repartir de zéro (M) |
| A2 | **S1** | **Le compte démo partagé voit les données de tout le monde** : `isAdmin` accepte le compte démo quand `ALLOW_DEMO=1` et `adminOverview` agrège **toute** la base (paiements, noms de fournisseurs, versements, journal de webhooks). Et sans fournisseur SMS, le code de connexion est **public** (`123456`) : n'importe qui peut ouvrir n'importe quel compte | `admin.ts:17`, `admin.ts:87`, `otp.ts:28-33` | Séparer une instance **démo** (données fictives seulement) d'une instance **pilote** (`ALLOW_DEMO=0`) ; borner la vue admin du compte démo aux objets `demo` ; offrir une connexion sans SMS (Nostr, passkey, lien e-mail) (M) |
| A3 | **S2** | **Corps de requête lu en entier avant toute authentification** : la route de preuve appelle `request.formData()` avant de lire le jeton (qui est dans le formulaire) ; le contrôle `content-length` se contourne en envoyant sans cette en-tête. Même défaut sur le webhook public (`request.text()` sans plafond). Épuisement de mémoire possible sans identifiants | `proof/route.ts:30-36`, `webhooks/bitnob/route.ts:17` | Jeton en en-tête (contrôlé avant lecture), plafond de taille **en flux**, limite par IP avant lecture (S) |
| A4 | **S3** | SSRF latent : `upgrade()` appelle telle quelle l'URL de calendrier lue **dans le fichier `.ots`** (qui vient des calendriers publics) | `ots.ts:246-252` | Liste blanche d'hôtes HTTPS (S) |
| A5 | **S3** | CSP avec `script-src 'unsafe-inline'` (scripts d'amorçage de Next) ; `connect-src 'self'` bloquera les relais Nostr et l'explorateur Bitcoin dont la vérification sans serveur aura besoin | `next.config.mjs:10-14` | Nonces avec Next 16 ; élargir `connect-src` à une liste précise de relais/explorateurs (M) |
| A6 | **S3** | L'API accepte comme « numéro » n'importe quel texte de 6 à 24 caractères (le format E.164 n'est imposé que par le formulaire) ; un SMS part vers tout numéro (limites 5 par numéro et 20 par IP / 10 min : correct mais le coût SMS reste exposé) ; le message « Aucun compte avec ce numéro » permet de tester l'existence d'un compte | `validation.ts:62`, `auth.ts:152`, `rateLimit.ts:67-70` | Validation E.164 serveur, plafond de dépense SMS, message neutre (S) |
| A7 | **S3** | Sans en-tête `X-Forwarded-For`, tous les clients partagent le seau `local` : un seul abuseur bloque tout le monde derrière un proxy qui ne l'ajoute pas | `rateLimit.ts:58` | Documenter le proxy retenu (Caddy l'ajoute) ; test (S) |
| A8 | **S3** | Fichiers : pas de ré-encodage ni de retrait des métadonnées EXIF ; les fichiers sont écrits **avant** de savoir si l'étape accepte une preuve (orphelins possibles) | `files.ts:34-45`, `proof/route.ts:57-74` vs `services.ts:454` | Valider l'état de l'étape avant écriture ; EXIF lu puis retiré des copies servies (M) |

### 4.2 Argent et fiabilité

| # | Gravité | Constat | Preuve | Correctif (effort) |
|---|---|---|---|---|
| B1 | **S2** | **La mémoire prend l'avance sur le disque** (D20 de la doc, que je classe S2) : si l'écriture échoue (disque plein), l'état en mémoire diffère du fichier ; après redémarrage, un paiement lancé peut disparaître du registre et un nouveau devis (nouvelle référence) pourrait payer deux fois | `db.ts:65-66` | Persister **puis** remplacer l'état (S) ; résolu en bloc par SQLite (§ 7) |
| B2 | **S2** | **Aucun remboursement** (D10) : le financeur ne peut pas récupérer le séquestre d'un projet abandonné. Pour un jury, un séquestre sans sortie ressemble à un piège | `ROADMAP-BACKEND.md` B2.8 | Remboursement vers une adresse/facture Lightning ou le mobile money, événement `escrow_refunded`, validation et délai (M) |
| B3 | **S2** | **Risque de change** : la facture vaut 24 h et le séquestre est crédité en **dollars fixes** pendant que le BTC bouge ; la marge de solvabilité (3 % + 5 $) ne couvre pas un mouvement de plusieurs jours | `services.ts:162-173`, `services.ts:374` | Expiration de 15 à 30 min, ou comptabilité en sats avec taux figé à la réception (S) |
| B4 | **S2** | **Le bénéficiaire est choisi par la personne sur place** (nom, numéro, opérateur saisis dans la preuve). Aucun contrôle de cohérence : changement de bénéficiaire d'une étape à l'autre, numéro identique à celui du gestionnaire, nom différent de l'émetteur de la facture. Le seul rempart est l'œil du financeur | `services.ts:457-460`, `:474` | Liste de bénéficiaires approuvés par le financeur, règles déterministes d'alerte, extraction IA de l'émetteur de facture, nom du titulaire du compte mobile money si l'API le donne (M) |
| B5 | **S2** | **Aucune détection de photo réutilisée** : le SHA-256 est enregistré mais jamais comparé entre étapes et projets ; GPS et heure sont **déclarés par le téléphone** (D12) | `services.ts:469-492` | Doublons exacts (SHA-256), quasi-doublons (empreinte perceptuelle), lecture EXIF, revue IA consultative (M) |
| B6 | **S3** | Le badge « Cohérent avec le montant prévu » compare le montant **saisi à la main** au budget de l'étape (au taux indicatif 760 FCFA/$, alors que le taux réel observé est ≈ 593) ; le fichier de facture n'est jamais lu | écran d'étape, `seed.ts` | Extraction réelle du montant par IA ; taux de la démo alignés sur le réel (M) |
| B7 | **S3** | La réception Lightning et la conversion BTC→stablecoin n'ont **jamais été observées** ; un paiement mobile money est plafonné à **200 000 FCFA (≈ 336 $)** en sandbox, alors que la démo simulée a des étapes jusqu'à 6 000 $ | `BITNOB-SANDBOX-REPORT.md` | Lightning réel via NWC (§ 7) ; démo simulée alignée sur la limite (S) |
| B8 | **S3** | Webhook : l'unité du montant est devinée (sats, msats ou BTC, tolérance 0,5 %) et un évènement signé **sans** montant lisible est crédité. Acceptable car signé, à figer avec une vraie livraison | `webhooks.ts:63-81` | À fermer dès qu'une réception réelle est observée |

### 4.3 Confiance et vérifiabilité (le cœur de la promesse)

| # | Gravité | Constat | Preuve | Correctif (effort) |
|---|---|---|---|---|
| C1 | **S2** | **Le dossier public contient des données personnelles** : coordonnées GPS des photos, nom du fournisseur, note libre de la personne sur place. Il est servi à toute personne qui a le lien (identifiant de 64 bits, aucun autre contrôle) | `services.ts:488` (GPS), `:490` (note), `:591` (nom du fournisseur) ; route publique `/api/anchors/:id/dossier` | **Publier des engagements** (hachages salés) et garder le détail privé ; divulgation sélective au vérificateur (M) |
| C2 | **S3** | La page publique ne vérifie dans le navigateur que le SHA-256 et la chaîne ; la partie « dans la blockchain Bitcoin » est **lue par notre serveur** (calendriers puis blockstream.info). Le texte « sans faire confiance à NobPay » n'est vrai qu'avec l'outil externe (opentimestamps.org ou `ots verify`) | `VerifyAnchor.tsx:40-53`, `ots.ts:273-289` | Vérifier le `.ots` **dans le navigateur** et comparer la racine de Merkle à un explorateur interrogé depuis le navigateur (M) |
| C3 | **S3** | L'opérateur peut réécrire ou omettre des évènements **entre deux ancrages** (l'ancrage est manuel, ou `AUTO_ANCHOR=1` en option) | `anchors.ts:77-96` | Engagements publiés sur des relais Nostr **à chaque évènement** + ancrage automatique par défaut (M) |
| C4 | **S3** | Le recoupement de bloc suppose « racine de Merkle affichée inversée = valeur interne ». C'est cohérent avec l'implémentation de référence, mais **aucun ancrage n'a jamais été confirmé** pour le prouver | `ots.ts:281`, doc D14 | Confirmer avec un exemple public connu (S) |
| C5 | **S3** | Tout est signé par NobPay ; ni le financeur ni la personne sur place ne signent leurs décisions : pas de non-répudiation | modèle de données | Signatures Nostr optionnelles par acteur (M) |

### 4.4 Architecture et exploitation

| # | Gravité | Constat | Preuve | Correctif (effort) |
|---|---|---|---|---|
| D1 | **S2** | **Base = un fichier JSON** : un seul processus, état entier cloné et réécrit à chaque transaction, aucune sauvegarde, aucune contrainte d'unicité, inutilisable sans disque persistant (la doc la classe S1, D4 ; je la ramène à S2 si B1 est corrigé et qu'une sauvegarde existe) | `db.ts:60-71` | SQLite en mode WAL derrière une interface `Store`, sauvegarde continue (L) |
| D2 | **S2** | L'interface `Gateway` mélange facture Lightning, conversion, paiement, soldes et suit l'API de Bitnob : ajouter NWC, l'adresse Lightning ou Nostr obligerait à tordre ce contrat | `bitnob/types.ts` | Ports et adaptateurs (M) |
| D3 | **S3** | Les tâches de fond tournent dans le processus web (`setInterval`) : correct pour un seul conteneur durable, fragile sur un hébergeur qui endort ou recycle | `jobs.ts:76-78` | Conteneur durable, puis processus « worker » (S) |
| D4 | **S3** | Ni Dockerfile, ni déploiement, ni sauvegarde testée, ni métriques ; `/api/health` existe | dépôt | Docker + Caddy + sauvegarde + test de restauration (M) |
| D5 | **S3** | CI : Node 20, pas de test navigateur ni d'accessibilité, pas de contrôle `npm audit`. `@getalby/sdk@9` et `@cashu/cashu-ts@4` exigent **Node ≥ 22** | `ci.yml:22` ; `npm view` | Node 22, `npm audit --audit-level=high`, Playwright + axe (M) |

### 4.5 Produit, interface, accessibilité

| # | Gravité | Constat | Statut |
|---|---|---|---|
| E1 | **S2** | Points P1 de `docs/AUDIT-DESIGN.md` toujours ouverts (**vérifiés** : pas de `not-found.tsx`, aucun lien d'évitement, police `material-symbols` toujours importée) : page 404 en anglais, 1,1 Mo d'icônes par page, noms accessibles et contrastes à corriger | ouvert |
| E2 | **S2** | **Aucune version anglaise** alors que Devpost et Btrust sont internationaux | ouvert |
| E3 | S3 | La personne sur place doit avoir un smartphone avec appareil photo ; aucun canal USSD ou messagerie, alors que « USSD » figure dans les outils du hackathon | idée (§ 9) |
| E4 | S3 | La démo simulée affiche 760 FCFA/$ ; le taux réel observé est ≈ 593 : un jury qui compare verra l'écart | ouvert |
| E5 | S3 | Textes et documents encore centrés sur « Code & Chain » (« Demo Day 18 oct. », 281 tests, kit Bitnob annoncé mais non livré) | ouvert |

### 4.6 Qualité du dépôt et open source

`lab3.mjs` : fichier vide à la racine ; 7 branches Dependabot ouvertes ; 4 branches de travail déjà fusionnées à supprimer ; pas de modèles de tickets ni de PR, pas de code de conduite, pas de captures dans le README, aucune version publiée. **Point positif :** `LICENSE` MIT, `SECURITY.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, scan de secrets en CI.

### 4.7 Ce qu'il faut absolument garder

L'ordre des contrôles du récepteur de webhooks (signature, rejeu, ressource, montant, application) ; la validation d'un paiement **en trois temps** avec reprise sur réponse perdue ; les tests d'invariants aléatoires (vérifiés par mutation d'après la doc) ; la validation stricte des entrées, les limites de débit, l'anti-CSRF, la CSP, les journaux masqués ; les jetons signés (terrain, reçu) ; le registre enchaîné et sa vérification partagée avec le navigateur ; les règles d'honnêteté `COPY-RULES.md`. Ces briques sont la raison pour laquelle je recommande de **ne pas réécrire**.

## 5. Adéquation aux critères du jury

| Critère | Aujourd'hui | Écart | Ce qui comble l'écart |
|---|---|---|---|
| **Utilité et impact social** | Diaspora → projets familiaux ; chiffres IFAD sourcés | L'annonce parle commerçant, étudiant, boutique | Trois couloirs sur un moteur (§ 8) ; comparateur de coût sourcé |
| **Sécurité dès la conception** | Au-dessus de ce qu'on voit d'ordinaire en hackathon | Dépendances, démo/admin, dossier public, séquestre sans sortie | A1-A3, B1-B5, C1-C3, remboursement ; modèle de menaces publié |
| **UX/UI** | Très soigné (mobile + bureau) | Accessibilité, poids, anglais, 404 | E1, E2 ; démonstration sans inscription |
| **MVP testable** | Local, simulé | Pas d'URL, pas de vrais sats | Déploiement public ; NWC ; adresse Lightning ; instances démo et pilote |
| **Pitch clair** | Vidéo, 29 diapositives, vitrine | Récit diaspora seulement | Récit « un moteur, trois personnes » |
| **Originalité et technicité** | Registre ancré sur Bitcoin | Rien côté Nostr, IA, FOSS Bitcoin | NIP-03, engagements sur relais, vérification sans serveur, revue IA, bibliothèque OpenTimestamps libre |
| **Bonus du règlement** | | « Build in public », outils cités (NWC, mobile money, USSD) | Notes Nostr et X régulières ; NWC ; mobile money conservé ; USSD en idée |

## 6. Recherche

### 6.1 Contexte local

- **Marché** : chiffres IFAD déjà sourcés dans le README (ONU Info, IFAD). **Coût d'envoi** vers l'Afrique subsaharienne : environ **8,5 %** pour 200 $ au 3ᵉ trimestre 2025 contre 6,4 % en moyenne mondiale, d'après une [dépêche de presse](https://www.vanguardngr.com/?p=2883411) qui cite la Banque mondiale (une autre source donne 8,78 %). **Source secondaire** ; le site de la Banque mondiale m'a répondu 403 : à vérifier avant de l'afficher.
- **Frais Wave** : sources contradictoires (transferts gratuits ou 1 % ; marchand ≈ 1 %), la plupart issues d'un blog commercial. **Ne pas citer de chiffre Wave** sans lire sa grille officielle.
- **Réglementation UEMOA** (sources secondaires, presse financière et blog juridique) : pas de cadre spécifique aux crypto-actifs en 2026 ; la BCEAO répète que ce ne sont ni une monnaie ni des actifs réglementés ; comité **C-CRYPTO** annoncé le 8 mai 2026 ; calendrier évoqué 2027-2028 ; détention et échange entre particuliers non réprimés au Sénégal ; aucune plateforme avec licence sénégalaise formelle ([Financial Afrik](https://www.financialafrik.com/2026/08/26/lencadrement-des-cryptoactifs-dans-luemoa-entre-innovation-financiere-et-preservation-de-la-stabilite-monetaire/), [Osiris](https://www.osiris.sn/le-fcfa-a-l-epreuve-du-bitcoin-la-bceao-sort-du-silence.html)). **Conséquence** : NobPay doit se présenter comme une **couche de règles et de preuve**, laisser la partie monnaie locale aux opérateurs agréés, plafonner ses montants, et ne jamais écrire « réglementé » ni « conforme ».
- **Concurrence** (pages commerciales, affirmations non vérifiées) : Trust Platform (Nigeria), RemitBuild et Nnarks Escrow (Ghana), Urbex PRO, Vancus (« IA »), JaGedo : séquestre et suivi de chantier pour la diaspora, **centralisés et en monnaie fiduciaire**. Je n'ai **pas trouvé** d'équivalent ouvert, ancré sur Bitcoin et francophone. C'est une hypothèse de positionnement à confirmer, pas une certitude.

### 6.2 Briques techniques (spécifications lues)

| Brique | Ce que dit la source | Usage dans NobPay |
|---|---|---|
| **NIP-03** ([texte](https://nips.4rs.nl/nips/3)) | Évènement `kind 1040` : étiquette `e` vers l'évènement daté, **preuve `.ots` en base64** dans `content`, qui doit prouver l'**identifiant de l'évènement** ; une seule attestation Bitcoin recommandée, **sans attestation en attente** | Publier la preuve `.ots` d'un évènement « point de contrôle » du registre dès que le bloc est confirmé |
| **NIP-47 / Nostr Wallet Connect** ([texte](https://raw.githubusercontent.com/nostr-protocol/nips/master/47.md)) | Évènements `13194` (info), `23194` (requête), `23195` (réponse) ; chiffrement **NIP-44** ; méthodes du cœur : `make_invoice`, `lookup_invoice`, `pay_invoice`, `get_balance`, `get_info`. **Hors cœur** : notifications, factures à retenue, budgets (laissés au portefeuille) | **Recevoir** (facture + vérification par interrogation) et **payer** (adresse Lightning, remboursement) avec n'importe quel portefeuille compatible, sans dépendre de Bitnob |
| **NUT-11 de Cashu** ([texte](https://cashubtc.github.io/nuts/11/)) | Jetons verrouillés par clé publique, multi-signatures (`n_sigs`), échéance (`locktime`) puis clés de **remboursement** ; exemple 2-sur-3 avec remboursement ; le mint doit annoncer le support | **Piste expérimentale** d'un vrai séquestre cryptographique ; à n'engager qu'après une journée d'essai (§ 9) |
| **Routstr** ([billet](https://blog.cashu.space/routstr/)) | Marché d'inférence IA découvert via Nostr, payé en sats par Cashu, compatible avec le client OpenAI | Fournisseur IA **alternatif** payé en sats (source promotionnelle, non évalué) |
| **Machankura** ([TechCabal](https://techcabal.com/2026/03/04/machankuras-solution-for-crypto-transactions/)) | Portefeuille Lightning par USSD, 1 % de frais, 10 pays dont la Côte d'Ivoire, **pas le Sénégal** | Confirme que l'USSD est une piste, pas une brique prête pour Dakar |

**Bibliothèques** (`npm view`, 1er nov. 2026) : `nostr-tools` 2.25.4 (Unlicense ; expose NIP-05/07/17/19/44/46/59/98 ; **pas de NIP-03 ni NIP-47** : le premier s'écrit à la main, le second vient du SDK Alby) ; `@getalby/sdk` 9.0.0 (MIT, **Node ≥ 22**, sous-chemin `./nwc`) ; `@getalby/lightning-tools` 10.0.0 (MIT, adresses Lightning) ; `@cashu/cashu-ts` 4.13.0 (MIT ou Apache-2.0, Node ≥ 22.4) ; `@anthropic-ai/sdk` 1.3.0 ; `next` 16.4.3. **`opentimestamps` (npm) est sous LGPL-3.0 et sans publication depuis mai 2022** : c'est pourquoi l'implémentation maison de `ots.ts` est un atout et peut devenir une **contribution libre** utile (§ 7).

**Next.js 16** ([guide officiel](https://nextjs.org/docs/app/guides/upgrading/version-16)) : Node 20.9+ ; accès **asynchrone obligatoire** à `cookies()`, `headers()` et `params` (codemod fourni) ; `middleware` renommé **`proxy`** ; `next lint` et l'option `eslint` supprimés ; Turbopack par défaut ; `experimental.instrumentationHook` n'est plus nécessaire. Migration **mécanique** sur un code de cette taille, protégée par 323 tests.

### 6.3 Les organisateurs : ce qu'ils sont et ce qu'ils attendent (recherche du 1er novembre)

| Organisateur | Ce que disent les sources | Source |
|---|---|---|
| **Btrust** | Association à but non lucratif fondée en 2021 grâce à un don de 500 BTC de Jack Dorsey et Jay-Z. Mission : « soutenir l'écosystème open source de Bitcoin dans la Majorité globale » : trouver, former et rémunérer des ingénieurs du Sud global. Programmes : **Btrust Builders** (formation Bitcoin et Lightning open source), bourses (Starter Grant, Open-Source Cohort), Developer Day, BitDevs. Finance des événements et de l'éducation Bitcoin (≈ 1 M$ en un tour, **dont Dakar Bitcoin Days**) ; critères des subventions d'événements : logiciel libre, développement Bitcoin ou formation de développeurs, en Afrique ou dans le Sud global. Présent sur Nostr (`npub133yvyku5munsddczjqwz4w6aspwz93z22jmlzgw8xur7qu0368vq7urapg`) et X (@btrustteam) | [btrust.tech](https://btrust.tech) (lu), [Mariblock](https://www.mariblock.com/stories/btrust-grants-1m-to-ten-bitcoin-focused-events-and-developer-education-programs), page de candidature (secondaire) |
| **Dakar Bitcoin Days** | Forum décrit comme **« bitcoin-only »**, créé par Mouhamadou Kouta, dit Nourou (Yité Technologies ; formé aux séminaires Chaincode Labs ; initiateur de **Bitcoin Senegal**, mouvement qui diffuse la connaissance financière et Bitcoin **en wolof**). Appel à intervenants : sujets sur **Bitcoin, les questions monétaires ou les paiements transfrontaliers en Afrique** ; « solutions pratiques et simples d'usage », communautés et usages réels, **projets et partenariats** ; 30 minutes au plus ; logo de l'événement obligatoire. Conférences en anglais, français et wolof (source secondaire) | [Sessionize](https://sessionize.com/dakar-bitcoin-days-iv) (lu), [Afrobitcoin](https://afrobitcoin.org/?p=6174) (lu), Coinpedia |
| **Banxaas** | Startup du même fondateur : **pont entre Bitcoin Lightning et le FCFA par les API de mobile money**. Page d'accueil : « Instant Mobile Money & Bitcoin Lightning Swaps » (Sénégal, Côte d'Ivoire, Cameroun, Guinée, Kenya, Tanzanie, Zambie) ; Trustpilot : 10 opérateurs dont Wave et Orange Money. **Aucune documentation d'API publique trouvée.** Soutien de l'événement | [banxaas.com](https://banxaas.com) (lu), Trustpilot (secondaire) |
| **Wave** | Soutien de l'événement ; **aucune intégration Bitcoin officielle trouvée** (une démonstration Lightning dans un reportage de 2023) | Luma, Cointelegraph |
| Alliance Fintech UEMOA, Sentartup, Optic | Soutiens listés ; non étudiés | Luma |

**Ce que j'en déduis, et ce que j'ajuste dans NobPay**

1. **Bitcoin sans jetons annexes.** Le forum se dit « bitcoin-only » et Btrust finance Bitcoin et Lightning. Je retire des écrans les tuiles « USDT / USDC bientôt », je dis « Bitcoin » (jamais « crypto »), et je présente la conversion en stablecoin du chemin Bitnob comme un **détail interne d'un pont optionnel**, pas comme une fonction. Le chemin principal devient **Lightning de bout en bout** (financement et paiement vers une adresse Lightning).
2. **Open source et formation des développeurs.** Objectif n° 1 des organisateurs : contribuer à l'écosystème libre. Je livre des **briques libres réutilisables**, documentées en anglais (`@nobpay/ots` pour OpenTimestamps et NIP-03, un simulateur de portefeuille NWC, un client LNURL-pay à l'épreuve du SSRF), je garde une licence permissive, **aucun service fermé n'est obligatoire** (Bitnob et l'IA restent optionnels), et je documente la **provenance des images** du dépôt public.
3. **Wolof et éducation.** Le mouvement diffuse Bitcoin en wolof. Interface en français et en anglais, **wolof en bêta** pour l'espace terrain et les explications (à faire relire par des locuteurs natifs, c'est dit à l'écran), et de courts explicatifs « Lightning en 30 secondes ».
4. **Le pont Lightning ↔ mobile money existe déjà chez l'organisateur.** Le mobile money devient un **port interchangeable** (Bitnob aujourd'hui, **Banxaas comme cible** si un accès à l'API est obtenu). Je n'annonce **jamais** une intégration non faite. À faire : contacter Banxaas/Yité Technologies (l'appel à intervenants « encourage projets et partenariats »).
5. **La scène du 27-28 novembre.** L'appel à intervenants est ouvert jusqu'au **13 novembre** : proposer une intervention ou une démonstration (« Payer sur preuve : Lightning, Nostr et OpenTimestamps pour les transferts de la diaspora »).
6. **Build in public sur Nostr.** Btrust y publie : mentionner @btrustteam et son npub dans les notes du parcours, avec le mot-dièse #DakarBitcoinHack.

### 6.4 Ce que je n'ai pas pu établir

Gagnants et critères réels de 2025 ; jury ; poids du vote du public ; **si Banxaas offre une API publique** (rien trouvé) et ses conditions ; position officielle de Wave sur Bitcoin ; chiffre officiel Banque mondiale ; grille tarifaire officielle Wave ; signatures exactes du SDK Alby (le README renvoie à sa documentation : à lire au moment de coder) ; liste des mints Cashu qui annoncent NUT-11 ; couverture USSD au Sénégal.

## 7. Architecture cible : mes décisions

Choix techniques internes, que je tranche (chacun justifié en une phrase) :

| # | Décision | Pourquoi |
|---|---|---|
| T1 | **Rester un monolithe TypeScript (Next.js)**, refactorer par ports, ne rien réécrire | Le cœur métier est testé et correct ; 19 jours ne se gaspillent pas à le refaire |
| T2 | **Next 16, React 19, zod 4, Node 22 LTS** | Ferme les avis critiques ; exigé par le SDK Alby et cashu-ts |
| T3 | **SQLite (mode WAL)** derrière une interface `Store` (adaptateurs SQLite et mémoire ; pilote `better-sqlite3`, à valider sur Windows et Linux), sauvegarde continue vers un stockage objet | Atomicité réelle, contraintes d'unicité (`event_id` de webhook, référence de versement, `(projet, seq)` du registre), registre en ajout seul par déclencheur, plusieurs processus, sauvegardes ; tests plus rapides ; PostgreSQL n'apporterait rien à cette échelle |
| T4 | **Ports et adaptateurs** : `LightningRail` (NWC, Bitnob), `PayoutRail` (mobile money Bitnob, adresse Lightning), `Attestor` (OpenTimestamps, Nostr), `Notifier` (SMS, message Nostr chiffré, lien à partager), `ProofReviewer` (IA, heuristiques) | Ajouter un rail ne doit plus toucher les règles d'argent |
| T5 | **Registre = source de vérité + boîte d'envoi transactionnelle** vers des relais Nostr : on publie des **engagements** (numéro, type, empreinte, empreinte précédente), signés par une **clé de projet dérivée** (HKDF), jamais les données | Réplication indépendante contre l'omission et la réécriture ; vie privée préservée |
| T6 | **Vérification sans notre serveur** : bibliothèque OpenTimestamps partagée serveur/navigateur, lecture des relais et d'un explorateur depuis le navigateur | Tient enfin la promesse « verify, don't trust » |
| T7 | **Connexion** : SMS + Nostr (NIP-07/46) + passkeys ; **instance démo isolée** de l'instance pilote | Réduit le coût et l'abus SMS ; supprime A2 |
| T8 | **IA consultative, asynchrone, journalisée** : jamais de décision automatique ; entrées traitées comme **non fiables** (injection par le texte d'une facture) ; sorties validées par schéma ; fournisseur interchangeable ; jeu d'évaluation publié | Valeur démontrable sans risque de « décoration IA » |
| T9 | **Déploiement** : Docker, Caddy (HTTPS automatique), sauvegarde continue, un VPS à quelques euros par mois ; deux instances (démo, pilote) | MVP en ligne, reproductible, bon marché |
| T10 | **CI** : Node 22, typecheck, tests, build, `npm audit`, Playwright + axe | Garde la qualité pendant la course |
| T11 | **Contribution libre** : paquet `@nobpay/ots` (MIT, TypeScript, serveur et navigateur) avec aides NIP-03, et un simulateur de service NWC pour les tests | Remplace le « kit Bitnob » annoncé par quelque chose d'utile à l'écosystème Nostr/Bitcoin |

```
 Navigateur (PWA, FR/EN)            Conteneur unique : Next.js 16 (Node 22)
  ├ /app        financeur            ┌───────────────────────────────────────────────┐
  ├ /terrain    personne sur place   │ routes + pages ─► services (cas d'usage)      │
  ├ /recu       fournisseur          │                      │                        │
  └ /verifier   public               │            domain (règles pures, testées)     │
       │  ▲                          │                      │                        │
       │  └── relais Nostr (WS)      │  ports ──────────────┼──────────────────────┐ │
       │  └── explorateur Bitcoin    │  LightningRail   ◄ NWC · Bitnob             │ │
       ▼                             │  PayoutRail      ◄ Bitnob (Wave/Orange/Free)│ │
   vérification locale               │                  ◄ adresse Lightning        │ │
   (OTS + chaîne + relais)           │  Attestor        ◄ OpenTimestamps · Nostr   │ │
                                     │  Notifier        ◄ SMS · message Nostr · lien│ │
                                     │  ProofReviewer   ◄ IA (vision) · heuristiques│ │
                                     │                                             │ │
                                     │  Store ◄ SQLite (WAL) + boîte d'envoi ──────┘ │
                                     └───────────────┬───────────────────────────────┘
                                                     ▼
                                   sauvegarde continue (stockage objet) · relais Nostr
```

**Modèle de garde (à dire franchement dans le pitch).** Le séquestre reste **une règle logicielle sur un portefeuille que NobPay contrôle** : c'est inévitable tant que le mobile money est la sortie. Ce qui change : (1) les fonds attendent dans un portefeuille **à nous, connecté par NWC**, plutôt que chez un tiers ; (2) on **sépare** deux connexions NWC, l'une **en réception seule**, l'autre **pour les paiements avec plafond** (les budgets sont laissés au portefeuille par NIP-47 : à vérifier chez le portefeuille choisi) ; (3) un **plafond de démonstration** limite l'exposition ; (4) on publie une **déclaration de solvabilité signée** (ce que nous devons, ce que contient le portefeuille). L'**option Cashu NUT-11** (séquestre 2-sur-3 avec remboursement) est la vraie réponse « non custodiale » : à tenter seulement après un essai d'une journée.

## 8. Direction produit recommandée (à valider par le chef de projet)

**Récit.** *« L'argent ne bouge que sur preuve, au coût du Lightning. Et la preuve ne dépend pas de nous. »*

L'annonce décrit trois personnes ; le moteur de NobPay (étapes, preuves, libération, registre) les sert déjà avec de petits ajouts de contenu :

| Personne de l'annonce | Couloir NobPay | Ce qui change dans le produit |
|---|---|---|
| (la diaspora, **démo principale**) | Famille à l'étranger → projet (maison, champ, boutique) | Déjà là ; Lightning réel, Nostr, IA |
| **L'étudiant sans accès bancaire** | Famille → **frais de scolarité** payés **directement à l'établissement** (Wave, Orange ou adresse Lightning), libérés par trimestre sur reçu ou attestation | Nouveau secteur « Scolarité » : gabarit d'étapes, preuves (reçu d'inscription, attestation), texte |
| **Le commerçant qui attend trois jours** | Commerçant → **fournisseur** : réassort **payé à la livraison** sur preuve (photo du bon + facture) ; le fournisseur est payé dès la validation, sans attendre un virement | Gabarit « Réassort » dans le secteur Commerce, vue fournisseur (le reçu existe déjà) |
| **La boutique qui perd une commission** | Même couloir : **comparateur de coût** affiché au devis (frais de la voie classique sourcés contre frais Lightning + opérateur) | Écran de devis enrichi, **avec sources** ; pas de chiffre Wave non sourcé |

**Garde-fous de pitch.** Ne pas promettre « instantané » (règle `COPY-RULES.md` : le paiement final dépend de l'opérateur) ; dire « payé sans attendre un virement », pas « en une seconde ». Garder **un seul scénario complet de trois minutes** (diaspora → projet) et montrer les deux autres couloirs en dix secondes chacun : un pitch clair vaut mieux que trois produits à moitié montrés.

**Ce que je déconseille.** Pivoter vers un terminal de paiement LNURL ou un portefeuille USSD (hors du cœur de NobPay, concurrence directe de projets spécialisés) ; faire du séquestre Cashu le cœur du produit (risque de ne pas livrer).

## 9. Plan jusqu'au 20 novembre

**Convention** : **M** = à livrer, **S** = à livrer si le calendrier tient, **C** = bonus. Chaque jalon se termine par `typecheck`, tests, build et mode simulé fonctionnel.

| Jalon | Dates | Contenu |
|---|---|---|
| **M0 Fondations** | dim. 1 → mer. 4 nov. | **M** : étiquette Git `pre-dbd4` ; Next 16.4.3, React 19, zod 4, Node 22, CI à jour (A1, D5) ; correctifs A2, A3, A4, A6, B1, B3 ; E1 (404 en français, lien d'évitement, sous-ensemble d'icônes, contrastes) ; ménage (`lab3.mjs`, branches) ; Dockerfile, Caddy, **premier déploiement public** (instance démo) ; **inscription Devpost** ; compte Nostr du projet et première note « build in public » |
| **M1 Bitcoin réel** | mer. 4 → dim. 8 nov. | **M** : ports (T4, dont un port **mobile money interchangeable** : Bitnob aujourd'hui, Banxaas visé) ; retrait des tuiles USDT/USDC ; **SQLite** (T3) ; adaptateur **NWC** (facture, interrogation, solde) avec simulateur de test ; **paiement vers adresse Lightning** (LNURL-pay) comme 4ᵉ rail de bénéficiaire ; **remboursement** (B2) ; deux connexions NWC, plafonds, instance pilote en sats réels plafonnés ; **soumission préliminaire sur Devpost le dim. 8** (texte, vidéo existante + séquence Lightning). **S** : « payer avec mon portefeuille » côté navigateur ; adaptateur BTCPay Server |
| **M2 Nostr** | dim. 8 → jeu. 12 nov. | **M** : boîte d'envoi et publication des **engagements** sur 3 relais publics + 1 relais à nous ; clé de projet dérivée ; **NIP-03** à la confirmation de l'ancrage ; NIP-05 ; **vérification sans serveur** dans `/verifier` ; CSP ; ancrage automatique par défaut ; engagements à la place des données dans le dossier public (C1). **S** : connexion Nostr ; messages NIP-17 ; signatures optionnelles du financeur ; déclaration de solvabilité signée. **C** : essai Cashu NUT-11 d'une journée, **décision le 12** |
| **M3 IA** | jeu. 12 → lun. 16 nov. | **M** : port `ProofReviewer` + adaptateur ; **revue de preuve consultative** (extraction de la facture : montant, émetteur, date ; comparaison avec la saisie et le budget ; doublons exacts et proches ; EXIF ; cohérence photo/étape) ; évènement `ai_review` dans le registre ; **jeu d'évaluation** (factures propres, falsifiées, hors sujet, **avec injection de consigne**) et rapport ; plafonds de coût ; fournisseur simulé déterministe pour la CI. **S** : planificateur de projet en texte libre ; résumé en français simple ; règles d'alerte sur le bénéficiaire (B4). **C** : note vocale ; fournisseur alternatif |
| **M4 Couloirs et finition** | lun. 16 → mer. 18 nov. | **M** : secteur Scolarité et gabarit Réassort ; comparateur de coût sourcé ; **anglais** (vitrine, parcours de démo, README) et **wolof en bêta** (espace terrain, explicatifs) ; briques libres publiées (`@nobpay/ots`, simulateur NWC, client LNURL-pay) ; provenance des images documentée ; passage accessibilité (0 violation critique) et mobile ; README, ARCHITECTURE, SECURITY, modèle de menaces, journal « nouveau depuis le 26 oct. » ; vidéo v2 FR avec sous-titres EN ; diapositives ; texte Devpost ; modèles de tickets, sujets et captures GitHub |
| **M5 Gel et soumission** | mer. 18 → ven. 20 nov. | **Gel mer. 18 au soir.** Test complet sur l'URL publique, sauvegarde **et restauration** essayées, relecture des textes (`COPY-RULES.md`), **soumission finale jeu. 19**, vendredi = marge |
| **Jury et scène** | 21 → 28 nov. | Aucun déploiement non critique ; surveillance ; **pitch de 3 min** et plan B (vidéo, instance locale simulée) pour le 27-28 à Seanema (dates confirmées) ; **proposer une intervention avant le 13 novembre** ; confirmer si les finalistes doivent être présents |

**Si on prend du retard (ordre de sacrifice).** SQLite (garder le JSON avec B1 corrigé et des sauvegardes) → connexion Nostr et messages NIP-17 → anglais limité à la vitrine et au README → IA limitée à l'extraction de facture et aux doublons. **Ne jamais sacrifier** : déploiement public, vrais sats, remboursement, engagements Nostr, vidéo, dossier Devpost.

**Build in public.** Une note sur Nostr et sur X tous les deux jours (capture ou GIF, ce qui a été fait, ce qui a cassé). Les objectifs de l'organisateur incluent « la visibilité » : c'est aussi ce qui nourrit le vote du public.

## 10. Risques

| Risque | Parade |
|---|---|
| Portée trop grande pour 19 jours | Jalons, ordre de sacrifice, « M/S/C » ci-dessus |
| Portefeuille Lightning vidé ou compromis | Deux connexions NWC (réception seule / paiements plafonnés), montant maximal de démonstration, balayage régulier, mention « pilote » |
| Relais ou NWC instables pendant le jury | Plusieurs relais + un à nous, repli par interrogation, états clairs à l'écran, instance simulée de secours |
| IA : erreur, injection, coût | Consultative seulement, schéma strict, aucune action déclenchée, plafonds, jeu d'évaluation, repli déterministe |
| Perception réglementaire | « Couche de règles et de preuve », opérateurs agréés pour la monnaie locale, plafonds, page « Conformité et limites », jamais « réglementé » |
| Le jury ne peut pas tester (friction d'inscription) | Instance démo sans inscription ; « payer une facture de 500 sats avec n'importe quel portefeuille » |
| Panne le 27-28 nov. | Vidéo, instance locale simulée, point d'accès téléphone |
| Perte de données | SQLite + sauvegarde continue + **restauration essayée** avant le gel |
| Travail antérieur contesté | Étiquette `pre-dbd4`, journal des nouveautés, mention explicite dans Devpost |
| Chaîne d'approvisionnement | Fichier de verrouillage, `npm audit` en CI, peu de dépendances nouvelles (`nostr-tools`, `@getalby/sdk`, `better-sqlite3`) |

## 11. Ce dont j'ai besoin de l'équipe

1. **Valider** la direction produit du § 8 (un moteur, trois couloirs, anglais).
2. **Composition et disponibilité** : qui travaille, combien d'heures par jour ; qui réside en Afrique (condition du règlement) ; qui s'inscrit sur Devpost.
3. **Hébergement** : un petit VPS (quelques euros par mois) et un nom de domaine : qui paie, avec quel moyen.
4. **Portefeuille Lightning de NobPay** compatible NWC (Alby Hub, Rizful, Coinos, LNbits…) : la chaîne de connexion se met **uniquement** dans `.env.local` ou dans les secrets de l'hébergeur, **jamais** dans une conversation ni dans Git.
5. **Clé d'API pour l'IA** (Anthropic ou autre) avec un **plafond de dépense** fixé par vous.
6. Les **clés Bitnob sandbox** sont-elles toujours actives ?
7. **Proposer une intervention** à Dakar Bitcoin Days IV avant le **13 novembre** (appel ouvert sur Sessionize) et demander aux organisateurs si les finalistes doivent être présents.
8. **Contacter Banxaas / Yité Technologies** pour un accès à leur API (pont Lightning ↔ mobile money, startup de l'organisateur).
9. **Provenance des images** du dépôt (couvertures, photos de preuve, captures) : sont-elles libres de droits ? Le dépôt est public et le règlement dit que les résultats sont open source.

## 12. Sources

- Devpost : [accueil](https://dakar-bitcoin-hack-2026.devpost.com/), [règles](https://dakar-bitcoin-hack-2026.devpost.com/rules), [ressources](https://dakar-bitcoin-hack-2026.devpost.com/resources), [calendrier](https://dakar-bitcoin-hack-2026.devpost.com/details/dates) (lus le 1er nov. 2026)
- [Dakar Bitcoin Days IV sur Luma](https://luma.com/5q43x47y?locale=fr) ; [édition 2025 (allhackathons)](https://allhackathons.com/hackathon/dakar-bitcoin-hack)
- Spécifications : [NIP-03](https://nips.4rs.nl/nips/3), [NIP-47](https://raw.githubusercontent.com/nostr-protocol/nips/master/47.md), [Cashu NUT-11](https://cashubtc.github.io/nuts/11/), [Next.js 16](https://nextjs.org/docs/app/guides/upgrading/version-16), [SDK Alby](https://raw.githubusercontent.com/getAlby/js-sdk/master/README.md)
- Organisateurs : [Btrust](https://btrust.tech), [Mariblock sur les subventions de Btrust](https://www.mariblock.com/stories/btrust-grants-1m-to-ten-bitcoin-focused-events-and-developer-education-programs), [appel à intervenants de Dakar Bitcoin Days IV](https://sessionize.com/dakar-bitcoin-days-iv), [Afrobitcoin sur Nourou et Banxaas](https://afrobitcoin.org/?p=6174), [Banxaas](https://banxaas.com)
- Contexte : [Routstr](https://blog.cashu.space/routstr/), [Machankura](https://techcabal.com/2026/03/04/machankuras-solution-for-crypto-transactions/), [Banque mondiale T3 2025 via Vanguard](https://www.vanguardngr.com/?p=2883411), [BCEAO et crypto-actifs](https://www.financialafrik.com/2026/08/26/lencadrement-des-cryptoactifs-dans-luemoa-entre-innovation-financiere-et-preservation-de-la-stabilite-monetaire/), [Osiris](https://www.osiris.sn/le-fcfa-a-l-epreuve-du-bitcoin-la-bceao-sort-du-silence.html), [exemple de page commerciale de séquestre pour la diaspora (non vérifiée)](https://cofellow.com/articles/how-nigerians-abroad-can-hire-trusted-professionals-back-home-without-being-scammed)
- Mesures : `npm run typecheck`, `npm test`, `npm run build`, `npm audit --omit=dev`, `npm view <paquet>`, recherche de secrets par motifs dans `git log -p`, lecture du code et parcours de l'application sur `localhost`.
