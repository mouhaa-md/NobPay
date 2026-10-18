# Parcours de démonstration (5 minutes)

> **Pour qui :** la personne qui présente NobPay au jury (en direct ou en vidéo). La vidéo de secours (4 min 20, sans voix, sous-titres en français) suit exactement ce parcours : `demo-video/nobpay-demo.webm` (non versionnée, voir « Régénérer la vidéo »).
> **Mode :** simulé (`BITNOB_MODE=mock`), compte de démonstration. Rien n'y est réel, et la présentation le dit à voix haute dès le début.

## Avant de commencer
- Base neuve : supprimer `frontend/.data/` ou Profil → « Réinitialiser les données ».
- `cd frontend && npm run build && npm start` (ou `npm run dev`), ouvrir `http://localhost:3000`.
- Fenêtre en 1280 × 720 pour que les écrans tiennent sans défiler, ou un téléphone en mode paysage pour la partie terrain.

## Déroulé

| Durée | Écran | Ce qu'on fait | Ce qu'on dit |
|---|---|---|---|
| 0:00 | Vitrine `/` | Faire défiler le héros, les chiffres, « Comment ça marche » | « La diaspora envoie des sommes énormes ; un transfert déplace l'argent mais n'en contrôle pas l'usage. Ces chiffres décrivent le marché, pas des résultats de NobPay. C'est un prototype du hackathon. » |
| 0:30 | Entrée | « Essayer la démo », puis « Essayer avec le compte démo » | « Aucun argent réel : Lightning et mobile money sont simulés. » |
| 0:40 | Accueil | Montrer le total en séquestre, les projets, « 1 preuve attend votre décision » | « Rien n'est payé sans l'accord du financeur. » |
| 0:50 | Projet → étape 3 | « Gérer le projet », cliquer « Élévation des murs » | « Chaque étape ne se paie que sur preuve : photos géolocalisées, facture, fournisseur à payer. » |
| 1:10 | Paiement | « Valider et payer », lire le devis (débit, taux, frais, montant reçu, durée de validité), « Confirmer et payer » | « Le devis expire ; le paiement part directement au fournisseur en mobile money. L'étape passe à payée par un webhook signé. » |
| 1:30 | Terrain `/terrain/demo-villa-thies` | Ajouter la photo et la facture, saisir le fournisseur, « Envoyer la preuve » | « La personne de confiance n'a pas de compte : un lien privé. Elle dit qui doit être payé. » |
| 2:20 | Nouveau projet | Commerce, nom, ville, budget, étapes, personne de confiance, « Créer le projet » | « Trois secteurs, des étapes proposées modifiables ; la somme des étapes doit égaler le budget. » |
| 3:00 | Financer | Montant au clavier, Lightning, « Générer la facture », « Simuler le paiement » | « Facture Lightning et QR. En démonstration elle n'est pas payable : on envoie à NobPay l'événement signé que Bitnob enverrait. » |
| 3:30 | Certificat | Montrer le registre, « Ancrer l'état actuel sur Bitcoin » | « Chaque événement s'ajoute à un registre enchaîné par hachage. Seule l'empreinte quitte l'application, via OpenTimestamps. » |
| 4:00 | Page publique | « Page publique » | « N'importe qui vérifie sans compte : le navigateur refait les calculs. L'ancrage est en attente d'un bloc Bitcoin, quelques heures. » |

## Ce qu'il faut dire pour rester honnête
- C'est un **prototype** ; le mode simulé n'utilise aucun argent réel. En sandbox Bitnob, le paiement mobile money a été exécuté de bout en bout, mais l'entrée Lightning n'a pas pu être payée (aucun moyen en sandbox) : elle est simulée et marquée comme telle dans le registre.
- L'ancrage prouve qu'un dossier **n'a pas changé** depuis une date ; il ne prouve pas qu'une photo montre le bon chantier : c'est le financeur qui en juge.
- La position et l'heure d'une photo sont **déclarées par le téléphone**.

## Régénérer la vidéo
Le script `docs/demo/record-demo.mjs` rejoue ce parcours dans Chromium et l'enregistre (sous-titres et curseur ajoutés par injection, aucune dépendance ajoutée au projet). Les instructions sont en tête du fichier. La vidéo n'est pas versionnée (poids) : le dossier `demo-video/` est ignoré par Git.
