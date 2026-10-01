// dart format width=80
// ignore_for_file: unused_local_variable, unused_import
import 'package:drift/drift.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:flutter_test/flutter_test.dart';

import 'generated/schema.dart';

import 'generated/schema_v1.dart' as v1;
import 'generated/schema_v2.dart' as v2;
import 'generated/schema_v3.dart' as v3;

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  late SchemaVerifier verifier;

  setUpAll(() {
    verifier = SchemaVerifier(GeneratedHelper());
  });

  group('simple database migrations', () {
    // These simple tests verify all possible schema updates with a simple (no
    // data) migration. This is a quick way to ensure that written database
    // migrations properly alter the schema.
    const versions = GeneratedHelper.versions;
    for (final (i, fromVersion) in versions.indexed) {
      group('from $fromVersion', () {
        for (final toVersion in versions.skip(i + 1)) {
          test('to $toVersion', () async {
            final schema = await verifier.schemaAt(fromVersion);
            final db = AppDatabase(schema.newConnection());
            await verifier.migrateAndValidate(db, toVersion);
            await db.close();
          });
        }
      });
    }
  });

  // Données d'un terminal en v1 : la préférence de SIS et l'état de synchro
  // sont conservés, les nouvelles colonnes prennent leurs valeurs par défaut.
  test('la migration v1 → v2 conserve les données existantes', () async {
    const oldLocalMetaData = [
      v1.LocalMetaData(key: 'active_tenant_id', value: 'tenant-06'),
    ];
    const expectedNewLocalMetaData = [
      v2.LocalMetaData(key: 'active_tenant_id', value: 'tenant-06'),
    ];
    const oldSyncStateData = [
      v1.SyncStateData(
        id: 1,
        lastSyncAt: '2026-09-27T10:30:00.000Z',
        status: 'idle',
      ),
    ];
    const expectedNewSyncStateData = [
      v2.SyncStateData(
        id: 1,
        lastSyncAt: '2026-09-27T10:30:00.000Z',
        status: 'idle',
        receiptPending: 0,
      ),
    ];

    await verifier.testWithDataIntegrity(
      oldVersion: 1,
      newVersion: 2,
      createOld: v1.DatabaseAtV1.new,
      createNew: v2.DatabaseAtV2.new,
      openTestedDatabase: AppDatabase.new,
      createItems: (batch, oldDb) {
        batch.insertAll(oldDb.localMeta, oldLocalMetaData);
        batch.insertAll(oldDb.syncState, oldSyncStateData);
      },
      validateItems: (newDb) async {
        expect(
          expectedNewLocalMetaData,
          await newDb.select(newDb.localMeta).get(),
        );
        expect(
          expectedNewSyncStateData,
          await newDb.select(newDb.syncState).get(),
        );
      },
    );
  });

  // Tablette en v2 : l'état de synchronisation et le SIS actif sont conservés,
  // la file des signalements démarre vide.
  test('la migration v2 → v3 conserve les données existantes', () async {
    const oldSyncStateData = [
      v2.SyncStateData(
        id: 1,
        activeGeneration: 4,
        lastSyncAt: '2026-10-01T08:00:00.000Z',
        status: 'idle',
        catalogGeneration: 4,
        authorizedUserId: 'user-1',
        receiptPending: 0,
      ),
    ];
    const expectedNewSyncStateData = [
      v3.SyncStateData(
        id: 1,
        activeGeneration: 4,
        lastSyncAt: '2026-10-01T08:00:00.000Z',
        status: 'idle',
        catalogGeneration: 4,
        authorizedUserId: 'user-1',
        receiptPending: 0,
      ),
    ];

    await verifier.testWithDataIntegrity(
      oldVersion: 2,
      newVersion: 3,
      createOld: v2.DatabaseAtV2.new,
      createNew: v3.DatabaseAtV3.new,
      openTestedDatabase: AppDatabase.new,
      createItems: (batch, oldDb) {
        batch.insertAll(oldDb.syncState, oldSyncStateData);
      },
      validateItems: (newDb) async {
        expect(
          expectedNewSyncStateData,
          await newDb.select(newDb.syncState).get(),
        );
        expect(await newDb.select(newDb.fieldReport).get(), isEmpty);
      },
    );
  });
}
