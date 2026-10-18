# Audit du design : responsive, accessibilité, performance, cohérence

> **Date :** 18 octobre 2026. **Portée :** les 20 écrans de l'application (vitrine, connexion, tableau de bord, projets, étapes, financement, assistant de création, portefeuille, profil, notifications, certificat, espace terrain, vérification publique, page 404) en version de **production**, mode simulé, données de démonstration.
> **Pour qui :** le chef de projet (propriétaire du frontend) et toute personne qui retouche les écrans.
> **Statut des chiffres :** tous les chiffres ci-dessous ont été **mesurés** dans un navigateur réel (Chromium 156), pas estimés. Les jugements (notes, priorités) sont les miens. Ce que je n'ai **pas** pu vérifier est listé en fin de document.

## 1. En bref

| Axe | Note | En une phrase |
|---|---|---|
| Responsive | **9 / 10** | Aucun débordement horizontal sur 20 écrans × 9 largeurs (320 à 1920 px). Il manque une vraie mise en page **tablette** (768–1023 px). |
| Accessibilité | **6,5 / 10** | Base saine (focus visible partout, mouvement réduit respecté, `lang`, titres), mais 3 défauts « critiques » d'axe-core, des contrastes limites et pas de lien d'évitement. Tout se corrige vite. |
| Performance | **9 / 10** en connexion rapide, **5 / 10** sur réseau mobile lent | Une **seule police d'icônes pèse 1,1 Mo** et se charge sur chaque page. C'est le problème n° 1. |
| Cohérence visuelle | **8 / 10** | Hiérarchie claire, composants homogènes, belle mise en page ordinateur. 148 couleurs écrites en dur hors de la charte. |
| Contenu et honnêteté | **9 / 10** | Un seul mot interdit par les règles de rédaction (« garanti »). |

**Les 5 corrections qui rapportent le plus** (détail § 4) : sous-ensemble de la police d'icônes (−1,1 Mo), contrastes de 3 couleurs, noms accessibles manquants (champs fichier, barres de progression), lien d'évitement + un seul `h1` et un seul `main` par page, mise en page tablette.

## 2. Méthode

- **Parc de test :** 20 écrans × 9 largeurs (320, 375, 390, 430, 768, 1024, 1280, 1440, 1920 px) = 180 cas, Chromium headless, version `next build` de production en mode simulé.
- **Mesures automatiques par cas :** débordement horizontal, taille des zones tactiles (seuil 44 px, plancher WCAG 2.2 : 24 px), tailles de texte, images (cassées, sans `alt`, surdimensionnées), structure (`h1`, `main`, niveaux de titres, `lang`, `title`, `viewport`), décalage de mise en page (CLS), LCP/FCP, poids par type de ressource, erreurs console, et **axe-core 4.10** (WCAG 2.0/2.1/2.2 A et AA + bonnes pratiques) sur 4 largeurs.
- **Essais ciblés :** navigation au clavier (25 à 28 tabulations sur 8 parcours), mouvement réduit, texte agrandi à 200 %, mode sombre, paysage, PWA et hors ligne, écrans d'état (devis, facture, assistant), et **réseau mobile lent** (Slow 4G, processeur 4× plus lent).
- **Revue visuelle :** une trentaine de captures regardées une à une (mobile 375, tablette 768, ordinateur 1280).
- **Audit statique du code :** contrastes de la charte, règles de rédaction, focus, mouvement réduit, zones sûres, couleurs en dur.

## 3. Ce qui est déjà très bien

