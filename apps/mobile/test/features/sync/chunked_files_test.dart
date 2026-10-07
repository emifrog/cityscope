import 'dart:io';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:etare_ops/src/core/errors/error_messages.dart';
import 'package:etare_ops/src/core/storage/storage_guard.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/basemaps/application/basemap_sync.dart';
import 'package:etare_ops/src/features/ops/data/file_source.dart';
import 'package:etare_ops/src/features/sync/application/document_downloader.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_messages.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/application/trust_store.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_platform.dart';
import '../../support/fakes.dart';
import 'fake_sync_server.dart';

const site = '06000002-0000-4000-8000-00000000000a';

/// Taille des morceaux dans ces tests : un fichier de 10 Ko en fait trois.
const chunk = 4096;

/// Contenu sans motif : un décalage d'un octet change l'empreinte.
List<int> content(int size, int seed) =>
    List.generate(size, (i) => (i * 31 + seed * 7 + i ~/ 251) & 0xff);

final plan = content(10500, 1);
final notice = content(3000, 2);
final prevention = content(9000, 3);

FakePublication version(int number, {List<int>? planBytes}) => FakePublication(
  siteId: site,
  publicationId:
      '0600000f-0000-4000-8000-${number.toString().padLeft(12, '0')}',
  number: number,
  siteName: 'Centre commercial du Var',
  files: {'plans/rdc.png': planBytes ?? plan, 'etare.pdf': notice},
  optionalFiles: {'documents/prevention.pdf': prevention},
);

