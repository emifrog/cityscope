import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/sync_state_dao.dart';
import 'package:etare_ops/src/features/sync/domain/sync_status.dart';

/// Lecture de l'état de synchronisation depuis la table Drift `sync_state`.
final class SyncStatusRepository {
  SyncStatusRepository(this._dao);

  final SyncStateDao _dao;

  Stream<SyncStatus> watch() => _dao.watch().map(_toDomain);

  static SyncStatus _toDomain(SyncStateRow row) => SyncStatus(
    phase: SyncPhase.fromStorage(row.status),
    activeGeneration: row.activeGeneration,
    lastSyncAt: row.lastSyncAt?.toUtc(),
  );
}