- **Responsive solide.** Zéro défilement horizontal sur les 180 cas ; texte à 200 % sans débordement sur 3 écrans sur 4 ; paysage téléphone sans débordement ; zones sûres iOS gérées (17 usages) et `viewport-fit=cover`.
- **Clavier.** Sur 8 parcours (connexion, accueil, étape, vitrine, mobile et ordinateur), **100 % des éléments focalisés ont un anneau de focus visible**, aucun n'est hors écran, l'ordre est logique.
- **Mouvement réduit respecté :** la vitrine passe de 14 animations infinies à 0 avec `prefers-reduced-motion`.
- **Robustesse :** 0 erreur console, 0 image cassée, 0 réponse 4xx/5xx, 0 erreur de script sur 180 cas.
- **Structure de base :** `lang="fr"`, titres de page uniques et parlants, `viewport` sans blocage du zoom, icônes masquées aux lecteurs d'écran (`aria-hidden`).
- **PWA complète :** manifeste avec raccourcis et icône « maskable », service worker enregistré, page hors ligne présente.
- **Performance en connexion rapide :** LCP de 48 à 390 ms, JavaScript de 295 à 370 Ko, 16 écrans sur 20 avec un CLS « bon » (< 0,1).
- **Conception.** Hiérarchie nette (un geste principal par écran), feuille de confirmation de paiement exemplaire (débit, taux, frais, montant reçu, devis chronométré, « un paiement confirmé ne peut pas être annulé »), pavé numérique de financement aux grandes touches, écran terrain très lisible, mise en page ordinateur (barre latérale + deux colonnes) soignée.
- **Contenu honnête :** prototype annoncé sur la vitrine, chiffres de marché sourcés, limites dites.

## 4. Constats et corrections, par priorité

Priorités : **P1** à corriger avant d'exposer l'application ; **P2** important ; **P3** confort. Effort : **S** < 1 h, **M** quelques heures, **L** une journée ou plus.

### P1

**1. Performance : une police d'icônes de 1,1 Mo sur chaque page.** *(effort M)*
- Preuve : `material-symbols-outlined-latin-…woff2` = **1 112 Ko**, soit 55 à 65 % du poids de chaque page (1,7 à 2,0 Mo au total). Sur Slow 4G + processeur 4× plus lent : FCP 0,7 à 0,9 s, mais **chargement complet de 8 à 9,5 s**. L'application n'utilise que **82 icônes** sur environ 3 000.
- Correction : ne charger que les 82 icônes (sous-ensemble de la police, quelques dizaines de Ko) ou passer à des SVG en ligne. Gain attendu : −1,1 Mo par page, soit plus de la moitié du poids. Bonus : les 4 écrans dont le CLS dépasse 0,1 (voir 9) devraient redescendre, car la police tardive décale le texte.

