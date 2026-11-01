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

## À venir (voir le plan du rapport d'audit)
M1 Bitcoin réel (NWC, paiement vers adresse Lightning, remboursement, SQLite) · M2 Nostr (engagements du registre sur relais, NIP-03, vérification sans notre serveur) · M3 IA consultative · M4 couloirs scolarité et commerçant, anglais, finition · M5 gel et soumission.
