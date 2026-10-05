import 'package:drift/drift.dart' show Value;
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/home/presentation/home_screen.dart';
import 'package:etare_ops/src/features/map/application/map_providers.dart';
import 'package:etare_ops/src/features/map/presentation/map_screen.dart';
import 'package:etare_ops/src/features/map/presentation/ops_map_view.dart';
import 'package:etare_ops/src/features/ops/presentation/site_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../ops/ops_app.dart';
import '../ops/ops_fixtures.dart' as fixtures;
import '../sync/fake_sync_server.dart';

const nicePack = '0600000b-0000-4000-8000-000000000001';
const parisPack = '0600000b-0000-4000-8000-000000000002';

/// Vue de carte simulée : la vue native de MapLibre n'existe pas sous
/// `flutter test`. Elle montre ce que l'écran lui confie et rejoue ses gestes.
final class FakeMap implements OpsMapControl {
  OpsMapSpec? spec;
  OpsMapEvents? events;
  bool followed = false;

  Widget build(BuildContext context, OpsMapSpec spec, OpsMapEvents events) {
    this.spec = spec;
    this.events = events;
    events.onReady(this);
    return ListView(
      padding: const EdgeInsets.only(top: 160),
      children: [
        Text('fond ${spec.styleKey}'),
        for (final marker in [...spec.sites, ...spec.objects])
          TextButton(
            key: Key('fake.${marker.id}'),
            onPressed: () => events.onMarkerTap(marker),
            child: Text('repère ${marker.label}'),
          ),
      ],
    );
  }

  @override
  Future<void> followUser() async => followed = true;

  @override
  Future<void> moveTo(double lon, double lat, double zoom) async {}
}

final class FakePermission implements LocationPermissionGate {
  FakePermission(this.granted);

  final bool granted;
  int requests = 0;

  @override
  Future<bool> request() async {
    requests++;
    return granted;
  }
}

Future<void> installBasemap(AppDatabase database, FakeBasemap basemap) =>
    database.basemapDao.install(
      InstalledBasemapsCompanion(
        packId: Value(basemap.packId),
        sectorId: Value(basemap.sectorId),
        sectorName: Value(basemap.sectorName),
        version: Value(basemap.version),
        manifestHash: Value('a' * 64),
        manifestText: Value(basemap.manifest),
        totalBytes: Value(basemap.totalBytes),
        builtAt: Value(DateTime.utc(2026, 10)),
        renewAfter: Value(DateTime.utc(2027, 4)),
        installedAt: Value(DateTime.utc(2026, 10, 1, 9)),
      ),
    );

final nice = FakeBasemap(
  packId: nicePack,
  sectorId: '0600001a-0000-4000-8000-000000000001',
  sectorName: 'CIS Nice Centre',
  version: 1,
  tiles: List.filled(8, 1),
);

final paris = FakeBasemap(
  packId: parisPack,
  sectorId: '0600001a-0000-4000-8000-000000000009',
  sectorName: 'Secteur Paris',
  version: 1,
  tiles: List.filled(8, 2),
  bounds: const [2.2, 48.8, 2.5, 48.9],
  center: const [2.35, 48.85],
);

