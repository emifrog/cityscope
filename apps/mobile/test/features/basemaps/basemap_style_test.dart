import 'dart:convert';
import 'dart:io';

import 'package:etare_ops/src/features/basemaps/data/basemap_style.dart';
import 'package:etare_ops/src/features/basemaps/domain/basemap_models.dart';
import 'package:etare_ops/src/features/basemaps/domain/installed_basemap.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;

  setUp(() async {
    root = await Directory.systemTemp.createTemp('etare-map-style-');
  });

  tearDown(() => root.delete(recursive: true));

  test(
    'copie une fois les glyphes embarqués (trois polices, plages latines)',
    () async {
      final glyphs = await installMapGlyphs(root);
      final files = glyphs
          .listSync(recursive: true)
          .whereType<File>()
          .where((file) => file.path.endsWith('.pbf'))
          .toList();
      expect(files, hasLength(9));
      for (final font in mapFonts) {
        expect(
          File(p.join(glyphs.path, font, '0-255.pbf')).lengthSync(),
          greaterThan(10000),
        );
      }
      final stamp = File(p.join(glyphs.path, 'NotoSans-Regular', '0-255.pbf'))
          .lastModifiedSync();
      await installMapGlyphs(root);
      expect(
        File(p.join(glyphs.path, 'NotoSans-Regular', '0-255.pbf'))
            .lastModifiedSync(),
        stamp,
      );
    },
  );

  test(
    'rend le style local : fichier du fond et glyphes de la tablette',
    () async {
      final basemap = Directory(p.join(root.path, 'basemaps', 'pack'))
        ..createSync(recursive: true);
      File(p.join(basemap.path, 'style.json')).writeAsStringSync(
        jsonEncode({
          'glyphs': 'file://{{GLYPHS_DIR}}/{fontstack}/{range}.pbf',
          'sprite': 'file://{{BASEMAP_DIR}}/sprite',
          'sources': {
            'fond': {
              'type': 'vector',
              'url': 'pmtiles://file://{{BASEMAP_DIR}}/tiles.pmtiles',
            },
          },
        }),
      );
      final glyphs = Directory(p.join(root.path, 'map-glyphs', 'v1'));
      final style = await resolveBasemapStyle(basemap: basemap, glyphs: glyphs);
      expect(style, isNot(contains('{{')));
      final document = jsonDecode(style) as Map<String, Object?>;
      final url =
          ((document['sources']! as Map)['fond'] as Map)['url'] as String;
      expect(url, startsWith('pmtiles://file:///'));
      expect(url, endsWith('/basemaps/pack/tiles.pmtiles'));
      expect(url, isNot(contains(r'\')));
      expect(document['glyphs'], startsWith('file:///'));

      final blank =
          jsonDecode(blankMapStyle(glyphs: glyphs)) as Map<String, Object?>;
      expect(blank['sources'], isEmpty);
      expect(
        blank['glyphs'],
        contains('map-glyphs/v1/{fontstack}/{range}.pbf'),
      );
    },
  );

  test('choisit le fond qui couvre le site, et décrit la couverture', () {
    InstalledBasemap basemap(
      String id,
      List<double> bounds,
      List<List<double>> detail,
    ) => InstalledBasemap(
      packId: id,
      sectorName: id,
      version: 1,
      coverage: BasemapCoverage(
        west: bounds[0],
        south: bounds[1],
        east: bounds[2],
        north: bounds[3],
        centerLon: (bounds[0] + bounds[2]) / 2,
        centerLat: (bounds[1] + bounds[3]) / 2,
        generalMaxZoom: 14,
        detailMaxZoom: 18,
        detailRadiusMeters: 500,
        detailPoints: [for (final point in detail) (point[0], point[1])],
      ),
      source: const BasemapSourceRef(
        id: 'synthetic',
        product: 'Essai',
        attribution: 'Essai',
        synthetic: true,
      ),
      builtAt: DateTime.utc(2026, 10),
      renewAfter: DateTime.utc(2027, 4),
      totalBytes: 10,
    );
    final nice = basemap(
      'nice',
      [7.18, 43.66, 7.32, 43.75],
      [
        [7.2518, 43.7079],
      ],
    );
    final wide = basemap('large', [7.0, 43.5, 7.5, 43.9], []);

    expect(
      chooseBasemap([wide, nice], focus: (7.2518, 43.7079))?.packId,
      'nice',
    );
    expect(chooseBasemap([wide, nice], focus: (7.45, 43.85))?.packId, 'large');
    expect(
      chooseBasemap([wide, nice], preferredPackId: 'nice')?.packId,
      'nice',
    );
    expect(chooseBasemap([], focus: (7.2, 43.7)), isNull);

    expect(
      coverageAt(nice, lon: 7.2518, lat: 43.7079, zoom: 18),
      BasemapCoverageState.covered,
    );
    expect(
      coverageAt(nice, lon: 7.30, lat: 43.74, zoom: 12),
      BasemapCoverageState.covered,
    );
    expect(
      coverageAt(nice, lon: 7.30, lat: 43.74, zoom: 17),
      BasemapCoverageState.generalOnly,
    );
    expect(
      coverageAt(nice, lon: 2.35, lat: 48.85, zoom: 12),
      BasemapCoverageState.outside,
    );
    expect(
      coverageAt(null, lon: 7.2, lat: 43.7, zoom: 12),
      BasemapCoverageState.none,
    );
    expect(
      otherCovering([nice, wide], nice, lon: 7.45, lat: 43.85)?.packId,
      'large',
    );
    expect(nice.outdatedAt(DateTime.utc(2027, 5)), isTrue);
  });
}
