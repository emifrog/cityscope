import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:material_ui/material_ui.dart';

/// Affiché pendant la restauration de la session au démarrage.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
    backgroundColor: BrandColors.navy,
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image(
            image: AssetImage(Brand.logoInverseAsset),
            width: 220,
            semanticLabel: Brand.productName,
          ),
          SizedBox(height: 32),
          CircularProgressIndicator(
            color: BrandColors.onDark,
            semanticsLabel: 'Chargement',
          ),
        ],
      ),
    ),
  );
}
