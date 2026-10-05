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

  /// Ouverture d'un site sensible proposé à la demande (PER-02).
  static String sensitiveSite(String siteId) => '/home/sensitive/$siteId';

  /// Liste d'une entrée de la synthèse (risques, accès, eau…).
  static String section(String siteId, String section) =>
      '/home/site/$siteId/section/$section';

  /// Signalements de l'agent et suite donnée (OPS-04).
  static const reports = '/home/reports';

  /// Signaler un écart sur un site, éventuellement sur un élément ou un point
  /// d'un plan de la version consultée.
  static String report(
    String siteId, {
    String? itemType,
    String? itemId,
    String? planRevisionId,
    double? x,
    double? y,
  }) {
    final query = {
      if (itemType != null && itemId != null) 'item': '$itemType:$itemId',
      if (planRevisionId != null && x != null && y != null)
        'plan':
            '$planRevisionId:${x.toStringAsFixed(1)}:${y.toStringAsFixed(1)}',
    };
    return Uri(
      path: '/home/site/$siteId/report',
      queryParameters: query.isEmpty ? null : query,
    ).toString();
  }

  /// Plan tactile (OPS-02), éventuellement centré sur un élément.
  static String plan(String siteId, String planId, {String? focus}) =>
      '/home/site/$siteId/plan/$planId${focus == null ? '' : '?focus=$focus'}';
}
