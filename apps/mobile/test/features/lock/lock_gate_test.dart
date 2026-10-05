import 'package:etare_ops/src/app.dart';
import 'package:etare_ops/src/core/security/local_code.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/auth/presentation/login_screen.dart';
import 'package:etare_ops/src/features/home/presentation/home_screen.dart';
import 'package:etare_ops/src/features/lock/application/lock_controller.dart';
import 'package:etare_ops/src/features/lock/presentation/code_pad.dart';
import 'package:etare_ops/src/features/lock/presentation/lock_gate.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/app_harness.dart';

Future<void> typeCode(WidgetTester tester, String code) async {
  for (final digit in code.split('')) {
    await tester.tap(find.byKey(CodePad.digitKey(int.parse(digit))));
    await tester.pump();
  }
  await tester.pumpAndSettle();
}

void main() {
  late DateTime now;

  Future<ProviderContainer> pump(WidgetTester tester) async {
    // Format d'une tablette en portrait.
    tester.view
      ..physicalSize = const Size(1200, 1900)
      ..devicePixelRatio = 1.5;
    addTearDown(tester.view.reset);
    final overrides = appOverrides(
      authRepository: ScriptedAuthRepository(),
      signedIn: true,
      lock: true,
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [...overrides, clockProvider.overrideWithValue(() => now)],
        child: const EtareOpsApp(),
      ),
    );
    await tester.pumpAndSettle();
    return ProviderScope.containerOf(tester.element(find.byType(LockGate)));
  }

  setUp(() => now = DateTime.utc(2026, 10, 5, 8));

  testWidgets('premier passage : l’agent choisit son code, saisi deux fois', (
    tester,
  ) async {
    await pump(tester);
    expect(find.byKey(LockGate.setupKey), findsOneWidget);
    expect(find.text('Choisissez votre code'), findsOneWidget);

    await typeCode(tester, '482913');
    expect(find.text('Confirmez votre code'), findsOneWidget);
    await typeCode(tester, '482914');
    expect(
      find.text('Les deux saisies diffèrent : recommencez.'),
      findsOneWidget,
    );

    await typeCode(tester, '482913');
    await typeCode(tester, '482913');
    expect(find.byKey(LockGate.setupKey), findsNothing);
    expect(find.byType(HomeScreen), findsOneWidget);
  });

  testWidgets(
    'verrouillée après 15 minutes d’inactivité, rouverte par le code',
    (tester) async {
      await pump(tester);
      await typeCode(tester, '482913');
      await typeCode(tester, '482913');
      expect(find.byKey(LockGate.lockedKey), findsNothing);

      // Une interaction repousse l'échéance.
      now = now.add(const Duration(minutes: 14));
      await tester.tap(find.byType(HomeScreen), warnIfMissed: false);
      now = now.add(const Duration(minutes: 14));
      await tester.pump(const Duration(seconds: 21));
      expect(find.byKey(LockGate.lockedKey), findsNothing);

      now = now.add(const Duration(minutes: 15));
      await tester.pump(const Duration(seconds: 21));
      await tester.pumpAndSettle();
      expect(find.byKey(LockGate.lockedKey), findsOneWidget);
      expect(find.text('Application verrouillée'), findsOneWidget);

      await typeCode(tester, '000000');
      expect(
        find.text('Code erroné : encore 4 essais avant la déconnexion.'),
        findsOneWidget,
      );
      await typeCode(tester, '482913');
      expect(find.byKey(LockGate.lockedKey), findsNothing);
      expect(find.byType(HomeScreen), findsOneWidget);
    },
  );

  testWidgets(
    'cinq erreurs déconnectent l’agent : reconnexion en ligne, rien d’effacé',
    (tester) async {
      final container = await pump(tester);
      await typeCode(tester, '482913');
      await typeCode(tester, '482913');
      container.read(lockControllerProvider.notifier).lock();
      await tester.pumpAndSettle();

      for (var attempt = 0; attempt < maxLocalCodeAttempts; attempt++) {
        await typeCode(tester, '111111');
      }
      expect(find.byType(LoginScreen), findsOneWidget);
      expect(
        find.textContaining('Trop d’erreurs de code : reconnectez-vous'),
        findsOneWidget,
      );
      // Le code de l'agent ne reste pas sur la tablette.
      expect(
        await container.read(localCodeStoreProvider).isSetFor('user-1'),
        isFalse,
      );
    },
  );
}
