import 'package:etare_ops/src/app.dart';
import 'package:etare_ops/src/core/config/app_config.dart';
import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/encrypted_database.dart';
import 'package:etare_ops/src/features/startup/presentation/startup_error_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

const _logger = AppLogger('bootstrap');

/// Séquence de démarrage :
/// 1. validation de la configuration (`--dart-define`) ;
/// 2. ouverture de la base locale CHIFFRÉE (échec = arrêt, jamais de repli
///    vers une base en clair) ;
/// 3. lancement de l'application avec les dépendances injectées.
Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();

  final AppConfig config;
  switch (AppConfig.load()) {
    case ConfigRejected(:final issues):
      _logger.error('Configuration invalide : ${issues.join(' ; ')}');
      runApp(StartupErrorApp(child: ConfigErrorScreen(issues: issues)));
      return;
    case ConfigLoaded(config: final loaded):
      config = loaded;
  }
  _logger.info('Démarrage : $config');

  final secureStore = FlutterSecureStore();
  final AppDatabase database;
  try {
    database = await openEncryptedAppDatabase(secureStore: secureStore);
  } on Object catch (error, stackTrace) {
    _logger.error(
      'Base locale chiffrée indisponible',
      error: unwrapDatabaseError(error),
      stackTrace: stackTrace,
    );
    runApp(
      const StartupErrorApp(
        child: StartupErrorScreen(
          title: 'Stockage sécurisé indisponible',
          message:
              'La base de données locale chiffrée n’a pas pu être ouverte. '
              'Par sécurité, l’application ne peut pas démarrer. Redémarrez '
              'l’appareil puis réessayez ; si le problème persiste, '
              'contactez le support.',
        ),
      ),
    );
    return;
  }

  runApp(
    ProviderScope(
      overrides: [
        appConfigProvider.overrideWithValue(config),
        secureStoreProvider.overrideWithValue(secureStore),
        appDatabaseProvider.overrideWithValue(database),
      ],
      // Pas de nouvelle tentative automatique : les erreurs sont affichées et
      // l'utilisateur relance explicitement (« Réessayer »).
      retry: (retryCount, error) => null,
      child: const EtareOpsApp(),
    ),
  );
}
