import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:material_ui/material_ui.dart';

/// Affiché pendant la restauration de la session au démarrage.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: BrandColors.navy,
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Brand.logoIcon, size: 72, color: BrandColors.accent),
          const SizedBox(height: 16),
          Text(
            Brand.productName,
            style: Theme.of(context).textTheme.headlineMedium
                ?.copyWith(color: BrandColors.onDark),
          ),
          const SizedBox(height: 32),
          const CircularProgressIndicator(
            color: BrandColors.onDark,
            semanticsLabel: 'Chargement',
          ),
        ],
      ),
    ),
  );
}
