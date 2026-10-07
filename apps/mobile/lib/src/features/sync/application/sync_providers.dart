import 'dart:async';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/errors/error_messages.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/network/dio_factory.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/basemaps/application/basemap_providers.dart';
import 'package:etare_ops/src/features/lock/application/lock_controller.dart';
import 'package:etare_ops/src/features/lock/application/terminal_providers.dart';
import 'package:etare_ops/src/features/reports/application/report_providers.dart';
import 'package:etare_ops/src/features/sensitive/application/sensitive_providers.dart';
import 'package:etare_ops/src/features/sync/application/enrollment_service.dart';
import 'package:etare_ops/src/features/sync/application/sync_messages.dart';
import 'package:etare_ops/src/features/sync/application/sync_service.dart';
import 'package:etare_ops/src/features/sync/application/trust_store.dart';
import 'package:etare_ops/src/features/sync/background/background_scheduler.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/device_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:etare_ops/src/features/sync/data/sync_status_repository.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';
import 'package:etare_ops/src/features/sync/domain/removal_notice.dart';
import 'package:etare_ops/src/features/sync/domain/sync_status.dart';
import 'package:etare_ops/src/features/sync/domain/sync_trigger.dart';
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

/// Raisons des sites retirés de la tablette (MET-04), les plus récentes d'abord.
final removalNoticesProvider = StreamProvider<List<RemovalNotice>>(
  (ref) => ref.watch(appDatabaseProvider).offlineDao.watchRemovalNotices(),
);

final deviceIdentityStoreProvider = Provider<DeviceIdentityStore>(
  (ref) => DeviceIdentityStore(ref.watch(secureStoreProvider)),
);

/// Clé du terminal : Keystore Android, ou Ed25519 logicielle (SEC-05).
final deviceKeysProvider = Provider<DeviceKeys>(
  (ref) => DeviceKeys(ref.watch(platformServicesProvider)),
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

/// Clés reconnues par la tablette : racine de la configuration, jeu de clés
/// retenu (SEC-04, ADR-027).
final trustStoreProvider = Provider<TrustStore>(
  (ref) => TrustStore(
    embedded: ref.watch(appConfigProvider).trustedKeys,
    dao: ref.watch(appDatabaseProvider).trustDao,
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
    trust: ref.watch(trustStoreProvider),
    basemaps: ref.watch(basemapSyncProvider),
    clock: ref.watch(clockProvider),
    keys: ref.watch(deviceKeysProvider),
    trustedClock: ref.watch(trustedClockProvider),
    wipeSecrets: ref.watch(terminalWipeProvider),
    storage: ref.watch(storageGuardProvider),
  );
});

