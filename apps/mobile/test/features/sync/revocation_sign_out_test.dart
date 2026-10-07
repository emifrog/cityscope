import 'package:drift/native.dart';
import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/platform/platform_services.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/auth/data/session_store.dart';
import 'package:etare_ops/src/features/auth/domain/auth_session.dart';
import 'package:etare_ops/src/features/basemaps/application/basemap_providers.dart';
import 'package:etare_ops/src/features/lock/application/lock_controller.dart';
import 'package:etare_ops/src/features/lock/application/terminal_providers.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/application/trust_store.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/app_harness.dart';
import '../../support/fakes.dart';
import 'fake_sync_server.dart';

/// Révocation constatée par la synchronisation (SEC-05) : données, identité
/// et secrets effacés ; l'agent est déconnecté et le motif l'attend à la
/// connexion, même quand la purge a eu lieu application fermée.
void main() {
  test('la tablette révoquée déconnecte l’agent et garde le motif pour la '
      'connexion', () async {
    final server = await FakeSyncServer.start();
    final database = AppDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    final store = InMemorySecureStore();
    await SessionStore(store).write(
      AuthSession(
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: DateTime.utc(2099),
        user: const AuthUser(id: userId, email: 'ops@sdis06.test'),
        signedInAt: server.serverClock,
      ),
    );
    final api = SyncApi(
      api: serverDio(apiBase, server.handleApi),
      files: serverDio(apiBase, server.handleFile),
      clock: () => server.serverClock,
    );
    await EnrollmentService(
      api: api,
      identities: DeviceIdentityStore(store),
    ).enroll(tenantId: tenantId, code: 'abcd-efgh-jklm');
    server.revoked = true;

    final container = ProviderContainer.test(
      overrides: [
        appDatabaseProvider.overrideWithValue(database),
        secureStoreProvider.overrideWithValue(store),
        platformServicesProvider.overrideWithValue(
          const SoftwarePlatformServices(),
        ),
        authRepositoryProvider.overrideWithValue(ScriptedAuthRepository()),
        clockProvider.overrideWithValue(() => server.serverClock),
        syncApiProvider.overrideWithValue(api),
        trustStoreProvider.overrideWith(
          (ref) =>
              TrustStore(embedded: server.trustedKeys, dao: database.trustDao),
        ),
        basemapSyncProvider.overrideWithValue(null),
      ],
    );
    expect(await container.read(authControllerProvider.future), isNotNull);

    await container.read(syncControllerProvider.notifier).synchronize();

    final state = container.read(syncControllerProvider);
    if (state is SyncRunFailed) fail(state.message);
    expect(state, isA<SyncRunFinished>());
    final report =
        (container.read(syncControllerProvider) as SyncRunFinished).report;
    expect(report, isA<SyncPurged>());
    expect(container.read(authControllerProvider).value, isNull);
    expect(await store.read(SecureStorageKeys.authSession), isNull);
    expect(await store.read(SecureStorageKeys.deviceIdentity), isNull);
    expect(
      container.read(lockoutNoticeProvider),
      startsWith('Tablette révoquée par votre SIS'),
    );
    expect(
      await database.localMetaDao.readValue(loginNoticeKey),
      startsWith('Tablette révoquée par votre SIS'),
    );
  });
}
