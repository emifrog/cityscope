/// Racine de composition : fournisseurs d'infrastructure partagés.
///
/// [appConfigProvider] et [appDatabaseProvider] sont initialisés au démarrage
/// (`bootstrap.dart`) puis injectés via `ProviderScope.overrides` ; les tests
/// les surchargent de la même façon.
library;

import 'package:dio/dio.dart';
import 'package:etare_ops/src/core/config/app_config.dart';
import 'package:etare_ops/src/core/network/auth_interceptor.dart';
import 'package:etare_ops/src/core/network/dio_factory.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/remote/etare_api_client.dart';
import 'package:etare_ops/src/features/account/application/account_providers.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final appConfigProvider = Provider<AppConfig>(
  (ref) => throw UnimplementedError(
    'appConfigProvider doit être surchargé au démarrage.',
  ),
);

final appDatabaseProvider = Provider<AppDatabase>(
  (ref) => throw UnimplementedError(
    'appDatabaseProvider doit être surchargé au démarrage.',
  ),
);

final secureStoreProvider = Provider<SecureStore>(
  (ref) => FlutterSecureStore(),
);

/// Client HTTP de Supabase Auth : SANS intercepteur d'authentification.
final authDioProvider = Provider<Dio>((ref) {
  final dio = createDio(baseUrl: ref.watch(appConfigProvider).authUrl);
  ref.onDispose(dio.close);
  return dio;
});

/// Client HTTP de l'API produit : Bearer + X-Tenant-Id + rafraîchissement.
final apiDioProvider = Provider<Dio>((ref) {
  final dio = createDio(baseUrl: ref.watch(appConfigProvider).apiBaseUrl);
  dio.interceptors.insert(
    0,
    AuthInterceptor(
      readAccessToken: () =>
          ref.read(authControllerProvider.notifier).validAccessToken(),
      refreshAccessToken: () =>
          ref.read(authControllerProvider.notifier).refreshAccessToken(),
      readTenantId: () => ref.read(activeTenantIdProvider),
      retryClient: dio,
    ),
  );
  ref.onDispose(dio.close);
  return dio;
});

final etareApiClientProvider = Provider<EtareApiClient>(
  (ref) => EtareApiClient(ref.watch(apiDioProvider)),
);
