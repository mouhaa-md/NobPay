# Parcours de démonstration (5 minutes)

> **Pour qui :** la personne qui présente NobPay au jury (en direct ou en vidéo). La vidéo de secours (4 min 20, sans voix, sous-titres en français) suit exactement ce parcours : `demo-video/nobpay-demo.webm` (non versionnée, voir « Régénérer la vidéo »).
> **Vidéo à sous-titres anglais (12 novembre 2026) :** `demo-video/nobpay-demo-en.webm` (4 min 28, sans voix, interface en français), enregistrée sur la démo en ligne avec `CAPS=en RECORD=1 RESET=1 node docs/demo/record-demo.mjs https://nobpay.onrender.com` (variables décrites en tête du script). `RESET=1` remet les données de démonstration à la fin.
> **Vidéo « pitch » avec voix et musique (12 novembre 2026) :** `demo-video/nobpay-demo-pitch-en.mp4` (2 min 37, interface en français, voix anglaise, musique originale très discrète), sa variante sans musique `nobpay-demo-pitch-en-nomusic.mp4` et les sous-titres `nobpay-demo-pitch-en.en.srt`. Le texte dit est dans `docs/demo/narration-en.json`. La voix est celle de Kokoro (82 M de paramètres, licence Apache 2.0, voix `af_heart`, la mieux notée du catalogue), générée en local, sans service en ligne ; la musique est fabriquée par `docs/demo/voice/music.py` (aucun échantillon, aucun droit à citer). Pour la refaire, dans un environnement virtuel Python (`pip install kokoro-onnx soundfile numpy imageio-ffmpeg`, plus `kokoro-v1.0.onnx` et `voices-v1.0.bin` depuis les versions « model-files-v1.0 » de `thewh1teagle/kokoro-onnx`) : `python docs/demo/voice/synth-en.py <modèle.onnx> <voix.bin> docs/demo/narration-en.json <dossier> af_heart 0.82` fabrique la voix (0,82 = environ 154 mots par minute) ; `OUTDIR=… NARR=<dossier> RESET=1 node docs/demo/record-pitch.mjs https://nobpay.onrender.com` enregistre l'écran, retire les temps d'attente du réseau et note l'instant de chaque phrase (`info.json`) ; `python docs/demo/voice/assemble-en.py <video.webm> <OUTDIR>/info.json <dossier> docs/demo/narration-en.json <sortie>` pose la voix et la musique (qui baisse quand la voix parle) et écrit les sous-titres ; `NO_MUSIC=1` donne la version sans musique.
> **Mode :** simulé (`BITNOB_MODE=mock`), compte de démonstration. Rien n'y est réel, et la présentation le dit à voix haute dès le début.

## Avant de commencer
- Base neuve : supprimer `frontend/.data/` ou Profil → « Réinitialiser les données ».
- `cd frontend && npm run build && npm start` (ou `npm run dev`), ouvrir `http://localhost:3000`.
- Fenêtre en 1280 × 720 pour que les écrans tiennent sans défiler, ou un téléphone en mode paysage pour la partie terrain.

## Déroulé

| Durée | Écran | Ce qu'on fait | Ce qu'on dit |
|---|---|---|---|
| 0:00 | Vitrine `/` | Faire défiler le héros, les chiffres, « Comment ça marche » | « La diaspora envoie des sommes énormes ; un transfert déplace l'argent mais n'en contrôle pas l'usage. Ces chiffres décrivent le marché, pas des résultats de NobPay. C'est un prototype open source. » |
| 0:30 | Entrée | « Essayer la démo », puis « Essayer avec le compte démo » | « Aucun argent réel : Lightning et mobile money sont simulés. » |
| 0:40 | Accueil | Montrer le total en séquestre, les projets, « 1 preuve attend votre décision » | « Rien n'est payé sans l'accord du financeur. » |
| 0:50 | Projet → étape 3 | « Gérer le projet », cliquer « Élévation des murs » | « Chaque étape ne se paie que sur preuve : photos géolocalisées, facture, fournisseur à payer. » |
| 1:10 | Paiement | « Valider et payer », lire le devis (débit, taux, frais, montant reçu, durée de validité), « Confirmer et payer » | « Le devis expire ; le paiement part directement au fournisseur en mobile money. L'étape passe à payée par un webhook signé. » |
| 1:30 | Terrain `/terrain/demo-villa-thies` | Ajouter la photo et la facture, saisir le fournisseur, « Envoyer la preuve » | « La personne de confiance n'a pas de compte : un lien privé. Elle dit qui doit être payé. » |
| 2:20 | Nouveau projet | Commerce, nom, ville, budget, étapes, personne de confiance, « Créer le projet » | « Trois secteurs, des étapes proposées modifiables ; la somme des étapes doit égaler le budget. » |
| 3:00 | Financer | Montant au clavier, Lightning, « Générer la facture », « Simuler le paiement » | « Facture Lightning et QR. En démonstration elle n'est pas payable : on envoie à NobPay l'événement signé que Bitnob enverrait. » |
| 3:30 | Certificat | Montrer le registre, « Ancrer l'état actuel sur Bitcoin » | « Chaque événement s'ajoute à un registre enchaîné par hachage. Seule l'empreinte quitte l'application, via OpenTimestamps. » |
| 4:00 | Page publique | « Page publique » | « N'importe qui vérifie sans compte : le navigateur refait les calculs. L'ancrage est en attente d'un bloc Bitcoin, quelques heures. » |

