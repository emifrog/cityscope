import 'dart:typed_data';

import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/theme/bounded_image.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/ops/application/document_downloads.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart';
import 'package:etare_ops/src/features/ops/data/file_source.dart';
import 'package:etare_ops/src/features/ops/presentation/pdf_reader.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

/// Document lu depuis la base chiffrée : jamais écrit en clair sur le stockage
/// de la tablette. Images zoomables, décodées à taille bornée ; PDF lus dans
/// l'application, par plages (DOC-01, CAP-02). Un document « à la demande »
/// absent se télécharge ici, explicitement (DOC-02).
class DocumentScreen extends ConsumerWidget {
  const DocumentScreen({
    required this.title,
    required this.sha256,
    required this.mimeType,
    this.caption,
    this.onDemandSiteId,
    super.key,
  });

  static const _pdf = 'application/pdf';

  static const downloadButtonKey = Key('document.download');
  static const removeButtonKey = Key('document.remove');

  final String title;
  final String sha256;
  final String mimeType;

  /// Légende affichée en entier sous une photo (le titre peut être tronqué).
  final String? caption;

  /// Site dont la version installée propose ce document « à la demande ».
  final String? onDemandSiteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Un PDF n'est jamais chargé en entier : PDFium lit ses pages au besoin.
    final AsyncValue<Object?> file = mimeType == _pdf
        ? ref.watch(installedFileSourceProvider(sha256))
        : ref.watch(installedFileProvider(sha256));
    final siteId = onDemandSiteId;
    final present = file.value != null;
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [
          if (siteId != null && present)
            IconButton(
              key: removeButtonKey,
              tooltip: 'Retirer de la tablette',
              onPressed: () => _confirmRemoval(context, ref, siteId),
              icon: const Icon(Icons.delete_outline),
            ),
        ],
      ),
      body: SafeArea(
        child: switch (file) {
          AsyncData(value: final Uint8List bytes)
              when mimeType.startsWith('image/') =>
            Column(
              children: [
                Expanded(
                  child: InteractiveViewer(
                    maxScale: 8,
                    child: Center(
                      child: Image(
                        image: boundedImage(bytes, maxSide: photoMaxSide),
                      ),
                    ),
                  ),
                ),
                if (caption case final text?)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      text,
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                  ),
              ],
            ),
          AsyncData(value: final FileSource source) => ref.watch(
            pdfViewBuilderProvider,
          )(context, source, 'sha256:$sha256'),
          AsyncData(value: _?) => const _Notice(
            icon: Icons.description_outlined,
            text: 'Format de document non lisible sur la tablette.',
          ),
          AsyncData() when siteId != null => _OnDemandPanel(
            file: (siteId: siteId, sha256: sha256),
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

  Future<void> _confirmRemoval(
    BuildContext context,
    WidgetRef ref,
    String siteId,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Retirer ce document de la tablette ?'),
        content: const Text(
          'La place est libérée. Pour le consulter à nouveau, il faudra le '
          'retélécharger, avec du réseau.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Retirer'),
          ),
        ],
      ),
    );
    if (confirmed ?? false) {
      await ref
          .read(
            documentDownloadProvider((siteId: siteId, sha256: sha256)).notifier,
          )
          .discard();
    }
  }
}

/// Document « à la demande » pas encore sur la tablette : taille, conditions,
/// téléchargement explicite et sa progression, message exact en cas d'échec.
class _OnDemandPanel extends ConsumerWidget {
  const _OnDemandPanel({required this.file});

  final SiteFile file;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final textTheme = Theme.of(context).textTheme;
    final size = ref.watch(installedFileInfoProvider(file)).value?.sizeBytes;
    final download = ref.watch(documentDownloadProvider(file));
    final sizeText = size == null ? '' : ' (${formatBytesFr(size)})';
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Icon(
          Icons.cloud_download_outlined,
          size: 48,
          color: BrandColors.textMuted,
        ),
        const SizedBox(height: 12),
        Text(
          'Document « à la demande » : il n’est pas encore sur cette '
          'tablette.',
          textAlign: TextAlign.center,
          style: textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Text(
          'Son téléchargement demande du réseau$sizeText. Il est vérifié puis '
          'enregistré chiffré, et reste consultable sans réseau tant que '
          'cette version du site est installée.',
          textAlign: TextAlign.center,
          style: textTheme.bodyLarge,
        ),
        const SizedBox(height: 24),
        if (download case DocumentDownloading(
          :final received,
          :final total,
          :final fraction,
        )) ...[
          LinearProgressIndicator(value: fraction),
          const SizedBox(height: 8),
          Text(
            total > 0
                ? 'Téléchargement… ${formatBytesFr(received)} / '
                      '${formatBytesFr(total)}'
                : 'Téléchargement…',
            textAlign: TextAlign.center,
            style: textTheme.bodyMedium,
          ),
        ] else ...[
          if (download case DocumentDownloadFailed(:final message)) ...[
            Text(
              message,
              textAlign: TextAlign.center,
              style: textTheme.bodyLarge?.copyWith(color: BrandColors.critical),
            ),
            const SizedBox(height: 16),
          ],
          FilledButton.icon(
            key: DocumentScreen.downloadButtonKey,
            onPressed: () =>
                ref.read(documentDownloadProvider(file).notifier).download(),
            icon: const Icon(Icons.download),
            label: Text('Télécharger$sizeText'),
          ),
        ],
      ],
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
