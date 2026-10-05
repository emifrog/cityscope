import 'package:etare_ops/src/features/sync/domain/removal_notice.dart';
import 'package:flutter_test/flutter_test.dart';

RemovalNotice notice(String site, int day, {String kind = 'withdrawn'}) =>
    RemovalNotice(
      siteId: site,
      siteName: 'Site $site',
      kind: kind,
      at: DateTime.utc(2026, 10, day),
      reason: 'Motif $site',
    );

void main() {
  group('avis de retrait (MET-04)', () {
    test('les plus récents d’abord, un par site, bornés', () {
      final merged = mergeRemovalNotices(
        [notice('a', 1), notice('b', 2)],
        [notice('a', 3, kind: 'archived')],
      );
      expect(merged.map((n) => (n.siteId, n.kind)), [
        ('a', 'archived'),
        ('b', 'withdrawn'),
      ]);
      final many = mergeRemovalNotices(const [], [
        for (var day = 1; day <= 25; day++) notice('s$day', day),
      ]);
      expect(many, hasLength(maxRemovalNotices));
      expect(many.first.siteId, 's25');
    });

    test('un site réinstallé n’a plus d’avis', () {
      expect(
        mergeRemovalNotices(
          [notice('a', 1), notice('b', 2)],
          const [],
          reinstalled: {'a'},
        ).map((n) => n.siteId),
        ['b'],
      );
    });

    test('lecture tolérante et aller-retour', () {
      final text = encodeRemovalNotices([notice('a', 1)]);
      expect(decodeRemovalNotices(text).single.reason, 'Motif a');
      expect(decodeRemovalNotices('pas du json'), isEmpty);
      expect(decodeRemovalNotices(null), isEmpty);
      // Un motif inconnu (serveur plus récent) ne bloque pas la synchronisation.
      expect(
        RemovalNotice.fromJson(const {
          'site_id': 'x',
          'site_name': 'X',
          'kind': 'autre',
          'at': '2026-10-01T00:00:00Z',
          'reason': 'r',
        }).label,
        'Retiré de la tablette',
      );
      expect(
        () =>
            RemovalNotice.fromJson(const {'site_id': 'x', 'kind': 'perimeter'}),
        throwsFormatException,
      );
    });

    test('site sorti du périmètre de la tablette ou de l’agent (PER-01)', () {
      final perimeter = notice('a', 5, kind: 'perimeter');
      expect(perimeter.label, 'Retiré de votre périmètre');
      expect(
        decodeRemovalNotices(encodeRemovalNotices([perimeter])).single.kind,
        'perimeter',
      );
    });
  });
}
