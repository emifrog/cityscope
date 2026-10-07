/// Racine de composition : fournisseurs d'infrastructure partagés.
///
/// [appConfigProvider] et [appDatabaseProvider] sont initialisés au démarrage
/// (`bootstrap.dart`) puis injectés via `ProviderScope.overrides` ; les tests
/// les surchargent de la même façon.
library;

import 'dart:io';

import 'package:dio/dio.dart';
import 'package:etare_ops/src/core/config/app_config.dart';
import 'package:etare_ops/src/core/network/auth_interceptor.dart';
import 'package:etare_ops/src/core/network/dio_factory.dart';
import 'package:etare_ops/src/core/platform/platform_services.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:etare_ops/src/core/storage/storage_guard.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/remote/etare_api_client.dart';
import 'package:etare_ops/src/features/account/application/account_providers.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

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

/// Services Android (Keystore, horloge monotone, espace libre, FLAG_SECURE),
/// remplacés dans les tests (SEC-05, CAP-02).
final platformServicesProvider = Provider<PlatformServices>(
  (ref) => const AndroidPlatformServices(),
);

/// Dossier privé de l'application (base chiffrée, fonds de carte).
final appSupportDirectoryProvider = Provider<Future<Directory> Function()>(
  (ref) => getApplicationSupportDirectory,
);

/// Espace libre contrôlé avant chaque téléchargement (CAP-02).
final storageGuardProvider = Provider<StorageGuard>(
  (ref) => StorageGuard(
    platform: ref.watch(platformServicesProvider),
    directory: ref.watch(appSupportDirectoryProvider),
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
