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
import 'generated/schema_v4.dart' as v4;
import 'generated/schema_v5.dart' as v5;
import 'generated/schema_v6.dart' as v6;
import 'generated/schema_v7.dart' as v7;
import 'generated/schema_v8.dart' as v8;

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

  // Tablette en v3 : rien ne change, l'application est réputée compatible
  // jusqu'au prochain catalogue (SYN-02).
  test(
    'la migration v3 → v4 conserve l’état et part d’une application compatible',
    () async {
      const oldSyncStateData = [
        v3.SyncStateData(
          id: 1,
          activeGeneration: 5,
          lastSyncAt: '2026-10-01T09:00:00.000Z',
          status: 'idle',
          catalogGeneration: 5,
          authorizedUserId: 'user-1',
          receiptPending: 0,
        ),
      ];
      const expectedNewSyncStateData = [
        v4.SyncStateData(
          id: 1,
          activeGeneration: 5,
          lastSyncAt: '2026-10-01T09:00:00.000Z',
          status: 'idle',
          catalogGeneration: 5,
          authorizedUserId: 'user-1',
          receiptPending: 0,
        ),
      ];

      await verifier.testWithDataIntegrity(
        oldVersion: 3,
        newVersion: 4,
        createOld: v3.DatabaseAtV3.new,
        createNew: v4.DatabaseAtV4.new,
        openTestedDatabase: AppDatabase.new,
        createItems: (batch, oldDb) {
          batch.insertAll(oldDb.syncState, oldSyncStateData);
        },
        validateItems: (newDb) async {
          expect(
            expectedNewSyncStateData,
            await newDb.select(newDb.syncState).get(),
          );
        },
      );
    },
  );

  // Tablette en v4 : l'état est conservé, aucun bail n'est tenu (SYN-01).
  test('la migration v4 → v5 conserve l’état, sans bail en cours', () async {
    const oldSyncStateData = [
      v4.SyncStateData(
        id: 1,
        activeGeneration: 6,
        lastSyncAt: '2026-10-01T12:00:00.000Z',
        status: 'failed',
        catalogGeneration: 7,
        authorizedUserId: 'user-1',
        receiptPending: 1,
        requiredAppVersion: '0.2.0',
      ),
    ];
    const expectedNewSyncStateData = [
      v5.SyncStateData(
        id: 1,
        activeGeneration: 6,
        lastSyncAt: '2026-10-01T12:00:00.000Z',
        status: 'failed',
        catalogGeneration: 7,
        authorizedUserId: 'user-1',
        receiptPending: 1,
        requiredAppVersion: '0.2.0',
      ),
    ];

    await verifier.testWithDataIntegrity(
      oldVersion: 4,
      newVersion: 5,
      createOld: v4.DatabaseAtV4.new,
      createNew: v5.DatabaseAtV5.new,
      openTestedDatabase: AppDatabase.new,
      createItems: (batch, oldDb) {
        batch.insertAll(oldDb.syncState, oldSyncStateData);
      },
      validateItems: (newDb) async {
        expect(
          expectedNewSyncStateData,
          await newDb.select(newDb.syncState).get(),
        );
      },
    );
  });

  test(
    'la migration v5 → v6 conserve les préférences, sans site sensible',
    () async {
      const oldLocalMetaData = [
        v5.LocalMetaData(key: 'active_tenant_id', value: 'tenant-06'),
      ];
      const expectedNewLocalMetaData = [
        v6.LocalMetaData(key: 'active_tenant_id', value: 'tenant-06'),
      ];

      await verifier.testWithDataIntegrity(
        oldVersion: 5,
        newVersion: 6,
        createOld: v5.DatabaseAtV5.new,
        createNew: v6.DatabaseAtV6.new,
        openTestedDatabase: AppDatabase.new,
        createItems: (batch, oldDb) {
          batch.insertAll(oldDb.localMeta, oldLocalMetaData);
        },
        validateItems: (newDb) async {
          expect(
            expectedNewLocalMetaData,
            await newDb.select(newDb.localMeta).get(),
          );
          expect(await newDb.select(newDb.onDemandSites).get(), isEmpty);
          expect(await newDb.select(newDb.sensitiveSites).get(), isEmpty);
        },
      );
    },
  );

  test(
    'la migration v6 → v7 conserve les préférences, sans fond de carte',
    () async {
      const oldLocalMetaData = [
        v6.LocalMetaData(key: 'active_tenant_id', value: 'tenant-06'),
      ];
      const expectedNewLocalMetaData = [
        v7.LocalMetaData(key: 'active_tenant_id', value: 'tenant-06'),
      ];

      await verifier.testWithDataIntegrity(
        oldVersion: 6,
        newVersion: 7,
        createOld: v6.DatabaseAtV6.new,
        createNew: v7.DatabaseAtV7.new,
        openTestedDatabase: AppDatabase.new,
        createItems: (batch, oldDb) {
          batch.insertAll(oldDb.localMeta, oldLocalMetaData);
        },
        validateItems: (newDb) async {
          expect(
            expectedNewLocalMetaData,
            await newDb.select(newDb.localMeta).get(),
          );
          expect(await newDb.select(newDb.installedBasemaps).get(), isEmpty);
        },
      );
    },
  );

  test(
    'la migration v7 → v8 garde les fonds installés, sans jeu de clés',
    () async {
      const oldBasemaps = [
        v7.InstalledBasemapsData(
          packId: 'pack-1',
          sectorId: 'sector-1',
          sectorName: 'CIS Nice Centre',
          version: 2,
          manifestHash: 'hash',
          manifestText: '{}',
          totalBytes: 4096,
          builtAt: '2026-10-05T08:00:00.000Z',
          renewAfter: '2027-04-05T08:00:00.000Z',
          installedAt: '2026-10-05T09:00:00.000Z',
        ),
      ];
      // La clé qui l'a signé est inconnue : le manifeste sera revérifié.
      const expectedBasemaps = [
        v8.InstalledBasemapsData(
          packId: 'pack-1',
          sectorId: 'sector-1',
          sectorName: 'CIS Nice Centre',
          version: 2,
          manifestHash: 'hash',
          manifestText: '{}',
          totalBytes: 4096,
          builtAt: '2026-10-05T08:00:00.000Z',
          renewAfter: '2027-04-05T08:00:00.000Z',
          installedAt: '2026-10-05T09:00:00.000Z',
        ),
      ];

      await verifier.testWithDataIntegrity(
        oldVersion: 7,
        newVersion: 8,
        createOld: v7.DatabaseAtV7.new,
        createNew: v8.DatabaseAtV8.new,
        openTestedDatabase: AppDatabase.new,
        createItems: (batch, oldDb) {
          batch.insertAll(oldDb.installedBasemaps, oldBasemaps);
        },
        validateItems: (newDb) async {
          expect(
            expectedBasemaps,
            await newDb.select(newDb.installedBasemaps).get(),
          );
          expect(await newDb.select(newDb.trustedKeyset).get(), isEmpty);
        },
      );
    },
  );
}
