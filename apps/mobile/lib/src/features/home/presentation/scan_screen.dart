import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/home/domain/site_link.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Vue de lecture des codes : la caméra en direct (ML Kit embarqué, sans
/// réseau), remplacée dans les tests par un bouton qui émet un code.
typedef ScanViewBuilder = Widget Function(
  BuildContext context,
  void Function(String text) onCode,
);

final scanViewBuilderProvider = Provider<ScanViewBuilder>(
  (ref) =>
      (context, onCode) => MobileScanner(
        onDetect: (capture) {
          for (final barcode in capture.barcodes) {
            final value = barcode.rawValue;
            if (value != null && value.isNotEmpty) {
              onCode(value);
              return;
            }
          }
        },
        errorBuilder: (context, error) => _Notice(
          error.errorCode == MobileScannerErrorCode.permissionDenied
              ? 'Autorisez la caméra pour FireScape dans les réglages de la '
                    'tablette, puis revenez ici.'
              : 'Caméra indisponible sur cette tablette.',
        ),
      ),
);

/// Lecture du QR code d'un dossier ETARE : ouvre la version installée du site
/// (ou le site sensible proposé à la demande), sans réseau. Le code ne porte
/// que l'identifiant du site : il ne donne aucun droit, la tablette n'affiche
/// que ce qu'elle a reçu.
class ScanScreen extends ConsumerStatefulWidget {
  const ScanScreen({super.key});

  static const messageKey = Key('scan.message');

  @override
  ConsumerState<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends ConsumerState<ScanScreen> {
  String? _message;
  bool _busy = false;

  Future<void> _onCode(String text) async {
    if (_busy) return;
    _busy = true;
    final siteId = siteIdOfLink(text);
    if (siteId == null) {
      return _say('Ce code n’est pas celui d’un site FireScape.');
    }
    final database = ref.read(appDatabaseProvider);
    if (await database.offlineDao.installedSite(siteId) != null) {
      if (mounted) context.pushReplacement(AppRoutes.site(siteId));
      return;
    }
    if (await database.sensitiveDao.offered(siteId) != null) {
      if (mounted) context.pushReplacement(AppRoutes.sensitiveSite(siteId));
      return;
    }
    return _say(
      'Site non installé sur cette tablette : hors de votre périmètre, '
      'non publié ou retiré.',
    );
  }

  /// Le même code reste devant la caméra : le message tient deux secondes
  /// avant qu'un code soit relu.
  Future<void> _say(String message) async {
    if (mounted) setState(() => _message = message);
    await Future<void>.delayed(const Duration(seconds: 2));
    _busy = false;
  }

  @override
  Widget build(BuildContext context) {
    final view = ref.watch(scanViewBuilderProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Scanner un dossier')),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(child: view(context, _onCode)),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                _message ??
                    'Visez le QR code imprimé en haut du dossier ETARE.',
                key: ScanScreen.messageKey,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: _message == null
                      ? BrandColors.textMuted
                      : BrandColors.accentStrong,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice(this.message);

  final String message;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodyLarge
            ?.copyWith(color: BrandColors.textMuted),
      ),
    ),
  );
}
