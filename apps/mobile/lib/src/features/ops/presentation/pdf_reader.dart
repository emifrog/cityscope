import 'dart:async';
import 'dart:typed_data';

import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:pdfrx/pdfrx.dart';

/// Construit le lecteur d'un PDF déjà vérifié (surchargé dans les tests : le
/// moteur PDFium est natif).
typedef PdfViewBuilder = Widget Function(
  BuildContext context,
  Uint8List bytes,
  String sourceName,
);

final pdfViewBuilderProvider = Provider<PdfViewBuilder>(
  (ref) =>
      (context, bytes, sourceName) =>
          PdfReader(bytes: bytes, sourceName: sourceName),
);

/// Lecture d'un PDF installé (DOC-01) : ouvert directement depuis la mémoire
/// (octets lus dans la base chiffrée), jamais copié dans un fichier en clair ;
/// zoom au geste, pages précédente et suivante, erreur explicite.
class PdfReader extends StatefulWidget {
  const PdfReader({required this.bytes, required this.sourceName, super.key});

  static const previousKey = Key('pdf.previous');
  static const nextKey = Key('pdf.next');

  final Uint8List bytes;

  /// Identifiant stable du document (son empreinte).
  final String sourceName;

  @override
  State<PdfReader> createState() => _PdfReaderState();
}

class _PdfReaderState extends State<PdfReader> {
  final _controller = PdfViewerController();
  int? _page;
  int _pages = 0;

  void _goTo(int page) =>
      unawaited(_controller.goToPage(pageNumber: page.clamp(1, _pages)));

  @override
  Widget build(BuildContext context) {
    final page = _page;
    return Column(
      children: [
        Expanded(
          child: PdfViewer.data(
            widget.bytes,
            sourceName: widget.sourceName,
            controller: _controller,
            params: PdfViewerParams(
              backgroundColor: BrandColors.background,
              onViewerReady: (document, controller) =>
                  setState(() => _pages = document.pages.length),
              onPageChanged: (number) => setState(() => _page = number),
              errorBannerBuilder: (context, error, stackTrace, documentRef) =>
                  const _PdfError(),
            ),
          ),
        ),
        if (_pages > 1)
          Material(
            color: BrandColors.surface,
            child: SafeArea(
              top: false,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    key: PdfReader.previousKey,
                    tooltip: 'Page précédente',
                    iconSize: 32,
                    onPressed: page == null || page <= 1
                        ? null
                        : () => _goTo(page - 1),
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text(
                      'Page ${page ?? 1} / $_pages',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  IconButton(
                    key: PdfReader.nextKey,
                    tooltip: 'Page suivante',
                    iconSize: 32,
                    onPressed: (page ?? 1) >= _pages
                        ? null
                        : () => _goTo((page ?? 1) + 1),
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _PdfError extends StatelessWidget {
  const _PdfError();

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Text(
        'Ce PDF ne peut pas être affiché. Il reste consultable depuis le '
        'back-office ; signalez-le à la Prévision.',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodyLarge,
      ),
    ),
  );
}