**2. Accessibilité : noms accessibles manquants (3 règles « critiques » ou « sérieuses » d'axe-core).** *(effort S)*
- Champs fichier de l'**espace terrain** (`input[capture]`, `input[multiple]`, facture) sans étiquette : un lecteur d'écran annonce « champ sans nom ». Ajouter `aria-label` (« Prendre une photo », « Choisir dans la galerie », « Ajouter la facture »).
- **Barres de progression** sans nom (cartes projet de l'accueil et de la liste, 3 écrans) : ajouter `aria-label="Avancement : 25 %"` (ou `aria-valuenow` + nom).
- `role="tablist"` de la vitrine avec des enfants `aria-hidden` : revoir ou retirer le rôle (`aria-required-children`).

**3. Contrastes insuffisants (5 couples de couleurs, 8 écrans sur 20).** *(effort S)*

| Couleur | Ratio | Où | Correction proposée |
|---|---|---|---|
| Blanc sur orange Bitcoin `#F7931A` | **2,29 : 1** | bouton « Ancrer l'état actuel sur Bitcoin » (certificat) ; la couleur sert 12 fois dans le code : vérifier chaque usage avec du texte blanc | texte `#2D1600` (ratio supérieur à 7) ou fond `#B45309` (blanc dessus : 5,0 : 1, déjà utilisé ailleurs) |
| `outline` `#747686` (texte 11–12 px) | 4,27 à 4,48 : 1 | placeholders, libellés secondaires (inscription, terrain, accueil, projets, étape) | assombrir le jeton `outline` à `#6B6D7E` (≥ 4,7 : 1) pour le **texte** ; garder l'actuel pour les bordures |
| `on-surface-variant` à 70 % | 4,05 : 1 | accueil (« Total en séquestre ») | retirer l'opacité |
| Vert `#16A34A` sur blanc | 3,30 : 1 (calcul sur la charte, **non signalé par axe-core** sur les écrans testés) | 18 usages : à vérifier partout où il colore du **texte** (les icônes et les gros chiffres sont tolérés à 3 : 1) | `#15803D` (5,0 : 1) pour le texte (déjà présent dans le code, 15 usages) |
| Liens dans un paragraphe, soulignement absent | 1,07 : 1 avec le texte voisin | vitrine (sources ONU Info / IFAD) | souligner les liens |

**4. Pas de lien d'évitement et structure incohérente.** *(effort S)*
- Aucun lien « Aller au contenu » : la 1ʳᵉ tabulation tombe sur le logo (ou la flèche de retour), puis sur toute la navigation avant d'atteindre le contenu (WCAG 2.4.1).
- **`h1` absent** sur l'accueil et sur l'écran de bienvenue (et d'autres écrans à certaines largeurs) ; **deux `main`** sur l'accueil et la liste des projets (le gabarit et la page en déclarent chacun un) ; **deux bandeaux (`banner`)** sur ordinateur dans le financement et l'assistant (barre latérale + barre du haut) ; un saut de niveau de titre (`h3` sans `h2`) dans la liste des projets.
- **Page 404** : c'est la page par défaut de Next.js, en **anglais** (« 404: This page could not be found. »), sans marque, sans `main`, sans lien de retour. Créer `not-found.tsx` en français avec « Retour à l'accueil ».

**5. Texte trop petit : beaucoup de 11 px.** *(effort M)*
- Nombre de textes à 11 px sur mobile : certificat **98**, portefeuille **40**, étape payée 34, accueil 30, projet 28, projets 25, étape à valider 23. Ce sont des libellés (« En séquestre », « Libéré », « Preuves attendues », statuts, empreintes).
- Correction : plancher à **12 px**, et **13 px** pour les libellés qui portent une information (montant, statut). Définir un jeton `text-label-xs` unique au lieu de valeurs éparses.

### P2

**6. Pas de mise en page tablette (768 à 1023 px).** *(effort M à L)*
- Constat : de 320 à 1023 px l'application affiche la colonne téléphone (480 px) centrée, avec de grandes marges bleues ; la mise en page ordinateur n'arrive qu'à 1024 px (212 usages du préfixe `lg:` contre 4 de `md:`). À 768 px (iPad portrait) un tiers de l'écran est vide ; en **paysage téléphone** (844 × 390) l'en-tête de 65 px mange 17 % de la hauteur et la colonne reste à 480 px.
- Correction : appliquer la mise en page à deux colonnes dès `md` (768 px) pour l'accueil, les projets et l'étape ; ou au minimum élargir la colonne à 640 px et réduire la hauteur des en-têtes en paysage.

**7. Zones tactiles sous 44 px.** *(effort S à M)*

| Élément | Taille mesurée | Écrans |
|---|---|---|
| Bascule « afficher/masquer le montant » (œil) | **17 × 17** | accueil |
| Lien « Vérifier un dossier sans compte » | 193 × **16** | bienvenue |
| « Choisir dans la galerie » | 120 × **16** | terrain |
| Lien des coordonnées GPS d'une photo | 154 × **14** | étape |
| `summary` « Empreintes des fichiers » | 330 × 22 | étape |
| Cloche de notifications | **36 × 36** | accueil, projets, portefeuille, profil |
| Logo (lien d'accueil) | 95 × 27 | projets, portefeuille, profil |
| « Envoyer le lien », « Copier » | 136 × 36, 87 × 36 | projet |

Correction : agrandir la zone cliquable (marge intérieure ou pseudo-élément) à 44 × 44 px sans changer l'aspect. Plusieurs éléments passent sous le plancher WCAG 2.2 (24 px) : l'œil, et les liens de 14 à 16 px de haut.

**8. Informations tronquées sur mobile (375 px).** *(effort S)*
- L'activité récente coupe les titres (« Preuve en attente de… », « Financement reçu… », « Paiement fournisse… ») pour laisser la place au montant ; le portefeuille coupe le détail des versements (« Bitcoin Lightning · 6 134 9… »).
- Correction : autoriser deux lignes pour les titres, ou placer le montant sous le titre sur petit écran.

**9. Décalage de mise en page (CLS) légèrement trop haut sur 4 écrans.** *(effort S après le point 1)*
- Certificat **0,103**, étape à valider **0,108**, profil **0,108**, projets **0,106** (seuil « bon » : 0,1). Probablement la police d'icônes qui arrive après le texte et les images de couverture sans dimensions réservées. À réévaluer après le point 1 ; sinon réserver `width`/`height` aux images.

**10. Images de couverture surdimensionnées.** *(effort S)*
- `covers/*.jpg` de 777 à 871 px de large affichées à **64 px** (vignettes des listes et de l'assistant) : 244 Ko sur 4 écrans. Générer des vignettes de 160 px (WebP) pour les listes.

**11. Règle de rédaction non respectée.** *(effort S)*
- « **Devis garanti** encore 0:58 » dans la feuille de confirmation : « garanti » est interdit par `design-reference/COPY-RULES.md`. Écrire « Devis **valable** encore 0:58 ». C'est le seul écart relevé sur l'ensemble du code des écrans. **Corrigé** (une ligne dans `ReleasePanel.tsx`) lors de l'enregistrement de la vidéo de démonstration.

**12. Assistant de création : débordement à 200 % de texte.** *(effort S)*
- Seul écran sur 4 testés qui déborde (441 px pour 390) quand le texte est agrandi : l'écran d'ouverture de l'assistant (choix du secteur). Vérifier les largeurs minimales des cartes de secteur ; les écrans suivants de l'assistant n'ont pas été testés à 200 %.

### P3

**13. Vitrine très longue sur mobile :** 18 494 px de haut à 390 px (environ 22 écrans). Une animation de révélation floute encore un titre au milieu du défilement (« vos *projets* au… » à demi lisible) : prévoir un état final lisible sans animation, ou réduire la durée.

**14. Pas de mode sombre :** l'arrière-plan reste `#F8F9FF` quand le système demande le sombre. À assumer (le dire) ou à planifier ; non bloquant.

**15. 148 couleurs écrites en dur** (`bg-[#16A34A]`…) en plus de la charte : vert `#16A34A` ×18 et `#15803D` ×15, ambres `#B45309`, `#C26700`, `#FEF3C7`, orange `#F7931A` ×12, `#0A0F24` ×8. Créer des jetons `success`, `warning`, `bitcoin` dans `tailwind.config.ts` : cohérence, et correction des contrastes (point 3) en un seul endroit.

**16. État désactivé peu lisible :** le bouton « Continuer » du pavé numérique à 0 $ est très pâle ; ajouter une aide (« Saisissez un montant d'au moins 5 $ »).

## 5. Plan d'action proposé

| Quand | Quoi | Effort total |
|---|---|---|
| **Avant la démonstration** (1 à 2 h) | points 2, 3, 4 (lien d'évitement, `h1`, `main`, 404), 11 ; soulignement des liens | S |
| **Cette semaine** (une demi-journée) | point 1 (icônes), 5 (11 → 12 px), 7 (zones tactiles), 8, 10, 12 | M |
| **Après le Demo Day** | point 6 (tablette), 15 (jetons de couleur), 13, 14, 16 | L |

Après les corrections : relancer le même audit (le script d'audit est reproductible, voir § 7) et viser **0 violation « critical » ou « serious » d'axe-core**, **CLS < 0,1 partout**, **chargement complet < 4 s sur Slow 4G**.

## 6. Ce que je n'ai pas pu vérifier

- **Safari / iOS, Firefox, vrais téléphones** (Chromium uniquement ; pas de test des barres d'adresse mobiles, du clavier virtuel, de l'installation PWA sur écran d'accueil).
- **Lecteurs d'écran réels** (VoiceOver, TalkBack) : seul axe-core (qui ne détecte qu'une partie des problèmes d'accessibilité) et la lecture du code. Un essai manuel du parcours de paiement reste nécessaire.
- **Score Lighthouse officiel**, mode contraste élevé de Windows, simulation de daltonisme, impression, langues droite-à-gauche.
- **Cas de données extrêmes :** noms très longs, 12 étapes, 100 projets, montants à 7 chiffres.
- **États d'erreur et de chargement** au-delà de ceux atteints (hors ligne en cours d'usage, échec réseau pendant un paiement).
- Le **mode sandbox** (mêmes écrans, textes légèrement différents) n'a pas été re-parcouru en entier.

## 7. Annexe : mesures détaillées

### Zones tactiles < 44 px et texte < 12 px, à 390 px (interactifs : petits / sous 24 px ; textes à 11 px)

| Écran | Petits | < 24 px | Éléments interactifs | Textes à 11 px |
|---|---|---|---|---|
| vitrine | 1 | 0 | 22 | – |
| bienvenue | 1 | 1 | 4 | 2 |
| connexion / inscription | 1 / 1 | 0 / 0 | 6 / 7 | – / 1 |
| accueil | 3 | 2 | 22 | 30 |
| projets | 10 | 3 | 19 | 25 |
| projet | 4 | 2 | 13 | 28 |
| étape à valider | 3 | 3 | 8 | 23 |
| étape payée | 3 | 3 | 6 | 34 |
| financer | 0 | 0 | 13 | – |
| nouveau projet | 0 | 0 | 6 | 1 |
| portefeuille | 3 | 0 | 11 | 40 |
| profil | 9 | 3 | 17 | 10 |
| notifications | 0 | 0 | 20 | 14 |
| certificat | 0 | 0 | 15 | **98** |
| terrain (3 variantes) | 0 à 2 | 0 à 1 | 0 à 11 | 8 à 13 |
| vérification publique | 5 | 0 | 6 | 1 |

### Règles axe-core en échec (agrégées sur 20 écrans × 4 largeurs)

| Impact | Règle | Écrans touchés |
|---|---|---|
| critique | `label` (champ sans étiquette) | 3 / 20 |
| critique | `aria-required-children` | 1 / 20 (vitrine) |
| sérieux | `color-contrast` | 8 / 20 |
| sérieux | `aria-progressbar-name` | 3 / 20 |
| sérieux | `link-in-text-block` | 1 / 20 (vitrine) |
| modéré | `page-has-heading-one` | 4 / 20 |
| modéré | `region`, `landmark-no-duplicate-banner`, `landmark-unique`, `heading-order`, `landmark-one-main` | 1 à 2 / 20 chacune |

### Performance, version de production, sans limitation (390 px / 1280 px)

| Mesure | Plage sur 20 écrans |
|---|---|
| LCP | 48 à 296 ms (mobile), 52 à 388 ms (ordinateur) |
| JavaScript transféré | 295 à 367 Ko |
| CSS | 61 à 77 Ko |
| Polices | ≈ 1 260 Ko (dont 1 112 Ko d'icônes) |
| CLS | 0 à 0,108 (16 écrans sous 0,1) |

Sur **Slow 4G + processeur 4× plus lent**, 390 px : FCP 0,70 à 0,86 s ; LCP 0,72 à 2,2 s ; chargement complet **8,1 à 9,5 s** ; poids total 1,67 à 2,01 Mo.

### Contrastes de la charte (WCAG : texte 4,5 : 1, grand texte et composants 3 : 1)

OK : `on-surface` sur fond 16,3 ; `on-surface-variant` 8,9 ; `primary` 9,2 ; blanc sur `primary-container` 6,7 ; texte d'avertissement 13,2 ; erreur 6,2. À corriger : `outline` 4,27 (texte) ; blanc sur `#F7931A` **2,29** ; `#16A34A` sur blanc 3,30 (texte) ; bordure `outline-variant` 1,62 (acceptable pour un décor, pas pour la bordure d'un champ si le champ n'a pas de fond distinct).

### Reproduire l'audit

Le script (Playwright + axe-core) et la méthode sont décrits au § 2 ; lancer une version de production en mode simulé (`BITNOB_MODE=mock`), puis parcourir les 20 adresses listées sur 9 largeurs. Les captures de cet audit ne sont pas versionnées (poids) ; elles se régénèrent avec le script.
