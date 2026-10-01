import 'dart:io';

import 'package:etare_ops/src/core/config/app_info.dart';
import 'package:etare_ops/src/core/text/search_text.dart';
import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:etare_ops/src/features/sync/domain/signed_content.dart';
import 'package:etare_ops/src/features/sync/domain/sync_plan.dart';
import 'package:etare_ops/src/features/sync/domain/sync_status.dart';
import 'package:flutter_test/flutter_test.dart';

CatalogEntry entry(String site, String publication, [String hash = 'a']) =>
    CatalogEntry(
      siteId: site,
      publicationId: publication,
      publicationNumber: 1,
      manifestHash: hash * 64,
      publishedAt: DateTime.utc(2026, 10),
      sizeBytes: 100,
      etareNumber: null,
      siteName: 'Site $site',
    );

SyncCatalog catalogOf(List<CatalogEntry> entries) => SyncCatalog(
  tenantId: 't',
  tenantName: 'SDIS',
  deviceId: 'd',
  generation: 3,
  issuedAt: DateTime.utc(2026, 10),
  authorizedUserId: 'u',
  authorizationExpiresAt: DateTime.utc(2026, 10, 8),
  publications: entries,
);

void main() {
  group('fraîcheur et consultation locale (OPS-05, ADR-015)', () {
    final syncedAt = DateTime.utc(2026, 10, 1, 8);
    final status = SyncStatus(
      phase: SyncPhase.idle,
      lastSyncAt: syncedAt,
      serverTime: syncedAt,
      authorizedUserId: 'ops',
      authorizationExpiresAt: syncedAt.add(const Duration(days: 7)),
      installedSites: 3,
    );

    test('à jour moins de 24 h, puis en retard ; erreur si la dernière '
        'tentative a échoué ; jamais sans synchronisation', () {
      expect(
        status.freshness(syncedAt.add(const Duration(hours: 23))),
        Freshness.upToDate,
      );
      expect(
        status.freshness(syncedAt.add(const Duration(hours: 25))),
        Freshness.late,
      );
      expect(
        SyncStatus(
          phase: SyncPhase.failed,
          lastSyncAt: syncedAt,
        ).freshness(syncedAt),
        Freshness.error,
      );
      expect(SyncStatus.initial.freshness(syncedAt), Freshness.never);
    });

    test('réservée à l’utilisateur autorisé, pendant 7 jours', () {
      final soon = syncedAt.add(const Duration(days: 6));
      expect(status.canConsult(userId: 'ops', now: soon), isTrue);
      expect(status.canConsult(userId: 'autre', now: soon), isFalse);
      expect(status.canConsult(userId: null, now: soon), isFalse);
      expect(
        status.canConsult(
          userId: 'ops',
          now: syncedAt.add(const Duration(days: 8)),
        ),
        isFalse,
      );
    });

    test(
      'une horloge reculée ne prolonge ni l’autorisation ni la fraîcheur',
      () {
        final late = status.freshness(DateTime.utc(2020));
        expect(late, Freshness.upToDate);
        expect(
          status.effectiveNow(DateTime.utc(2020)),
          syncedAt,
          reason: 'jamais avant la dernière heure connue du serveur',
        );
      },
    );
  });

  group('plan de synchronisation', () {
    test(
      'installe le nouveau et le modifié, retire l’absent, garde le reste',
      () {
        final plan = planSync(
          const [
            InstalledVersion(
              siteId: 'A',
              publicationId: 'a1',
              manifestHash: 'x',
            ),
            InstalledVersion(
              siteId: 'B',
              publicationId: 'b1',
              manifestHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            ),
            InstalledVersion(
              siteId: 'C',
              publicationId: 'c1',
              manifestHash: 'x',
            ),
          ],
          catalogOf([
            entry('A', 'a2'),
            entry('B', 'b1', 'b'),
            entry('D', 'd1'),
          ]),
        );
        expect(plan.toInstall.map((e) => e.siteId), ['A', 'D']);
        expect(plan.toRemove, ['C']);
        expect(plan.unchanged, 1);
        expect(plan.announcedBytes, 200);
      },
    );
  });

  group('contrat du paquet', () {
    test('chemins relatifs sans traversée', () {
      for (final path in ['data/site.json', 'plans/a.png', 'etare.pdf']) {
        expect(isSafePackagePath(path), isTrue, reason: path);
      }
      for (final path in [
        '',
        '/etc/passwd',
        '../x',
        'a/../b',
        'a//b',
        r'a\b',
      ]) {
        expect(isSafePackagePath(path), isFalse, reason: path);
      }
    });

    test('versions comparées numériquement', () {
      expect(compareVersions('1.10.0', '1.9.9'), greaterThan(0));
      expect(compareVersions('1.0.0', '1.0.0'), 0);
      expect(compareVersions('0.9.1', '1.0.0'), lessThan(0));
    });

    test('un manifeste avec un chemin dangereux est refusé', () {
      expect(
        () => PublicationManifest.fromJson({
          'manifest_version': 1,
          'tenant_id': '06000000-0000-4000-8000-000000000000',
          'publication_id': '0600000f-0000-4000-8000-000000000001',
          'site_id': '06000002-0000-4000-8000-000000000001',
          'publication_number': 1,
          'min_reader_version': '1.0.0',
          'data_file': 'data/site.json',
          'files': [
            {
              'path': '../../shared_prefs/x.xml',
              'sha256': 'a' * 64,
              'size_bytes': 1,
              'media_type': 'text/xml',
              'required': true,
            },
          ],
        }),
        throwsFormatException,
      );
    });
  });

  test('code d’enrôlement saisi librement, sans caractères ambigus', () {
    expect(normalizeEnrollmentCode(' abcd-efgh jklm '), 'ABCDEFGHJKLM');
    expect(normalizeEnrollmentCode('ABCD-EFGH-JKL0'), isNull);
    expect(normalizeEnrollmentCode('ABCD'), isNull);
  });

  test('recherche locale : sans casse, accents ni ponctuation', () {
    expect(
      normalizeForSearch('Établissement Saint-Éloï, 06-0428'),
      'etablissement saint eloi 06 0428',
    );
    expect(normalizeForSearch('Cœur d’Œuvre'), 'coeur d oeuvre');
  });

  test('la version déclarée au serveur est celle du pubspec', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('version: ${AppInfo.version}+'));
  });
}
