import 'package:drift/native.dart';
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/sync/application/document_downloader.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/application/trust_store.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fakes.dart';
import 'fake_sync_server.dart';

const site = '06000002-0000-4000-8000-00000000000a';
final plan = List.filled(2048, 1);
final prevention = List.filled(4096, 2);
final maintenance = List.filled(1024, 3);

FakePublication version(int number, {Map<String, List<int>>? optional}) =>
    FakePublication(
      siteId: site,
      publicationId:
          '0600000f-0000-4000-8000-${number.toString().padLeft(12, '0')}',
      number: number,
      siteName: 'EHPAD Les Oliviers',
      files: {'plans/rdc.png': plan},
      optionalFiles: optional ?? {'documents/prevention.pdf': prevention},
    );

void main() {
  late FakeSyncServer server;
  late AppDatabase database;
  late SyncService sync;
  late DocumentDownloader downloader;

  setUp(() async {
    server = await FakeSyncServer.start();
    database = AppDatabase(NativeDatabase.memory());
    final api = SyncApi(
      api: serverDio(apiBase, server.handleApi),
      files: serverDio(apiBase, server.handleFile),
      clock: () => server.serverClock,
    );
    final identities = DeviceIdentityStore(InMemorySecureStore());
    sync = SyncService(
      api: api,
      offline: database.offlineDao,
      reports: database.reportsDao,
      state: database.syncStateDao,
      identities: identities,
      trust: TrustStore(embedded: server.trustedKeys, dao: database.trustDao),
      clock: () => server.serverClock,
    );
    downloader = DocumentDownloader(
      api: api,
      offline: database.offlineDao,
      identities: identities,
      clock: () => server.serverClock,
    );
    await EnrollmentService(
      api: api,
      identities: identities,
    ).enroll(tenantId: tenantId, code: 'abcd-efgh-jklm');
    server.publish(version(1));
    await sync.run(userId: userId);
  });

  tearDown(() => database.close());

  Future<bool> onTablet(List<int> bytes) async =>
      (await database.offlineDao.presentBlobs([sha256Hex(bytes)])).isNotEmpty;

  Future<void> download(List<int> bytes) =>
      downloader.download(siteId: site, sha256: sha256Hex(bytes));

  Matcher failsWith(DocumentDownloadFailure failure) => throwsA(
    isA<DocumentDownloadException>().having(
      (e) => e.failure,
      'failure',
      failure,
    ),
  );

  test('la synchronisation installe la version sans le document à la '
      'demande, qui reste listé avec sa taille', () async {
    expect(await onTablet(plan), isTrue);
    expect(await onTablet(prevention), isFalse);
    expect(server.downloadedFiles, isNot(contains(sha256Hex(prevention))));
    final file = await database.offlineDao.installedFile(
      site,
      sha256Hex(prevention),
    );
    expect(file?.required, isFalse);
    expect(file?.sizeBytes, prevention.length);
  });

  test('téléchargement explicite : vérifié, chiffré dans la base, conservé '
      'tant que la version installée le référence (DOC-02)', () async {
    final progress = <int>[];
    await downloader.download(
      siteId: site,
      sha256: sha256Hex(prevention),
      onProgress: (received, total) => progress.add(received),
    );

    expect(await database.offlineDao.blob(sha256Hex(prevention)), prevention);
    expect(progress, isNotEmpty);
    // Une seconde demande ne retélécharge rien.
    server.downloadedFiles.clear();
    await download(prevention);
    expect(server.downloadedFiles, isEmpty);

    // Nouvelle version, même document : il reste sur la tablette.
    server.publish(
      version(2, optional: {'documents/prevention.pdf': prevention}),
    );
    await sync.run(userId: userId);
    expect(await onTablet(prevention), isTrue);

    // Document remplacé dans une version suivante : l'ancien est effacé, le
    // nouveau n'est pas téléchargé d'office.
    server.publish(
      version(3, optional: {'documents/maintenance.pdf': maintenance}),
    );
    await sync.run(userId: userId);
    expect(await onTablet(prevention), isFalse);
    expect(await onTablet(maintenance), isFalse);
  });

  test('fichier altéré : refusé, rien n’est enregistré', () async {
    server.corruptedFiles.add(sha256Hex(prevention));

    await expectLater(
      download(prevention),
      failsWith(DocumentDownloadFailure.corrupted),
    );
    expect(await onTablet(prevention), isFalse);
  });

  test('sans réseau : erreur réseau, rien n’est enregistré', () async {
    server.apiOffline = true;

    await expectLater(download(prevention), throwsA(isA<NetworkException>()));
    expect(await onTablet(prevention), isFalse);
  });

  test('version installée remplacée sur le serveur : le document n’est plus '
      'distribué pour elle, il faut synchroniser', () async {
    server.publish(version(2));

    await expectLater(
      download(prevention),
      failsWith(DocumentDownloadFailure.unavailable),
    );
  });

  test('seuls les documents à la demande de la version installée sont '
      'téléchargeables', () async {
    await expectLater(
      download(plan),
      failsWith(DocumentDownloadFailure.notOffered),
    );
    await expectLater(
      download(maintenance),
      failsWith(DocumentDownloadFailure.notOffered),
    );
  });

  test('retrait par l’agent : la place est libérée, jamais un fichier '
      'obligatoire', () async {
    await download(prevention);

    expect(await downloader.discard(sha256Hex(prevention)), isTrue);
    expect(await onTablet(prevention), isFalse);
    expect(await downloader.discard(sha256Hex(plan)), isFalse);
    expect(await onTablet(plan), isTrue);
  });
}
