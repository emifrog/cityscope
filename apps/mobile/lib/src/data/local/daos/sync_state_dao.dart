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

  /// Met à jour les colonnes fournies par [changes] (les autres sont gardées).
  Future<void> write(SyncStateCompanion changes) async {
    await (update(
      syncState,
    )..where((t) => t.id.equals(SyncState.singletonId))).write(changes);
  }

  /// Prend (ou prolonge) le bail de synchronisation pour [owner] jusqu'à
  /// `now + ttl`, s'il est libre, échu ou déjà le sien (SYN-01). Une seule
  /// instruction UPDATE : atomique même entre deux connexions à la base.
  Future<bool> tryAcquireLease(String owner, DateTime now, Duration ttl) async {
    final utcNow = now.toUtc();
    final updated =
        await (update(syncState)..where(
              (t) =>
                  t.id.equals(SyncState.singletonId) &
                  (t.syncLeaseOwner.isNull() |
                      t.syncLeaseOwner.equals(owner) |
                      t.syncLeaseExpiresAt.isSmallerOrEqualValue(utcNow)),
            ))
            .write(
              SyncStateCompanion(
                syncLeaseOwner: Value(owner),
                syncLeaseExpiresAt: Value(utcNow.add(ttl)),
              ),
            );
    return updated == 1;
  }

  /// Rend le bail, s'il est toujours celui de [owner].
  Future<void> releaseLease(String owner) async {
    await (update(syncState)..where(
          (t) =>
              t.id.equals(SyncState.singletonId) &
              t.syncLeaseOwner.equals(owner),
        ))
        .write(
          const SyncStateCompanion(
            syncLeaseOwner: Value(null),
            syncLeaseExpiresAt: Value(null),
          ),
        );
  }

  /// Bail en cours d'un autre moteur à [now] (null : libre ou échu).
  Future<String?> leaseHolder(DateTime now) async {
    final row = await read();
    final expiresAt = row.syncLeaseExpiresAt;
    if (row.syncLeaseOwner == null || expiresAt == null) return null;
    return expiresAt.isAfter(now.toUtc()) ? row.syncLeaseOwner : null;
  }
}
