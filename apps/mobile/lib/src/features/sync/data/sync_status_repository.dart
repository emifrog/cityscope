import 'dart:async';

import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/data/local/daos/sync_state_dao.dart';
import 'package:etare_ops/src/features/sync/domain/sync_status.dart';

/// Lecture de l'état de synchronisation depuis la base locale.
final class SyncStatusRepository {
  SyncStatusRepository(this._dao, [this._offline]);

  final SyncStateDao _dao;
  final OfflineDao? _offline;

  /// État courant et nombre de sites installés, mis à jour en continu.
  Stream<SyncStatus> watch() {
    final offline = _offline;
    if (offline == null) return _dao.watch().map((row) => _toDomain(row, 0));
    late final StreamController<SyncStatus> controller;
    SyncStateRow? row;
    var installed = 0;
    final subscriptions = <StreamSubscription<Object?>>[];
    void emit() {
      final current = row;
      if (current != null) controller.add(_toDomain(current, installed));
    }

    controller = StreamController<SyncStatus>(
      onListen: () {
        subscriptions
          ..add(
            _dao.watch().listen((value) {
              row = value;
              emit();
            }, onError: controller.addError),
          )
          ..add(
            offline.watchInstalledCount().listen((value) {
              installed = value;
              emit();
            }, onError: controller.addError),
          );
      },
      onCancel: () async {
        for (final subscription in subscriptions) {
          await subscription.cancel();
        }
        await controller.close();
      },
    );
    return controller.stream;
  }

  static SyncStatus _toDomain(SyncStateRow row, int installed) => SyncStatus(
    phase: SyncPhase.fromStorage(row.status),
    activeGeneration: row.activeGeneration,
    lastSyncAt: row.lastSyncAt?.toUtc(),
    catalogGeneration: row.catalogGeneration,
    lastAttemptAt: row.lastAttemptAt?.toUtc(),
    lastError: row.lastError,
    serverTime: row.serverTime?.toUtc(),
    authorizedUserId: row.authorizedUserId,
    authorizationExpiresAt: row.authorizationExpiresAt?.toUtc(),
    installedSites: installed,
    requiredAppVersion: row.requiredAppVersion,
  );
}
