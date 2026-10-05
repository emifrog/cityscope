import 'dart:io';

import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/basemaps/application/basemap_sync.dart';
import 'package:etare_ops/src/features/basemaps/data/basemap_store.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

/// Dossier de l'application qui accueille les fonds de carte (ADR-024) :
/// stockage interne, effacé avec l'application.
final basemapRootProvider = Provider<Future<Directory> Function()>(
  (ref) => getApplicationSupportDirectory,
);

final basemapStoreProvider = Provider<BasemapStore>(
  (ref) => BasemapStore(ref.watch(basemapRootProvider)),
);

final basemapSyncProvider = Provider<BasemapSync?>(
  (ref) => BasemapSync(
    api: ref.watch(syncApiProvider),
    dao: ref.watch(appDatabaseProvider).basemapDao,
    store: ref.watch(basemapStoreProvider),
    clock: ref.watch(clockProvider),
  ),
);

/// Fonds installés, mis à jour en continu depuis la base locale.
final installedBasemapsProvider = StreamProvider<List<InstalledBasemapRow>>(
  (ref) => ref.watch(appDatabaseProvider).basemapDao.watchAll(),
);
