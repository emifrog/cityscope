import 'dart:math' as math;

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:etare_ops/src/app.dart';
import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/home/presentation/home_screen.dart';
import 'package:etare_ops/src/features/ops/domain/ops_labels.dart';
import 'package:etare_ops/src/features/ops/domain/plan_items.dart';
import 'package:etare_ops/src/features/ops/presentation/item_sheet.dart';
import 'package:etare_ops/src/features/ops/presentation/plan_screen.dart';
import 'package:etare_ops/src/features/ops/presentation/section_screen.dart';
import 'package:etare_ops/src/features/ops/presentation/site_screen.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';
import 'package:flutter/widgets.dart'
    show CustomPaint, InteractiveViewer, Offset, Size, SizedBox;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart' show FilterChip;

import '../../support/app_harness.dart';
import 'ops_fixtures.dart';

/// Pas de réseau dans ces tests : la synchronisation automatique ne fait rien.
class _IdleSync extends SyncController {
  @override
  Future<void> synchronize() async {}
}

final now = DateTime.utc(2026, 10, 1, 10);

Future<AppDatabase> installedDatabase({String user = 'user-1'}) async {
  final database = AppDatabase(NativeDatabase.memory());
  await database.offlineDao.storeBlob(sha256Hex(tinyPng), tinyPng, now);
  await database.offlineDao.activate(
    ActivationRecord(
      install: [installRecord()],
      removeSites: const [],
      generation: 2,
      serverTime: now,
      authorizedUserId: user,
      authorizationExpiresAt: now.add(const Duration(days: 7)),
      complete: true,
      now: now,
    ),
  );
  return database;
}

Future<void> pumpApp(WidgetTester tester, AppDatabase database) async {
  tester.view
    ..physicalSize = const Size(1200, 1900)
    ..devicePixelRatio = 1.5;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...appOverrides(
          authRepository: ScriptedAuthRepository(),
          signedIn: true,
          stubSyncStatus: false,
        ),
        appDatabaseProvider.overrideWithValue(database),
        clockProvider.overrideWithValue(
          () => now.add(const Duration(hours: 1)),
        ),
        deviceIdentityProvider.overrideWith(
          (ref) async => const DeviceIdentity(
            deviceId: 'device',
            deviceName: 'TABLETTE FPT01',
            tenantId: 'tenant-06',
            tenantName: 'SDIS DEMO 06',
            keySeed: [],
          ),
        ),
        syncControllerProvider.overrideWith(_IdleSync.new),
      ],
      child: const EtareOpsApp(),
    ),
  );
  await tester.pumpAndSettle();
}

/// Démonte l'application (les flux Drift libèrent leurs minuteries) puis
/// ferme la base, avant la vérification de fin de test.
Future<void> finish(WidgetTester tester, AppDatabase database) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(const Duration(milliseconds: 1));
  await database.close();
}

