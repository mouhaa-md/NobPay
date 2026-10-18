# Règles de texte et de mise en page (à appliquer à tous les écrans)

Stitch invente des affirmations fausses ou invérifiables. Chaque texte affiché doit
être vrai pour NobPay : le jury technique de Bitnob et Btrust relira.

## Textes

| À ne pas écrire | Pourquoi | À écrire à la place |
|---|---|---|
| « Multisig » (2-sur-3, Bitcoin) | L'approbation 2 sur 3 est une règle de l'application, pas du multisig | « Approbation 2 sur 3 » |
| « Escrow décentralisé », « Tiers de confiance Bitcoin » | Les fonds sont conservés dans les wallets Bitnob | « Fonds en séquestre » |
| « Séquestre réglementé » | La BCEAO indique que les cryptoactifs ne sont pas réglementés dans l'UEMOA | « Fonds en séquestre, libérés sur preuve » |
| « Garantie Zéro Fraude », « 100 % », « 0 FCFA sans justificatif » | Promesses absolues | « Chaque libération exige une preuve » |
| « Zéro intermédiaire », « sans intermédiaire obscur » | Bitnob et le mobile money sont des intermédiaires | « Paiement direct au fournisseur » |
| « Chiffrement de bout en bout », « Protocole Sécurisé », « v1.0 », « v2.4 », « Édition Diaspora » | Non implémentés ou inventés | (supprimer) |
| « Synchronisation du nœud », « Vérification du coffre », « Génération de session chiffrée » | Faux chargement : il n'y a pas de nœud | Vrais états : « Connexion… », « Chargement de vos projets… » |
| « Preuve On-Chain » | Imprécis | « Preuve ancrée sur Bitcoin » |
| « Financement participatif » | NobPay n'est pas du crowdfunding | « Financez vos projets » |
| « Agri & BTP » | Il manque le commerce | « Immobilier · Agricole · Commerce » |
| « Wave / Orange Money » présentés comme garantis | Dépend des pays réellement supportés | Vérifier `GET /api/payouts/supported-countries` avant d'afficher un opérateur |
| « Rejoignez la diaspora +4k » et portraits de membres | Faux compteur et fausses personnes | Supprimer (initiales si des avatars sont nécessaires) |
| « Portefeuille Garanti Séquestre » | « Garanti » est une promesse | « Fonds en séquestre » |
| « Contrats séquestres multi-signatures », « sanctuarisés » | Il n'y a pas de contrat multisig | « Vos fonds restent en séquestre et ne sont libérés que sur preuve » |
| « Sécurisé par le protocole NobPay Escrow » | Ce protocole n'existe pas | (supprimer) |
| « ⚡ Instant » | Le paiement final passe par le mobile money, pas toujours instantané | « Paiement Lightning » ou supprimer |
| Titre « Nouveau Transfert » sur l'écran d'inscription | Mauvais titre | « Créer un compte » (et pas d'avatar de profil avant l'inscription) |
| « Escrow 2.0 », « Tiers de confiance certifié » | Version inventée, aucune certification | (supprimer) |
| « Chiffrement bancaire », « TLS 1.3 & AES-256 » | Détails techniques non maîtrisés ni vérifiés | « Connexion chiffrée (HTTPS) » |
| « Contrats multisig BTC », « Séquestre on-chain audité » | Pas de multisig, aucun audit | « Preuves ancrées sur Bitcoin : vérifiables par tous » |
| « CGU du tiers de confiance », « politique de protection des fonds » | Ces documents n'existent pas | « Conditions d'utilisation » et « Politique de confidentialité » (à rédiger, même brèves) |
| « Compte investisseur » | Évoque un statut réglementé | « Compte NobPay » |
| Badge « On-chain » sur le total en séquestre | Les fonds sont dans des wallets Bitnob, pas sur la chaîne | Supprimer, ou « Wallets Bitnob » |
| « Séquestre sous protocole Bitcoin multisig · Vérifiable » | Pas de multisig | « Preuves ancrées sur Bitcoin · Vérifiables » |
| « Jalon(s) » | Vocabulaire retenu : « Étape(s) » | « Étape 3 sur 4 » |
| « Paris (Diaspora) · Sécurisé » | « Sécurisé » ne veut rien dire | « Paris » seul |
| « Alertes directes de chantier… en temps réel » | Les notifications push ne sont pas prévues | « Installez NobPay sur votre écran d'accueil » (alertes dans l'application) |
| « +4 500 $ » en vert pour une étape validée | Un paiement d'étape n'est pas un revenu | Montant neutre : « 4 500 $ libérés » |
| Montants à l'américaine (« $56,893.30 », « +$5,000.00 ») | Interface en français | « 56 893,30 $ » via `Intl.NumberFormat('fr-FR')` |
| « BTC Garanti » | « Garanti » est une promesse | (supprimer) |
| « Preuve on-chain prête » | Imprécis | « Preuve prête à valider » |
| « Fonds protégés en Bitcoin multi-sig », « validation de livrable certifiée » | Pas de multisig, aucune certification | « Chaque libération exige une preuve que vous validez » |
| Dates figées (« 14 Mai 2024 ») | Année passée | Dates générées (« il y a 3 jours ») |

