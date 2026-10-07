import 'dart:typed_data';

import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/security/local_code.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/auth/domain/auth_session.dart';
import 'package:etare_ops/src/features/auth/presentation/login_screen.dart';
import 'package:etare_ops/src/features/home/presentation/home_screen.dart';
import 'package:etare_ops/src/features/lock/presentation/lock_gate.dart';
import 'package:etare_ops/src/features/map/presentation/map_screen.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/app_harness.dart';
import '../ops/ops_app.dart';
import '../ops/ops_fixtures.dart' as fixtures;

/// Tablette partagée (SEC-05) : un agent passe la tablette à un autre. Rien de
/// l'agent précédent ne reste (code, secret de l'installation, sites
/// sensibles) et le suivant ne consulte rien avant sa propre synchronisation.
void main() {
  testWidgets('changement d’agent : rien du précédent ne reste, le suivant ne '
      'consulte rien avant sa synchronisation', (tester) async {
    final database = await installedDatabase(user: 'user-1');
    await database
        .into(database.sensitiveSites)
        .insert(
          SensitiveSitesCompanion.insert(
            siteId: fixtures.siteId,
            publicationId: 'publication-sensible',
            publicationNumber: 1,
            userId: 'user-1',
            siteName: 'Site sensible',
            openedAt: now,
            expiresAt: now.add(const Duration(hours: 24)),
            wrappedKey: Uint8List(60),
            dataCipher: Uint8List(60),
          ),
        );
    final auth = ScriptedAuthRepository();
    await pumpApp(tester, database, authRepository: auth);
    final container = ProviderScope.containerOf(
      tester.element(find.byType(LockGate)),
    );
    final store = container.read(secureStoreProvider);
    // Code de A : dérivation sans isolat (le temps des tests d'interface est simulé).
    await LocalCodeStore(
      store,
      iterations: 200,
      derive: (password, salt, rounds) async =>
          pbkdf2Sha256(password, salt, rounds),
    ).set('user-1', '482913');
    expect(await store.read(LocalCodeKeys.pepper), isNotNull);
    expect(container.read(offlineAccessProvider), isTrue);

    // L'agent A rend la tablette.
    await container.read(authControllerProvider.notifier).signOut();
    await tester.pumpAndSettle();
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(await store.read(LocalCodeKeys.record), isNull);
    expect(await store.read(LocalCodeKeys.pepper), isNull);
    expect(await database.select(database.sensitiveSites).get(), isEmpty);

    // L'agent B se connecte : l'autorisation reçue était celle de A.
    auth.session = AuthSession(
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresAt: DateTime.utc(2099),
      user: const AuthUser(id: 'user-2', email: 'autre@sdis06.test'),
    );
    await container
        .read(authControllerProvider.notifier)
        .signIn(email: 'autre@sdis06.test', password: 'x');
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(container.read(offlineAccessProvider), isFalse);
    expect(container.read(authControllerProvider).value?.signedInAt, isNotNull);
    await tester.tap(find.byKey(HomeScreen.mapButtonKey));
    await tester.pumpAndSettle();
    expect(find.byKey(MapScreen.lockedKey), findsOneWidget);

    await finish(tester, database);
  });
}
