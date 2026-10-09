import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:etare_ops/src/features/ops/domain/ops_labels.dart';
import 'package:etare_ops/src/features/ops/presentation/document_screen.dart';
import 'package:etare_ops/src/features/ops/presentation/item_sheet.dart';
import 'package:etare_ops/src/features/ops/presentation/site_screen.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:flutter/widgets.dart' show Navigator, Offset;
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart' show ListTile;

import 'ops_app.dart';
import 'ops_fixtures.dart';

void main() {
  setUpAll(() => driftRuntimeOptions.dontWarnAboutMultipleDatabases = true);

  testWidgets('matières dangereuses listées avec les risques, fiche et FDS '
      'lue sans réseau (RISK-03)', (tester) async {
    final database = await installedDatabase();
    await pumpApp(tester, database);
    await tester.tap(find.text('EHPAD Les Oliviers'));
    await tester.pumpAndSettle();

    // La synthèse compte les matières avec les risques et les points à risque.
    final risksTile = find.byKey(SiteScreen.tileKey(OpsSection.risks));
    expect(
      find.descendant(of: risksTile, matching: find.text('5')),
      findsOneWidget,
    );
    await tester.tap(risksTile);
    await tester.pumpAndSettle();

    // Après les risques et les points à risque, les matières.
    expect(find.text('Matières dangereuses'), findsOneWidget);
    expect(find.text('Oxygène liquide'), findsOneWidget);
    expect(
      find.text('Comburant, Gaz sous pression · 2,5 m³ · Bâtiment A · RDC'),
      findsOneWidget,
    );
    expect(find.text('Hypochlorite de sodium'), findsOneWidget);
    expect(
      find.text(
        'Corrosif, Dangereux pour l’environnement · 200 L · '
        'Local ménage, sous-sol',
      ),
      findsOneWidget,
    );
    final tiles = tester.widgetList<ListTile>(find.byType(ListTile)).toList();
    expect(tiles, hasLength(5));

    // Fiche : classes, ONU, état, quantité, emplacement, puis la FDS.
    await tester.tap(find.text('Oxygène liquide'));
    await tester.pumpAndSettle();
    expect(find.text('Comburant'), findsOneWidget);
    expect(find.text('Gaz sous pression'), findsOneWidget);
    expect(find.text('ONU 1073'), findsOneWidget);
    expect(find.text('Liquide'), findsOneWidget);
    expect(find.text('2,5 m³'), findsOneWidget);
    expect(find.text('Bâtiment A · RDC'), findsOneWidget);
    expect(find.text('Réserve O₂, accès par la cour'), findsOneWidget);
    await tester.ensureVisible(find.byKey(ItemSheet.sheetButtonKey));
    await tester.tap(find.byKey(ItemSheet.sheetButtonKey));
    await tester.pumpAndSettle();
    expect(find.byType(DocumentScreen), findsOneWidget);
    expect(
      find.text('PDF ${tinyPdf.length} octets · sha256:${sha256Hex(tinyPdf)}'),
      findsOneWidget,
    );
    Navigator.of(tester.element(find.byType(DocumentScreen))).pop();
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    // Sans FDS publiée : la fiche le dit, sans bouton.
    await tester.tap(find.text('Hypochlorite de sodium'));
    await tester.pumpAndSettle();
    expect(find.text('ONU 1791'), findsOneWidget);
    expect(find.text('FDS absente de cette version'), findsOneWidget);
    expect(find.byKey(ItemSheet.sheetButtonKey), findsNothing);
    await finish(tester, database);
  });
}
