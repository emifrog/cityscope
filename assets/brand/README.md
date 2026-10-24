# Identité FireScape

Nom commercial : **FireScape** (un seul mot, F et S capitales). Signature : « La connaissance
opérationnelle du bâtiment. » Identité vectorielle **version 2.0** fournie par le porteur le 24 octobre
2026 (pack « FireScape-Brand-Pack-v2.0 ») ; elle remplace les originaux matriciels du 1er octobre 2026
(logo marine et orange).

## Originaux

| Dossier    | Contenu                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------- |
| `svg/`     | 42 SVG maîtres : 7 compositions × 6 variantes de couleur (voir ci-dessous)               |
| `icons/`   | icône d’application (carré marine opaque), calques adaptatifs Android, favicon           |
| `tokens/`  | jetons de couleur du pack (`firescape.tokens.json`, `firescape.css`)                     |
| `fonts/`   | Barlow (licence OFL 1.1), police d’interface recommandée par le pack — **non appliquée** |
| `preview/` | planche de synthèse de l’identité                                                        |

Compositions : `primary` (pictogramme, nom et signature), `horizontal` (pictogramme et nom), `vertical`
(pictogramme au-dessus du nom et de la signature), `compact` (pictogramme simplifié et nom, pour les
petites tailles), `wordmark` (nom seul), `mark` (pictogramme seul), `mark-compact` (pictogramme simplifié :
trois volumes et une ligne de plan, lisible dès 16 px). Variantes : `color` (marine et teal, fonds blancs
ou clairs), `inverse` (blanc, « S » et plan en teal, fonds marine), `white`, `navy`, `black` (une couleur),
`dark` (inverse sur une plaque marine).

Le lettrage est vectorisé : aucune police n’est nécessaire pour afficher le logo ou sa signature.

## Déclinaisons générées

`pnpm brand:assets` (`scripts/brand-assets.ts`) rastérise les maîtres à la taille d’affichage (×3 pour les
écrans denses) ; les sorties sont versionnées. Relancer la commande après le remplacement d’un maître et
vérifier le rendu.

| Déclinaison                                           | Maître                                    | Fichiers générés                                                      |
| ----------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| Favicon du back-office                                | `icons/favicon.svg`                       | `apps/web/src/app/icon.png`                                           |
| Icône Apple du back-office                            | `icons/firescape-app-icon.svg`            | `apps/web/src/app/apple-icon.png`                                     |
| Logo de la carte de connexion (fond clair)            | `svg/firescape-horizontal-color.svg`      | `apps/web/src/assets/brand/firescape-logo.png`                        |
| Logo des barres marine du back-office et du portail   | `svg/firescape-compact-inverse.svg`       | `apps/web/src/assets/brand/firescape-logo-inverse.png`                |
| Logo de la tablette (connexion, fond clair)           | `svg/firescape-vertical-color.svg`        | `apps/mobile/assets/brand/firescape-logo.png`                         |
| Logo de la tablette (démarrage, fond marine)          | `svg/firescape-vertical-inverse.svg`      | `apps/mobile/assets/brand/firescape-logo-inverse.png`                 |
| Icône Android classique (carré marine arrondi)        | `icons/firescape-app-icon.svg`            | `apps/mobile/android/app/src/main/res/mipmap-*/ic_launcher.png`       |
| Calques adaptatifs Android (premier plan, monochrome) | `icons/firescape-adaptive-foreground.svg` | `…/mipmap-*/ic_launcher_foreground.png`, `ic_launcher_monochrome.png` |
| Icônes iOS (opaques, coins dessinés par le système)   | `icons/firescape-app-icon.svg`            | `apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/*.png`     |

Le fond de l’icône adaptative Android est le marine, déclaré dans `values/colors.xml`.

## Couleurs

| Jeton       | Valeur    | Usage                                                                                         |
| ----------- | --------- | --------------------------------------------------------------------------------------------- |
| Marine      | `#012B5C` | logo, barres d’application, couleur primaire, titres                                          |
| Teal marque | `#0E8A7A` | logo, repères, anneaux, bordures, grands éléments ; pas de texte courant (blanc dessus 4,3:1) |
| Teal action | `#0B7A75` | boutons principaux, liens, texte teal sur blanc (5,2:1, WCAG AA)                              |
| Survol      | `#075E5B` | survol des boutons principaux (7,6:1)                                                         |
| Blanc       | `#FFFFFF` | surfaces                                                                                      |
| Fond clair  | `#F7F9FA` | fond des pages                                                                                |

L’orange et le rouge sont réservés aux risques et aux alertes (jetons `important`, `critical`) : ils ne
font plus partie de la palette du logo.

Les jetons sont définis dans `packages/ui/src/styles/globals.css` (web) et
`apps/mobile/lib/src/core/theme/brand.dart` (mobile) ; le PDF ETARE (`packages/adapters/src/pdf/etare-pdf.ts`),
les e-mails d’authentification (`supabase/templates/`) et le fond de l’icône Android reprennent le marine
et le teal action.

## Règles d’usage

- Sur fond marine, la variante `inverse` ; jamais le logo couleur sur teal, ni la variante marine sur un
  fond sombre.
- Aux petites tailles (barres d’en-tête, favicon, icônes), la signature compacte ou le pictogramme
  compact ; le pictogramme complet (bâtiment et plan) à partir d’environ 48 px.
- Ne pas recomposer le logo ni sa signature avec une police ; ne pas déformer, recolorer ni détourer les
  maîtres autrement que par le script.
- Le nom du produit reste lisible en texte réel (titres de pages, libellés d’application, textes
  alternatifs) ; sur le back-office, la signature est du texte réel sous le logo.
- La police d’interface Barlow fournie par le pack n’est pas appliquée : les applications gardent leur
  police système (lisibilité terrain validée). Son adoption est une décision séparée.
