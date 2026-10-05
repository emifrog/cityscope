import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:etare_ops/src/core/security/trusted_keys.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/application/trust_store.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fakes.dart';
import 'fake_sync_server.dart';

const siteA = '06000002-0000-4000-8000-00000000000a';

FakePublication publicationA(int number) => FakePublication(
  siteId: siteA,
  publicationId:
      '0600000f-0000-4000-8000-${number.toString().padLeft(12, '0')}',
  number: number,
  siteName: 'EHPAD Les Oliviers',
  files: {'plans/rdc.png': List.filled(2048, number)},
);

/// SEC-04 (ADR-027) : la tablette lit le jeu de clés signé par la racine avant
/// son catalogue ; rotation et révocation lui parviennent sans nouvelle version
/// de l'application.
void main() {
  late FakeSyncServer server;
  late AppDatabase database;
  late SyncService service;
  late TrustStore trust;

  setUp(() async {
    server = await FakeSyncServer.start();
    database = AppDatabase(NativeDatabase.memory());
    final api = SyncApi(
      api: serverDio(apiBase, server.handleApi),
      files: serverDio(apiBase, server.handleFile),
      clock: () => server.serverClock,
    );
    final identities = DeviceIdentityStore(InMemorySecureStore());
    trust = TrustStore(embedded: server.trustedKeys, dao: database.trustDao);
    service = SyncService(
      api: api,
      offline: database.offlineDao,
      reports: database.reportsDao,
      state: database.syncStateDao,
      identities: identities,
      trust: trust,
      clock: () => server.serverClock,
    );
    await EnrollmentService(
      api: api,
      identities: identities,
    ).enroll(tenantId: tenantId, code: 'abcd-efgh-jklm');
    server.publish(publicationA(1));
  });

  tearDown(() => database.close());

  Future<SyncCompleted> sync() async =>
      await service.run(userId: userId) as SyncCompleted;

  Future<String> installedKey() async =>
      (await database.offlineDao.installed()).single.signatureKeyId;

  /// Statuts du jeu : les clés initiales de la configuration, actives.
  Map<String, KeyStatus> initial() => {
    server.publicationKeyId: KeyStatus.active,
    server.catalogKeyId: KeyStatus.active,
  };

  test('sans jeu servi (404), les clés de la configuration valent', () async {
    final report = await sync();
    expect(report.complete, isTrue);
    expect(server.keysetRequests, hasLength(1));
    expect(await trust.sequence(), isNull);
    expect(server.receipts.single.containsKey('keyset_sequence'), isFalse);
  });

  test(
    'retient le jeu vérifié par la racine et le déclare dans l’accusé',
    () async {
      server.publishKeyset(1, initial());
      await sync();
      expect(await trust.sequence(), 1);
      expect(server.receipts.last['keyset_sequence'], 1);
      // Le même jeu au contact suivant : rien ne change.
      await sync();
      expect(await trust.sequence(), 1);
    },
  );

  test(
    'rotation : nouvelles clés reconnues dès le contact où le jeu les annonce, '
    'ce que l’ancienne clé a signé reste installé',
    () async {
      server.publishKeyset(1, initial());
      await sync();
      final oldPublication = server.publicationKeyId;
      final oldCatalog = server.catalogKeyId;
      final newPublication = await server.addKey(KeyPurpose.publication);
      final newCatalog = await server.addKey(KeyPurpose.catalog);
      server
        ..publicationKeyId = newPublication
        ..catalogKeyId = newCatalog
        ..publishKeyset(2, {
          oldPublication: KeyStatus.retired,
          newPublication: KeyStatus.active,
          oldCatalog: KeyStatus.retired,
          newCatalog: KeyStatus.active,
        });
      final packages = server.packageRequests.length;

      // Catalogue signé par la nouvelle clé de catalogue : ni elle ni la
      // nouvelle clé de publication ne sont dans la configuration, seul le
      // jeu les fait connaître. La version signée par la clé retirée reste.
      expect(server.trustedKeys.find(newCatalog, KeyPurpose.catalog), isNull);
      final unchanged = await sync();
      expect(unchanged.complete, isTrue);
      expect(unchanged.unchanged, 1);
      expect(server.packageRequests.length, packages);
      expect(await installedKey(), oldPublication);
      expect(server.receipts.last['keyset_sequence'], 2);

      // Une nouvelle version, signée par la nouvelle clé de publication.
      server.publish(publicationA(2));
      final report = await sync();
      expect(report.installed, 1);
      expect(await installedKey(), newPublication);
    },
  );

  test('révocation : la version installée est revérifiée avec sa signature '
      'renouvelée, sans retélécharger ses fichiers', () async {
    server.publishKeyset(1, initial());
    await sync();
    final oldPublication = server.publicationKeyId;
    expect(await installedKey(), oldPublication);
    final downloads = server.downloadedFiles.length;
    final packages = server.packageRequests.length;
    // Un site sensible ouvert à la demande (sa signature n'est pas gardée).
    await database
        .into(database.sensitiveSites)
        .insert(
          SensitiveSitesCompanion.insert(
            siteId: 'site-sensible',
            publicationId: 'publication-sensible',
            publicationNumber: 1,
            userId: userId,
            siteName: 'Site restreint',
            openedAt: server.serverClock,
            expiresAt: server.serverClock.add(const Duration(hours: 24)),
            wrappedKey: Uint8List(1),
            dataCipher: Uint8List(1),
          ),
        );

    // Le worker a re-signé avec la nouvelle clé ; l'ancienne est révoquée.
    final newPublication = await server.addKey(KeyPurpose.publication);
    server
      ..publicationKeyId = newPublication
      ..publishKeyset(2, {
        oldPublication: KeyStatus.revoked,
        newPublication: KeyStatus.active,
        server.catalogKeyId: KeyStatus.active,
      });

    final report = await sync();

    expect(report.complete, isTrue);
    expect(server.packageRequests.length, packages + 1);
    expect(server.downloadedFiles.length, downloads, reason: 'déjà présents');
    expect(await installedKey(), newPublication);
    // Refermé : rouvert, il sera revérifié avec la nouvelle clé.
    expect(await database.select(database.sensitiveSites).get(), isEmpty);
    // Puis plus rien à revérifier.
    await sync();
    expect(server.packageRequests.length, packages + 1);
  });

  test('refuse un jeu plus ancien que le sien (rejeu d’un jeu où une clé '
      'aujourd’hui révoquée était active)', () async {
    server.publishKeyset(3, initial());
    await sync();
    server.publishKeyset(2, initial());
    await expectLater(
      service.run(userId: userId),
      throwsA(
        isA<SyncIntegrityException>().having(
          (error) => error.code,
          'code',
          'KEYSET_REPLAYED',
        ),
      ),
    );
    expect(await trust.sequence(), 3);
    expect((await database.syncStateDao.read()).status, 'failed');
  });

  test('refuse un jeu signé par une autre racine, ou différent sous le même '
      'numéro', () async {
    server
      ..publishKeyset(1, initial())
      ..signKeysetWithForeignRoot = true;
    await expectLater(
      service.run(userId: userId),
      throwsA(
        isA<SyncIntegrityException>().having(
          (error) => error.code,
          'code',
          'KEYSET_SIGNATURE_INVALID',
        ),
      ),
    );
    expect(await trust.sequence(), isNull);

    server.signKeysetWithForeignRoot = false;
    await sync();
    final extra = await server.addKey(KeyPurpose.publication);
    server.publishKeyset(1, {...initial(), extra: KeyStatus.active});
    await expectLater(
      service.run(userId: userId),
      throwsA(
        isA<SyncIntegrityException>().having(
          (error) => error.code,
          'code',
          'KEYSET_CONFLICT',
        ),
      ),
    );
  });

  test(
    'un catalogue signé par une clé de catalogue retirée est refusé',
    () async {
      final oldCatalog = server.catalogKeyId;
      final newCatalog = await server.addKey(KeyPurpose.catalog);
      server.publishKeyset(1, {
        server.publicationKeyId: KeyStatus.active,
        oldCatalog: KeyStatus.retired,
        newCatalog: KeyStatus.active,
      });
      await expectLater(
        service.run(userId: userId),
        throwsA(
          isA<SyncIntegrityException>().having(
            (error) => error.code,
            'code',
            'CATALOG_SIGNATURE_INVALID',
          ),
        ),
      );
      expect(await database.offlineDao.installed(), isEmpty);
    },
  );

  test('le jeu retenu est revérifié à chaque lecture : altéré en base, il est '
      'ignoré', () async {
    server.publishKeyset(1, initial());
    await sync();
    final row = (await database.trustDao.read())!;
    await database.trustDao.save(
      sequence: row.sequence,
      keysetText: row.keysetText.replaceFirst('"active"', '"revoked"'),
      rootKeyId: row.rootKeyId,
      signature: row.signature,
      receivedAt: row.receivedAt,
    );
    expect(await trust.sequence(), isNull);
    // Les clés de la configuration reprennent le relais.
    expect(
      (await trust.current()).find(server.catalogKeyId, KeyPurpose.catalog),
      isNotNull,
    );
  });
}
