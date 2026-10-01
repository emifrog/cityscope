import 'package:drift/native.dart';
import 'package:etare_ops/src/core/config/app_config.dart';
import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/network/auth_interceptor.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/account/application/account_providers.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/app_harness.dart';
import '../../support/fakes.dart';

/// Chaîne réelle de la tablette : session → `GET /me` à travers
/// l'intercepteur d'authentification → SIS actif. Aucun dépôt simulé, seul le
/// transport HTTP l'est.
void main() {
  test('le SIS actif se résout par GET /me à travers l’intercepteur', () async {
    final database = AppDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    final requests = <String>[];
    late final ProviderContainer container;
    container = ProviderContainer(
      // Comme l'application : pas de nouvelle tentative automatique.
      retry: (retryCount, error) => null,
      overrides: [
        ...appOverrides(
          authRepository: ScriptedAuthRepository(),
          signedIn: true,
          stubAccount: false,
        ),
        appConfigProvider.overrideWithValue(
          const AppConfig(
            environment: AppEnvironment.dev,
            apiBaseUrl: 'https://api.test/api/v1',
            authUrl: 'https://auth.test/auth/v1',
            authPublishableKey: 'k',
          ),
        ),
        appDatabaseProvider.overrideWithValue(database),
        apiDioProvider.overrideWith((ref) {
          final (dio, _) = fakeDio('https://api.test/api/v1', (options) {
            requests.add('${options.method} ${options.path}');
            return const FakeResponse(200, {
              'user': {
                'id': 'user-1',
                'email': 'agent@sdis06.test',
                'display_name': null,
              },
              'memberships': [
                {
                  'tenant_id': 'tenant-06',
                  'tenant_slug': 'sdis-demo-06',
                  'tenant_name': 'SDIS DEMO 06',
                  'roles': ['OPS_USER'],
                },
              ],
            });
          });
          dio.interceptors.insert(
            0,
            AuthInterceptor(
              readAccessToken: () =>
                  ref.read(authControllerProvider.notifier).validAccessToken(),
              refreshAccessToken: () => ref
                  .read(authControllerProvider.notifier)
                  .refreshAccessToken(),
              readTenantId: () => ref.read(activeTenantIdProvider),
              retryClient: dio,
            ),
          );
          return dio;
        }),
      ],
    );
    addTearDown(container.dispose);

    await container.read(authControllerProvider.future);
    final subscription = container.listen(
      activeTenantControllerProvider,
      (previous, next) {},
    );
    addTearDown(subscription.close);
    final tenant = await container.read(activeTenantControllerProvider.future);

    expect(requests, ['GET /me']);
    expect(tenant?.tenantName, 'SDIS DEMO 06');
  });
}
