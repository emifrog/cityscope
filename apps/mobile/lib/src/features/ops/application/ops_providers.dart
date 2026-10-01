import 'dart:typed_data';

import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/text/search_text.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
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
  return status.canConsult(userId: userId, now: ref.watch(clockProvider)());
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
  // Une nouvelle installation remplace le contenu : relire après chaque
  // synchronisation.
  ref.watch(syncStatusProvider.select((status) => status.value?.lastSyncAt));
  final text = await ref.watch(appDatabaseProvider).offlineDao.dataText(siteId);
  return text == null ? null : PublishedSite.fromJsonText(text);
});

/// Contenu d'un fichier installé (plan, PDF, photo), par empreinte.
final installedFileProvider = FutureProvider.family<Uint8List?, String>(
  (ref, sha256) => ref.watch(appDatabaseProvider).offlineDao.blob(sha256),
);
