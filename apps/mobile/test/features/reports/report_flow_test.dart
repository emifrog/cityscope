import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/reports_dao.dart';
import 'package:etare_ops/src/features/ops/domain/ops_labels.dart';
import 'package:etare_ops/src/features/ops/presentation/item_sheet.dart';
import 'package:etare_ops/src/features/ops/presentation/plan_screen.dart';
import 'package:etare_ops/src/features/ops/presentation/site_screen.dart';
import 'package:etare_ops/src/features/reports/application/report_providers.dart';
import 'package:etare_ops/src/features/reports/data/photo_picker.dart';
import 'package:etare_ops/src/features/reports/domain/field_report.dart';
import 'package:etare_ops/src/features/reports/presentation/my_reports_screen.dart';
import 'package:etare_ops/src/features/reports/presentation/report_form_screen.dart';
import 'package:flutter/widgets.dart' show InteractiveViewer, Scrollable;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart' show ChoiceChip;

import '../ops/ops_app.dart';
import '../ops/ops_fixtures.dart';

/// Appareil photo simulé : une petite image PNG.
final class _FakePicker implements PhotoPicker {
  int calls = 0;

  @override
  Future<NewReportPhoto?> pick(
    PhotoSource source, {
    required int position,
  }) async {
    calls++;
    return photoFromBytes(tinyPng, position: position);
  }
}

Finder scrollOf(Type screen) => find
    .descendant(of: find.byType(screen), matching: find.byType(Scrollable))
    .first;

Future<List<FieldReportRow>> reports(AppDatabase database) =>
    database.select(database.fieldReports).get();

