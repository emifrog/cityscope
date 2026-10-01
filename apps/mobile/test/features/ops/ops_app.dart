import 'package:drift/native.dart';
import 'package:etare_ops/src/app.dart';
import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/ops/presentation/pdf_reader.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';
import 'package:etare_ops/src/features/sync/domain/sync_trigger.dart';
import 'package:flutter/widgets.dart' show Size, SizedBox, Text;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';

import '../../support/app_harness.dart';
import 'ops_fixtures.dart';

/// Application OPS sur une base en mémoire où la version de l'EHPAD est
/// installée : parcours terrain sans réseau.

/// Pas de réseau dans ces tests : la synchronisation automatique ne fait rien.
class IdleSync extends SyncController {
  @override
  Future<void> synchronize({SyncTrigger trigger = SyncTrigger.manual}) async {}
}

final now = DateTime.utc(2026, 10, 1, 10);

Future<AppDatabase> installedDatabase({String user = 'user-1'}) async {
  final database = AppDatabase(NativeDatabase.memory());
  await database.offlineDao.storeBlob(sha256Hex(tinyPng), tinyPng, now);
  await database.offlineDao.storeBlob(sha256Hex(tinyPdf), tinyPdf, now);
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

Future<void> pumpApp(
  WidgetTester tester,
  AppDatabase database, {
  List<Override> overrides = const [],
  SyncController Function() sync = IdleSync.new,
}) async {
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
        syncControllerProvider.overrideWith(sync),
        // PDFium est natif : un lecteur simulé montre ce qui lui est confié.
        pdfViewBuilderProvider.overrideWithValue(
          (context, bytes, sourceName) =>
              Text('PDF ${bytes.length} octets · $sourceName'),
        ),
        ...overrides,
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
