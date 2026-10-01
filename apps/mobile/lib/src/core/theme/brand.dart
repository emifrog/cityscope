import 'package:material_ui/material_ui.dart';

/// Identité visuelle FireScape, centralisée ici.
///
/// Les logos sont générés par `pnpm brand:assets` depuis les originaux de
/// `assets/brand/` à la racine du dépôt ; les couleurs reprennent les jetons
/// partagés avec l'application web.
abstract final class Brand {
  /// Nom commercial du produit.
  static const productName = 'FireScape';

  /// Signature de la marque.
  static const tagline = 'La connaissance opérationnelle du bâtiment.';

  /// Sous-titre de l'application mobile opérationnelle.
  static const appSubtitle = 'Application opérationnelle';

  /// Logo empilé pour fond clair.
  static const logoAsset = 'assets/brand/firescape-logo.png';

  /// Logo empilé pour fond marine (pictogramme et nom en blanc).
  static const logoInverseAsset = 'assets/brand/firescape-logo-inverse.png';
}

/// Palette de marque (jetons partagés web / mobile).
abstract final class BrandColors {
  /// Marine du logo : barres d'application, couleur primaire.
  static const navy = Color(0xFF012B5C);

  /// Orange du logo : marques et repères. Texte blanc interdit dessus
  /// (contraste 3,3:1) : les actions utilisent [accentStrong].
  static const accent = Color(0xFFFE5002);

  /// Orange foncé des actions principales : texte blanc à 4,9:1 (WCAG AA).
  static const accentStrong = Color(0xFFC84300);

  static const background = Color(0xFFF5F7FA);
  static const surface = Color(0xFFFFFFFF);
  static const text = Color(0xFF0F172A);
  static const textMuted = Color(0xFF475569);
  static const border = Color(0xFFCBD5E1);

  // Niveaux de criticité (risques, alertes).
  static const critical = Color(0xFFB91C1C);
  static const important = Color(0xFFB45309);
  static const info = Color(0xFF1D4ED8);
  static const success = Color(0xFF15803D);

  static const onDark = Color(0xFFFFFFFF);
}
