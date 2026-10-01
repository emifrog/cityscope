import 'dart:async';
import 'dart:io';
import 'dart:isolate';
import 'dart:ui' show IsolateNameServer;

import 'package:drift/native.dart';
import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/auth/data/session_store.dart';
import 'package:etare_ops/src/features/reports/application/report_providers.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/background/background_scheduler.dart';
import 'package:etare_ops/src/features/sync/background/background_sync.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';
import 'package:etare_ops/src/features/sync/domain/sync_trigger.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/app_harness.dart';
import '../../support/fakes.dart';
import 'fake_sync_server.dart';

const small = '06000002-0000-4000-8000-00000000000a';
const large = '06000002-0000-4000-8000-00000000000b';
final now = DateTime.utc(2026, 10, 1, 10);

FakePublication publication(String siteId, int bytes) => FakePublication(
  siteId: siteId,
  publicationId: '0600000f-0000-4000-8000-${siteId.substring(34)}0000000001',
  number: 1,
  siteName: siteId == small ? 'Petit site' : 'Grand site',
  files: {'plans/rdc.png': List.filled(bytes, siteId == small ? 1 : 2)},
);

final class RecordingScheduler implements BackgroundScheduler {
  int unmetered = 0;

  @override
  Future<void> start() async {}

  @override
  Future<void> scheduleUnmetered() async => unmetered++;

  @override
  String get summary => 'en test';
}

class RecordingOutbox extends ReportOutbox {
  int sent = 0;
  int sentInBackground = 0;

  @override
  Future<void> send() async => sent++;

  @override
  void sendInBackground() => sentInBackground++;
}

class RecordingSync extends SyncController {
  final List<SyncTrigger> triggers = [];

  @override
  Future<void> synchronize({SyncTrigger trigger = SyncTrigger.manual}) async =>
      triggers.add(trigger);
}

