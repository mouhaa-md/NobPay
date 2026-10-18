# Logo NobPay

Le logo se lit « nobpay » : le **n** est une arche de pierre dont la **clé de voûte** est orange. Une arche ne tient que par sa clé de voûte ; NobPay ne libère l'argent que lorsque la preuve est posée.

- Rive de départ : la diaspora, qui finance.
- Clé de voûte : la preuve (photos, facture, ancrage sur Bitcoin).
- Rive d'arrivée : le projet au pays, dont le fournisseur est payé.

Planche complète (idée, construction, couleurs, déclinaisons, usages) : [nobpay-identite-visuelle.pdf](nobpay-identite-visuelle.pdf).

## Fichiers

| Usage | Fichier |
|---|---|
| Logo principal (fond clair) | `nobpay-logo.svg` · `.png` (2400 px, fond transparent) |
| Logo sur fond sombre ou bleu | `nobpay-logo-white.svg` · `.png` |
| Logo en une couleur (tampon, fax, gravure) | `nobpay-logo-mono.svg`, `nobpay-logo-mono-white.svg` |
| Logo bleu (interface, fond clair) | `nobpay-logo-blue.svg` |
| Logo sous 120 px de large | `nobpay-logo-small.svg`, `nobpay-logo-small-white.svg` (fentes élargies) |
| Symbole seul (l'arche) | `nobpay-symbol.svg` · `.png`, `nobpay-symbol-white.svg` · `.png`, `nobpay-symbol-mono*.svg` |
| Symbole sous 24 px | `nobpay-symbol-small.svg`, `nobpay-symbol-small-white.svg` |
| Icône d'application | `nobpay-app-icon.svg`, `nobpay-app-icon-1024.png` |
| Icônes PWA | `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` |
| Favicon | `favicon.svg`, `favicon.ico` (16, 32, 48 px) |

Tous les SVG sont des tracés (aucune police à installer) et font environ 1 Ko.

## Couleurs

| Nom | Hex | Rôle |
|---|---|---|
| Encre | `#0B132B` | le mot, les fonds sombres |
| Blanc | `#FFFFFF` | les fonds clairs, le mot sur encre |
| Orange clé de voûte | `#F7931A` | la preuve, rien d'autre |
| Bleu interface | `#1D4ED8` | couleur d'action de l'application (déjà dans l'interface) |

Règle proposée : l'orange est réservé à la preuve (clé de voûte du logo ; dans l'application, ce qui est vérifié). Contrastes : blanc sur encre 18,4:1, orange sur encre 8,0:1, orange sur blanc 2,3:1. Sur fond clair, l'orange est une forme, jamais du texte.

## Règles d'usage

- **Espace de protection :** au moins la moitié de la hauteur d'x (la hauteur du « o ») autour du logo.
- **Tailles minimales :** logo 80 px de large (version *small* sous 120 px) ; symbole 16 px (version *small* sous 24 px).
- **À ne pas faire :** déformer, changer la couleur de la clé, ajouter ombre ou dégradé, incliner, recomposer le mot dans une autre police, poser sur une image chargée.
- **Dans un texte,** la marque s'écrit « NobPay ». Le logo, lui, est en minuscules.

## Construction

Dessiné sur une hauteur d'x de 100 unités : trait de 17 u, anneau des lettres rondes R 51,5 / r 34,5, arche R 48 / r 31, clé de voûte de 44° séparée par des fentes de 3,5 u. Les lettres rondes dépassent de 1,5 u la ligne de base et la hauteur d'x (correction optique).

## Ce qui reste à faire

Ces fichiers ne sont **pas encore branchés** dans l'application ni dans le site : le composant `Logo` (`frontend/src/components/ui/Logo.tsx`) affiche toujours l'ancien éclair, et les icônes de `frontend/public/icons` (PWA, apple-touch-icon) ainsi que `frontend/public/brand/nobpay-logo.png` sont les anciennes.
