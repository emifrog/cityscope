import 'package:drift/drift.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/tables.dart';

part 'sync_state_dao.g.dart';

/// Accès à la ligne unique de `sync_state`.
@DriftAccessor(tables: [SyncState])
class SyncStateDao extends DatabaseAccessor<AppDatabase>
    with _$SyncStateDaoMixin {
  SyncStateDao(super.attachedDatabase);

  SimpleSelectStatement<$SyncStateTable, SyncStateRow> get _singleton =>
      select(syncState)..where((t) => t.id.equals(SyncState.singletonId));

  Future<SyncStateRow> read() => _singleton.getSingle();

  Stream<SyncStateRow> watch() => _singleton.watchSingle();

  /// Met à jour les champs fournis de la ligne unique.
  Future<void> save({
    Value<int?> activeGeneration = const Value.absent(),
    Value<DateTime?> lastSyncAt = const Value.absent(),
    Value<String> status = const Value.absent(),
  }) async {
    await (update(
      syncState,
    )..where((t) => t.id.equals(SyncState.singletonId))).write(
      SyncStateCompanion(
        activeGeneration: activeGeneration,
        lastSyncAt: lastSyncAt,
        status: status,
      ),
    );
  }
}
