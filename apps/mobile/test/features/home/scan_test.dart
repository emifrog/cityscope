import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/home/presentation/home_screen.dart';
import 'package:etare_ops/src/features/home/presentation/scan_screen.dart';
import 'package:etare_ops/src/features/ops/presentation/site_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../ops/ops_app.dart';
import '../ops/ops_fixtures.dart' as fixtures;

/// Caméra simulée : un bouton émet le code préparé par le test.
const fakeScanKey = Key('fake.scan');

void main() {
  late String pending;

  Future<void> scan(WidgetTester tester, String code) async {
    pending = code;
    await tester.tap(find.byKey(fakeScanKey));
    await tester.pumpAndSettle();
  }

  Future<void> open(WidgetTester tester, AppDatabase database) async {
    await pumpApp(
      tester,
      database,
      overrides: [
        scanViewBuilderProvider.overrideWithValue(
          (context, onCode) => TextButton(
            key: fakeScanKey,
            onPressed: () => onCode(pending),
            child: const Text('Caméra'),
          ),
        ),
      ],
    );
    await tester.tap(find.byKey(HomeScreen.scanButtonKey));
    await tester.pumpAndSettle();
    expect(find.byType(ScanScreen), findsOneWidget);
  }

  testWidgets('le QR code du dossier ouvre le site installé, sans réseau', (
    tester,
  ) async {
    final database = await installedDatabase();
    await open(tester, database);
    await scan(tester, 'https://firescape.io/sites/${fixtures.siteId}');
    expect(find.byType(SiteScreen), findsOneWidget);
    expect(find.text('EHPAD Les Oliviers'), findsWidgets);
    // Le scan a cédé sa place au site : le retour mène à l'accueil.
    expect(find.byType(ScanScreen), findsNothing);
    await finish(tester, database);
  });

  testWidgets('un code étranger ou un site absent de la tablette sont dits', (
    tester,
  ) async {
    final database = await installedDatabase();
    await open(tester, database);
    await scan(tester, 'https://exemple.fr/promo');
    expect(
      find.text('Ce code n’est pas celui d’un site FireScape.'),
      findsOneWidget,
    );
    await tester.pump(const Duration(seconds: 3));
    await scan(
      tester,
      'https://firescape.io/sites/06000002-0000-4000-8000-0000000000ff',
    );
    expect(find.textContaining('Site non installé'), findsOneWidget);
    expect(find.byType(SiteScreen), findsNothing);
    await tester.pump(const Duration(seconds: 3));
    await finish(tester, database);
  });
}
