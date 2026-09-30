import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/features/sync/data/sync_status_repository.dart';
import 'package:etare_ops/src/features/sync/domain/sync_status.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final syncStatusRepositoryProvider = Provider<SyncStatusRepository>(
  (ref) => SyncStatusRepository(ref.watch(appDatabaseProvider).syncStateDao),
);

/// État de synchronisation, mis à jour en continu depuis la base locale.
final syncStatusProvider = StreamProvider<SyncStatus>(
  (ref) => ref.watch(syncStatusRepositoryProvider).watch(),
);
