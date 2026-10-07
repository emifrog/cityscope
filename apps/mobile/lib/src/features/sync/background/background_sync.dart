import 'dart:async';
import 'dart:isolate';
import 'dart:ui' show IsolateNameServer;

import 'package:etare_ops/src/core/config/app_config.dart';
import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:etare_ops/src/data/local/encrypted_database.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/lock/application/terminal_providers.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:etare_ops/src/features/sync/domain/sync_trigger.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:workmanager/workmanager.dart';

/// Nom unique de la tâche périodique (sur tout réseau) et de la tâche lancée
/// en Wi-Fi pour une mise à jour reportée. La tâche périodique est enregistrée
/// une fois pour toutes (politique `keep`) : changer sa fréquence ou ses
/// contraintes impose de changer son nom (suffixe de version).
const periodicSyncTask = 'fr.etare.ops.sync.periodic.v1';
const unmeteredSyncTask = 'fr.etare.ops.sync.unmetered';

/// Nom sous lequel l'application ouverte se déclare dans le processus : une
/// tâche de fond lui confie alors la synchronisation (une seule session, une
/// seule connexion à la base, un affichage à jour).
const uiSyncPortName = 'fr.etare.ops.sync.ui';

const _logger = AppLogger('background');

/// Point d'entrée des tâches Android (moteur Flutter sans écran).
@pragma('vm:entry-point')
void backgroundSyncDispatcher() {
  Workmanager().executeTask(
    (task, inputData) => runBackgroundSync(
      task == unmeteredSyncTask
          ? SyncTrigger.unmetered
          : SyncTrigger.background,
    ),
  );
}

/// Exécute une synchronisation de tâche de fond. L'échec n'est jamais
/// renvoyé à WorkManager (pas de rafale de nouvelles tentatives) : la
/// prochaine exécution périodique reprendra, la fraîcheur affichée suffit.
Future<bool> runBackgroundSync(
  SyncTrigger trigger, {
  Duration delegateTimeout = const Duration(minutes: 9),
  Future<ProviderContainer?> Function() openContainer = _openContainer,
}) async {
  final ui = IsolateNameServer.lookupPortByName(uiSyncPortName);
  if (ui != null) {
    // L'application est ouverte : c'est elle qui synchronise.
    final reply = ReceivePort();
    try {
      ui.send([trigger.name, reply.sendPort]);
      await reply.first.timeout(delegateTimeout);
    } on TimeoutException {
      _logger.warning(
        'Synchronisation confiée à l’application : sans réponse.',
      );
    } finally {
      reply.close();
    }
    return true;
  }

  final ProviderContainer? container;
  try {
    container = await openContainer();
  } on Object catch (error, stackTrace) {
    _logger.error(
      'Base locale indisponible pour la tâche de fond.',
      error: error,
      stackTrace: stackTrace,
    );
    return true;
  }
  if (container == null) return true;
  final database = container.read(appDatabaseProvider);
  try {
    final session = await container.read(authControllerProvider.future);
    final identity = await container.read(deviceIdentityProvider.future);
    if (session == null || identity == null) return true;
    // Heure de confiance lue avant la synchronisation, qui la recale (SEC-05).
    await container.read(trustedClockProvider).refresh();
    await container
        .read(syncControllerProvider.notifier)
        .synchronize(trigger: trigger);
  } on Object catch (error, stackTrace) {
    _logger.error(
      'Synchronisation en arrière-plan interrompue.',
      error: error,
      stackTrace: stackTrace,
    );
  } finally {
    container.dispose();
    await database.close();
  }
  return true;
}

/// Mêmes dépendances que l'application (`bootstrap.dart`) : configuration
/// embarquée, base chiffrée, stockage sécurisé. Null si l'une manque.
Future<ProviderContainer?> _openContainer() async {
  final config = switch (AppConfig.load()) {
    ConfigLoaded(:final config) => config,
    ConfigRejected() => null,
  };
  if (config == null) return null;
  final secureStore = FlutterSecureStore();
  final database = await openEncryptedAppDatabase(secureStore: secureStore);
  final container = ProviderContainer(
    overrides: [
      appConfigProvider.overrideWithValue(config),
      secureStoreProvider.overrideWithValue(secureStore),
      appDatabaseProvider.overrideWithValue(database),
    ],
    retry: (retryCount, error) => null,
  );
  return container;
}

/// Déclare l'application ouverte auprès des tâches de fond du processus et
/// mène, à leur demande, la synchronisation avec sa propre session.
final backgroundSyncBridgeProvider = Provider<void>((ref) {
  final port = ReceivePort();
  IsolateNameServer.removePortNameMapping(uiSyncPortName);
  IsolateNameServer.registerPortWithName(port.sendPort, uiSyncPortName);
  final subscription = port.listen((message) async {
    if (message case [final String name, final SendPort reply]) {
      final trigger = SyncTrigger.values
          .where((value) => value.name == name)
          .firstOrNull;
      try {
        if (trigger != null) {
          await ref
              .read(syncControllerProvider.notifier)
              .synchronize(trigger: trigger);
        }
      } finally {
        reply.send(true);
      }
    }
  });
  ref.onDispose(() {
    unawaited(subscription.cancel());
    port.close();
    IsolateNameServer.removePortNameMapping(uiSyncPortName);
  });
});
