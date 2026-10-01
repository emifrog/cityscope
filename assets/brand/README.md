# Identité FireScape

Nom commercial : **FireScape** (un seul mot, F et S capitales). Signature : « La connaissance
opérationnelle du bâtiment. » Identité fournie par le porteur le 1er octobre 2026.

## Originaux

| Fichier                          | Contenu                                     | Sert à                                |
| -------------------------------- | ------------------------------------------- | ------------------------------------- |
| `firescape-mark.webp`            | pictogramme seul (flamme et bâtiment)       | favicon, icônes Android et iOS        |
| `firescape-logo-horizontal.webp` | pictogramme, nom et signature, en ligne     | en-tête et connexion du back-office   |
| `firescape-logo-stacked.webp`    | pictogramme au-dessus du nom                | connexion et démarrage de la tablette |
| `firescape-app-icon.png`         | rendu de référence de l’icône d’application | référence visuelle (non utilisé)      |

Ce sont des images matricielles sur fond blanc. `pnpm brand:assets` (`scripts/brand-assets.ts`) en tire
toutes les déclinaisons, qui sont versionnées : le blanc devient transparent, le marine devient blanc pour
les fonds marine, et les icônes sont recomposées pour les masques de chaque plateforme. Après le
remplacement d’un original, relancer la commande et vérifier le rendu (la découpe de la signature du logo
horizontal dépend de sa mise en page : `HORIZONTAL_TAGLINE` dans le script).

| Déclinaison                                         | Fichiers générés                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Favicon et icône Apple du back-office               | `apps/web/src/app/icon.png`, `apple-icon.png`                     |
| Logo du back-office (fond clair et fond marine)     | `apps/web/src/assets/brand/firescape-logo*.png`                   |
| Logo de la tablette (fond clair et fond marine)     | `apps/mobile/assets/brand/firescape-logo*.png`                    |
| Icône Android classique, adaptative et monochrome   | `apps/mobile/android/app/src/main/res/mipmap-*/ic_launcher*.png`  |
| Icônes iOS (opaques, coins dessinés par le système) | `apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/*.png` |

## Couleurs

| Jeton                   | Valeur    | Usage                                                                  |
| ----------------------- | --------- | ---------------------------------------------------------------------- |
| Marine                  | `#012B5C` | logo, barres d’application, couleur primaire                           |
| Orange                  | `#FE5002` | logo, repères, contours ; jamais sous un texte blanc (contraste 3,3:1) |
| Orange foncé (actions)  | `#C84300` | boutons principaux, texte orange sur fond blanc (4,9:1, WCAG AA)       |
| Orange profond (survol) | `#A33600` | survol des boutons principaux                                          |

Les jetons sont définis dans `packages/ui/src/styles/globals.css` (web) et
`apps/mobile/lib/src/core/theme/brand.dart` (mobile) ; le PDF ETARE reprend le marine et l’orange foncé.

## Règles d’usage

- Sur fond marine, le logo inversé (pictogramme et nom en blanc, flamme et « S » orange).
- Ne pas déformer, recolorer ni détourer le logo autrement que par le script.
- Le nom du produit reste lisible en texte réel (titres de pages, libellés d’application, textes
  alternatifs) ; sur le back-office, la signature est du texte réel sous le logo.
- Une version vectorielle (SVG ou PDF) des originaux reste à obtenir pour l’impression et les grands
  formats.
