import 'package:drift/native.dart';
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/time/trusted_clock.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/sync_state_dao.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/application/trust_store.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/device_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';
import 'package:etare_ops/src/features/sync/domain/terminal_policy.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_platform.dart';
import '../../support/fakes.dart';
import 'fake_sync_server.dart';
import 'sync_service_test.dart' show publicationOf, siteA;

/// SEC-05 sur la tablette : clé du terminal dans le Keystore, rotation des
/// premières tablettes, purge complète, politique du SIS et repère de temps.
void main() {
  late FakeSyncServer server;
  late AppDatabase database;
  late InMemorySecureStore secureStore;
  late FakePlatformServices platform;
  late DeviceIdentityStore identities;
  late SyncApi api;
  late TrustedClock clock;
  late int wipes;

  SyncService serviceWith(FakePlatformServices platform) => SyncService(
    api: api,
    offline: database.offlineDao,
    reports: database.reportsDao,
    state: database.syncStateDao,
    identities: identities,
    trust: TrustStore(embedded: server.trustedKeys, dao: database.trustDao),
    clock: () => server.serverClock,
    keys: DeviceKeys(platform),
    trustedClock: clock,
    wipeSecrets: () async => wipes++,
  );

  Future<void> enroll(FakePlatformServices platform) => EnrollmentService(
    api: api,
    identities: identities,
    generateKey: DeviceKeys(platform).generate,
  ).enroll(tenantId: tenantId, code: 'abcd-efgh-jklm');

  setUp(() async {
    server = await FakeSyncServer.start();
    database = AppDatabase(NativeDatabase.memory());
    secureStore = InMemorySecureStore();
    platform = FakePlatformServices();
    identities = DeviceIdentityStore(secureStore);
    api = SyncApi(
      api: serverDio(apiBase, server.handleApi),
      files: serverDio(apiBase, server.handleFile),
      clock: () => server.serverClock,
    );
    clock = TrustedClock(
      platform: platform,
      store: DriftTrustedTimeStore(database.syncStateDao),
      wall: () => server.serverClock,
    );
    wipes = 0;
    server.publish(publicationOf(siteA, 1));
  });

  tearDown(() => database.close());

  test('une nouvelle tablette s’enrôle avec une clé du Keystore, sans graine '
      'conservée', () async {
    await enroll(platform);
    final identity = (await identities.read())!;
    expect(identity.keyAlgorithm, DeviceKeyAlgorithms.ecdsaP256);
    expect(identity.keySeed, isEmpty);
    expect(platform.keys.keys.keys, [identity.keyAlias]);
    expect(server.deviceKeyAlgorithm, 'ecdsa-p256');

    expect(
      await serviceWith(platform).run(userId: userId),
      isA<SyncCompleted>(),
    );
    expect(server.rotatedKeys, isEmpty);
  });

  test('une tablette de la première génération passe au Keystore à sa '
      'synchronisation ; l’ancienne clé est oubliée', () async {
    await enroll(FakePlatformServices(withHardwareKeys: false));
    final before = (await identities.read())!;
    expect(before.keyAlgorithm, DeviceKeyAlgorithms.ed25519);

    expect(
      await serviceWith(platform).run(userId: userId),
      isA<SyncCompleted>(),
    );

    final after = (await identities.read())!;
    expect(after.keyAlgorithm, DeviceKeyAlgorithms.ecdsaP256);
    expect(after.keySeed, isEmpty);
    expect(after.pendingKeyAlias, isNull);
    expect(server.rotatedKeys, [
      await platform.keys.publicKey(after.keyAlias!),
    ]);
    // La synchronisation suivante ne refait rien.
    expect(
      await serviceWith(platform).run(userId: userId),
      isA<SyncCompleted>(),
    );
    expect(server.rotatedKeys, hasLength(1));
  });

  test('rotation dont la réponse se perd : reprise au passage suivant, la '
      'nouvelle clé le prouve, rien n’est purgé', () async {
    await enroll(FakePlatformServices(withHardwareKeys: false));
    server.loseRotationResponse = true;
    await expectLater(
      serviceWith(platform).run(userId: userId),
      throwsA(isA<NetworkException>()),
    );
    expect((await identities.read())!.pendingKeyAlias, isNotNull);

    server.loseRotationResponse = false;
    final report = await serviceWith(platform).run(userId: userId);
    expect(report, isA<SyncCompleted>());
    final identity = (await identities.read())!;
    expect(identity.keyAlgorithm, DeviceKeyAlgorithms.ecdsaP256);
    expect(server.rotatedKeys, hasLength(1));
  });

  test('un Keystore indisponible laisse la clé actuelle en place', () async {
    await enroll(FakePlatformServices(withHardwareKeys: false));
    platform.keys.failNext = true;
    expect(
      await serviceWith(platform).run(userId: userId),
      isA<SyncCompleted>(),
    );
    expect(
      (await identities.read())!.keyAlgorithm,
      DeviceKeyAlgorithms.ed25519,
    );
    expect(server.rotatedKeys, isEmpty);
  });

  test('révocation : clés du Keystore, identité et secrets effacés', () async {
    await enroll(platform);
    await serviceWith(platform).run(userId: userId);
    server.revoked = true;

    final report = await serviceWith(platform).run(userId: userId);

    expect(report, isA<SyncPurged>());
    expect(await identities.read(), isNull);
    expect(platform.keys.keys, isEmpty);
    expect(wipes, 1);
  });

  test('clé du Keystore perdue (réinitialisation) : la tablette est purgée et '
      'doit être réenrôlée', () async {
    await enroll(platform);
    platform.keys.keys.clear();

    final report = await serviceWith(platform).run(userId: userId);

    expect(report, isA<SyncPurged>());
    expect((report as SyncPurged).reason, ApiErrorCode.deviceNotEnrolled);
    expect(await identities.read(), isNull);
  });

  test('la politique du SIS reçue avec le catalogue est retenue ; absente, '
      'les valeurs par défaut', () async {
    await enroll(platform);
    await serviceWith(platform).run(userId: userId);
    var row = await database.syncStateDao.read();
    expect(
      TerminalPolicy.fromStored(row.terminalPolicy),
      TerminalPolicy.defaults,
    );

    server
      ..terminalPolicy = {
        'idle_lock_minutes': 2,
        'background_lock_seconds': 30,
        'screenshots_allowed': true,
        'max_days_without_login': 10,
        'offline_authorization_days': 3,
      }
      ..generation += 1;
    await serviceWith(platform).run(userId: userId);
    row = await database.syncStateDao.read();
    expect(
      TerminalPolicy.fromStored(row.terminalPolicy),
      const TerminalPolicy(
        idleLockMinutes: 2,
        backgroundLockSeconds: 30,
        screenshotsAllowed: true,
        maxDaysWithoutLogin: 10,
        offlineAuthorizationDays: 3,
      ),
    );
  });

  test('chaque catalogue fixe le repère de temps de confiance : heure du '
      'serveur et horloge monotone', () async {
    await enroll(platform);
    await serviceWith(platform).run(userId: userId);
    final row = await database.syncStateDao.readTrustedTime();
    expect(row.anchorServerTime, server.serverClock);
    expect(row.anchorElapsedMs, platform.monotonic!.elapsedMs);
    expect(row.anchorBootCount, platform.monotonic!.bootCount);
    expect(row.highWater, server.serverClock);
  });
}
