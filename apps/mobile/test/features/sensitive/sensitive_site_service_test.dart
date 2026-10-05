import 'dart:convert';

import 'package:drift/native.dart';
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/security/local_code.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/sensitive/application/sensitive_site_service.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fakes.dart';
import '../sync/fake_sync_server.dart';

const normalSite = '06000002-0000-4000-8000-00000000000a';
const sensitiveSite = '06000002-0000-4000-8000-0000000000aa';
const code = '482913';

void main() {
  late FakeSyncServer server;
  late AppDatabase database;
  late SyncService sync;
  late SensitiveSiteService service;
  late LocalCodeStore codes;
  late DateTime clock;

  final plan = List.filled(4096, 42);
  final sensitive = FakePublication(
    siteId: sensitiveSite,
    publicationId: '0600000f-0000-4000-8000-0000000000aa',
    number: 3,
    siteName: 'Dépôt pétrolier (démo)',
    files: {'plans/site.png': plan, 'etare.pdf': List.filled(512, 9)},
  );

  setUp(() async {
    server = await FakeSyncServer.start();
    database = AppDatabase(NativeDatabase.memory());
    clock = server.serverClock;
    final secure = InMemorySecureStore();
    final api = SyncApi(
      api: serverDio(apiBase, server.handleApi),
      files: serverDio(apiBase, server.handleFile),
      clock: () => clock,
    );
    final identities = DeviceIdentityStore(secure);
    codes = LocalCodeStore(secure, iterations: 300);
    await codes.set(userId, code);
    sync = SyncService(
      api: api,
      offline: database.offlineDao,
      reports: database.reportsDao,
      state: database.syncStateDao,
      identities: identities,
      trustedKeys: server.trustedKeys,
      clock: () => clock,
    );
    service = SensitiveSiteService(
      api: api,
      dao: database.sensitiveDao,
      identities: identities,
      trustedKeys: server.trustedKeys,
      codes: codes,
      clock: () => clock,
    );
    await EnrollmentService(
      api: api,
      identities: identities,
    ).enroll(tenantId: tenantId, code: 'abcd-efgh-jklm');
    server
      ..publish(
        FakePublication(
          siteId: normalSite,
          publicationId: '0600000f-0000-4000-8000-00000000000a',
          number: 1,
          siteName: 'Collège (démo)',
          files: {'etare.pdf': List.filled(256, 1)},
        ),
      )
      ..onDemand[sensitiveSite] = sensitive;
    await sync.run(userId: userId);
  });

  tearDown(() => database.close());

  test('un site restreint est proposé, jamais installé en masse', () async {
    final installed = await database.offlineDao.installed();
    expect(installed.map((row) => row.siteId), [normalSite]);
    final offered = await database.sensitiveDao.offered(sensitiveSite);
    expect(offered?.siteName, 'Dépôt pétrolier (démo)');
    expect(server.packageRequests, isNot(contains(sensitive.publicationId)));
  });

  test('ouvert avec le code, vérifié, chiffré : rien de lisible en base', () async {
    final unlocked = await service.open(
      userId: userId,
      siteId: sensitiveSite,
      code: code,
    );
    expect(unlocked.site.name, 'Dépôt pétrolier (démo)');
    expect(unlocked.expiresAt, server.serverClock.add(onDemandAccess));
    expect(await service.file(unlocked, sha256Hex(plan)), plan);
    expect(
      await service.etarePdf(sensitiveSite),
      sha256Hex(List.filled(512, 9)),
    );

    final row = await database.sensitiveDao.opened(sensitiveSite);
    expect(
      utf8.decode(row!.dataCipher, allowMalformed: true),
      isNot(contains('Dépôt')),
    );
    final stored = await database.sensitiveDao.file(
      sensitiveSite,
      sha256Hex(plan),
    );
    expect(stored!.cipher, isNot(plan));
    // Jamais dans les fichiers en clair de la base (contenu installé en masse).
    expect(await database.offlineDao.blob(sha256Hex(plan)), isNull);
  });

  test('rouvert sans réseau, le code demandé à chaque fois', () async {
    await service.open(userId: userId, siteId: sensitiveSite, code: code);
    server.apiOffline = true;
    await expectLater(
      service.unlock(userId: userId, siteId: sensitiveSite, code: '000000'),
      throwsA(isA<SensitiveCodeRejected>()),
    );
    final again = await service.unlock(
      userId: userId,
      siteId: sensitiveSite,
      code: code,
    );
    expect(again.site.siteId, sensitiveSite);
    // Un autre agent ne le rouvre pas, même avec son propre code.
    await codes.set('autre-agent', '111111');
    await expectLater(
      service.unlock(
        userId: 'autre-agent',
        siteId: sensitiveSite,
        code: '111111',
      ),
      throwsA(isA<SensitiveSiteUnavailable>()),
    );
  });

  test('effacé après 24 h, ou si l’horloge recule avant l’ouverture', () async {
    await service.open(userId: userId, siteId: sensitiveSite, code: code);
    clock = clock.subtract(const Duration(minutes: 1));
    await expectLater(
      service.unlock(userId: userId, siteId: sensitiveSite, code: code),
      throwsA(isA<SensitiveSiteUnavailable>()),
    );
    expect(await database.sensitiveDao.opened(sensitiveSite), isNull);

    clock = server.serverClock;
    await service.open(userId: userId, siteId: sensitiveSite, code: code);
    clock = clock.add(const Duration(hours: 24));
    expect(await service.purgeExpired(), 1);
    expect(await database.sensitiveDao.opened(sensitiveSite), isNull);
  });

  test('l’ouverture exige le réseau et un site encore proposé', () async {
    server.apiOffline = true;
    await expectLater(
      service.open(userId: userId, siteId: sensitiveSite, code: code),
      throwsA(isA<NetworkException>()),
    );
    server.apiOffline = false;
    server.onDemand.clear();
    server.generation++;
    await sync.run(userId: userId);
    await expectLater(
      service.open(userId: userId, siteId: sensitiveSite, code: code),
      throwsA(isA<SensitiveSiteUnavailable>()),
    );
  });

  test(
    'habilitation retirée : le site ouvert disparaît à la synchronisation',
    () async {
      await service.open(userId: userId, siteId: sensitiveSite, code: code);
      server.onDemand.clear();
      server.generation++;
      await sync.run(userId: userId);
      expect(await database.sensitiveDao.opened(sensitiveSite), isNull);
      expect(await database.sensitiveDao.offered(sensitiveSite), isNull);
    },
  );

  test('chaque consultation est remontée une fois au journal', () async {
    await service.open(userId: userId, siteId: sensitiveSite, code: code);
    await service.unlock(userId: userId, siteId: sensitiveSite, code: code);
    expect(await service.flushEvents(userId), 2);
    expect(server.accessEvents.values.map((event) => event['site_id']), [
      sensitiveSite,
      sensitiveSite,
    ]);
    expect(await service.flushEvents(userId), 0);
  });

  test('cinq erreurs : l’agent est déconnecté', () async {
    for (var attempt = 1; attempt < maxLocalCodeAttempts; attempt++) {
      await expectLater(
        service.open(userId: userId, siteId: sensitiveSite, code: '999999'),
        throwsA(isA<SensitiveCodeRejected>()),
      );
    }
    await expectLater(
      service.open(userId: userId, siteId: sensitiveSite, code: '999999'),
      throwsA(isA<SensitiveCodeLockedOut>()),
    );
  });
}
