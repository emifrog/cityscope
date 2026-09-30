import 'package:etare_ops/src/core/domain/cursor_page.dart';
import 'package:etare_ops/src/features/sites/domain/site.dart';

/// Consultation des sites d'un SIS (en ligne ; la version hors ligne viendra
/// avec la synchronisation des publications).
abstract interface class SitesRepository {
  Future<CursorPage<Site>> listSites({
    required String tenantId,
    int limit = 25,
    String? cursor,
  });
}
