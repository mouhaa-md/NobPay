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

> Branche `dbd4/m1-real-bitcoin`. Tout ce chemin est **testé contre un portefeuille simulé**, pas encore avec un vrai portefeuille (il faut une connexion NWC de l'équipe : voir §11 de l'audit).

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

## À venir (voir le plan du rapport d'audit)
M1 (suite) architecture en ports/adaptateurs et SQLite · M3 IA consultative · M4 couloirs scolarité et commerçant, anglais, finition · M5 gel et soumission.
