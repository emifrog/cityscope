import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/time/trusted_clock.dart';
import 'package:etare_ops/src/data/local/daos/sync_state_dao.dart';
import 'package:etare_ops/src/data/local/encrypted_database.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/lock/application/lock_controller.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:etare_ops/src/features/sync/domain/terminal_policy.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Horloge de confiance des contrôles locaux (SEC-05, ADR-029) : rafraîchie
/// au démarrage, au retour au premier plan et périodiquement par le verrou.
final trustedClockProvider = Provider<TrustedClock>(
  (ref) => TrustedClock(
    platform: ref.watch(platformServicesProvider),
    store: DriftTrustedTimeStore(ref.watch(appDatabaseProvider).syncStateDao),
    wall: ref.watch(clockProvider),
  ),
);

/// Heure de confiance : consultation locale, sites sensibles, session.
final trustedNowProvider = Provider<DateTime Function()>(
  (ref) => ref.watch(trustedClockProvider).now,
);

/// Politique des tablettes reçue au dernier catalogue (avant : par défaut).
final terminalPolicyProvider = Provider<TerminalPolicy>(
  (ref) =>
      ref.watch(
        syncStatusProvider.select((status) => status.value?.terminalPolicy),
      ) ??
      TerminalPolicy.defaults,
);

/// Clé `local_meta` du message montré à la prochaine connexion (révocation
/// constatée par une tâche de fond, application fermée).
const loginNoticeKey = 'login_notice';

/// Motif conservé pour la prochaine connexion, effacé une fois connecté.
final storedLoginNoticeProvider = StreamProvider<String?>(
  (ref) =>
      ref.watch(appDatabaseProvider).localMetaDao.watchValue(loginNoticeKey),
);

/// Révocation (SEC-05) : session, code personnel et son secret, clé de la
/// base locale. Les données, l'identité et les clés du terminal sont effacées
/// par la synchronisation elle-même.
final terminalWipeProvider = Provider<Future<void> Function()>(
  (ref) => () async {
    const logger = AppLogger('lock');
    // Chaque effacement est tenté, même si un autre échoue : les données sont
    // déjà effacées, il ne reste que des secrets à ne pas laisser derrière soi.
    final steps = <String, Future<void> Function()>{
      'session': () => ref.read(sessionStoreProvider).clear(),
      'code personnel': () => ref.read(localCodeStoreProvider).clear(),
      'clé de la base': () =>
          DatabaseKeyStore(ref.read(secureStoreProvider))
              .rekey(ref.read(appDatabaseProvider)),
    };
    for (final MapEntry(key: name, value: step) in steps.entries) {
      try {
        await step();
      } on Object catch (error) {
        logger.warning('Révocation : $name non effacé(e).', error: error);
      }
    }
  },
);
