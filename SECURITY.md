# Sécurité

NobPay est un **prototype de hackathon** (Code & Chain Dakar). Il n'a pas été audité et ne gère aucun argent réel : ne l'utilisez pas en production sans les travaux listés dans `docs/ROADMAP-BACKEND.md` (Phase 3 : vraie base de données, stockage des fichiers, hébergement durable).

## Signaler une faille

Écrivez-nous **en privé**, sans ouvrir de ticket public :

- via l'onglet « Security » → « Report a vulnerability » du dépôt GitHub, ou
- par message direct à un mainteneur du dépôt.

Indiquez : ce que vous avez trouvé, comment le reproduire (requêtes, étapes), et ce que cela permettrait. Nous accusons réception sous 72 heures. Merci de ne pas publier avant qu'un correctif existe.

N'envoyez **jamais** de vraie clé, de vrai secret ni de données personnelles dans un signalement : des valeurs masquées suffisent.

## Dans le périmètre

- authentification et sessions (`server/auth.ts`, `server/otp.ts`) ;
- récepteur de webhooks Bitnob (`server/webhooks.ts`) : signature, rejeu, rapprochement, montants ;
- règles d'argent (`server/services.ts`, `server/domain.ts`) : séquestre, paiements, conversion ;
- contrôle d'accès aux preuves et aux fichiers (`/api/files`, lien de la personne de confiance) ;
- registre enchaîné, dossier canonique et vérification publique (`server/ledger.ts`, `lib/verify.ts`).

## Hors périmètre

- le mode `mock` et ses simulations (par construction, rien n'y est réel) ;
- le compte de démonstration et le code SMS partagé quand `ALLOW_DEMO=1` (c'est un choix documenté et signalé au démarrage) ;
- les attaques par déni de service volumétrique (la limitation de débit est en mémoire, pour un seul processus) ;
- les failles de dépendances déjà connues et listées dans `docs/CONTEXTE-PROJET.md` (D19), tant qu'elles ne sont pas exploitables ici.

## Ce que le code garantit, et ce qu'il ne garantit pas

- **Garanti par des tests** : un webhook mal signé est refusé (401) ; un évènement rejoué ne crédite pas deux fois ; un montant différent de la facture ne crédite pas ; un paiement dont la réponse est perdue ne libère pas le séquestre ; des centaines de séquences aléatoires d'évènements ne produisent ni séquestre négatif, ni double crédit, ni double paiement.
- **Non garanti** : la position GPS et l'heure d'une photo sont **déclarées par le téléphone** ; l'ancrage Bitcoin prouve qu'un dossier n'a pas changé, pas qu'une photo montre le bon chantier ; le séquestre est une règle logicielle dans une base locale, pas un contrat.

## Si vous déployez

Voir `docs/CONTEXTE-PROJET.md` § 10 et § 11 : secret de session de 32 caractères au moins (le serveur refuse de démarrer sinon en sandbox), `ALLOW_DEMO` absent, un vrai fournisseur SMS, HTTPS, clés Bitnob **sandbox** uniquement tant que le parcours n'est pas validé de bout en bout.
