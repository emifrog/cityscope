import 'package:etare_ops/src/core/config/app_config.dart';
import 'package:etare_ops/src/core/theme/app_theme.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:material_ui/material_ui.dart';

/// Application minimale affichée quand le démarrage normal est impossible
/// (configuration invalide, stockage chiffré indisponible…). Aucun routeur,
/// aucun accès réseau.
class StartupErrorApp extends StatelessWidget {
  const StartupErrorApp({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: Brand.productName,
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light(),
    locale: const Locale('fr', 'FR'),
    supportedLocales: const [Locale('fr', 'FR')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    home: child,
  );
}

/// Écran d'erreur de configuration (`--dart-define` manquants ou invalides).
class ConfigErrorScreen extends StatelessWidget {
  const ConfigErrorScreen({required this.issues, super.key});

  final List<ConfigIssue> issues;

  @override
  Widget build(BuildContext context) => StartupErrorScreen(
    title: 'Configuration invalide',
    message:
        'L’application n’est pas correctement configurée pour cet '
        'environnement : aucune connexion n’est possible. Contactez le '
        'support ou l’équipe technique.',
    details: [for (final issue in issues) '${issue.key} — ${issue.message}'],
    hint:
        'Développeurs : relancez avec les paramètres --dart-define attendus '
        '(voir apps/mobile/README.md).',
  );
}

/// Écran d'erreur fatale générique au démarrage.
class StartupErrorScreen extends StatelessWidget {
  const StartupErrorScreen({
    required this.title,
    required this.message,
    this.details = const [],
    this.hint,
    super.key,
  });

  final String title;
  final String message;
  final List<String> details;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text(Brand.productName)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Icon(
              Icons.error_outline,
              size: 64,
              color: BrandColors.critical,
            ),
            const SizedBox(height: 16),
            Semantics(
              header: true,
              child: Text(
                title,
                style: textTheme.headlineMedium?.copyWith(
                  color: BrandColors.critical,
                ),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 16),
            Text(message, style: textTheme.bodyLarge),
            if (details.isNotEmpty) ...[
              const SizedBox(height: 24),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final detail in details)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Padding(
                                padding: EdgeInsets.only(top: 2, right: 8),
                                child: Icon(
                                  Icons.chevron_right,
                                  color: BrandColors.critical,
                                ),
                              ),
                              Expanded(
                                child: Text(
                                  detail,
                                  style: textTheme.bodyMedium,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
            if (hint != null) ...[
              const SizedBox(height: 24),
              Text(
                hint!,
                style: textTheme.bodyMedium?.copyWith(
                  color: BrandColors.textMuted,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