void main() {
  setUpAll(() => driftRuntimeOptions.dontWarnAboutMultipleDatabases = true);

  testWidgets('un écart signalé sans réseau, avec photo, reste chiffré en '
      'attente d’envoi (OPS-04)', (tester) async {
    final database = await installedDatabase();
    final picker = _FakePicker();
    await pumpApp(
      tester,
      database,
      overrides: [photoPickerProvider.overrideWithValue(picker)],
    );
    await tester.tap(find.text('EHPAD Les Oliviers'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(SiteScreen.reportButtonKey),
      200,
      scrollable: scrollOf(SiteScreen),
    );
    await tester.tap(find.byKey(SiteScreen.reportButtonKey));
    await tester.pumpAndSettle();
    expect(find.byType(ReportFormScreen), findsOneWidget);

    // Le constat est obligatoire.
    await tester.scrollUntilVisible(
      find.byKey(ReportFormScreen.saveKey),
      200,
      scrollable: scrollOf(ReportFormScreen),
    );
    await tester.tap(find.byKey(ReportFormScreen.saveKey));
    await tester.pumpAndSettle();
    expect(find.text('Décrivez le constat.'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.byKey(ReportFormScreen.categoryKey(ReportCategory.water)),
      -200,
      scrollable: scrollOf(ReportFormScreen),
    );
    await tester.tap(
      find.byKey(ReportFormScreen.categoryKey(ReportCategory.water)),
    );
    await tester.tap(
      find.byKey(ReportFormScreen.severityKey(ReportSeverity.urgent)),
    );
    await tester.enterText(
      find.byKey(ReportFormScreen.descriptionKey),
      'Poteau incendie masqué par un véhicule.',
    );
    await tester.scrollUntilVisible(
      find.byKey(ReportFormScreen.cameraKey),
      200,
      scrollable: scrollOf(ReportFormScreen),
    );
    await tester.tap(find.byKey(ReportFormScreen.cameraKey));
    await tester.pumpAndSettle();
    expect(picker.calls, 1);
    expect(find.text('Photos (1/5)'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(ReportFormScreen.saveKey),
      200,
      scrollable: scrollOf(ReportFormScreen),
    );
    await tester.tap(find.byKey(ReportFormScreen.saveKey));
    await tester.pumpAndSettle();

    expect(find.byType(SiteScreen), findsOneWidget);
    expect(find.textContaining('Signalement enregistré'), findsOneWidget);
    final saved = (await reports(database)).single;
    expect(saved.authorUserId, 'user-1');
    expect(saved.category, 'water');
    expect(saved.severity, 'urgent');
    expect(saved.publicationNumber, 2);
    expect(saved.localState, 'pending');
    expect(
      await database.reportsDao.photosOf(saved.clientReportId),
      hasLength(1),
    );

    // Mes signalements : en attente d'envoi.
    GoRouter.of(tester.element(find.byType(SiteScreen))).go(AppRoutes.reports);
    await tester.pumpAndSettle();
    expect(find.byType(MyReportsScreen), findsOneWidget);
    expect(find.text('En attente d’envoi'), findsOneWidget);
    expect(find.text('1 signalement en attente d’envoi'), findsOneWidget);
    expect(
      find.text('Poteau incendie masqué par un véhicule.'),
      findsOneWidget,
    );
    await finish(tester, database);
  });

  testWidgets('depuis la fiche d’un point, l’élément est joint et la '
      'catégorie proposée', (tester) async {
    final database = await installedDatabase();
    await pumpApp(tester, database);
    await tester.tap(find.text('EHPAD Les Oliviers'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(SiteScreen.tileKey(OpsSection.water)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('PEI principal'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(ItemSheet.reportButtonKey),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.byKey(ItemSheet.reportButtonKey));
    await tester.pumpAndSettle();

    expect(find.text('Élément : PEI principal'), findsOneWidget);
    expect(
      tester
          .widget<ChoiceChip>(
            find.byKey(ReportFormScreen.categoryKey(ReportCategory.water)),
          )
          .selected,
      isTrue,
    );
    await tester.enterText(
      find.byKey(ReportFormScreen.descriptionKey),
      'Bouchon manquant.',
    );
    await tester.scrollUntilVisible(
      find.byKey(ReportFormScreen.saveKey),
      200,
      scrollable: scrollOf(ReportFormScreen),
    );
    await tester.tap(find.byKey(ReportFormScreen.saveKey));
    await tester.pumpAndSettle();

    final saved = (await reports(database)).single;
    expect(saved.itemType, 'object');
    expect(saved.itemId, '06000009-0000-4000-8000-000000000004');
    expect(saved.itemLabel, 'PEI principal');
    await finish(tester, database);
  });

  testWidgets('un appui long sur le plan joint la position et l’élément '
      'touché', (tester) async {
    final database = await installedDatabase();
    await pumpApp(tester, database);
    await tester.tap(find.text('EHPAD Les Oliviers'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Oxygène médical · gravité forte'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(ItemSheet.planButtonKey));
    await tester.pumpAndSettle();
    expect(find.byType(PlanScreen), findsOneWidget);

    await tester.longPressAt(
      tester.getRect(find.byType(InteractiveViewer)).center,
    );
    await tester.pumpAndSettle();

    expect(find.byType(ReportFormScreen), findsOneWidget);
    expect(
      find.textContaining('Position sur le plan « Bâtiment A - RDC » jointe'),
      findsOneWidget,
    );
    expect(find.text('Élément : Oxygène médical'), findsOneWidget);
    await tester.enterText(
      find.byKey(ReportFormScreen.descriptionKey),
      'Bouteilles déplacées dans le couloir.',
    );
    await tester.scrollUntilVisible(
      find.byKey(ReportFormScreen.saveKey),
      200,
      scrollable: scrollOf(ReportFormScreen),
    );
    await tester.tap(find.byKey(ReportFormScreen.saveKey));
    await tester.pumpAndSettle();

    final saved = (await reports(database)).single;
    expect(saved.itemType, 'risk');
    expect(saved.planRevisionId, planRevision);
    expect(saved.planX, isNotNull);
    expect(saved.planTitle, 'Bâtiment A - RDC');
    await finish(tester, database);
  });
}
