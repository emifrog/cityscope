import 'dart:typed_data';

import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/text/search_text.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/lock/application/terminal_providers.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
import 'package:etare_ops/src/features/sensitive/application/sensitive_providers.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Consultation locale permise à l'utilisateur connecté (autorisation reçue
/// avec le dernier catalogue, ADR-015/016). Les écrans OPS ne montrent
/// aucune donnée sans elle.
final offlineAccessProvider = Provider<bool>((ref) {
  final status = ref.watch(syncStatusProvider).value;
  final userId = ref.watch(
    authControllerProvider.select((state) => state.value?.user.id),
  );
  if (status == null) return false;
  // Heure de confiance : une horloge reculée ne prolonge pas l'autorisation (SEC-05).
  return status.canConsult(
    userId: userId,
    now: ref.watch(trustedNowProvider)(),
  );
});

/// Texte saisi dans la recherche locale (OPS-03).
final siteQueryProvider = NotifierProvider<SiteQuery, String>(SiteQuery.new);

class SiteQuery extends Notifier<String> {
  @override
  String build() => '';

  void set(String value) => state = value;
}

/// Sites installés correspondant à la recherche (nom, adresse, commune,
/// n° ETARE), sans réseau.
final siteResultsProvider = StreamProvider<List<SiteSearchRow>>((ref) {
  final tokens = normalizeForSearch(ref.watch(siteQueryProvider))
      .split(' ')
      .where((token) => token.isNotEmpty)
      .toList();
  return ref.watch(appDatabaseProvider).offlineDao.watchSites(tokens);
});

/// Version publiée installée d'un site (null si absente de la tablette).
final publishedSiteProvider = FutureProvider.family<PublishedSite?, String>((
  ref,
  siteId,
) async {
  // Site sensible déverrouillé par le code : lu en mémoire (PER-02).
  final unlocked = ref.watch(
    unlockedSitesProvider.select((sites) => sites[siteId]),
  );
  if (unlocked != null) return unlocked.site;
  // Une nouvelle installation remplace le contenu : relire après chaque
  // synchronisation.
  ref.watch(syncStatusProvider.select((status) => status.value?.lastSyncAt));
  final text = await ref.watch(appDatabaseProvider).offlineDao.dataText(siteId);
  return text == null ? null : PublishedSite.fromJsonText(text);
});

/// Empreinte du PDF ETARE de la version installée d'un site (null : absent).
final etarePdfProvider = FutureProvider.family<String?, String>((
  ref,
  siteId,
) async {
  if (ref.watch(unlockedSitesProvider.select((sites) => sites[siteId])) !=
      null) {
    return ref.read(sensitiveSiteServiceProvider).etarePdf(siteId);
  }
  ref.watch(syncStatusProvider.select((status) => status.value?.lastSyncAt));
  final dao = ref.watch(appDatabaseProvider).offlineDao;
  final installed = await dao.installedSite(siteId);
  if (installed == null) return null;
  final files = await dao.files(installed.publicationId);
  return files.where((file) => file.path == 'etare.pdf').firstOrNull?.sha256;
});

/// Contenu d'un fichier installé (plan, PDF, photo), par empreinte ; celui
/// d'un site sensible déverrouillé est déchiffré en mémoire (PER-02).
final installedFileProvider = FutureProvider.family<Uint8List?, String>((
  ref,
  sha256,
) async {
  final unlocked = ref.watch(unlockedSitesProvider).values;
  if (unlocked.isNotEmpty) {
    final service = ref.read(sensitiveSiteServiceProvider);
    for (final site in unlocked) {
      final bytes = await service.file(site, sha256);
      if (bytes != null) return bytes;
    }
  }
  return ref.watch(appDatabaseProvider).offlineDao.blob(sha256);
});
