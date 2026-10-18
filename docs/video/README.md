# Vidéo de démonstration NobPay

Vidéo motion design de la plateforme, qui couvre tous les parcours clients. Elle est prévue pour être intégrée à la fin de la présentation Canva.

| Fichier | Contenu |
|---|---|
| `NobPay-demo.mp4` | La vidéo complète : voix off, musique d’ambiance très discrète et petits effets sonores. 1920 × 1080, 30 images/s, H.264 + AAC. |
| `NobPay-demo-voix-seule.mp4` | Les mêmes images avec la voix off seule, sans musique ni effets (à privilégier si vous ajoutez votre propre musique dans Canva). |
| `NobPay-voix-off.mp3` | La voix off seule, pour la réutiliser ailleurs. |
| `NobPay-demo-poster.png` | Image de couverture (le logo animé et la promesse). |
| `NobPay-demo.srt` | Les sous-titres français (un fichier standard, pour YouTube, LinkedIn ou un lecteur vidéo). |

## Parcours couverts (4 min 38)

1. **Le constat** : le chiffre de l’IFAD, le quart qui finance un projet, un virement qui ne prouve rien.
2. **Le principe** : séquestre, étapes, preuve, paiement direct, vérification.
3. **Parcours 1, le financeur** : compte par téléphone et code SMS, tableau de bord, création du projet (secteur, budget, étapes, personne de confiance), financement par facture Bitcoin Lightning.
4. **Parcours 2, la personne sur place** : lien privé WhatsApp, photo géolocalisée, fournisseur à payer, envoi de la preuve.
5. **Le financeur décide** : alerte, examen de la preuve, refus avec motif, devis en francs CFA, confirmation, paiement mobile money, notification signée.
6. **Parcours 3, le fournisseur** : lien de reçu sans compte.
7. **Parcours 4, la preuve** : registre enchaîné, ancrage Bitcoin avec OpenTimestamps, vérification publique.
8. **Parcours 5, l’administrateur** : tableau de bord en lecture seule et alertes.
9. **Sous le capot** : l’API Bitnob (Lightning, conversion, mobile money, webhooks signés).

Les écrans sont de vraies captures de l’application, en mode démonstration (paiements simulés). Les prénoms et les montants sont des exemples.

## Régénérer la vidéo

Le dossier `source/` contient tout le nécessaire : le texte de la voix off (`script.json`) et ses enregistrements, la timeline qui en découle (`timeline.js`), le moteur d’animation (`engine.js`, `lib.js`), les scènes (`sc-a.js`, `sc-b.js`, `sc-c.js`), les captures d’écran de l’application (`assets/shots`) et les scripts de rendu, de son et d’encodage. Chaque image est calculée à partir du temps seul : le rendu est donc identique à chaque exécution.

Prérequis : Node 22 ou plus, Microsoft Edge (ou la variable `EDGE`), ffmpeg (ou la variable `FFMPEG`).

```
cd docs/video/source
node render.mjs     # les images, environ 7 minutes (WORKERS=4 par défaut)
node audio.mjs      # voix off calée sur la timeline, effets, ambiance
node encode.mjs     # les MP4 dans out/
```

Pour changer un texte ou la voix : modifier `script.json`, relancer `VOICE=… RATE=… node tts.mjs` (après `npm install`), puis `node build-video.mjs`, qui recalcule la timeline. Pour refaire les captures d’écran : lancer l’application en mode `mock` sur le port 3002 avec un dossier de données vide, puis `node capture.mjs`.
