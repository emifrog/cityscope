import 'package:material_ui/material_ui.dart';

/// Identité visuelle centralisée : SEUL fichier à modifier lorsque le nom
/// commercial et le logo définitifs seront arrêtés.
///
/// Les couleurs reprennent les jetons partagés avec l'application web.
abstract final class Brand {
  /// Nom provisoire du produit (nom commercial non décidé).
  static const productName = 'Produit ETARE';

  /// Sous-titre de l'application mobile opérationnelle.
  static const appSubtitle = 'Application opérationnelle';

  /// Pictogramme provisoire en attendant le logo définitif.
  static const IconData logoIcon = Icons.local_fire_department;
}

/// Palette de marque (jetons partagés web / mobile).
abstract final class BrandColors {
  /// Barres d'application, couleur primaire.
  static const navy = Color(0xFF13233F);

  /// Actions principales. Texte blanc en gras ≥ 18 sp uniquement
  /// (contraste 3,4:1, conforme WCAG AA « grand texte »).
  static const accent = Color(0xFFE8601C);

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
