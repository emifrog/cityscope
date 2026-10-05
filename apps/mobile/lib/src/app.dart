import 'package:etare_ops/src/core/routing/app_router.dart';
import 'package:etare_ops/src/core/theme/app_theme.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/lock/presentation/lock_gate.dart';
import 'package:etare_ops/src/features/sync/background/background_sync.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

/// Racine de l'application OPS (une fois la configuration et la base locale
/// prêtes).
class EtareOpsApp extends ConsumerWidget {
  const EtareOpsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Les tâches de fond du processus confient la synchronisation à
    // l'application tant qu'elle est ouverte (SYN-01).
    ref.watch(backgroundSyncBridgeProvider);
    return MaterialApp.router(
      title: Brand.productName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      themeMode: ThemeMode.light,
      locale: const Locale('fr', 'FR'),
      supportedLocales: const [Locale('fr', 'FR')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      routerConfig: ref.watch(routerProvider),
      // Verrou applicatif au-dessus de toute la navigation (ADR-025).
      builder: (context, child) =>
          LockGate(child: child ?? const SizedBox.shrink()),
    );
  }
}
