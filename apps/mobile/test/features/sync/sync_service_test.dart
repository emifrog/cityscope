import 'package:drift/native.dart';
import 'package:etare_ops/src/core/config/app_info.dart';
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/application/trust_store.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fakes.dart';
import 'fake_sync_server.dart';

const siteA = '06000002-0000-4000-8000-00000000000a';
const siteB = '06000002-0000-4000-8000-00000000000b';

String publicationId(int index) =>
    '0600000f-0000-4000-8000-${index.toString().padLeft(12, '0')}';

FakePublication publicationOf(
  String siteId,
  int number, {
  Map<String, List<int>>? files,
  String name = 'EHPAD Les Oliviers',
}) => FakePublication(
  siteId: siteId,
  publicationId: publicationId(number + (siteId == siteB ? 100 : 0)),
  number: number,
  siteName: name,
  files:
      files ??
      {
        // Contenus propres à chaque site : aucun fichier partagé par hasard.
        'plans/rdc.png': List.filled(2048, number + (siteId == siteB ? 50 : 0)),
        'etare.pdf': List.filled(1024, siteId == siteB ? 8 : 7),
      },
);

void main() {
  late FakeSyncServer server;
  late AppDatabase database;
  late InMemorySecureStore secureStore;
  late SyncService service;
  late DateTime deviceClock;

  setUp(() async {
    server = await FakeSyncServer.start();
    database = AppDatabase(NativeDatabase.memory());
    secureStore = InMemorySecureStore();
    deviceClock = server.serverClock;
    final api = SyncApi(
      api: serverDio(apiBase, server.handleApi),
      files: serverDio(apiBase, server.handleFile),
      clock: () => deviceClock,
    );
    final identities = DeviceIdentityStore(secureStore);
    service = SyncService(
      api: api,
      offline: database.offlineDao,
      reports: database.reportsDao,
      state: database.syncStateDao,
      identities: identities,
      trust: TrustStore(embedded: server.trustedKeys, dao: database.trustDao),
      clock: () => deviceClock,
    );
    // Enrôlement : la tablette génère sa clé et la prouve au serveur.
    await EnrollmentService(
      api: api,
      identities: identities,
    ).enroll(tenantId: tenantId, code: 'abcd-efgh-jklm');
  });

  tearDown(() => database.close());

  Future<SyncCompleted> sync() async =>
      await service.run(userId: userId) as SyncCompleted;

  Future<Map<String, String>> installed() async => {
    for (final row in await database.offlineDao.installed())
      row.siteId: row.publicationId,
  };

  test('installe le catalogue signé, vérifie chaque fichier et accuse '
      'réception', () async {
    server
      ..publish(publicationOf(siteA, 1))
      ..publish(publicationOf(siteB, 1, name: 'Collège Jean Moulin'));
    final progress = <SyncProgress>[];

    final report = await service.run(
      userId: userId,
      onProgress: progress.add,
    ) as SyncCompleted;

    expect(report.complete, isTrue);
    expect(report.installed, 2);
    expect(await installed(), {
      siteA: publicationId(1),
      siteB: publicationId(101),
    });
    // Le contenu des fichiers est dans la base chiffrée, vérifié par empreinte.
    final plan = server.catalog[siteA]!.files['plans/rdc.png']!;
    expect(await database.offlineDao.blob(sha256Hex(plan)), plan);
    expect(
      await database.offlineDao.dataText(siteA),
      server.catalog[siteA]!.data,
    );
    final state = await database.syncStateDao.read();
    expect(state.activeGeneration, server.generation);
    expect(state.lastSyncAt, isNotNull);
    expect(state.authorizedUserId, userId);
    expect(state.receiptPending, isFalse);
    expect(server.receipts.single['status'], 'installed');
    expect(
      server.receipts.single['installed'],
      unorderedEquals([publicationId(1), publicationId(101)]),
    );
    expect(progress.last.step, SyncStep.receipt);
    expect(
      progress.where((p) => p.step == SyncStep.downloading).last.doneBytes,
      greaterThan(0),
    );
  });

  test('différentiel : seuls les fichiers d’empreinte nouvelle sont '
      'retéléchargés (OFF-02)', () async {
    server
      ..publish(publicationOf(siteA, 1))
      ..publish(publicationOf(siteB, 1, name: 'Collège'));
    await sync();
    server.downloadedFiles.clear();
    server.packageRequests.clear();

    // Nouvelle version du site A : le plan change, le PDF est identique.
    server.publish(
      publicationOf(
        siteA,
        2,
        files: {
          'plans/rdc.png': List.filled(2048, 99),
          'etare.pdf': List.filled(1024, 7),
        },
      ),
    );
    final report = await sync();

    expect(report.installed, 1);
    expect(report.unchanged, 1);
    expect(server.packageRequests, [publicationId(2)]);
    expect(server.downloadedFiles, [sha256Hex(List.filled(2048, 99))]);
    expect((await installed())[siteA], publicationId(2));
    // L'ancien plan n'est plus référencé : il est effacé.
    expect(
      await database.offlineDao.blob(sha256Hex(List.filled(2048, 1))),
      isNull,
    );
  });

  test('retire un site absent du catalogue', () async {
    server
      ..publish(publicationOf(siteA, 1))
      ..publish(publicationOf(siteB, 1, name: 'Collège'));
    await sync();
    server.withdraw(siteB);

    final report = await sync();

    expect(report.removed, 1);
    expect((await installed()).keys, [siteA]);
    expect(await database.offlineDao.dataText(siteB), isNull);
  });

  test('garde la raison d’un retrait annoncée par le SIS (MET-04), jusqu’à '
      'une nouvelle publication du site', () async {
    server
      ..publish(publicationOf(siteA, 1))
      ..publish(publicationOf(siteB, 1, name: 'Collège'));
    await sync();
    server.withdraw(siteB, reason: 'Bâtiment démoli.');

    await sync();

    final notices = await database.offlineDao.watchRemovalNotices().first;
    expect(notices.map((n) => (n.siteId, n.siteName, n.label, n.reason)), [
      (siteB, 'Collège', 'Version retirée par le SIS', 'Bâtiment démoli.'),
    ]);

    server.publish(publicationOf(siteB, 2, name: 'Collège'));
    await sync();
    expect(await database.offlineDao.watchRemovalNotices().first, isEmpty);
  });

  test(
    'retire un site sorti du périmètre, avec un avis lisible (PER-01)',
    () async {
      server
        ..publish(publicationOf(siteA, 1))
        ..publish(publicationOf(siteB, 1, name: 'Collège'));
      await sync();
      server.withdraw(
        siteB,
        reason: 'Hors des secteurs de cette tablette.',
        kind: 'perimeter',
      );

      final report = await sync();

      expect(report.removed, 1);
      expect((await installed()).keys, [siteA]);
      final notices = await database.offlineDao.watchRemovalNotices().first;
      expect(notices.map((n) => (n.siteId, n.label, n.reason)), [
        (
          siteB,
          'Retiré de votre périmètre',
          'Hors des secteurs de cette tablette.',
        ),
      ]);
    },
  );

  test(
    'refuse un catalogue qui n’est pas signé par la clé de catalogue',
    () async {
      server
        ..publish(publicationOf(siteA, 1))
        ..signCatalogWithPublicationKey = true;

      await expectLater(
        service.run(userId: userId),
        throwsA(
          isA<SyncIntegrityException>().having(
            (e) => e.code,
            'code',
            'CATALOG_SIGNATURE_INVALID',
          ),
        ),
      );
      expect(await installed(), isEmpty);
      final state = await database.syncStateDao.read();
      expect(state.status, 'failed');
      expect(state.lastError, contains('rien n’a été installé'));
    },
  );

  test('manifeste altéré ou fichier corrompu : rien n’est installé, '
      'l’ancienne version reste', () async {
    server.publish(publicationOf(siteA, 1));
    await sync();

    server
      ..publish(publicationOf(siteA, 2))
      ..tamperManifest = true;
    var report = await sync();
    expect(report.failures.single.code, 'MANIFEST_SIGNATURE_INVALID');
    expect((await installed())[siteA], publicationId(1));
    expect(server.receipts.last['status'], 'partial');

    server
      ..tamperManifest = false
      ..corruptedFiles.add(sha256Hex(List.filled(2048, 2)));
    report = await sync();
    expect(report.failures.single.code, 'FILE_HASH_MISMATCH');
    expect((await installed())[siteA], publicationId(1));
    expect((await database.syncStateDao.read()).status, 'failed');
  });

  test(
    'refuse le rejeu d’un catalogue plus ancien que le dernier accepté',
    () async {
      server.publish(publicationOf(siteA, 1));
      await sync();
      server.generation -= 1;

      await expectLater(
        service.run(userId: userId),
        throwsA(
          isA<SyncIntegrityException>().having(
            (e) => e.code,
            'code',
            'CATALOG_REPLAYED',
          ),
        ),
      );
    },
  );

  test('refuse un catalogue émis pour un autre utilisateur', () async {
    server
      ..publish(publicationOf(siteA, 1))
      ..catalogUserId = '00000000-0000-4000-b000-000000000099';

    await expectLater(
      service.run(userId: userId),
      throwsA(isA<SyncIntegrityException>()),
    );
    expect(await installed(), isEmpty);
  });

  test('coupure réseau pendant les téléchargements : jamais de mélange, '
      'reprise des seuls fichiers manquants', () async {
    server
      ..publish(publicationOf(siteA, 1))
      ..publish(publicationOf(siteB, 1, name: 'Collège'))
      ..filesOfflineAfter = 3;

    final interrupted = await sync();

    expect(interrupted.interrupted, isTrue);
    expect(interrupted.installed, 1);
    expect((await installed()).length, 1);
    final state = await database.syncStateDao.read();
    expect(state.activeGeneration, isNull);
    expect(state.status, 'failed');
    final alreadyDownloaded = [...server.downloadedFiles];

    server.filesOfflineAfter = null;
    server.downloadedFiles.clear();
    final resumed = await sync();

    expect(resumed.complete, isTrue);
    expect((await installed()).length, 2);
    // Le fichier déjà vérifié avant la coupure n'est pas retéléchargé.
    expect(
      server.downloadedFiles.toSet().intersection(alreadyDownloaded.toSet()),
      isEmpty,
    );
    expect(
      (await database.syncStateDao.read()).activeGeneration,
      server.generation,
    );
  });

  test('terminal révoqué : données et identité effacées (OFF-04)', () async {
    server.publish(publicationOf(siteA, 1));
    await sync();
    server.revoked = true;

    final report = await service.run(userId: userId);

    expect(report, isA<SyncPurged>());
    expect((report as SyncPurged).reason, ApiErrorCode.deviceRevoked);
    expect(await installed(), isEmpty);
    expect(
      await database.offlineDao.presentBlobs(
        server.catalog[siteA]!.files.values.map(sha256Hex),
      ),
      isEmpty,
    );
    expect(secureStore.values[SecureStorageKeys.deviceIdentity], isNull);
    expect((await database.syncStateDao.read()).authorizedUserId, isNull);
    expect(await service.run(userId: userId), isA<SyncNotEnrolled>());
  });

  test(
    'horloge de la tablette décalée : recalage sur l’heure du serveur',
    () async {
      server.publish(publicationOf(siteA, 1));
      deviceClock = server.serverClock.subtract(const Duration(hours: 2));

      final report = await sync();

      expect(report.complete, isTrue);
      expect(server.clockSkewRefusals, 1);
    },
  );

  test('sans réseau : rien ne change et ce n’est pas une erreur de '
      'synchronisation (OPS-05)', () async {
    server.publish(publicationOf(siteA, 1));
    await sync();
    final before = await database.syncStateDao.read();
    server.apiOffline = true;

    await expectLater(
      service.run(userId: userId),
      throwsA(isA<NetworkException>()),
    );

    final after = await database.syncStateDao.read();
    expect(after.status, 'idle');
    expect(after.lastSyncAt, before.lastSyncAt);
    expect(after.lastError, contains('Réseau indisponible'));
    expect((await installed())[siteA], publicationId(1));
  });

  test('bail perdu avant l’activation (moteur gelé, SYN-01) : rien n’est '
      'installé ni écrit, l’autre moteur tient l’état', () async {
    server.publish(publicationOf(siteA, 1));
    await sync();
    final before = await database.syncStateDao.read();
    server.publish(publicationOf(siteA, 2));
    deviceClock = deviceClock.add(const Duration(minutes: 5));

    await expectLater(
      service.run(userId: userId, holdsLease: () async => false),
      throwsA(isA<SyncSuperseded>()),
    );

    expect(await installed(), {siteA: publicationId(1)});
    final after = await database.syncStateDao.read();
    expect(after.lastSyncAt, before.lastSyncAt);
    expect(after.catalogGeneration, before.catalogGeneration);
    expect(server.receipts, hasLength(1));
  });

  group('version minimale de l’application (SYN-02)', () {
    test('application trop ancienne : le référentiel installé reste lisible, '
        'les retraits s’appliquent, la mise à jour est demandée', () async {
      server
        ..publish(publicationOf(siteA, 1))
        ..publish(publicationOf(siteB, 1, name: 'Collège'));
      await sync();
      final before = await database.syncStateDao.read();
      server.packageRequests.clear();
      server.serverClock = server.serverClock.add(const Duration(hours: 1));
      deviceClock = server.serverClock;
      server
        ..minAppVersion = '99.0.0'
        ..publish(publicationOf(siteA, 2))
        ..withdraw(siteB);

      final report = await service.run(userId: userId);

      expect(
        report,
        isA<SyncUpdateRequired>()
            .having((r) => r.minVersion, 'minVersion', '99.0.0')
            .having((r) => r.removed, 'removed', 1),
      );
      // Rien de nouveau n'est téléchargé ; le site retiré l'est quand même.
      expect(server.packageRequests, isEmpty);
      expect(await installed(), {siteA: publicationId(1)});
      final state = await database.syncStateDao.read();
      expect(state.requiredAppVersion, '99.0.0');
      expect(state.lastSyncAt, before.lastSyncAt);
      expect(
        state.authorizationExpiresAt,
        server.serverClock.add(const Duration(days: 7)),
      );
      expect(state.lastError, contains('version 99.0.0 minimum'));
      expect(
        server.receipts.last,
        allOf(
          containsPair('error_code', 'APP_UPDATE_REQUIRED'),
          containsPair('status', 'partial'),
        ),
      );

      // Application à jour : l'installation reprend et l'alerte disparaît.
      server.minAppVersion = AppInfo.version;
      final resumed = await sync();
      expect(resumed.complete, isTrue);
      expect(await installed(), {siteA: publicationId(2)});
      expect((await database.syncStateDao.read()).requiredAppVersion, isNull);
    });

    test('catalogue d’un format plus récent : rien n’est lu ni installé, '
        'la mise à jour est demandée', () async {
      server.publish(publicationOf(siteA, 1));
      await sync();
      server.catalogVersion = 2;

      final report = await service.run(userId: userId);

      expect(
        report,
        isA<SyncUpdateRequired>().having(
          (r) => r.minVersion,
          'minVersion',
          isNull,
        ),
      );
      expect(await installed(), {siteA: publicationId(1)});
      final state = await database.syncStateDao.read();
      expect(state.requiredAppVersion, '');
      expect(state.status, 'failed');
      expect(
        server.receipts.last,
        containsPair('error_code', 'APP_UPDATE_REQUIRED'),
      );
    });

    test('paquet exigeant un lecteur plus récent : l’ancienne version du '
        'site reste et la mise à jour est demandée', () async {
      server.publish(publicationOf(siteA, 1));
      await sync();
      server.publish(
        FakePublication(
          siteId: siteA,
          publicationId: publicationId(2),
          number: 2,
          siteName: 'EHPAD Les Oliviers',
          files: {'etare.pdf': List.filled(1024, 7)},
          minReaderVersion: '9.0.0',
        ),
      );

      final report = await sync();

      expect(report.failures.single.code, 'READER_TOO_OLD');
      expect(await installed(), {siteA: publicationId(1)});
      final state = await database.syncStateDao.read();
      expect(state.requiredAppVersion, '');
      expect(state.lastError, contains('Mise à jour de l’application requise'));
    });
  });
}
