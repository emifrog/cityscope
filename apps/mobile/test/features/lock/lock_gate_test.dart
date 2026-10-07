import 'package:etare_ops/src/app.dart';
import 'package:etare_ops/src/core/platform/platform_services.dart';
import 'package:etare_ops/src/core/security/local_code.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/auth/presentation/login_screen.dart';
import 'package:etare_ops/src/features/home/presentation/home_screen.dart';
import 'package:etare_ops/src/features/lock/application/lock_controller.dart';
import 'package:etare_ops/src/features/lock/application/terminal_providers.dart';
import 'package:etare_ops/src/features/lock/presentation/code_pad.dart';
import 'package:etare_ops/src/features/lock/presentation/lock_gate.dart';
import 'package:etare_ops/src/features/sync/domain/terminal_policy.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/app_harness.dart';
import '../../support/fake_platform.dart';

Future<void> typeCode(WidgetTester tester, String code) async {
  for (final digit in code.split('')) {
    await tester.tap(find.byKey(CodePad.digitKey(int.parse(digit))));
    await tester.pump();
  }
  await tester.pumpAndSettle();
}

void main() {
  late DateTime now;
  // Temps monotone du processus (inactivité au premier plan).
  late Duration elapsed;

  Future<ProviderContainer> pump(
    WidgetTester tester, {
    TerminalPolicy? policy,
    PlatformServices platform = const SoftwarePlatformServices(),
    DateTime? signedInAt,
  }) async {
    // Format d'une tablette en portrait.
    tester.view
      ..physicalSize = const Size(1200, 1900)
      ..devicePixelRatio = 1.5;
    addTearDown(tester.view.reset);
    final overrides = appOverrides(
      authRepository: ScriptedAuthRepository(),
      signedIn: true,
      lock: true,
      platform: platform,
      signedInAt: signedInAt,
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          clockProvider.overrideWithValue(() => now),
          monotonicClockProvider.overrideWithValue(() => elapsed),
          if (policy != null) terminalPolicyProvider.overrideWithValue(policy),
        ],
        child: const EtareOpsApp(),
      ),
    );
    await tester.pumpAndSettle();
    return ProviderScope.containerOf(tester.element(find.byType(LockGate)));
  }

  Future<void> chooseCode(WidgetTester tester) async {
    await typeCode(tester, '482913');
    await typeCode(tester, '482913');
    expect(find.byKey(LockGate.lockedKey), findsNothing);
  }

  /// L'agent quitte l'application puis y revient (ce que le verrou reçoit
  /// des événements de cycle de vie : masquée, puis visible).
  Future<void> leaveAndComeBack(
    WidgetTester tester,
    ProviderContainer container, {
    Duration away = Duration.zero,
  }) async {
    final lock = container.read(lockControllerProvider.notifier);
    await lock.leave();
    await tester.pump();
    elapsed += away;
    await lock.back();
    await tester.pumpAndSettle();
  }

  setUp(() {
    now = DateTime.utc(2026, 10, 5, 8);
    elapsed = const Duration(hours: 1);
  });

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
    'verrouillée après l’inactivité fixée par le SIS (5 minutes par défaut), '
    'rouverte par le code',
    (tester) async {
      await pump(tester);
      await chooseCode(tester);

      // Une interaction repousse l'échéance ; l'horloge de l'appareil n'y est pour rien.
      elapsed += const Duration(minutes: 4);
      await tester.tap(find.byType(HomeScreen), warnIfMissed: false);
      elapsed += const Duration(minutes: 4);
      now = now.subtract(const Duration(days: 1));
      await tester.pump(const Duration(seconds: 21));
      expect(find.byKey(LockGate.lockedKey), findsNothing);

      elapsed += const Duration(minutes: 2);
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

  testWidgets('quitter l’application la verrouille aussitôt (politique par '
      'défaut)', (tester) async {
    final container = await pump(tester);
    await chooseCode(tester);
    await leaveAndComeBack(tester, container);
    expect(find.byKey(LockGate.lockedKey), findsOneWidget);
  });

  testWidgets('avec un délai du SIS : voilée pendant l’absence, rouverte au '
      'retour rapide, verrouillée au-delà', (tester) async {
    final container = await pump(
      tester,
      policy: const TerminalPolicy(backgroundLockSeconds: 30),
    );
    await chooseCode(tester);
    final lock = container.read(lockControllerProvider.notifier);

    await lock.leave();
    await tester.pumpAndSettle();
    // Rien de lisible dans l'aperçu des applications récentes.
    expect(find.byKey(LockGate.veilKey), findsOneWidget);
    elapsed += const Duration(seconds: 10);
    await lock.back();
    await tester.pumpAndSettle();
    expect(find.byKey(LockGate.veilKey), findsNothing);
    expect(find.byKey(LockGate.lockedKey), findsNothing);

    await leaveAndComeBack(
      tester,
      container,
      away: const Duration(seconds: 31),
    );
    expect(find.byKey(LockGate.lockedKey), findsOneWidget);
  });

  testWidgets('captures d’écran interdites par défaut', (tester) async {
    final platform = FakePlatformServices();
    await pump(tester, platform: platform);
    expect(platform.secureWindow.last, isTrue);
  });

  testWidgets('captures d’écran permises si le SIS le décide', (tester) async {
    final platform = FakePlatformServices();
    await pump(
      tester,
      platform: platform,
      policy: const TerminalPolicy(screenshotsAllowed: true),
    );
    expect(platform.secureWindow.last, isFalse);
  });

  testWidgets('au-delà de la durée fixée par le SIS depuis la dernière '
      'connexion par mot de passe : reconnexion en ligne exigée', (
    tester,
  ) async {
    await pump(tester, signedInAt: now.subtract(const Duration(days: 31)));
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(
      find.textContaining('demande une nouvelle connexion'),
      findsOneWidget,
    );
  });

  testWidgets('session ouverte avant cette version : le délai part '
      'd’aujourd’hui', (tester) async {
    final container = await pump(tester);
    expect(find.byType(LoginScreen), findsNothing);
    expect(container.read(authControllerProvider).value?.signedInAt, now);
  });
}