void main() {
  late AppDatabase database;
  late FakeMap map;
  late FakePermission permission;

  setUp(() async {
    database = await installedDatabase();
    map = FakeMap();
    permission = FakePermission(true);
  });

  Future<void> open(WidgetTester tester) => pumpApp(
    tester,
    database,
    overrides: [
      opsMapBuilderProvider.overrideWithValue(map.build),
      mapStyleProvider.overrideWith((ref, packId) async => 'style:$packId'),
      locationPermissionProvider.overrideWithValue(permission),
    ],
  );

  testWidgets('situe les sites installés sur le fond du secteur, avec sa '
      'source et sa date, et ouvre la fiche d’un site', (tester) async {
    await installBasemap(database, nice);
    await open(tester);

    await tester.tap(find.byKey(HomeScreen.mapButtonKey));
    await tester.pumpAndSettle();

    expect(find.text('fond $nicePack'), findsOneWidget);
    expect(map.spec?.style, 'style:$nicePack');
    expect(map.spec?.showUserLocation, isFalse);
    expect(
      find.text(
        'Fond d’essai FireScape — aucune donnée IGN · fond du 01/10/2026',
      ),
      findsOneWidget,
    );
    // Au centre du secteur : fond couvert, aucun avertissement.
    expect(find.byKey(MapScreen.coverageKey), findsNothing);

    await tester.tap(find.byKey(const Key('fake.${fixtures.siteId}')));
    await tester.pumpAndSettle();
    expect(find.byKey(MapScreen.markerCardKey), findsOneWidget);
    expect(find.text('12 avenue des Mimosas'), findsWidgets);
    await tester.tap(find.byKey(MapScreen.openSiteKey));
    await tester.pumpAndSettle();
    expect(find.byType(SiteScreen), findsOneWidget);
    await finish(tester, database);
  });

  testWidgets('depuis la fiche, centre la carte sur le site et montre ses '
      'points extérieurs', (tester) async {
    await installBasemap(database, nice);
    await open(tester);
    await tester.tap(find.text('EHPAD Les Oliviers'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(SiteScreen.mapKey),
      200,
      scrollable: find
          .descendant(
            of: find.byType(SiteScreen),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.tap(find.byKey(SiteScreen.mapKey));
    await tester.pumpAndSettle();

    expect(map.spec?.centerLon, closeTo(7.2514, 1e-6));
    expect(map.spec?.zoom, 16);
    expect(map.spec?.objects.map((marker) => marker.label), ['PEI principal']);
    await tester.tap(find.text('repère PEI principal'));
    await tester.pumpAndSettle();
    expect(find.text('Point d’eau incendie'), findsOneWidget);
    expect(find.text('Fiche du site'), findsOneWidget);
    await finish(tester, database);
  });

  testWidgets('distingue l’absence de fond de l’absence de données', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.byKey(HomeScreen.mapButtonKey));
    await tester.pumpAndSettle();

    expect(find.text('fond sans-fond'), findsOneWidget);
    expect(map.spec?.style, 'style:null');
    expect(
      find.textContaining('Aucun fond de carte sur cette tablette'),
      findsOneWidget,
    );
    expect(find.textContaining('Aucune donnée opérationnelle'), findsNothing);
    expect(find.text('Sans fond de carte'), findsOneWidget);
    // Les sites restent placés.
    expect(find.text('repère EHPAD Les Oliviers'), findsOneWidget);
    await finish(tester, database);
  });

  testWidgets('signale la sortie de la couverture et le détail manquant, '
      'propose le fond d’un autre secteur', (tester) async {
    await installBasemap(database, nice);
    await installBasemap(database, paris);
    await open(tester);
    await tester.tap(find.byKey(HomeScreen.mapButtonKey));
    await tester.pumpAndSettle();
    expect(find.byKey(MapScreen.sectorKey(nicePack)), findsOneWidget);
    expect(find.byKey(MapScreen.sectorKey(parisPack)), findsOneWidget);

    // Loin des sites diffusés, au-delà du zoom de la vue générale.
    map.events!.onCameraIdle(7.30, 43.74, 17);
    await tester.pumpAndSettle();
    expect(find.textContaining('Détail non disponible ici'), findsOneWidget);

    map.events!.onCameraIdle(2.35, 48.85, 12);
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Fond de carte non disponible ici'),
      findsOneWidget,
    );
    await tester.tap(find.text('Fond « Secteur Paris »'));
    await tester.pumpAndSettle();
    expect(find.text('fond $parisPack'), findsOneWidget);
    expect(find.byKey(MapScreen.coverageKey), findsNothing);

    await tester.tap(find.byKey(MapScreen.sectorKey(nicePack)));
    await tester.pumpAndSettle();
    expect(find.text('fond $nicePack'), findsOneWidget);
    await finish(tester, database);
  });

  testWidgets('affiche la position de l’agent après son accord, sans rien '
      'transmettre ; un refus laisse la carte utilisable', (tester) async {
    await installBasemap(database, nice);
    await open(tester);
    await tester.tap(find.byKey(HomeScreen.mapButtonKey));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(MapScreen.locateButtonKey));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(permission.requests, 1);
    expect(map.spec?.showUserLocation, isTrue);
    expect(map.followed, isTrue);
    await finish(tester, database);
  });

  testWidgets('localisation refusée', (tester) async {
    permission = FakePermission(false);
    await open(tester);
    await tester.tap(find.byKey(HomeScreen.mapButtonKey));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(MapScreen.locateButtonKey));
    await tester.pumpAndSettle();
    expect(find.textContaining('Localisation refusée'), findsOneWidget);
    expect(map.spec?.showUserLocation, isFalse);
    await finish(tester, database);
  });
}
