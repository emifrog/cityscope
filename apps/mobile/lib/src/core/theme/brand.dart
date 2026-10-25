import 'package:material_ui/material_ui.dart';

/// Identité visuelle FireScape, centralisée ici.
///
/// Les logos sont générés par `pnpm brand:assets` depuis les SVG maîtres de
/// `assets/brand/` à la racine du dépôt (identité 2.0) ; les couleurs
/// reprennent les jetons partagés avec l'application web.
abstract final class Brand {
  /// Nom commercial du produit.
  static const productName = 'FireScape';

  /// Signature de la marque.
  static const tagline = 'La connaissance opérationnelle du bâtiment.';

  /// Sous-titre de l'application mobile opérationnelle.
  static const appSubtitle = 'Application opérationnelle';

  /// Signature verticale (pictogramme, nom, baseline) pour fond clair.
  static const logoAsset = 'assets/brand/firescape-logo.png';

  /// Même signature pour fond marine (blanc, « S » et plan en teal).
  static const logoInverseAsset = 'assets/brand/firescape-logo-inverse.png';

  /// Police de l'interface, embarquée (`pubspec.yaml`, `assets/brand/fonts/`).
  static const fontFamily = 'Barlow';
}

/// Palette de marque (jetons partagés web / mobile).
abstract final class BrandColors {
  /// Marine du logo : barres d'application, couleur primaire.
  static const navy = Color(0xFF012B5C);

  /// Teal de marque : repères, anneaux, grands éléments. Pas de texte courant
  /// dessus (blanc à 4,3:1) : les actions utilisent [accentStrong].
  static const accent = Color(0xFF0E8A7A);

  /// Teal action des boutons principaux : texte blanc à 5,2:1 (WCAG AA).
  static const accentStrong = Color(0xFF0B7A75);

  /// Fond clair de la marque.
  static const background = Color(0xFFF7F9FA);
  static const surface = Color(0xFFFFFFFF);
  static const text = Color(0xFF0F172A);
  static const textMuted = Color(0xFF475569);
  static const border = Color(0xFFCBD5E1);

  /// Fond discret des pictogrammes et des tiroirs (jeton web `subtle`).
  static const subtle = Color(0xFFEEF2F7);

  // Niveaux de criticité (risques, alertes), avec leur teinte douce de fond.
  static const critical = Color(0xFFB91C1C);
  static const criticalSoft = Color(0xFFFEE2E2);
  static const important = Color(0xFFB45309);
  static const importantSoft = Color(0xFFFEF3C7);
  static const info = Color(0xFF1D4ED8);
  static const infoSoft = Color(0xFFDBEAFE);
  static const success = Color(0xFF15803D);
  static const successSoft = Color(0xFFDCFCE7);

  static const onDark = Color(0xFFFFFFFF);
}
