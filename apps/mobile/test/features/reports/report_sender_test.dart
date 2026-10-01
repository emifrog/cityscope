import 'dart:convert';
import 'dart:typed_data';

import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/reports/application/report_providers.dart';
import 'package:etare_ops/src/features/reports/application/report_sender.dart';
import 'package:etare_ops/src/features/reports/data/photo_picker.dart';
import 'package:etare_ops/src/features/reports/domain/field_report.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fakes.dart';
import '../sync/fake_sync_server.dart';

const otherUser = '00000000-0000-4000-b000-000000000099';
const siteId = '06000002-0000-4000-8000-000000000001';

/// Petite image PNG valide (en-tête reconnu).
final png = Uint8List.fromList([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, //
  ...List.filled(64, 7),
]);

void main() {
  late FakeSyncServer server;
  late AppDatabase database;
  late ReportSender sender;
  late SyncService sync;

  setUp(() async {
    server = await FakeSyncServer.start();
    database = AppDatabase(NativeDatabase.memory());
    final secureStore = InMemorySecureStore();
    final api = SyncApi(
      api: serverDio(apiBase, server.handleApi),
      files: serverDio(apiBase, server.handleFile),
      clock: () => server.serverClock,
    );
    final identities = DeviceIdentityStore(secureStore);
    sender = ReportSender(
      api: api,
      reports: database.reportsDao,
      identities: identities,
      clock: () => server.serverClock,
    );
    sync = SyncService(
      api: api,
      offline: database.offlineDao,
      reports: database.reportsDao,
      state: database.syncStateDao,
      identities: identities,
      trustedKeys: server.trustedKeys,
      clock: () => server.serverClock,
    );
    await EnrollmentService(
      api: api,
      identities: identities,
    ).enroll(tenantId: tenantId, code: 'abcd-efgh-jklm');
  });

  tearDown(() => database.close());

  Future<String> record({String author = userId, bool withPhoto = true}) async {
    final id = newClientReportId();
    await database.reportsDao.save(
      FieldReportsCompanion.insert(
        clientReportId: id,
        authorUserId: author,
        tenantId: tenantId,
        siteId: siteId,
        siteName: 'EHPAD Les Oliviers',
        publicationId: '0600000f-0000-4000-8000-000000000002',
        publicationNumber: 2,
        category: ReportCategory.access.wire,
        severity: ReportSeverity.urgent.wire,
        description: 'Portail secondaire condamné.',
        observedAt: '2026-10-01T09:50:00.000Z',
        itemType: const Value('object'),
        itemId: const Value('06000009-0000-4000-8000-000000000004'),
        createdAt: server.serverClock,
      ),
      [if (withPhoto) photoFromBytes(png, position: 0)],
    );
    return id;
  }

  Future<FieldReportRow> row(String id) => (database.select(
    database.fieldReports,
  )..where((t) => t.clientReportId.equals(id))).getSingle();

  test('transmet le signalement, sa photo par URL signée, puis demande son '
      'contrôle ; la photo quitte la tablette', () async {
    final id = await record();

    final summary = await sender.sendPending(userId: userId);

    expect(summary.sent, 1);
    final received = server.reports[id]!;
    expect(jsonDecode(received.body), containsPair('category', 'access'));
    expect(received.confirmations, 1);
    expect(server.storedObjects.values.single, png);
    final local = await row(id);
    expect(local.localState, 'sent');
    expect(local.serverReportId, received.id);
    expect(agentStateOf(local), AgentReportState.received);
    expect(await database.reportsDao.photosOf(id), isEmpty);
  });

  test('un accusé perdu ne crée pas de second signalement ; la photo déjà '
      'déposée compte comme reçue', () async {
    final id = await record();
    server.loseNextReportAnswer = true;

    final first = await sender.sendPending(userId: userId);
    expect(first.offline, isTrue);
    expect((await row(id)).localState, 'pending');

    // Envoi du fichier perdu lui aussi : il est déjà au stockage.
    server.storedObjects['/upload/${server.reports[id]!.id}/${photoFromBytes(png, position: 0).sha256}'] =
        png;
    final second = await sender.sendPending(userId: userId);

    expect(second.sent, 1);
    expect(server.reports, hasLength(1));
    expect(server.duplicateUploads, 1);
    expect(server.reports[id]!.confirmations, 1);
    expect((await row(id)).localState, 'sent');
  });

  test('sans réseau, le signalement reste dans la file chiffrée', () async {
    final id = await record();
    server.apiOffline = true;

    final summary = await sender.sendPending(userId: userId);

    expect(summary.offline, isTrue);
    expect(summary.waiting, 1);
    final local = await row(id);
    expect(local.localState, 'pending');
    expect(local.attempts, 1);
    expect(await database.reportsDao.photosOf(id), hasLength(1));
  });

  test(
    'un refus du serveur est signalé à l’agent, sans renvoi automatique',
    () async {
      final id = await record(withPhoto: false);
      server.refuseReportsWith = 'VALIDATION_FAILED';

      final summary = await sender.sendPending(userId: userId);

      expect(summary.refused, 1);
      expect(agentStateOf(await row(id)), AgentReportState.refused);
      server.refuseReportsWith = null;
      expect((await sender.sendPending(userId: userId)).sent, 0);
    },
  );

  test('chaque agent n’envoie et ne voit que ses signalements', () async {
    final mine = await record();
    final theirs = await record(author: otherUser);

    await sender.sendPending(userId: userId);

    expect(server.reports.keys, [mine]);
    final visible = await database.reportsDao.watchForAuthor(userId).first;
    expect(visible.map((r) => r.clientReportId), [mine]);
    expect((await row(theirs)).localState, 'pending');
  });

  test('la suite donnée par la Prévision revient sur la tablette', () async {
    final id = await record(withPhoto: false);
    await sender.sendPending(userId: userId);
    server.reports[id]!
      ..status = 'resolved'
      ..decisionComment = 'Accès corrigé dans la révision 3.'
      ..revisionNo = 3
      ..publicationNumber = 3;

    await sender.sendPending(userId: userId);

    final local = await row(id);
    expect(agentStateOf(local), AgentReportState.processed);
    expect(local.decisionComment, 'Accès corrigé dans la révision 3.');
    expect(local.resolutionPublicationNumber, 3);
  });

  test('la révocation purge la file avec le reste et le dit', () async {
    await record();
    await record(withPhoto: false);
    server.revoked = true;

    await expectLater(
      sender.sendPending(userId: userId),
      throwsA(isA<ReportDeviceRefused>()),
    );
    final report = await sync.run(userId: userId) as SyncPurged;

    expect(report.discardedReports, 2);
    expect(await database.select(database.fieldReports).get(), isEmpty);
    expect(await database.select(database.fieldReportPhotos).get(), isEmpty);
  });
}
