import 'dart:convert';

import 'package:etare_ops/src/features/ops/domain/ops_labels.dart';
import 'package:etare_ops/src/features/ops/domain/ops_order.dart';
import 'package:etare_ops/src/features/ops/domain/plan_items.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:flutter_test/flutter_test.dart';

import 'ops_fixtures.dart';

void main() {
  final site = PublishedSite.fromJsonText(jsonEncode(payload));

  group('lecture de la version publiée', () {
    test('identité, version et rattachements', () {
      expect(site.name, 'EHPAD Les Oliviers');
      expect(site.publicationNumber, 2);
      expect(site.etareNumber, '06-0428');
      expect(site.classifications.single.shortLabel, 'ERP J cat. 3');
      expect(site.approvedBy, 'Validateur Prévision 06 (démo)');
      expect(site.location, (7.2514, 43.7076));
      expect(
        site.locationOf(
          buildingId: '06000003-0000-4000-8000-000000000001',
          levelId: levelId,
          zoneId: '06000008-0000-4000-8000-000000000002',
        ),
        'Bâtiment A · RDC · Local pharmacie façade C',
      );
      expect(site.lastVerifiedAt, DateTime.utc(2026, 9, 18, 9));
    });

    test('risques par gravité, points par criticité et par entrée', () {
      expect(site.risks.map((risk) => risk.severity), [4, 3]);
      expect(site.risks.first.critical, isTrue);
      final tgbt = site.objectsOf({'energy'}).single;
      expect(tgbt.title, 'TGBT principal');
      // Photo contrôlée (PLAN-05) ; une photo illisible est ignorée.
      expect(tgbt.photos.map((photo) => (photo.id, photo.caption)), [
        (photoId, 'Armoire TGBT'),
      ]);
      expect(tgbt.photos.single.assetSha256, sha256Hex(tinyPng));
      final pei = site.objectsOf({'water'}).single;
      expect(pei.outOfService, isTrue);
      expect(pei.location, (7.2509, 43.7074));
    });

    test('champs du catalogue publiés avec le contenu', () {
      final fields = site.objectFields['PEI']!;
      expect(fields['debit_m3h']!.format(120), '120 m³/h');
      expect(fields['nature']!.format('poteau'), 'Poteau incendie');
      expect(
        const FieldDefinition(name: 'x', type: 'boolean').format(true),
        'Oui',
      );
      expect(
        const FieldDefinition(
          name: 'x',
          type: 'number',
          unit: 'bar',
        ).format(3.5),
        '3,5 bar',
      );
    });

    test('un risque placé sur la carte est signalé à l’extérieur (MET-02)', () {
      expect(site.risks.map((risk) => risk.outdoor), [false, false]);
      final located = jsonDecode(jsonEncode(payload)) as Map<String, Object?>;
      final risks =
          (located['data']! as Map<String, Object?>)['risks']! as List<Object?>;
      (risks.last! as Map<String, Object?>)['geometry'] = {
        'type': 'Point',
        'coordinates': [7.2516, 43.7078],
      };
      expect(
        PublishedSite.fromJson(located).risks.map((risk) => risk.outdoor),
        [false, true],
      );
    });

    test('une donnée inattendue n’empêche pas la lecture du reste', () {
      final altered = jsonDecode(jsonEncode(payload)) as Map<String, Object?>;
      final data = altered['data']! as Map<String, Object?>;
      data['zones'] = 'inattendu';
      (data['risks']! as List<Object?>).add({'id': 'r9', 'plan_position': 42});
      final parsed = PublishedSite.fromJson(altered);
      expect(parsed.zones, isEmpty);
      expect(parsed.risks, hasLength(3));
    });
  });

  group('sections du registre (MET-05, ADR-026)', () {
    test('les points à risque rejoignent les risques, comptés ensemble', () {
      expect(site.objectsOf(OpsSection.risks.categories).single.id, oxygenId);
      expect(site.countOf(OpsSection.risks), site.risks.length + 1);
      expect(
        site.criticalObjects.map((object) => object.id),
        contains(oxygenId),
      );
    });

    test('tout est affiché pour une version sans réglage du SIS', () {
      expect(site.layoutSections, isNull);
      expect(OpsSection.values.every(site.shows), isTrue);
      expect(site.gallery.single.photo.id, photoId);
      expect(site.gallery.single.section, OpsSection.energy);
    });

    test('masquées par le SIS : Coupures et Photos disparaissent, plans et documents restent', () {
      final data =
          Map<String, Object?>.of(payload['data']! as Map<String, Object?>)
            ..['layout'] = {
              'sections': [
                'synthesis',
                'access',
                'risks',
                'water',
                'rescue',
                'contacts',
              ],
            };
      final hidden = PublishedSite.fromJson({...payload, 'data': data});
      expect(hidden.shows(OpsSection.energy), isFalse);
      expect(hidden.shows(OpsSection.photos), isFalse);
      expect(hidden.shows(OpsSection.rescue), isTrue);
      expect(hidden.shows(OpsSection.plans), isTrue);
      expect(hidden.shows(OpsSection.annexes), isTrue);
      expect(hidden.gallery, isEmpty);
    });

    test('même ordre que l’aperçu et le PDF : criticité, titre sans accents, identifiant', () {
      expect(sortKey('Œil Été'), 'oeil ete');
      int compare(
        String a,
        String ca,
        String ta,
        String b,
        String cb,
        String tb,
      ) => compareObjectParts(
        leftId: a,
        leftCriticality: ca,
        leftTitle: ta,
        rightId: b,
        rightCriticality: cb,
        rightTitle: tb,
      );
      expect(
        compare('2', 'critical', 'Poteau', '1', 'info', 'Accès'),
        lessThan(0),
      );
      expect(
        compare('5', 'info', 'Éclairage', '3', 'info', 'Escalier'),
        lessThan(0),
      );
      expect(
        compare('3', 'info', 'Bouche', '4', 'info', 'Bouche'),
        lessThan(0),
      );
    });
  });

  group('plan tactile (OPS-02)', () {
    final plan = site.plans.single;
    final items = planItems(site, plan);

    test('seuls les éléments placés sur le fond validé du plan', () {
      expect(items.map((item) => item.id), [
        '06000008-0000-4000-8000-000000000002',
        '06000009-0000-4000-8000-000000000001',
        oxygenId,
        oxygenRiskId,
      ]);
      expect(items.map((item) => item.layer), [
        PlanLayer.zones,
        PlanLayer.energy,
        PlanLayer.risks,
        PlanLayer.risks,
      ]);
    });

    test(
      'un toucher choisit le risque avant le point, le point avant la zone',
      () {
        final all = {...PlanLayer.values};
        expect(hitTest(items, (531, 301), 24, all)?.id, oxygenRiskId);
        expect(
          hitTest(items, (412, 290), 24, all)?.id,
          '06000009-0000-4000-8000-000000000001',
        );
        expect(
          hitTest(items, (490, 320), 5, all)?.id,
          '06000008-0000-4000-8000-000000000002',
        );
        expect(hitTest(items, (100, 100), 24, all), isNull);
      },
    );

    test('un calque masqué n’est plus touchable', () {
      final withoutRisks = {...PlanLayer.values}..remove(PlanLayer.risks);
      expect(
        hitTest(items, (531, 301), 6, withoutRisks)?.id,
        '06000008-0000-4000-8000-000000000002',
      );
    });

    test('centre d’un élément pour l’ouverture centrée', () {
      expect(centerOf(items.first.geometry), (520.0, 290.0));
    });
  });
}
