import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

/// Document installé (essentiel hors ligne), lu depuis la base chiffrée :
/// jamais écrit en clair sur le stockage de la tablette.
class DocumentScreen extends ConsumerWidget {
  const DocumentScreen({
    required this.title,
    required this.sha256,
    required this.mimeType,
    super.key,
  });

  final String title;
  final String sha256;
  final String mimeType;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final file = ref.watch(installedFileProvider(sha256));
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: switch (file) {
          AsyncData(value: final bytes?) when mimeType.startsWith('image/') =>
            InteractiveViewer(
              maxScale: 8,
              child: Center(child: Image.memory(bytes)),
            ),
          AsyncData(value: final bytes?) => _Notice(
            icon: Icons.picture_as_pdf_outlined,
            text:
                'Document PDF installé et vérifié (${formatBytesFr(bytes.length)}). '
                'Sa lecture intégrée à la tablette arrive avec un prochain lot ; '
                'consultez-le en attendant depuis le back-office.',
          ),
          AsyncData() => const _Notice(
            icon: Icons.cloud_off_outlined,
            text: 'Document non installé sur cette tablette.',
          ),
          AsyncError() => const _Notice(
            icon: Icons.error_outline,
            text: 'Document illisible : relancez une synchronisation.',
          ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 48, color: BrandColors.textMuted),
          const SizedBox(height: 12),
          Text(
            text,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ],
      ),
    ),
  );
}
