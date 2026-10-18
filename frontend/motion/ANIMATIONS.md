# NobPay · kit d'animations

Animations du site vitrine, reprises du comportement observé sur nexaris.com.
Le code et les illustrations sont **originaux** : seules les durées, courbes et
mécaniques ont été mesurées dans le CSS/JS public de ce site. Aucun fichier,
code, Lottie ou visuel de Nexaris n'est copié.

Voir le résultat : ouvrir `demo.html` dans un navigateur (aucune installation,
Lenis est fourni dans `vendor/`).

## 1. Ce que fait nexaris.com (inspection du 17 oct. 2026)

Site Webflow. Bibliothèques : Lenis 1.0.11 (défilement fluide), SplitType
(découpe du texte), Swiper 8 (slider), 8 fichiers Lottie, quelques `@keyframes`
CSS. Les « interactions » Webflow ne contiennent que 3 entrées, dont 2 ne
ciblent aucun élément de la page.

| Effet | Mécanique relevée | Notre version |
|---|---|---|
| Défilement fluide | Lenis : durée 1 s, ease-out expo, molette lissée, tactile natif, `touchMultiplier` 1.5, ancres fluides | `initSmoothScroll()` (mêmes valeurs) |
| Titres | Mots : opacité 0→1, flou 0.6rem→0, échelle 1.2→1, 0.6 s, décalage 100 ms, déclenché une fois à l'entrée dans l'écran (marge basse 5 %) | `data-nm-reveal="words"` |
| Paragraphes | Lignes : monte de 2rem + fondu, 0.6 s, décalage 100 ms (marge 10 %) | `data-nm-reveal="lines"` |
| Pièces du hero | Lévitation CSS : −2 % sur 6 s / −1 % sur 5 s, `ease-in-out`, en boucle | `data-nm-float="a" / "b"` |
| Parallaxe du hero | Au scroll, chaque pièce monte de 20 / 40 / 10 / 80 % de sa hauteur (lissage 50) | `data-nm-parallax="-20"` (+ `data-nm-parallax-root`) |
| Grain | GIF de bruit à 8 % d'opacité sur hero, section bleue et pied de page | `.nm-grain` (bruit SVG maison, vacillement ~5 i/s) |
| Bouton | Survol 0.4 s : fond bleu → blanc, texte sombre, lueur intérieure | `.nm-btn--swap` |
| Réseaux sociaux | Survol 0.2 s : fond → couleur d'accent | `.nm-social` |
| Onglets + slider | Swiper en boucle, 4 s par slide, 0.5 s de transition, barre de progression linéaire, onglet actif en pleine opacité | `data-nm-tabs` |
| Cartes bento (Lottie) | 1 : 3 pastilles qui échangent leur place (cubic 0.65,0,0.35,1, 4 s). 2 : 4 tuiles en pendule ±7 à 14° (sine, ~5 s). 3 : points en orbite linéaire sur arcs concentriques (~6 s). 4 : pile de cartes qui défile (1 s de mouvement toutes les 1.5 s) | `.nm-pucks`, `.nm-swing`, `.nm-orbits`, `.nm-stack` |
| Illustration « solution » (Lottie) | Pièce qui flotte, flèche qui bouge, plateforme qui s'incline (3 s) | `.nm-toggle` |
| Illustrations d'onglets (Lottie) | Anneaux qui s'étendent de 84 à 209 % en tournant (0.8 s d'écart, 3 s chacun) | `.nm-ripple` |

Non reproduits : deux Lottie (liste 2 et 3) sont des suites d'images (580 et 98
images), donc quasi des vidéos. Les illustrations viendront du design Stitch.

## 2. API

```html
<link rel="stylesheet" href="nobpay-motion.css">
<script src="vendor/lenis.min.js"></script>      <!-- optionnel -->
<script src="nobpay-motion.js"></script>
<script>NobPayMotion.init()</script>             <!-- { smoothScroll, reveal, parallax, tabs } -->
```

- `data-nm-reveal="words|lines"`, `data-nm-margin` (%), `data-nm-delay` (ms).
- `data-nm-parallax-root` sur la section, `data-nm-parallax="-40"` sur chaque élément
  (translation finale en % de sa hauteur). Ne jamais mettre `data-nm-float` sur le même
  nœud : mettre la lévitation sur un élément interne.
- `data-nm-tabs data-nm-delay="4000"` avec `data-nm-tab` et `data-nm-panel` (même nombre).
- Sans JavaScript tout reste visible. `prefers-reduced-motion` : états finaux, pas de boucles.

## 3. Intégration Next.js (quand le projet sera créé)

```tsx
// app/(site)/motion-provider.tsx
'use client'
import { useEffect } from 'react'
import Lenis from 'lenis'
import NobPayMotion from '@/motion/nobpay-motion'
import '@/motion/nobpay-motion.css'

export function MotionProvider() {
  useEffect(() => {
    ;(window as any).Lenis = Lenis
    const m = NobPayMotion.init()
    return () => m.destroy()
  }, [])
  return null
}
```
Dans `<head>` : `document.documentElement.classList.add('nm-js')` via un script inline
(évite l'éclair de texte avant la découpe).

## 4. Points d'attention

- Les illustrations en CSS (`.nm-pucks`, etc.) ne fournissent que le mouvement : le dessin
  final est celui des écrans Stitch.
- La barre de progression des onglets se remplit exactement en 4 s (sur nexaris.com elle
  dure 4.3 s pour un changement à 4 s : la barre n'atteint pas 100 %).
- Lenis 1.1.20 (MIT) est fourni ici ; nexaris.com utilise la 1.0.11.
- La parallaxe est calculée sur la progression du scroll dans la section (0 en haut de la
  page, 1 quand la section est sortie), avec un lissage exponentiel de 0.12.

## 5. Vérification

Testé dans Edge (headless, pilotage par le protocole DevTools), en 1440×900 et
390×844 : titres révélés au chargement et au scroll, parallaxe à 70 % du hero =
−14 / −28 / −7 / −56 % (= 0.7 × 20/40/10/80), onglets qui passent seuls de 1 à 2
puis 3, toutes les boucles CSS actives, aucune erreur de console.
