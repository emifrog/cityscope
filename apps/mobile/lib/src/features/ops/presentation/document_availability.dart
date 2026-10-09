import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/features/ops/application/document_downloads.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

/// État d'un document « à la demande » : sur la tablette, à télécharger
/// (avec sa taille), en cours ou en échec (DOC-02). Même texte dans la liste
/// des documents et sur la fiche d'une matière dangereuse (RISK-03).
(String, Color) documentAvailability(WidgetRef ref, SiteFile file) {
  final size = ref.watch(installedFileInfoProvider(file)).value?.sizeBytes;
  final sizeText = size == null ? '' : ' · ${formatBytesFr(size)}';
  final present = ref.watch(fileOnTabletProvider(file.sha256)).value ?? false;
  return switch (ref.watch(documentDownloadProvider(file))) {
    _ when present => ('Sur la tablette$sizeText', BrandColors.success),
    DocumentDownloading(:final fraction) => (
      fraction == null
          ? 'Téléchargement…'
          : 'Téléchargement… ${(fraction * 100).round()} %',
      BrandColors.info,
    ),
    DocumentDownloadFailed() => (
      'Téléchargement échoué : touchez pour réessayer',
      BrandColors.critical,
    ),
    DocumentDownloadIdle() => (
      'À télécharger (réseau nécessaire)$sizeText',
      BrandColors.important,
    ),
  };
}
