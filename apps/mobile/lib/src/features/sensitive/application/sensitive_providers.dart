import 'dart:async';

import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/text/search_text.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/lock/application/lock_controller.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart'
    show siteQueryProvider;
import 'package:etare_ops/src/features/sensitive/application/sensitive_site_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final sensitiveSiteServiceProvider = Provider<SensitiveSiteService>(
  (ref) => SensitiveSiteService(
    api: ref.watch(syncApiProvider),
    dao: ref.watch(appDatabaseProvider).sensitiveDao,
    identities: ref.watch(deviceIdentityStoreProvider),
    trust: ref.watch(trustStoreProvider),
    codes: ref.watch(localCodeStoreProvider),
    clock: ref.watch(clockProvider),
  ),
);

/// Sites restreints proposés à la demande correspondant à la recherche.
final onDemandResultsProvider = StreamProvider<List<OnDemandSiteRow>>((ref) {
  final tokens = normalizeForSearch(ref.watch(siteQueryProvider))
      .split(' ')
      .where((token) => token.isNotEmpty)
      .toList();
  return ref.watch(appDatabaseProvider).sensitiveDao.watchOnDemand(tokens);
});

/// Un site sensible ouvert (24 h) sur cette tablette, ou null.
final openedSensitiveSiteProvider =
    StreamProvider.family<SensitiveSiteRow?, String>(
      (ref, siteId) =>
          ref.watch(appDatabaseProvider).sensitiveDao.watchOpened(siteId),
    );

final unlockedSitesProvider =
    NotifierProvider<UnlockedSites, Map<String, UnlockedSite>>(
      UnlockedSites.new,
    );

/// Sites sensibles déverrouillés par le code, en mémoire seulement : oubliés
/// dès que l'application se verrouille ou que l'agent change.
class UnlockedSites extends Notifier<Map<String, UnlockedSite>> {
  @override
  Map<String, UnlockedSite> build() {
    ref.listen(lockControllerProvider.select((lock) => lock.phase), (_, phase) {
      if (phase != LockPhase.unlocked) clear();
    });
    ref.watch(authControllerProvider.select((state) => state.value?.user.id));
    return const {};
  }

  void put(UnlockedSite site) => state = {...state, site.siteId: site};

  void clear() {
    if (state.isNotEmpty) state = const {};
  }
}

/// Après une synchronisation réussie : les sites sensibles expirés sont
/// effacés et les consultations hors ligne remontées au journal.
Future<void> afterSyncSensitive(Ref ref) async {
  const logger = AppLogger('sensitive');
  try {
    final service = ref.read(sensitiveSiteServiceProvider);
    await service.purgeExpired();
    final userId = ref.read(authControllerProvider).value?.user.id;
    if (userId != null) await service.flushEvents(userId);
  } on Object catch (error) {
    // Réessayé au prochain contact : la file reste dans la base chiffrée.
    logger.warning('Consultations sensibles non remontées.', error: error);
  }
}

/// Rien d'un site sensible ne reste à un autre agent que celui qui l'a ouvert.
Future<void> forgetSensitiveSites(AppDatabase database, String? nextUserId) =>
    database.sensitiveDao.purgeOtherUsers(nextUserId);

/// Purge d'un site expiré au moment de l'ouvrir, sans attendre la synchronisation.
void purgeExpiredSensitive(WidgetRef ref) =>
    unawaited(ref.read(sensitiveSiteServiceProvider).purgeExpired());