Phrase d'appui validée : « Vos fonds restent en séquestre et ne sont libérés que sur preuve. »

## Données d'exemple (source unique)

Les écrans Stitch affichent trois totaux différents (56 893 $, 42 500 $, 25 000 $ de budget…).
Tous les chiffres de l'app seront calculés à partir de ce seul jeu de données :

Ce jeu de données est celui de `frontend/src/server/seed.ts` (les écrans Stitch ne servent plus de référence
pour les chiffres). Les montants affichés sont toujours recalculés depuis la base.

| Projet | Secteur | Budget | Libérés | En séquestre | Étape | Responsable |
|---|---|---|---|---|---|---|
| Résidence à Thiès | Immobilier | 24 000 $ | 6 000 $ | 18 000 $ | 3 sur 6 : Élévation des murs (preuve à valider) | Mamadou Diop |
| Pépinière à Kaolack | Agricole | 9 000 $ | 5 400 $ | 3 600 $ | 4 sur 5 : Récolte et stockage | Ousmane Ba |
| Import de stock à Dakar | Commerce | 5 000 $ | 1 000 $ | 4 000 $ | 2 sur 4 : Livraison du stock | Aïcha Fall |

- Totaux calculés : 25 600 $ en séquestre, 12 400 $ libérés, 38 000 $ de budget, 6 étapes payées sur 15.
- Progression = libérés ÷ budget (Villa 25 %, Champ 60 %, Boutique 20 %).
- Taux indicatif : 1 $ = 760 FCFA (25 600 $ ≈ 19 456 000 FCFA) ; 1 BTC ≈ 81 500 $ (réglables dans `.env`).
  Les entrées se font en Bitcoin Lightning ; le dépôt USDT/USDC est affiché « Bientôt ».
- Utilisatrice : Aminata Sow, France. Fournisseur : Quincaillerie Ndiaye, payé par Wave.
- Photos de couverture : `public/covers/*.jpg` (fournies par l'équipe) ; photos de preuve de démonstration : `public/demo/proof-*.jpg` ; titre foncier
  et facture de démonstration : `public/demo/*.svg`.

## Technique

- Pas de `user-scalable=no` ni `maximum-scale=1` (bloque le zoom, nuit à l'accessibilité).
- Ne pas enfermer une mise en page desktop dans `max-w-[480px]` (les exports « web » de Stitch le font).
- Ne pas référencer les images `lh3.googleusercontent.com` (liens Stitch qui peuvent expirer) :
  copier le fichier dans le dépôt.
- Une illustration ne doit contenir ni maquette d'interface ni texte (les deux images
  reçues jusqu'ici sont des captures de maquette avec du texte anglais).
- Tailwind par CDN seulement dans les maquettes ; le vrai projet compile Tailwind avec les mêmes tokens.
- Les drapeaux emoji s'affichent en lettres (« FR ») sous Windows : utiliser des drapeaux SVG.
- La liste « Pays de résidence » (5 pays) est trop courte pour une diaspora panafricaine : ajouter
  au minimum Italie, Espagne, Allemagne, Royaume-Uni, États-Unis, Canada, en plus des pays africains.
- Code SMS : pas de fournisseur SMS pour le hackathon, donc code de démonstration, indiqué comme tel.
- Marque : les écrans utilisent 4 emblèmes différents (assured_workload, lock_clock, éclair dans un
  cercle, éclair + logo). Proposition : garder uniquement `app/assets/nobpay-logo-stitch.png`
  (éclair bleu + « NobPay »).
