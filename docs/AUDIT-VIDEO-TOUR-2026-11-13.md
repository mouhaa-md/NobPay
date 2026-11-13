# Audit de la vidéo « visite des cinq modèles » — 13 novembre 2026

> **Pour qui :** l'équipe NobPay, avant de publier la vidéo sur YouTube et dans Devpost.
> **Fichier audité :** `demo-video/nobpay-demo-tour-en.mp4` (non versionné, voir [DEMO-SCRIPT.md](DEMO-SCRIPT.md)) et ses sous-titres `nobpay-demo-tour-en.en.srt`.
> **Limite :** audit fait par l'assistant qui a fabriqué la vidéo, sur des images et des mesures ; **personne n'a écouté la voix**. Écoutez-la en entier avant de publier.

## 1. En bref

- **Aucune erreur visible à l'écran** : pas de page cassée, de message d'erreur, d'écran vide ni de montant incohérent sur les 128 images examinées (une toutes les 3 secondes) et sur les 43 images prises au début de chaque phrase de la voix.
- **Deux défauts de fond ont été trouvés et corrigés** : un chiffre exagéré dans la première phrase, et un long passage figé dans les étapes « facture seule ».
- **Un point reste à faire avant publication** : la phrase « les positions et les notes restent privées, seules des empreintes scellées sont publiées » n'est vraie sur le site en ligne qu'**après** la mise en ligne du correctif F-3 (voir §4).

## 2. Ce qui a été examiné

| Contrôle | Résultat |
|---|---|
| Format | 6 min 23, 1280 × 720, H.264 + AAC, 25 images par seconde |
| Son | −15,3 LUFS, crête −1,3 dBFS (pas d'écrêtage), musique 17 dB sous la voix et 23 dB pendant qu'elle parle |
| Voix | 43 phrases, 308 s de voix sur 383 s ; aucune phrase ne déborde sur la suivante ; plus long passage sans voix : 7 s |
| Sous-titres | 95 sous-titres au plus de 2 lignes de 42 caractères, sans chevauchement, lecture au plus de 22 caractères par seconde, alignés sur la voix (mêmes horloges) |
| Images | 128 images régulières + 43 images alignées sur la voix, comparées à la phrase dite |
| Affirmations | chaque phrase de la voix relue contre le code et l'écran (voir §3) |

## 3. Constats

| # | Constat | Gravité | Statut |
|---|---|---|---|
| V-1 | La voix disait « hundreds of billions of dollars » alors que le chiffre de la page d'accueil est **124,2 milliards** (IFAD, 2025). | Moyenne (exagération) | **Corrigé** : « over a hundred billion dollars » dans la voix, dans [DEVPOST-EN.md](DEVPOST-EN.md) et dans le guide des juges. **À vérifier :** l'ancienne vidéo « pitch » (nobpay-demo-pitch-en) et le texte déjà collé dans Devpost contiennent encore la formule si vous les gardez. |
| V-2 | « Photo positions and notes stay private: only sealed fingerprints are published » (voix de la vérification publique). Vrai dans le code (point F-3), **faux sur le site en ligne tant que ce correctif n'est pas déployé**. | Haute avant publication | **À faire** : voir §4 |
| V-3 | Sur les étapes « facture seule » (commerce, scolarité, réapprovisionnement), le script attendait un champ photo qui n'existe pas : écran figé 15 à 30 s et 32 s sans voix. | Moyenne | **Corrigé** (nouvel enregistrement) ; 7 phrases de voix ajoutées pour les étapes et les paiements des modèles 2 à 5 |
| V-4 | Sous-titres de 3 à 4 lignes sur les phrases longues. | Faible | **Corrigé** (phrases coupées à la virgule, 2 lignes au plus) |
| V-5 | Un premier enregistrement complet a échoué à cause d'une coupure réseau de la machine d'enregistrement (envoi de preuve figé). | Faible (outil) | **Corrigé** : le script vérifie l'état réel sur le serveur avant de recommencer |
| V-6 | Écrans fixes de 9 s environ (fenêtre du devis, page de reçu) et page d'accueil sans mouvement pendant les 12 premières secondes. | Cosmétique | Non corrigé, volontaire : le texte dit se déroule pendant ce temps |

## 4. Avant de publier : le point V-2

La vidéo a été enregistrée sur le site en ligne, **qui exécute la version déployée avant le correctif F-3**. Les nouveaux événements y contiennent encore la position des photos dans le dossier téléchargeable. Pour que la phrase soit vraie :

1. pousser les commits locaux (le correctif F-3 et les scripts) sur GitHub ;
2. **Render → Manual Deploy** ;
3. vérifier : ouvrir un dossier public du site et chercher `"lat"` dans le fichier téléchargeable (il ne doit plus y en avoir), ou demander à l'assistant de le faire (lecture seule).

Tant que ce n'est pas fait, retirer la phrase (« Photo positions… ») de la voix ou ne pas publier la vidéo.

## 5. Ce que la vidéo dit honnêtement

La voix annonce que les paiements sont **simulés**, que le chemin Lightning est testé avec un simulateur de portefeuille et **pas encore avec de vrais sats**, que la publication sur Nostr est coupée sur la démo gratuite, et la carte de fin répète « Payments in this demo are simulated ». **Interface en français, voix et sous-titres en anglais** : à écrire dans la description YouTube. La première étape de chaque modèle est jouée à l'écran ; **les étapes suivantes passent par les mêmes routes en coulisse** (le temps d'attente est coupé) : à écrire aussi dans la description.

## 6. Autres limites

- Prononciation de « Nob Pay » et « Open Timestamps » non vérifiée à l'oreille.
- Voix : Kokoro (Apache 2.0), générée en local. Musique : fabriquée par `docs/demo/voice/music.py`, aucun échantillon.
- Les données de la démo en ligne ont été remises à zéro après l'enregistrement.