void main() {
  // Une base en mémoire par scénario, jamais deux ouvertes à la fois.
  setUpAll(() => driftRuntimeOptions.dontWarnAboutMultipleDatabases = true);

  testWidgets('un risque critique atteint en trois interactions, sans réseau '
      '(OPS-01, OPS-03)', (tester) async {
    final database = await installedDatabase();
    await pumpApp(tester, database);

    // Accueil : fraîcheur visible, recherche locale.
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.textContaining('À jour'), findsOneWidget);
    await tester.enterText(find.byKey(HomeScreen.searchFieldKey), 'mimosas');
    await tester.pumpAndSettle();
    expect(find.text('EHPAD Les Oliviers'), findsOneWidget);
    await tester.enterText(find.byKey(HomeScreen.searchFieldKey), 'toulon');
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Aucun site installé ne correspond'),
      findsOneWidget,
    );
    await tester.enterText(find.byKey(HomeScreen.searchFieldKey), '06-0428');
    await tester.pumpAndSettle();

    // 1 : recherche ; 2 : le site ; le risque critique est déjà affiché.
    await tester.tap(find.text('EHPAD Les Oliviers'));
    await tester.pumpAndSettle();
    expect(find.byType(SiteScreen), findsOneWidget);
    expect(find.text('Oxygène médical · gravité forte'), findsOneWidget);
    expect(find.text('PEI principal : HORS SERVICE'), findsOneWidget);
    expect(find.textContaining('version 2'), findsOneWidget);
    expect(find.text('ERP J cat. 3'), findsOneWidget);

    // 3 : la fiche du risque.
    await tester.tap(find.text('Oxygène médical · gravité forte'));
    await tester.pumpAndSettle();
    expect(find.text('18 bouteilles'), findsOneWidget);
    expect(find.text('Local RDC façade C'), findsOneWidget);
    expect(find.byKey(ItemSheet.planButtonKey), findsOneWidget);
    await finish(tester, database);
  });

  testWidgets('entrées de la synthèse : eau, coupures, contacts', (
    tester,
  ) async {
    final database = await installedDatabase();
    await pumpApp(tester, database);
    await tester.tap(find.text('EHPAD Les Oliviers'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(SiteScreen.tileKey(OpsSection.water)));
    await tester.pumpAndSettle();
    expect(find.text('PEI principal'), findsOneWidget);
    await tester.tap(find.text('PEI principal'));
    await tester.pumpAndSettle();
    expect(find.text('120 m³/h'), findsOneWidget);
    expect(find.text('Poteau incendie'), findsOneWidget);
    expect(find.text('HORS SERVICE'), findsWidgets);
    expect(find.text('43.70740, 7.25090'), findsOneWidget);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    // Retour à la synthèse (bouton retour de l'AppBar).
    GoRouter.of(tester.element(find.byType(SectionScreen))).pop();
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(SiteScreen.tileKey(OpsSection.contacts)));
    await tester.pumpAndSettle();
    expect(find.text('01 99 00 12 34'), findsOneWidget);
    expect(find.text('Disponibilité : 24/7'), findsOneWidget);
    await finish(tester, database);
  });

  testWidgets('plan tactile : calques, centrage sur l’élément, fiche au '
      'toucher (OPS-02)', (tester) async {
    final database = await installedDatabase();
    await pumpApp(tester, database);
    await tester.tap(find.text('EHPAD Les Oliviers'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Oxygène médical · gravité forte'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(ItemSheet.planButtonKey));
    await tester.pumpAndSettle();

    expect(find.byType(PlanScreen), findsOneWidget);
    expect(find.text('Risques (2)'), findsOneWidget);
    expect(find.text('Énergie (1)'), findsOneWidget);
    expect(find.text('Zones (1)'), findsOneWidget);

    // Ouvert centré sur le risque, agrandi trois fois par rapport au plan
    // entier : les symboles sont dessinés à l'échelle réelle du zoom.
    final canvas = tester.getRect(find.byType(InteractiveViewer));
    final painter = tester
        .widgetList<CustomPaint>(find.byType(CustomPaint))
        .map((widget) => widget.painter)
        .whereType<PlanOverlayPainter>()
        .single;
    final fit = math.min(canvas.width / 1600, canvas.height / 1000);
    expect(painter.scale, closeTo(fit * 3, 0.001));
    // Un toucher au centre ouvre la fiche du risque.
    await tester.tapAt(canvas.center);
    await tester.pumpAndSettle();
    expect(find.text('Oxygène médical'), findsOneWidget);
    expect(find.byKey(ItemSheet.planButtonKey), findsNothing);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    // Calque des risques masqué : le même toucher atteint la zone dessous.
    await tester.tap(find.byKey(PlanView.layerKey(PlanLayer.risks)));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FilterChip>(find.byKey(PlanView.layerKey(PlanLayer.risks)))
          .selected,
      isFalse,
    );
    await tester.tapAt(canvas.center);
    await tester.pumpAndSettle();
    expect(find.text('Local pharmacie façade C'), findsWidgets);
    await finish(tester, database);
  });

  testWidgets('aucune donnée sans autorisation locale pour cet utilisateur', (
    tester,
  ) async {
    final database = await installedDatabase(user: 'autre-utilisateur');
    await pumpApp(tester, database);

    expect(find.text('EHPAD Les Oliviers'), findsNothing);
    expect(
      find.textContaining('Consultation hors ligne non autorisée'),
      findsOneWidget,
    );
    await finish(tester, database);
  });
}
