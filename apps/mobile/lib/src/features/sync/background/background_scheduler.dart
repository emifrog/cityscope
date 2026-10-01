import 'dart:io';

import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/features/sync/background/background_sync.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:workmanager/workmanager.dart';

/// Planification des synchronisations en arrière-plan (SYN-01).
abstract interface class BackgroundScheduler {
  /// Enregistre la tâche périodique (sans effet si elle existe déjà).
  Future<void> start();

  /// Demande une synchronisation dès que la tablette est en Wi-Fi, pour une
  /// mise à jour reportée parce que trop lourde sur réseau mobile.
  Future<void> scheduleUnmetered();

  /// Quand la tablette se synchronise seule, dit à l'agent.
  String get summary;
}

/// Contraintes retenues (proposition à valider avec le SIS, DEC-01) :
/// - toutes les heures, sur tout réseau, batterie et stockage non faibles :
///   le catalogue et les petites mises à jour suivent sans intervention ;
/// - au-delà de 50 Mo, la suite attend le Wi-Fi (tâche dédiée) ou une
///   synchronisation manuelle ;
/// - Android peut retarder ou regrouper ces exécutions (mode Doze) : la
///   fraîcheur affichée reste la référence pour l'agent.
final class WorkmanagerScheduler implements BackgroundScheduler {
  const WorkmanagerScheduler();

  static const _logger = AppLogger('background');

  /// Fréquence de la tâche périodique (WorkManager : 15 min au minimum).
  static const period = Duration(hours: 1);

  @override
  String get summary =>
      'à l’ouverture, au retour dans l’application et toutes les heures en '
      'arrière-plan (réseau disponible, batterie suffisante ; au-delà de '
      '50 Mo, en Wi-Fi seulement)';

  /// Anciens noms de la tâche périodique, retirés au démarrage.
  static const retiredPeriodicTasks = ['fr.etare.ops.sync.periodic'];

  @override
  Future<void> start() async {
    await Workmanager().initialize(backgroundSyncDispatcher);
    for (final name in retiredPeriodicTasks) {
      await Workmanager().cancelByUniqueName(name);
    }
    await Workmanager().registerPeriodicTask(
      periodicSyncTask,
      periodicSyncTask,
      frequency: period,
      initialDelay: const Duration(minutes: 15),
      constraints: Constraints(
        networkType: NetworkType.connected,
        requiresBatteryNotLow: true,
        requiresStorageNotLow: true,
      ),
      // `keep` : ré-enregistrer à chaque lancement (`update`) change la
      // génération du travail ; la tâche système de l'ancienne génération se
      // termine alors aussitôt et le travail continue sans elle, dans un
      // processus qu'Android peut geler (constaté sur Android 16).
      existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
      backoffPolicy: BackoffPolicy.exponential,
      backoffPolicyDelay: const Duration(minutes: 10),
    );
    _logger.info(
      'Synchronisation périodique planifiée (${period.inMinutes} min).',
    );
  }

  @override
  Future<void> scheduleUnmetered() async {
    await Workmanager().registerOneOffTask(
      unmeteredSyncTask,
      unmeteredSyncTask,
      constraints: Constraints(
        networkType: NetworkType.unmetered,
        requiresBatteryNotLow: true,
        requiresStorageNotLow: true,
      ),
      existingWorkPolicy: ExistingWorkPolicy.keep,
    );
    _logger.info('Mise à jour volumineuse : synchronisation prévue en Wi-Fi.');
  }
}

/// Plateformes sans tâche de fond configurée (iOS, tests) : la
/// synchronisation reste à l'ouverture, au retour et à la demande.
final class NoBackgroundScheduler implements BackgroundScheduler {
  const NoBackgroundScheduler();

  @override
  String get summary => 'à l’ouverture et au retour dans l’application';

  @override
  Future<void> start() async {}

  @override
  Future<void> scheduleUnmetered() async {}
}

final backgroundSchedulerProvider = Provider<BackgroundScheduler>(
  (ref) => Platform.isAndroid
      ? const WorkmanagerScheduler()
      : const NoBackgroundScheduler(),
);
