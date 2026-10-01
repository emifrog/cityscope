import 'package:drift/drift.dart' show Value, driftRuntimeOptions;
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:etare_ops/src/features/sync/domain/sync_trigger.dart';
import 'package:flutter/widgets.dart' show AppLifecycleState;
import 'package:flutter_test/flutter_test.dart';

import '../ops/ops_app.dart';

/// Retient les synchronisations demandées, sans réseau.
class RecordingSync extends SyncController {
  final List<SyncTrigger> triggers = [];

  @override
  Future<void> synchronize({SyncTrigger trigger = SyncTrigger.manual}) async =>
      triggers.add(trigger);
}

void main() {
  setUpAll(() => driftRuntimeOptions.dontWarnAboutMultipleDatabases = true);

  Future<void> resume(WidgetTester tester) async {
    for (final state in [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(state);
    }
    await tester.pumpAndSettle();
  }

  testWidgets('synchronisation à l’ouverture, puis au retour dans '
      'l’application si la dernière tentative date (SYN-01)', (tester) async {
    final database = await installedDatabase();
    // Dernière tentative il y a 10 min (horloge des tests : now + 1 h).
    await database.syncStateDao.write(
      SyncStateCompanion(
        lastAttemptAt: Value(now.add(const Duration(minutes: 50))),
      ),
    );
    final sync = RecordingSync();
    await pumpApp(tester, database, sync: () => sync);
    expect(sync.triggers, [SyncTrigger.automatic]);

    // Retour rapide : rien de plus.
    await resume(tester);
    expect(sync.triggers, [SyncTrigger.automatic]);

    // Dernière tentative ancienne : nouvelle synchronisation au retour.
    await database.syncStateDao.write(
      SyncStateCompanion(lastAttemptAt: Value(now)),
    );
    await tester.pumpAndSettle();
    await resume(tester);
    expect(sync.triggers, [SyncTrigger.automatic, SyncTrigger.automatic]);

    await finish(tester, database);
  });
}
