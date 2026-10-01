import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/account/data/api_account_repository.dart';
import 'package:etare_ops/src/features/sync/data/sync_status_repository.dart';
import 'package:etare_ops/src/features/sync/domain/sync_status.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late AppDatabase database;

  setUp(() {
    // Base en mémoire NON chiffrée : suffisante pour tester schéma et DAO.
    database = AppDatabase(NativeDatabase.memory());
  });

  tearDown(() => database.close());

  test(
    'schéma courant : la ligne unique de sync_state est créée à l’ouverture',
    () async {
      final row = await database.syncStateDao.read();

      expect(database.schemaVersion, AppDatabase.currentSchemaVersion);
      expect(row.receiptPending, isFalse);
      expect(row.id, 1);
      expect(row.status, 'never');
      expect(row.activeGeneration, isNull);
      expect(row.lastSyncAt, isNull);
    },
  );

  test('écriture puis relecture de sync_state', () async {
    final syncedAt = DateTime.utc(2026, 9, 27, 10, 30);

    await database.syncStateDao.save(
      activeGeneration: const Value(42),
      lastSyncAt: Value(syncedAt),
      status: const Value('idle'),
    );

    final row = await database.syncStateDao.read();
    expect(row.activeGeneration, 42);
    expect(row.lastSyncAt?.toUtc(), syncedAt);
    expect(row.status, 'idle');

    final status = await SyncStatusRepository(database.syncStateDao)
        .watch()
        .first;
    expect(status.hasPublication, isTrue);
    expect(status.phase, SyncPhase.idle);
    expect(status.lastSyncAt, syncedAt);
  });

  test('sync_state refuse une seconde ligne (contrainte id = 1)', () async {
    await expectLater(
      database
          .into(database.syncState)
          .insert(const SyncStateCompanion(id: Value(2))),
      throwsA(isA<Exception>()),
    );
  });

  test('local_meta : écriture, remplacement, suppression', () async {
    final selection = LocalTenantSelectionRepository(database.localMetaDao);

    expect(await selection.readSelectedTenantId(), isNull);
    await selection.saveSelectedTenantId('tenant-a');
    await selection.saveSelectedTenantId('tenant-b');
    expect(await selection.readSelectedTenantId(), 'tenant-b');

    await database.localMetaDao.removeValue(
      LocalTenantSelectionRepository.metaKey,
    );
    expect(await database.localMetaDao.readValue('active_tenant_id'), isNull);
  });
}