final enrollmentServiceProvider = Provider<EnrollmentService>(
  (ref) => EnrollmentService(
    api: ref.watch(syncApiProvider),
    identities: ref.watch(deviceIdentityStoreProvider),
    generateKey: ref.watch(deviceKeysProvider).generate,
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

/// Une tâche de fond (autre moteur Flutter du processus) synchronise déjà :
/// l'affichage attend sa fin puis relit la base (SYN-01).
final class SyncRunBusy extends SyncRunState {
  const SyncRunBusy();
}

final syncControllerProvider = NotifierProvider<SyncController, SyncRunState>(
  SyncController.new,
);

/// Intervalle de relecture du bail tenu par un autre moteur.
final syncLeasePollIntervalProvider = Provider<Duration>(
  (ref) => const Duration(seconds: 3),
);

/// Volume téléchargé au plus par une synchronisation périodique (SYN-01).
final backgroundDownloadBudgetProvider = Provider<int>(
  (ref) => backgroundDownloadBudgetBytes,
);

/// Une seule synchronisation à la fois : dans ce moteur (état en cours) et
/// entre moteurs (bail dans la base, renouvelé tant qu'elle dure, rendu à la
/// fin ; un bail échu est repris après un arrêt brutal).
class SyncController extends Notifier<SyncRunState> {
  static const _logger = AppLogger('sync');

  /// Durée d'un bail, renouvelé toutes les [_leaseRenewal].
  static const leaseTtl = Duration(minutes: 2);
  static const _leaseRenewal = Duration(seconds: 30);

  /// Identité de ce moteur pour le bail.
  final String _owner =
      'moteur-${DateTime.now().microsecondsSinceEpoch}-'
      '${Random.secure().nextInt(1 << 32)}';

  @override
  SyncRunState build() => const SyncRunIdle();

  bool get isRunning => state is SyncRunInProgress;

  /// Lance une synchronisation (sans effet si une autre est en cours, ici ou
  /// dans une tâche de fond). [trigger] fixe le budget de téléchargement.
  Future<void> synchronize({SyncTrigger trigger = SyncTrigger.manual}) async {
    if (isRunning || state is SyncRunBusy) return;
    final userId = ref.read(authControllerProvider).value?.user.id;
    if (userId == null) return;
    final leases = ref.read(appDatabaseProvider).syncStateDao;
    final clock = ref.read(clockProvider);
    if (!await leases.tryAcquireLease(_owner, clock(), leaseTtl)) {
      _logger.info('Synchronisation déjà menée par un autre moteur.');
      if (!trigger.unattended) {
        state = const SyncRunBusy();
        await _awaitOtherEngine();
      }
      return;
    }
    final renewal = Timer.periodic(
      _leaseRenewal,
      (_) => unawaited(leases.tryAcquireLease(_owner, clock(), leaseTtl)),
    );
    state = const SyncRunInProgress(SyncProgress(step: SyncStep.catalog));
    try {
      final report = await ref
          .read(syncServiceProvider)
          .run(
            userId: userId,
            onProgress: (progress) => state = SyncRunInProgress(progress),
            maxDownloadBytes: trigger.budgeted
                ? ref.read(backgroundDownloadBudgetProvider)
                : null,
            holdsLease: () => leases.tryAcquireLease(_owner, clock(), leaseTtl),
            // Fonds de carte de plus de 50 Mo : en Wi-Fi seulement (ADR-024).
            allowLargeBasemaps: trigger == SyncTrigger.unmetered,
          );
      if (report is SyncPurged) {
        ref.invalidate(deviceIdentityProvider);
        await _signOutAfterPurge(report);
      }
      state = SyncRunFinished(report);
      if (report case SyncCompleted(:final deferredBytes, :final basemaps)
          when deferredBytes > 0 || (basemaps?.deferredBytes ?? 0) > 0) {
        // Trop lourd pour le réseau mobile : la suite attend le Wi-Fi.
        await ref.read(backgroundSchedulerProvider).scheduleUnmetered();
      }
      // Puis la file des signalements, et la suite donnée par la Prévision.
      if (report is SyncCompleted || report is SyncUpdateRequired) {
        final outbox = ref.read(reportOutboxProvider.notifier);
        if (trigger.unattended) {
          await outbox.send();
        } else {
          outbox.sendInBackground();
        }
        // Sites sensibles expirés effacés, consultations remontées (PER-02).
        await afterSyncSensitive(ref);
      }
    } on SyncSuperseded {
      // Gelé ou arrêté trop longtemps : un autre moteur a repris la main.
      _logger.warning('Bail perdu : synchronisation abandonnée.');
      state = const SyncRunIdle();
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
    } finally {
      renewal.cancel();
      await leases.releaseLease(_owner);
    }
  }

  /// Attend la fin de la synchronisation menée par un autre moteur, puis
  /// relit la base : ses écritures passent par une autre connexion, que les
  /// flux de celle-ci n'ont pas vues.
  Future<void> _awaitOtherEngine() async {
    final database = ref.read(appDatabaseProvider);
    final clock = ref.read(clockProvider);
    final interval = ref.read(syncLeasePollIntervalProvider);
    while (await database.syncStateDao.leaseHolder(clock()) != null) {
      await Future<void>.delayed(interval);
      if (!ref.mounted) return;
    }
    database.markTablesUpdated(database.allTables);
    ref.invalidate(deviceIdentityProvider);
    if (state is SyncRunBusy) state = const SyncRunIdle();
  }

  /// Tablette révoquée ou inconnue (SEC-05) : la session est déjà effacée
  /// avec les données ; l'agent est déconnecté et le motif l'attend à la
  /// connexion, même si la purge a eu lieu application fermée.
  Future<void> _signOutAfterPurge(SyncPurged report) async {
    final message = purgeMessage(
      report.reason,
      discardedReports: report.discardedReports,
    );
    try {
      await ref
          .read(appDatabaseProvider)
          .localMetaDao
          .writeValue(loginNoticeKey, message);
    } on Object catch (error) {
      _logger.warning('Motif de la purge non conservé.', error: error);
    }
    ref.read(lockoutNoticeProvider.notifier).set(message);
    await ref.read(authControllerProvider.notifier).signOut();
  }

  /// Synchronisation sans attendre son résultat (ouverture, bouton).
  void synchronizeInBackground({SyncTrigger trigger = SyncTrigger.manual}) =>
      unawaited(synchronize(trigger: trigger));
}