void main() {
  late FakeSyncServer server;
  late AppDatabase database;
  late FakePlatformServices platform;
  late SyncService service;
  late DocumentDownloader downloader;

  setUp(() async {
    server = await FakeSyncServer.start();
    database = AppDatabase(NativeDatabase.memory());
    platform = FakePlatformServices();
    final api = SyncApi(
      api: serverDio(apiBase, server.handleApi),
      files: serverDio(apiBase, server.handleFile),
      clock: () => server.serverClock,
    );
    final identities = DeviceIdentityStore(InMemorySecureStore());
    final storage = StorageGuard(
      platform: platform,
      directory: () async => Directory.systemTemp,
    );
    service = SyncService(
      api: api,
      offline: database.offlineDao,
      reports: database.reportsDao,
      state: database.syncStateDao,
      identities: identities,
      trust: TrustStore(embedded: server.trustedKeys, dao: database.trustDao),
      clock: () => server.serverClock,
      storage: storage,
      chunkBytes: chunk,
    );
    downloader = DocumentDownloader(
      api: api,
      offline: database.offlineDao,
      identities: identities,
      clock: () => server.serverClock,
      storage: storage,
      chunkBytes: chunk,
    );
    await EnrollmentService(
      api: api,
      identities: identities,
    ).enroll(tenantId: tenantId, code: 'abcd-efgh-jklm');
  });

  tearDown(() => database.close());

  Future<SyncCompleted> sync() async =>
      await service.run(userId: userId) as SyncCompleted;

  Future<List<FileChunkRow>> chunksOf(List<int> bytes) => (database.select(
    database.fileChunks,
  )..where((t) => t.sha256.equals(sha256Hex(bytes)))).get();

  Future<bool> onTablet(List<int> bytes) async =>
      (await database.offlineDao.presentBlobs([sha256Hex(bytes)])).isNotEmpty;

  test(
    'un fichier est rangé par morceaux et relu entier ou par plages',
    () async {
      server.publish(version(1));

      final report = await sync();

      expect(report.complete, isTrue);
      final rows = await chunksOf(plan);
      expect(rows.map((row) => row.content.length), [
        chunk,
        chunk,
        10500 - 8192,
      ]);
      final offline = database.offlineDao;
      final hash = sha256Hex(plan);
      expect(await offline.blob(hash), plan);
      expect(await offline.storedFile(hash), (sizeBytes: 10500, chunkCount: 3));

      // Lecture par plages, comme PDFium : deux morceaux au plus en mémoire.
      final loaded = <int>[];
      final source = ChunkedSource(
        length: 10500,
        chunk: (index) {
          loaded.add(index);
          return offline.chunk(hash, index);
        },
        cachedChunks: 2,
      );
      final buffer = Uint8List(3000);
      // Plage à cheval sur deux morceaux, puis fin de fichier.
      expect(await source.read(buffer, 3000, 3000), 3000);
      expect(buffer, plan.sublist(3000, 6000));
      expect(await source.read(buffer, 9500, 3000), 1000);
      expect(buffer.sublist(0, 1000), plan.sublist(9500));
      expect(await source.read(buffer, 10500, 10), 0);
      expect(await source.read(buffer, 0, 100), 100);
      expect(buffer.sublist(0, 100), plan.sublist(0, 100));
      // 0 et 1 pour la première plage, 2 pour la fin, puis 0 relu : il avait
      // quitté le cache.
      expect(loaded, [0, 1, 2, 0]);
    },
  );

  test('fichier rangé avant CAP-02 : relu depuis son contenu entier', () async {
    final legacy = Uint8List.fromList(content(5000, 4));
    await database.offlineDao.storeBlob(
      sha256Hex(legacy),
      legacy,
      server.serverClock,
    );
    expect(await database.offlineDao.storedFile(sha256Hex(legacy)), (
      sizeBytes: 5000,
      chunkCount: 0,
    ));
    final source = MemorySource(legacy);
    final buffer = Uint8List(10);
    expect(await source.read(buffer, 4995, 10), 5);
    expect(buffer.sublist(0, 5), legacy.sublist(4995));
  });

  test('une coupure en cours de fichier reprend au morceau suivant', () async {
    server
      ..publish(version(1))
      // Coupé au milieu du deuxième morceau du premier fichier.
      ..cutNextFileAfterBytes = 6000;

    final first = await sync();

    expect(first.interrupted, isTrue);
    expect(first.installed, 0);
    expect(await onTablet(plan), isFalse);
    // Le premier morceau est gardé, invisible tant que le fichier n'est pas
    // complet et vérifié.
    expect(await database.offlineDao.receivedBytes(sha256Hex(plan)), chunk);
    expect(await chunksOf(plan), hasLength(1));
    expect(await database.offlineDao.blob(sha256Hex(plan)), isNull);

    server.fileRanges.clear();
    final second = await sync();

    expect(second.complete, isTrue);
    expect(second.installed, 1);
    expect(server.fileRanges.first, 'bytes=$chunk-');
    expect(await database.offlineDao.blob(sha256Hex(plan)), plan);
    expect(await database.offlineDao.receivedBytes(sha256Hex(plan)), 0);
  });

  test('un stockage qui ignore la plage fait tout reprendre, sans '
      'mélange', () async {
    server
      ..publish(version(1))
      ..cutNextFileAfterBytes = 6000;
    await sync();
    server.ignoreRange = true;

    final report = await sync();

    expect(report.complete, isTrue);
    expect(await database.offlineDao.blob(sha256Hex(plan)), plan);
    expect(await chunksOf(plan), hasLength(3));
  });

  test('un fichier altéré ne laisse aucun morceau', () async {
    server
      ..publish(version(1))
      ..corruptedFiles.add(sha256Hex(plan));

    final report = await sync();

    expect(report.failures.single.code, 'FILE_HASH_MISMATCH');
    expect(await chunksOf(plan), isEmpty);
    expect(await database.offlineDao.receivedBytes(sha256Hex(plan)), 0);
  });

  test(
    'une reprise dont le fichier a disparu du catalogue est effacée',
    () async {
      server
        ..publish(version(1))
        ..cutNextFileAfterBytes = 6000;
      await sync();
      expect(await chunksOf(plan), hasLength(1));

      // Nouvelle version avec un autre plan : l'ancien téléchargement partiel
      // n'est plus utile.
      final other = content(5000, 9);
      server.publish(version(2, planBytes: other));
      final report = await sync();

      expect(report.complete, isTrue);
      expect(await chunksOf(plan), isEmpty);
      expect(await database.offlineDao.blob(sha256Hex(other)), other);
    },
  );

  test('place insuffisante : rien n’est commencé, message clair et code dans '
      'l’accusé', () async {
    server.publish(version(1));
    platform.freeBytes = 10 * 1024 * 1024;

    final report = await sync();

    expect(report.complete, isFalse);
    expect(report.installed, 0);
    expect(
      report.storageProblem,
      contains('Stockage de la tablette insuffisant'),
    );
    expect(server.downloadedFiles, isEmpty);
    expect(server.receipts.last['error_code'], 'STORAGE_INSUFFICIENT');
    expect(server.receipts.last['status'], 'error');
    final state = await database.syncStateDao.read();
    expect(state.lastError, report.storageProblem);

    // Place libérée : la synchronisation suivante installe tout.
    platform.freeBytes = 1024 * 1024 * 1024;
    expect((await sync()).complete, isTrue);
  });

  test('la marge tient compte de la base et du système', () {
    expect(StorageGuard.neededFor(100 * 1024 * 1024), 174 * 1024 * 1024);
  });

  test('disque plein reconnu, message pour l’agent', () {
    final full = SqliteException(
      extendedResultCode: 13,
      message: 'database or disk is full',
    );
    const enospc = FileSystemException(
      'écriture',
      'fond.pmtiles',
      OSError('No space left on device', 28),
    );
    expect(isStorageFull(full), isTrue);
    expect(isStorageFull(enospc), isTrue);
    expect(
      isStorageFull(
        SqliteException(extendedResultCode: 19, message: 'constraint'),
      ),
      isFalse,
    );
    expect(isStorageFull(StateError('autre')), isFalse);
    expect(describeError(full), storageFullMessage);
    expect(
      describeError(
        const StorageInsufficientException(
          neededBytes: 200 * 1024 * 1024,
          availableBytes: 50 * 1024 * 1024,
        ),
      ),
      contains('200,0 Mo nécessaires, 50,0 Mo libres'),
    );
  });

  test('bilan des fonds de carte lisible par l’agent', () {
    expect(basemapSummary(null), isNull);
    expect(basemapSummary(const BasemapSyncReport()), isNull);
    expect(
      basemapSummary(
        const BasemapSyncReport(
          installed: 1,
          failures: [
            BasemapFailure('CIS Antibes', StorageInsufficientException.code),
          ],
        ),
      ),
      '1 fond(s) de carte installé(s), fond « CIS Antibes » non installé '
      '(place insuffisante sur la tablette).',
    );
    expect(
      basemapSummary(const BasemapSyncReport(deferredBytes: 80 * 1024 * 1024)),
      'Fond(s) de carte de 80,0 Mo en attente du Wi-Fi.',
    );
  });

  group('document à la demande', () {
    setUp(() async {
      server.publish(version(1));
      await sync();
    });

    test('téléchargé par morceaux, repris après une coupure', () async {
      server.cutNextFileAfterBytes = 5000;
      final progress = <int>[];

      await expectLater(
        downloader.download(
          siteId: site,
          sha256: sha256Hex(prevention),
          onProgress: (received, _) => progress.add(received),
        ),
        throwsA(isA<Object>()),
      );
      expect(await onTablet(prevention), isFalse);
      expect(
        await database.offlineDao.receivedBytes(sha256Hex(prevention)),
        chunk,
      );

      server.fileRanges.clear();
      await downloader.download(siteId: site, sha256: sha256Hex(prevention));

      expect(server.fileRanges.single, 'bytes=$chunk-');
      expect(await onTablet(prevention), isTrue);
      expect(await database.offlineDao.blob(sha256Hex(prevention)), prevention);
      expect(progress.last, lessThanOrEqualTo(9000));
    });

    test('place insuffisante : refus avant tout téléchargement', () async {
      platform.freeBytes = 1024;

      await expectLater(
        downloader.download(siteId: site, sha256: sha256Hex(prevention)),
        throwsA(isA<StorageInsufficientException>()),
      );
      expect(server.downloadedFiles, isNot(contains(sha256Hex(prevention))));
    });

    test('retiré par l’agent : morceaux effacés', () async {
      await downloader.download(siteId: site, sha256: sha256Hex(prevention));
      expect(await chunksOf(prevention), hasLength(3));

      expect(await downloader.discard(sha256Hex(prevention)), isTrue);

      expect(await chunksOf(prevention), isEmpty);
      expect(await onTablet(prevention), isFalse);
    });
  });
}
