import 'dart:convert';
import 'dart:typed_data';

import 'package:etare_ops/src/features/home/presentation/home_screen.dart';
import 'package:etare_ops/src/features/lock/presentation/code_pad.dart';
import 'package:etare_ops/src/features/ops/domain/published_site.dart';
import 'package:etare_ops/src/features/ops/presentation/site_screen.dart';
import 'package:etare_ops/src/features/sensitive/application/sensitive_providers.dart';
import 'package:etare_ops/src/features/sensitive/application/sensitive_site_service.dart';
import 'package:etare_ops/src/features/sensitive/presentation/sensitive_site_screen.dart';
import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:flutter_test/flutter_test.dart';

import '../ops/ops_app.dart';

const sensitiveSite = '06000002-0000-4000-8000-0000000000aa';
const publicationId = '0600000f-0000-4000-8000-0000000000aa';

/// Service simulé à sa frontière (le service réel a ses propres tests).
final class _FakeSensitiveService implements SensitiveSiteService {
  int attempts = 0;
  int opened = 0;

  UnlockedSite _site() => UnlockedSite(
    siteId: sensitiveSite,
    publicationId: publicationId,
    key: Uint8List(32),
    site: PublishedSite.fromJsonText(
      jsonEncode({
        'publication': {'id': publicationId, 'publication_number': 3},
        'data': {
          'site': {'id': sensitiveSite, 'name': 'Dépôt pétrolier (démo)'},
        },
      }),
    ),
    expiresAt: now.add(onDemandAccess),
  );

  @override
  Future<UnlockedSite> open({
    required String userId,
    required String siteId,
    required String code,
  }) async {
    if (code != '482913') throw SensitiveCodeRejected(4 - attempts++);
    opened++;
    return _site();
  }

  @override
  Future<UnlockedSite> unlock({
    required String userId,
    required String siteId,
    required String code,
  }) => open(userId: userId, siteId: siteId, code: code);

  @override
  Future<Uint8List?> file(UnlockedSite site, String sha256) async => null;

  @override
  Future<String?> etarePdf(String siteId) async => null;

  @override
  Future<int> purgeExpired() async => 0;

  @override
  Future<int> flushEvents(String userId) async => 0;
}

Future<void> typeCode(WidgetTester tester, String code) async {
  for (final digit in code.split('')) {
    await tester.tap(find.byKey(CodePad.digitKey(int.parse(digit))));
    await tester.pump();
  }
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'site sensible : proposé dans la recherche, ouvert avec le code, consulté (PER-02)',
    (tester) async {
      final database = await installedDatabase();
      await database.sensitiveDao.replaceOnDemand([
        CatalogEntry(
          siteId: sensitiveSite,
          publicationId: publicationId,
          publicationNumber: 3,
          manifestHash: 'a' * 64,
          publishedAt: now,
          sizeBytes: 600,
          etareNumber: null,
          siteName: 'Dépôt pétrolier (démo)',
        ),
      ]);
      final service = _FakeSensitiveService();
      await pumpApp(
        tester,
        database,
        overrides: [sensitiveSiteServiceProvider.overrideWithValue(service)],
      );

      expect(
        find.text('Sites sensibles — à ouvrir à la demande'),
        findsOneWidget,
      );
      await tester.tap(find.byKey(HomeScreen.sensitiveTileKey(sensitiveSite)));
      await tester.pumpAndSettle();
      expect(find.byType(SensitiveSiteScreen), findsOneWidget);
      expect(
        find.textContaining('Ouverture à la demande : réseau requis'),
        findsOneWidget,
      );

      await typeCode(tester, '000000');
      expect(
        find.textContaining('Code erroné : encore 4 essais'),
        findsOneWidget,
      );
      await typeCode(tester, '482913');
      expect(find.byType(SiteScreen), findsOneWidget);
      expect(find.text('Dépôt pétrolier (démo)'), findsWidgets);
      expect(service.opened, 1);

      await finish(tester, database);
    },
  );
}