void main() {
  group('bail de synchronisation (une seule à la fois, SYN-01)', () {
    test('libre, tenu, prolongé, échu puis repris ; rendu par son seul '
        'titulaire', () async {
      final database = AppDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      final leases = database.syncStateDao;
      const ttl = Duration(minutes: 2);

      expect(await leases.tryAcquireLease('application', now, ttl), isTrue);
      expect(await leases.tryAcquireLease('tache', now, ttl), isFalse);
      expect(await leases.leaseHolder(now), 'application');
      // Le titulaire prolonge son bail.
      final later = now.add(const Duration(minutes: 1));
      expect(await leases.tryAcquireLease('application', later, ttl), isTrue);
      expect(await leases.tryAcquireLease('tache', now.add(ttl), ttl), isFalse);
      // Arrêt brutal : le bail échu est repris.
      final expired = later.add(ttl);
      expect(await leases.leaseHolder(expired), isNull);
      expect(await leases.tryAcquireLease('tache', expired, ttl), isTrue);
      await leases.releaseLease('application');
      expect(await leases.leaseHolder(expired), 'tache');
      await leases.releaseLease('tache');
      expect(await leases.leaseHolder(expired), isNull);
    });

    test('deux connexions à la même base (deux moteurs) : un seul obtient '
        'le bail', () async {
      final directory = await Directory.systemTemp.createTemp('bail');
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/etare.sqlite');
      final first = AppDatabase(NativeDatabase(file));
      await first.syncStateDao.read();
      final second = AppDatabase(NativeDatabase(file));
      await second.syncStateDao.read();

      final results = await Future.wait([
        first.syncStateDao.tryAcquireLease(
          'a',
          now,
          const Duration(minutes: 2),
        ),
        second.syncStateDao.tryAcquireLease(
          'b',
          now,
          const Duration(minutes: 2),
        ),
      ]);

      expect(results.where((acquired) => acquired), hasLength(1));
      await first.close();
      await second.close();
    });
  });

  group('contrôleur de synchronisation', () {
    late FakeSyncServer server;
    late AppDatabase database;
    late RecordingScheduler scheduler;
    late RecordingOutbox outbox;
    late ProviderContainer container;

    setUp(() async {
      server = await FakeSyncServer.start();
      server
        ..serverClock = now
        ..catalogUserId = testSession.user.id;
      database = AppDatabase(NativeDatabase.memory());
      final store = InMemorySecureStore();
      await SessionStore(store).write(testSession);
      final api = SyncApi(
        api: serverDio(apiBase, server.handleApi),
        files: serverDio(apiBase, server.handleFile),
        clock: () => now,
      );
      final identities = DeviceIdentityStore(store);
      await EnrollmentService(
        api: api,
        identities: identities,
      ).enroll(tenantId: tenantId, code: 'abcd-efgh-jklm');
      scheduler = RecordingScheduler();
      outbox = RecordingOutbox();
      container = ProviderContainer.test(
        overrides: [
          appDatabaseProvider.overrideWithValue(database),
          secureStoreProvider.overrideWithValue(store),
          authRepositoryProvider.overrideWithValue(ScriptedAuthRepository()),
          clockProvider.overrideWithValue(() => now),
          syncServiceProvider.overrideWithValue(
            SyncService(
              api: api,
              offline: database.offlineDao,
              reports: database.reportsDao,
              state: database.syncStateDao,
              identities: identities,
              trustedKeys: server.trustedKeys,
              clock: () => now,
            ),
          ),
          backgroundSchedulerProvider.overrideWithValue(scheduler),
          reportOutboxProvider.overrideWith(() => outbox),
          backgroundDownloadBudgetProvider.overrideWithValue(10 * 1024),
          syncLeasePollIntervalProvider.overrideWithValue(
            const Duration(milliseconds: 10),
          ),
        ],
      );
      await container.read(authControllerProvider.future);
    });

    tearDown(() => database.close());

    SyncController controller() =>
        container.read(syncControllerProvider.notifier);

    Future<Set<String>> installed() async => {
      for (final row in await database.offlineDao.installed()) row.siteId,
    };

    test(
      'arrière-plan sur réseau mobile : la petite mise à jour passe, la '
      'volumineuse attend le Wi-Fi ; les signalements partent avant la fin',
      () async {
        server
          ..publish(publication(small, 2048))
          ..publish(publication(large, 64 * 1024));

        await controller().synchronize(trigger: SyncTrigger.background);

        expect(await installed(), {small});
        expect(scheduler.unmetered, 1);
        expect(outbox.sent, 1);
        final report =
            (container.read(syncControllerProvider) as SyncRunFinished).report
                as SyncCompleted;
        expect(report.deferredBytes, greaterThan(64 * 1024));
        final state = await database.syncStateDao.read();
        expect(state.lastError, contains('reportée'));
        expect(state.syncLeaseOwner, isNull);
        expect(server.receipts.last['error_code'], 'DOWNLOAD_DEFERRED');

        // En Wi-Fi (ou à la demande), la suite s'installe sans limite.
        await controller().synchronize(trigger: SyncTrigger.unmetered);
        expect(await installed(), {small, large});
        expect(scheduler.unmetered, 1);
      },
    );

    test('à la demande de l’agent : sans limite, signalements envoyés en '
        'tâche détachée', () async {
      server.publish(publication(large, 64 * 1024));

      await controller().synchronize();

      expect(await installed(), {large});
      expect(outbox.sentInBackground, 1);
      expect(outbox.sent, 0);
    });

    test('une tâche de fond tient le bail : l’application attend sa fin, '
        'puis relit la base', () async {
      await database.syncStateDao.tryAcquireLease(
        'tache-de-fond',
        now,
        const Duration(minutes: 2),
      );

      final waiting = controller().synchronize();
      await Future<void>.delayed(const Duration(milliseconds: 30));
      expect(container.read(syncControllerProvider), isA<SyncRunBusy>());
      expect(server.receipts, isEmpty);

      await database.syncStateDao.releaseLease('tache-de-fond');
      await waiting;
      expect(container.read(syncControllerProvider), isA<SyncRunIdle>());
      expect(server.receipts, isEmpty);
    });

    test('une tâche de fond face à une synchronisation en cours s’efface '
        'sans attendre', () async {
      await database.syncStateDao.tryAcquireLease(
        'application',
        now,
        const Duration(minutes: 2),
      );

      await controller().synchronize(trigger: SyncTrigger.background);

      expect(container.read(syncControllerProvider), isA<SyncRunIdle>());
      expect(server.receipts, isEmpty);
    });

    test('le bail est rendu même après un échec (réseau absent)', () async {
      server
        ..publish(publication(small, 2048))
        ..apiOffline = true;

      await controller().synchronize();

      expect(container.read(syncControllerProvider), isA<SyncRunFailed>());
      expect(await database.syncStateDao.leaseHolder(now), isNull);
    });
  });

  group('tâche de fond Android', () {
    tearDown(() => IsolateNameServer.removePortNameMapping(uiSyncPortName));

    test('application ouverte dans le processus : la synchronisation lui est '
        'confiée', () async {
      final ui = ReceivePort();
      addTearDown(ui.close);
      IsolateNameServer.registerPortWithName(ui.sendPort, uiSyncPortName);
      final received = Completer<String>();
      ui.listen((message) {
        if (message case [final String trigger, final SendPort reply]) {
          received.complete(trigger);
          reply.send(true);
        }
      });
      var opened = false;

      final result = await runBackgroundSync(
        SyncTrigger.unmetered,
        openContainer: () async {
          opened = true;
          return null;
        },
      );

      expect(result, isTrue);
      expect(await received.future, 'unmetered');
      expect(opened, isFalse);
    });

    test('application fermée : synchronisation autonome si un agent est '
        'connecté sur une tablette enrôlée', () async {
      final database = AppDatabase(NativeDatabase.memory());
      final store = InMemorySecureStore();
      await SessionStore(store).write(testSession);
      final sync = RecordingSync();

      final result = await runBackgroundSync(
        SyncTrigger.background,
        openContainer: () async => ProviderContainer(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
            secureStoreProvider.overrideWithValue(store),
            authRepositoryProvider.overrideWithValue(ScriptedAuthRepository()),
            deviceIdentityProvider.overrideWith((ref) async => device),
            syncControllerProvider.overrideWith(() => sync),
          ],
        ),
      );

      expect(result, isTrue);
      expect(sync.triggers, [SyncTrigger.background]);
    });

    test('application fermée sans agent connecté : rien n’est tenté', () async {
      final database = AppDatabase(NativeDatabase.memory());
      final sync = RecordingSync();

      await runBackgroundSync(
        SyncTrigger.background,
        openContainer: () async => ProviderContainer(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
            secureStoreProvider.overrideWithValue(InMemorySecureStore()),
            deviceIdentityProvider.overrideWith((ref) async => device),
            syncControllerProvider.overrideWith(() => sync),
          ],
        ),
      );

      expect(sync.triggers, isEmpty);
    });

    test('l’application ouverte se déclare et mène la synchronisation '
        'demandée, puis se retire à sa fermeture', () async {
      final sync = RecordingSync();
      final container = ProviderContainer(
        overrides: [syncControllerProvider.overrideWith(() => sync)],
      );
      container.read(backgroundSyncBridgeProvider);

      await runBackgroundSync(SyncTrigger.background);

      expect(sync.triggers, [SyncTrigger.background]);
      container.dispose();
      expect(IsolateNameServer.lookupPortByName(uiSyncPortName), isNull);
    });
  });
}

const device = DeviceIdentity(
  deviceId: deviceId,
  deviceName: 'TABLETTE TEST',
  tenantId: tenantId,
  tenantName: 'SDIS DEMO 06',
  keySeed: [],
);
