/// Chemins de navigation.
abstract final class AppRoutes {
  static const splash = '/splash';
  static const login = '/login';
  static const home = '/home';

  /// Enrôlement de la tablette (code de l'administrateur du SIS).
  static const enroll = '/home/enroll';

  /// Compte, SIS actif, état de la tablette et déconnexion.
  static const account = '/home/account';

  /// Synthèse opérationnelle d'un site installé (OPS-01).
  static String site(String siteId) => '/home/site/$siteId';

  /// Liste d'une entrée de la synthèse (risques, accès, eau…).
  static String section(String siteId, String section) =>
      '/home/site/$siteId/section/$section';

  /// Plan tactile (OPS-02), éventuellement centré sur un élément.
  static String plan(String siteId, String planId, {String? focus}) =>
      '/home/site/$siteId/plan/$planId${focus == null ? '' : '?focus=$focus'}';
}
