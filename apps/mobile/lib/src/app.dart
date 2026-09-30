import 'package:etare_ops/src/core/routing/app_router.dart';
import 'package:etare_ops/src/core/theme/app_theme.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

/// Racine de l'application OPS (une fois la configuration et la base locale
/// prêtes).
class EtareOpsApp extends ConsumerWidget {
  const EtareOpsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp.router(
    title: Brand.productName,
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light(),
    themeMode: ThemeMode.light,
    locale: const Locale('fr', 'FR'),
    supportedLocales: const [Locale('fr', 'FR')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    routerConfig: ref.watch(routerProvider),
  );
}
