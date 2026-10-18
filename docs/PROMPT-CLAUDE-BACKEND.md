# Prompt pour le Claude du développeur backend

## Mode d'emploi (30 secondes)

1. Clonez le dépôt : `git clone https://github.com/mouhaa-md/NobPay.git` (vous y avez accès en écriture), puis ouvrez **Claude Code à la racine** du projet (le dossier qui contient `docs/` et `frontend/`). Travaillez sur une branche `backend/<sujet>`, pas directement sur `main`.
2. Vérifiez que ces trois fichiers sont présents : `docs/CONTEXTE-PROJET.md`, `docs/ROADMAP-BACKEND.md`, `README.md`. Si vous ne recevez que des fichiers isolés, **collez leur contenu** dans la conversation avant le prompt.
3. Copiez-collez le bloc « Prompt » ci-dessous comme **premier message**.
4. Mettez vos clés Bitnob dans `frontend/.env.local` **vous-même** (jamais dans la conversation).

---

## Prompt (à copier en entier)

````text
Tu reprends le BACKEND de NobPay, un prototype de hackathon (Code & Chain Dakar, organisé par Bitnob et Btrust). Le frontend est terminé et testé en mode simulé ; le backend fonctionne en simulation mais n'a JAMAIS parlé à la vraie API Bitnob. Ton travail : le rendre réel et fiable, sans casser le reste.

Je suis le développeur qui reprend le backend. Le chef de projet est francophone et a construit le frontend avec un autre Claude. Réponds-moi en français, de façon courte et concrète (pas de pavés).

## 1. Lis d'abord, en entier et dans cet ordre
1. docs/CONTEXTE-PROJET.md : le produit, l'architecture, les règles métier, ce qui est vérifié ou non, la dette technique (D1 à D20).
2. docs/ROADMAP-BACKEND.md : le plan par phases (B0 à B5), les contrats à ne pas casser, la définition de « terminé ».
3. README.md, puis frontend/design-reference/COPY-RULES.md (règles de rédaction : le jury relit chaque phrase affichée).
4. Le code, dans cet ordre : frontend/src/server/services.ts, domain.ts, webhooks.ts, bitnob/client.ts, bitnob/mock.ts, bitnob/types.ts, db.ts, auth.ts, ledger.ts. Puis la liste de frontend/src/app/api/**/route.ts.

Quand tu as fini de lire, ne commence pas à coder. Réponds d'abord avec :
- un résumé de ce que tu as compris en 10 lignes maximum ;
- les 3 risques qui te paraissent les plus graves, avec la raison ;
- tout ce qui, dans les documents, te semble faux, incomplet ou contradictoire avec le code (vérifie dans le code, ne te contente pas des documents).

## 2. Mission, dans cet ordre
Phase 0 de la feuille de route (B0.1 à B0.11) : obtenir un parcours complet en BITNOB_MODE=sandbox (facture Lightning payée, webhook signé reçu, devis puis paiement mobile money confirmé par webhook), en remplaçant chaque hypothèse sur l'API Bitnob par un fait observé. Ensuite, dans l'ordre de la section « Plan des prochaines 24 heures » de la feuille de route. Ne commence pas la Phase 3 (base de données) avant d'avoir fini la Phase 0.

