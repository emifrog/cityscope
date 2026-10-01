import 'package:drift/drift.dart' show Value, driftRuntimeOptions;
import 'package:etare_ops/src/core/config/app_info.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/home/presentation/home_screen.dart';
import 'package:etare_ops/src/features/sync/presentation/offline_status_card.dart';
import 'package:flutter_test/flutter_test.dart';

import '../ops/ops_app.dart';

void main() {
  setUpAll(() => driftRuntimeOptions.dontWarnAboutMultipleDatabases = true);

  testWidgets('application trop ancienne : invitation à la mise à jour, '
      'référentiel installé toujours consultable (SYN-02)', (tester) async {
    final database = await installedDatabase();
    await database.syncStateDao.write(
      const SyncStateCompanion(
        status: Value('failed'),
        requiredAppVersion: Value('9.0.0'),
      ),
    );
    await pumpApp(tester, database);

    // L'accueil le dit en permanence ; le site installé reste consultable.
    expect(find.byKey(FreshnessBanner.updateRequiredKey), findsOneWidget);
    expect(find.text('EHPAD Les Oliviers'), findsOneWidget);

    // Le détail : version exigée, version installée, conséquence.
    await tester.tap(find.byKey(FreshnessBanner.updateRequiredKey));
    await tester.pumpAndSettle();
    expect(find.byKey(OfflineStatusCard.updateRequiredKey), findsOneWidget);
    expect(find.text('Mise à jour de l’application requise'), findsOneWidget);
    expect(
      find.textContaining(
        'Version 9.0.0 minimum (installée : ${AppInfo.version})',
      ),
      findsOneWidget,
    );

    await finish(tester, database);
  });

  testWidgets('format inconnu : la mise à jour est demandée sans version', (
    tester,
  ) async {
    final database = await installedDatabase();
    await database.syncStateDao.write(
      const SyncStateCompanion(requiredAppVersion: Value('')),
    );
    await pumpApp(tester, database);
    await tester.tap(find.byKey(FreshnessBanner.updateRequiredKey));
    await tester.pumpAndSettle();

    expect(find.byKey(OfflineStatusCard.updateRequiredKey), findsOneWidget);
    expect(find.textContaining('minimum'), findsNothing);

    await finish(tester, database);
  });
}
