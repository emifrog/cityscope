import 'dart:async';

import 'package:dio/dio.dart';
import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/errors/error_messages.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/network/dio_factory.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/reports/application/report_providers.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:etare_ops/src/features/sync/data/sync_status_repository.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';
import 'package:etare_ops/src/features/sync/domain/sync_status.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final syncStatusRepositoryProvider = Provider<SyncStatusRepository>((ref) {
  final database = ref.watch(appDatabaseProvider);
  return SyncStatusRepository(database.syncStateDao, database.offlineDao);
});

/// État de synchronisation, mis à jour en continu depuis la base locale.
final syncStatusProvider = StreamProvider<SyncStatus>(
  (ref) => ref.watch(syncStatusRepositoryProvider).watch(),
);

final deviceIdentityStoreProvider = Provider<DeviceIdentityStore>(
  (ref) => DeviceIdentityStore(ref.watch(secureStoreProvider)),
);

/// Ce terminal tel qu'enrôlé (null = pas encore enrôlé, ou purgé).
final deviceIdentityProvider = FutureProvider<DeviceIdentity?>(
  (ref) => ref.watch(deviceIdentityStoreProvider).read(),
);

/// Client HTTP des fichiers (URL signées du stockage) : sans jeton, délais
/// adaptés à de gros fichiers.
final filesDioProvider = Provider<Dio>((ref) {
  final dio = createDio(
    baseUrl: ref.watch(appConfigProvider).apiBaseUrl,
    receiveTimeout: const Duration(minutes: 3),
  );
  ref.onDispose(dio.close);
  return dio;
});

final syncApiProvider = Provider<SyncApi>(
  (ref) => SyncApi(
    api: ref.watch(apiDioProvider),
    files: ref.watch(filesDioProvider),
    clock: ref.watch(clockProvider),
  ),
);

final syncServiceProvider = Provider<SyncService>((ref) {
  final database = ref.watch(appDatabaseProvider);
  return SyncService(
    api: ref.watch(syncApiProvider),
    offline: database.offlineDao,
    reports: database.reportsDao,
    state: database.syncStateDao,
    identities: ref.watch(deviceIdentityStoreProvider),
    trustedKeys: ref.watch(appConfigProvider).trustedKeys,
    clock: ref.watch(clockProvider),
  );
});

final enrollmentServiceProvider = Provider<EnrollmentService>(
  (ref) => EnrollmentService(
    api: ref.watch(syncApiProvider),
    identities: ref.watch(deviceIdentityStoreProvider),
  ),
);

/// Synchronisation en cours ou dernier résultat (affichage de la progression).
@immutable
sealed class SyncRunState {
  const SyncRunState();
}

final class SyncRunIdle extends SyncRunState {
  const SyncRunIdle();
}

final class SyncRunInProgress extends SyncRunState {
  const SyncRunInProgress(this.progress);

  final SyncProgress progress;
}

final class SyncRunFinished extends SyncRunState {
  const SyncRunFinished(this.report);

  final SyncReport report;
}

final class SyncRunFailed extends SyncRunState {
  const SyncRunFailed(this.message);

  final String message;
}

final syncControllerProvider = NotifierProvider<SyncController, SyncRunState>(
  SyncController.new,
);

class SyncController extends Notifier<SyncRunState> {
  static const _logger = AppLogger('sync');

  @override
  SyncRunState build() => const SyncRunIdle();

  bool get isRunning => state is SyncRunInProgress;

  /// Lance une synchronisation (sans effet si une autre est en cours).
  Future<void> synchronize() async {
    if (isRunning) return;
    final userId = ref.read(authControllerProvider).value?.user.id;
    if (userId == null) return;
    state = const SyncRunInProgress(SyncProgress(step: SyncStep.catalog));
    try {
      final report = await ref
          .read(syncServiceProvider)
          .run(
            userId: userId,
            onProgress: (progress) => state = SyncRunInProgress(progress),
          );
      if (report is SyncPurged) ref.invalidate(deviceIdentityProvider);
      state = SyncRunFinished(report);
      // Puis la file des signalements, et la suite donnée par la Prévision.
      if (report is SyncCompleted) {
        ref.read(reportOutboxProvider.notifier).sendInBackground();
      }
    } on SyncIntegrityException catch (error) {
      _logger.warning('Synchronisation refusée : ${error.code}');
      state = SyncRunFailed(
        (await ref.read(syncStatusRepositoryProvider).watch().first)
                .lastError ??
            'Données reçues invalides.',
      );
    } on Object catch (error) {
      _logger.warning('Synchronisation interrompue.', error: error);
      state = SyncRunFailed(describeError(error));
    }
  }

  /// Synchronisation automatique au démarrage, si la tablette est enrôlée.
  void synchronizeInBackground() => unawaited(synchronize());
}
