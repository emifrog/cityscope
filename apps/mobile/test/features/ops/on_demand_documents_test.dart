import 'dart:typed_data';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/ops/application/document_downloads.dart';
import 'package:etare_ops/src/features/ops/domain/ops_labels.dart';
import 'package:etare_ops/src/features/ops/presentation/document_screen.dart';
import 'package:etare_ops/src/features/ops/presentation/site_screen.dart';
import 'package:etare_ops/src/features/sync/application/document_downloader.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:flutter/widgets.dart' show Navigator, Scrollable;
import 'package:flutter_test/flutter_test.dart';

import 'ops_app.dart';
import 'ops_fixtures.dart';

/// Téléchargement simulé : refusé sans réseau, sinon le document vérifié est
/// rangé dans la base comme le ferait le vrai service.
class _FakeDownloader implements DocumentDownloader {
  _FakeDownloader(this.database);

  final AppDatabase database;
  bool offline = true;
  int downloads = 0;

  @override
  Future<void> download({
    required String siteId,
    required String sha256,
    void Function(int received, int total)? onProgress,
  }) async {
    if (offline) throw const NetworkException(NetworkFailure.offline);
    downloads++;
    onProgress?.call(onDemandPdf.length, onDemandPdf.length);
    await database.offlineDao.storeOnDemandBlob(
      sha256,
      Uint8List.fromList(onDemandPdf),
      now,
    );
  }

  @override
  Future<bool> discard(String sha256) =>
      database.offlineDao.discardOnDemandBlob(sha256);
}

void main() {
  setUpAll(() => driftRuntimeOptions.dontWarnAboutMultipleDatabases = true);

  testWidgets('document à la demande : listé avec sa taille, message exact '
      'sans réseau, téléchargé sur demande, lu puis retiré (DOC-02)', (
    tester,
  ) async {
    final database = await installedDatabase();
    final downloader = _FakeDownloader(database);
    await pumpApp(
      tester,
      database,
      overrides: [documentDownloaderProvider.overrideWithValue(downloader)],
    );
    await tester.tap(find.text('EHPAD Les Oliviers'));
    await tester.pumpAndSettle();
    final documents = find.byKey(SiteScreen.tileKey(OpsSection.annexes));
    await tester.scrollUntilVisible(
      documents,
      200,
      scrollable: find
          .descendant(
            of: find.byType(SiteScreen),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    // Essentiel et « à la demande » ; jamais un document réservé au back-office.
    expect(find.text('Documents (2)'), findsOneWidget);
    await tester.tap(documents);
    await tester.pumpAndSettle();
    expect(find.text('Consignes de sécurité'), findsOneWidget);
    expect(find.text('Contrat de maintenance'), findsNothing);
    expect(
      find.text('À télécharger (réseau nécessaire) · ${onDemandPdf.length} o'),
      findsOneWidget,
    );

    // Sans réseau : le document manque, l'écran le dit exactement.
    await tester.tap(find.text('Plan de prévention'));
    await tester.pumpAndSettle();
    expect(find.textContaining('n’est pas encore sur cette'), findsOneWidget);
    await tester.tap(find.byKey(DocumentScreen.downloadButtonKey));
    await tester.pumpAndSettle();
    expect(find.text(documentOfflineMessage), findsOneWidget);

    // Réseau revenu : téléchargement explicite puis lecture.
    downloader.offline = false;
    await tester.tap(find.byKey(DocumentScreen.downloadButtonKey));
    await tester.pumpAndSettle();
    expect(downloader.downloads, 1);
    expect(
      find.text(
        'PDF ${onDemandPdf.length} octets · '
        'sha256:${sha256Hex(onDemandPdf)}',
      ),
      findsOneWidget,
    );
    Navigator.of(tester.element(find.byType(DocumentScreen))).pop();
    await tester.pumpAndSettle();
    expect(
      find.text('Sur la tablette · ${onDemandPdf.length} o'),
      findsOneWidget,
    );

    // Retrait : la place est libérée, le document redevient à télécharger.
    await tester.tap(find.text('Plan de prévention'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(DocumentScreen.removeButtonKey));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Retirer'));
    await tester.pumpAndSettle();
    expect(find.byKey(DocumentScreen.downloadButtonKey), findsOneWidget);
    expect(
      await database.offlineDao.presentBlobs([sha256Hex(onDemandPdf)]),
      isEmpty,
    );

    await finish(tester, database);
  });
}
