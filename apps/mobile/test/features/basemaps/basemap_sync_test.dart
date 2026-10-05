import 'dart:io';

import 'package:drift/native.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/basemaps/application/basemap_sync.dart';
import 'package:etare_ops/src/features/basemaps/data/basemap_store.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

import '../../support/fakes.dart';
import '../sync/fake_sync_server.dart';

const sectorNice = '0600001a-0000-4000-8000-000000000001';
const sectorAntibes = '0600001a-0000-4000-8000-000000000002';

String packId(int index) =>
    '0600000b-0000-4000-8000-${index.toString().padLeft(12, '0')}';

FakeBasemap basemapOf(
  int index, {
  String sector = sectorNice,
  int version = 1,
  int size = 10,
  Map<String, List<int>> extra = const {},
}) => FakeBasemap(
  packId: packId(index),
  sectorId: sector,
  sectorName: sector == sectorNice ? 'CIS Nice Centre' : 'CIS Antibes',
  version: version,
  tiles: List.generate(size, (byte) => (byte * 7 + index) % 256),
  extra: extra,
);

void main() {
  late FakeSyncServer server;
  late AppDatabase database;
  late Directory root;
  late SyncService service;
  late BasemapStore store;

  setUp(() async {
    server = await FakeSyncServer.start();
    database = AppDatabase(NativeDatabase.memory());
    root = await Directory.systemTemp.createTemp('etare-basemaps-test-');
    final api = SyncApi(
      api: serverDio(apiBase, server.handleApi),
      files: serverDio(apiBase, server.handleFile),
      clock: () => server.serverClock,
    );
    final identities = DeviceIdentityStore(InMemorySecureStore());
    store = BasemapStore(() async => root);
    service = SyncService(
      api: api,
      offline: database.offlineDao,
      reports: database.reportsDao,
      state: database.syncStateDao,
      identities: identities,
      trustedKeys: server.trustedKeys,
      // Seuil du Wi-Fi abaissé à 16 octets pour les essais.
      basemaps: BasemapSync(
        api: api,
        dao: database.basemapDao,
        store: store,
        trustedKeys: server.trustedKeys,
        clock: () => server.serverClock,
        largeThresholdBytes: 16,
        budgetBytes: 200,
      ),
      clock: () => server.serverClock,
    );
    await EnrollmentService(
      api: api,
      identities: identities,
    ).enroll(tenantId: tenantId, code: 'abcd-efgh-jklm');
  });

  tearDown(() async {
    await database.close();
    if (await root.exists()) await root.delete(recursive: true);
  });

  Future<BasemapSyncReport> sync({bool wifi = true}) async {
    final report = await service.run(
      userId: userId,
      allowLargeBasemaps: wifi,
    ) as SyncCompleted;
    return report.basemaps!;
  }

  File fileOf(String pack, String name) =>
      File(p.join(root.path, 'basemaps', pack, name));

  test('installe le fond du secteur : parties vérifiées, fichier reconstitué, '
      'style et pictogrammes, accusé de réception', () async {
    final basemap = basemapOf(1, extra: {'sprite.png': List.filled(5, 9)});
    server.publishBasemap(basemap);

    final report = await sync();

    expect(report.installed, 1);
    expect(report.failures, isEmpty);
    expect(
      await fileOf(packId(1), 'tiles.pmtiles').readAsBytes(),
      basemap.tiles,
    );
    expect(await fileOf(packId(1), 'style.json').readAsString(), basemap.style);
    expect(await fileOf(packId(1), 'sprite.png').readAsBytes(), [
      9,
      9,
      9,
      9,
      9,
    ]);
    expect(
      await fileOf(packId(1), 'manifest.json').readAsString(),
      basemap.manifest,
    );
    final rows = await database.basemapDao.all();
    expect(rows.single.sectorName, 'CIS Nice Centre');
    expect(rows.single.totalBytes, basemap.totalBytes);
    expect(server.basemapReceipts.last, [packId(1)]);
    expect(
      Directory(p.join(root.path, 'basemaps', '.incoming')).listSync(),
      isEmpty,
    );

    // Rien à refaire au passage suivant.
    server.downloadedFiles.clear();
    expect((await sync()).installed, 0);
    expect(server.downloadedFiles, isEmpty);
  });

  test('reprend un téléchargement interrompu à la partie suivante', () async {
    server
      ..publishBasemap(basemapOf(1))
      ..filesOfflineAfter = 2;

    final interrupted = await sync();
    expect(interrupted.interrupted, isTrue);
    expect(await database.basemapDao.all(), isEmpty);
    expect(server.downloadedFiles, hasLength(2));

    server
      ..filesOfflineAfter = null
      ..downloadedFiles.clear();
    final resumed = await sync();
    expect(resumed.installed, 1);
    // Trois parties de 4, 4 et 2 octets plus le style : les deux premières
    // parties ne sont pas retéléchargées.
    expect(server.downloadedFiles, hasLength(2));
    expect(
      await fileOf(packId(1), 'tiles.pmtiles').readAsBytes(),
      basemapOf(1).tiles,
    );
  });

  test(
    'refuse une partie altérée ou un manifeste mal signé, sans rien installer',
    () async {
      final basemap = basemapOf(1);
      server
        ..publishBasemap(basemap)
        ..corruptedFiles.add(basemap.objects.keys.first);
      expect((await sync()).failures.single.code, 'BASEMAP_PART_MISMATCH');
      expect(await database.basemapDao.all(), isEmpty);
      expect(
        Directory(p.join(root.path, 'basemaps', packId(1))).existsSync(),
        isFalse,
      );

      server
        ..corruptedFiles.clear()
        ..signBasemapWithCatalogKey = true;
      expect((await sync()).failures.single.code, 'BASEMAP_SIGNATURE_INVALID');

      server.signBasemapWithCatalogKey = false;
      expect((await sync()).installed, 1);
    },
  );

  test('laisse au Wi-Fi un fond de plus de 50 Mo (ici 16 octets)', () async {
    server.publishBasemap(basemapOf(1, size: 40));

    final cellular = await sync(wifi: false);
    expect(cellular.installed, 0);
    expect(cellular.deferredBytes, basemapOf(1, size: 40).totalBytes);
    expect(server.downloadedFiles, isEmpty);

    expect((await sync()).installed, 1);
  });

  test('garde l’ancienne version jusqu’à l’installation de la nouvelle, '
      'puis retire le fond d’un secteur qui n’est plus reçu', () async {
    server.publishBasemap(basemapOf(1));
    await sync();

    server.publishBasemap(basemapOf(2, version: 2, size: 40));
    await sync(wifi: false);
    expect((await database.basemapDao.all()).single.packId, packId(1));
    expect(fileOf(packId(1), 'tiles.pmtiles').existsSync(), isTrue);

    await sync();
    expect((await database.basemapDao.all()).single.packId, packId(2));
    expect(
      Directory(p.join(root.path, 'basemaps', packId(1))).existsSync(),
      isFalse,
    );

    server
      ..basemaps.clear()
      ..publishBasemap(basemapOf(3, sector: sectorAntibes));
    final moved = await sync();
    expect(moved.removed, 1);
    expect(moved.installed, 1);
    expect((await database.basemapDao.all()).single.sectorId, sectorAntibes);
    expect(
      Directory(p.join(root.path, 'basemaps', packId(2))).existsSync(),
      isFalse,
    );
  });

  test('respecte le budget de la tablette', () async {
    server
      ..publishBasemap(basemapOf(1, size: 150))
      ..publishBasemap(basemapOf(2, sector: sectorAntibes, size: 150));
    final report = await sync();
    expect(report.installed, 1);
    expect(report.failures.single.code, 'BASEMAP_BUDGET');
  });

  test('efface les fonds à la révocation du terminal', () async {
    server.publishBasemap(basemapOf(1));
    await sync();
    server.revoked = true;
    expect(await service.run(userId: userId), isA<SyncPurged>());
    expect(await database.basemapDao.all(), isEmpty);
    expect(Directory(p.join(root.path, 'basemaps')).existsSync(), isFalse);
  });

  test('sans fond demandé ni détenu, ne touche pas au disque', () async {
    final report = await sync();
    expect(report.installed, 0);
    expect(Directory(p.join(root.path, 'basemaps')).existsSync(), isFalse);
    expect(server.basemapReceipts, isEmpty);
  });
}