Si quelque chose bloque (pas de moyen de payer une facture en sandbox, un endpoint qui n'existe pas, un comportement différent de la doc), dis-le tout de suite avec la preuve (requête, réponse nettoyée), propose une solution de contournement et la question à poser à un mentor Bitnob. Ne devine pas en silence.

## 3. Règles de travail (non négociables)
Argent et secrets
- N'utilise JAMAIS le mode live de Bitnob. Si une facture Lightning commence par « lnbc », ne la paie pas : demande-moi.
- Ne demande jamais de clé ou de secret dans la conversation. Je les mets dans frontend/.env.local ; tu les lis seulement via l'environnement. N'écris aucun secret dans un fichier suivi par Git, un message de commit, un journal, une capture ou un rapport. Masque les secrets, signatures et identifiants dans tout ce que tu enregistres.
- Les captures de webhooks vont dans frontend/.data/ (ignoré par Git) ; ne committe que des jeux d'essai nettoyés (tests/fixtures/).

Ne rien casser
- Le mode `mock` doit continuer à fonctionner : c'est le plan B devant le jury. Tout comportement Bitnob nouveau passe par l'interface Gateway (frontend/src/server/bitnob/types.ts) et existe dans client.ts ET mock.ts.
- Les routes /api/* et leurs formes JSON sont un contrat avec le frontend (CONTEXTE § 9). Si une forme doit changer, modifie le frontend dans le même commit et préviens-moi.
- Ne change jamais l'ordre des contrôles du récepteur de webhooks (signature, rejeu, ressource connue, application) ni le format du registre et du dossier (lib/canonical.ts, ledger.ts).
- Les textes de l'interface respectent COPY-RULES.md : n'affiche rien que le code ne tient pas (pas de « multisig », « on-chain », « garanti », « audité », etc.).

Méthode
- Avant d'écrire du code pour une tâche : dis en 3 à 5 lignes ce que tu vas faire et quels fichiers tu touches. Tiens une liste de tâches visible (ID B0.x) et mets-la à jour.
- Petits commits, message en anglais à l'impératif (« Fix invoice parsing »), une branche par sujet (`backend/<sujet>`). Jamais de push --force, jamais de push direct sur main sans mon accord.
- Avant chaque commit : `cd frontend && npm run typecheck && npm test`. Après un changement qui touche l'écran, relance le parcours de démonstration (README) en mock, et en sandbox dès que possible.
- Chaque comportement nouveau a un test. Pour l'API Bitnob : un fetch simulé qui rejoue des réponses réelles nettoyées (tests/fixtures/bitnob/).
- Quand tu constates qu'un document de docs/ est faux, corrige-le dans le même commit.
- Demande-moi AVANT : toute action irréversible (supprimer .data/, réécrire l'historique Git), toute installation globale, tout changement du modèle de données qui casserait des projets existants, tout choix de produit (voir « Décisions à prendre » dans la feuille de route). Pour un choix technique interne, décide et justifie en une phrase.

## 4. Ce que j'attends en retour
À chaque étape terminée, un compte rendu court : ID de la tâche, ce qui marche (avec la preuve : extrait de journal ou de réponse, sans secret), ce qui a changé dans l'API ou le frontend, ce qui reste, et ce dont tu as besoin de moi. À la fin de la Phase 0 : docs/BITNOB-SANDBOX-REPORT.md à jour.

## 5. Contexte rapide, au cas où
- Stack : Next.js 14 (App Router), TypeScript strict, un seul projet dans frontend/. Le backend = frontend/src/server/ et frontend/src/app/api/. Base = fichier JSON (.data/db.json), un seul processus.
- Commandes (dans frontend/) : npm install, npm run dev, npm run typecheck, npm test (102 tests), npm run build && npm start.
- Compte démo : bouton « Essayer avec le compte démo », code SMS 123456. Projets de démonstration : p_villa, p_champ, p_boutique ; jetons terrain : demo-villa-thies, demo-champ-kaolack, demo-boutique-sandaga.
- Le séquestre est une règle logicielle : l'argent est dans des portefeuilles Bitnob communs, NobPay le compte projet par projet dans sa base. Les paiements partent en USDT vers le mobile money du Sénégal (XOF).
- Ce qui n'a jamais été testé : tout appel à l'API Bitnob réelle, les charges utiles réelles des webhooks, la confirmation Bitcoin d'un ancrage OpenTimestamps.
````

---

## Version courte (pour les sessions suivantes)

````text
Reprends le backend NobPay. Relis docs/CONTEXTE-PROJET.md et docs/ROADMAP-BACKEND.md (ils sont à jour), puis `git log --oneline -10` et `git status`. Dis-moi en 5 lignes où on en est et quelle est la prochaine tâche de la feuille de route. Mêmes règles qu'avant : mode mock jamais cassé, jamais de secret dans Git ni dans la conversation, jamais de mode live Bitnob, typecheck + tests avant chaque commit, réponses courtes en français.
````

---

## Message d'accompagnement (à envoyer avec les fichiers)

> Salut ! Tu reprends le backend de NobPay. Dans le dépôt (`docs/`), tu as : le **contexte complet** du projet, la **feuille de route** (la Phase 0 passe avant tout : faire marcher la vraie sandbox Bitnob) et le **prompt** à donner à ton Claude. Lance Claude Code à la racine du dépôt, colle le prompt, et mets tes clés Bitnob dans `frontend/.env.local` (jamais dans le chat ni dans Git). Le mode simulé marche déjà de bout en bout : c'est notre plan B pour la démo. Dis-moi dès que tu bloques sur Bitnob, on demandera à un mentor.