## Parcours « jury », avec de vrais sats (3 minutes, instance `LIGHTNING_RAIL=nwc`)

À faire avec **un portefeuille Lightning personnel** (pour payer la facture et fournir une adresse `nom@domaine`). L'application s'ouvre en anglais pour un navigateur anglophone (interrupteur de langue en haut de la page d'accueil).

| Étape | Ce qu'on fait | Ce qu'on dit |
|---|---|---|
| 1 | `/en` → « Open the app » → **« Try without an account »** (compte invité privé) | « Pas de numéro de téléphone : un compte privé reste dans ce navigateur. » |
| 2 | **New project** → **« Quick trial »** → « Create the project » | « Trois étapes de 5 $ : le parcours entier en quelques minutes. » |
| 3 | **« Fund now »** → régler la facture Lightning depuis votre portefeuille | « Le séquestre n'est crédité que lorsque le portefeuille confirme le paiement, au montant exact de la facture. » |
| 4 | Étape 1 → **« Or send the proof myself »** : une photo, une facture (n'importe quelle image), le fournisseur = **votre adresse Lightning** | « La personne sur place n'a pas de compte ; ici vous jouez les deux rôles. » |
| 5 | Retour côté financeur : lire **« To look at before paying »** ; si l'IA est activée, **« Ask for the AI's opinion »** | « Des contrôles sans IA d'abord ; l'IA lit, le code compare, c'est vous qui décidez. » |
| 6 | **« Approve and pay »** → devis en sats → confirmer ; ouvrir le **reçu** | « Les sats arrivent chez le fournisseur ; le reçu porte la preuve de paiement, la préimage. » |
| 7 | Projet → certificat → **ancrer** → **page publique** de vérification | « Le navigateur recalcule tout, interroge les relais Nostr et Bitcoin, sans nous. » |

À dire sans détour : c'est une **phase pilote** (montants plafonnés, séquestre tenu par l'opérateur de l'instance, pas un service financier agréé) ; les chemins Lightning, Nostr et IA ont été **testés avec des simulations** avant ce jour, et c'est la première fois avec de vrais sats si vous êtes le premier à le faire.

## Ce qu'il faut dire pour rester honnête
- C'est un **prototype** ; le mode simulé n'utilise aucun argent réel. En sandbox Bitnob, le paiement mobile money a été exécuté de bout en bout, mais l'entrée Lightning n'a pas pu être payée (aucun moyen en sandbox) : elle est simulée et marquée comme telle dans le registre.
- L'ancrage prouve qu'un dossier **n'a pas changé** depuis une date ; il ne prouve pas qu'une photo montre le bon chantier : c'est le financeur qui en juge.
- La position et l'heure d'une photo sont **déclarées par le téléphone**.

## Régénérer la vidéo
Le script `docs/demo/record-demo.mjs` rejoue ce parcours dans Chromium et l'enregistre (sous-titres et curseur ajoutés par injection, aucune dépendance ajoutée au projet). Les instructions sont en tête du fichier. La vidéo n'est pas versionnée (poids) : le dossier `demo-video/` est ignoré par Git.

## Vidéo avec voix (MP4, lisible sur WhatsApp)

`demo-video/nobpay-demo-voix.mp4` : 5 min 03, 1280 × 720, H.264 + AAC, **environ 11 Mo** (WhatsApp accepte les vidéos jusqu'à environ 16 Mo). Voix d'homme français de synthèse, **sans sous-titres** ; le curseur visible montre ce dont la voix parle. Le texte du commentaire est dans `docs/demo/narration-fr.json` (19 phrases, ton parlé ; « WhatsApp » y est écrit « Ouatsappe » pour que la voix le prononce correctement).

- **Fabrication :** `docs/demo/voice/synth.py` (voix locale Piper, aucun service en ligne), `docs/demo/record-demo-voix.mjs` (enregistrement synchronisé sur la durée de chaque phrase), `docs/demo/voice/assemble.py` (recalage son/image sur un éclair de calibration : écart mesuré de 0,04 s), puis `ffmpeg`.
- **Contrôles faits :** la piste son finale a été retranscrite par un modèle de reconnaissance vocale (Whisper) : **93 % de correspondance** avec le texte ; images extraites aux moments clés pour vérifier que l'écran correspond à la phrase. **La voix n'a pas été écoutée par un humain : écoutez-la en entier avant de la diffuser.**
- **Licence de la voix :** `fr_FR-tom-medium` est entraînée sur un jeu de données sous **AGPLv3** ([modèle](https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR/tom/medium)). Le son généré n'est en principe pas soumis à cette licence, mais le point n'est pas tranché juridiquement : pour une diffusion publique large, vérifiez ou utilisez `fr_FR-gilles-low` (**CC0**, sans contrainte, qualité un peu plus basse).
