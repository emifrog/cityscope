import 'package:etare_ops/src/app.dart';
import 'package:etare_ops/src/core/routing/app_router.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/auth/presentation/login_screen.dart';
import 'package:etare_ops/src/features/home/presentation/home_screen.dart';
import 'package:etare_ops/src/features/sync/presentation/offline_status_card.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart' show Scrollable;

import '../../support/app_harness.dart';

void main() {
  group('resolveRedirect', () {
    test('session en cours de restauration → écran d’attente', () {
      expect(
        resolveRedirect(status: AuthStatus.unknown, location: AppRoutes.home),
        AppRoutes.splash,
      );
      expect(
        resolveRedirect(status: AuthStatus.unknown, location: AppRoutes.splash),
        isNull,
      );
    });

    test('non authentifié → /login', () {
      for (final location in [AppRoutes.splash, AppRoutes.home]) {
        expect(
          resolveRedirect(
            status: AuthStatus.unauthenticated,
            location: location,
          ),
          AppRoutes.login,
        );
      }
      expect(
        resolveRedirect(
          status: AuthStatus.unauthenticated,
          location: AppRoutes.login,
        ),
        isNull,
      );
    });

    test('authentifié → /home depuis /login ou l’écran d’attente', () {
      for (final location in [AppRoutes.splash, AppRoutes.login]) {
        expect(
          resolveRedirect(status: AuthStatus.authenticated, location: location),
          AppRoutes.home,
        );
      }
      expect(
        resolveRedirect(
          status: AuthStatus.authenticated,
          location: AppRoutes.home,
        ),
        isNull,
      );
    });
  });

  group('navigation de bout en bout', () {
    testWidgets('sans session : affichage de la connexion', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: appOverrides(authRepository: ScriptedAuthRepository()),
          child: const EtareOpsApp(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(LoginScreen), findsOneWidget);
    });

    testWidgets('connexion réussie → accueil → déconnexion → connexion', (
      tester,
    ) async {
      final authRepository = ScriptedAuthRepository();
      await tester.pumpWidget(
        ProviderScope(
          overrides: appOverrides(authRepository: authRepository),
          child: const EtareOpsApp(),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(LoginScreen.emailFieldKey),
        'agent@sdis06.test',
      );
      await tester.enterText(find.byKey(LoginScreen.passwordFieldKey), 'ok');
      await tester.tap(find.byKey(LoginScreen.submitButtonKey));
      await tester.pumpAndSettle();

      expect(find.byType(HomeScreen), findsOneWidget);

      // Liste paresseuse : faire défiler jusqu'au bouton pour qu'il existe.
      await tester.scrollUntilVisible(
        find.byKey(HomeScreen.signOutButtonKey),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.byKey(HomeScreen.signOutButtonKey));
      await tester.pumpAndSettle();

      expect(authRepository.signOutCalls, 1);
      expect(find.byType(LoginScreen), findsOneWidget);
    });

    testWidgets(
      'session restaurée : accueil avec compte, SIS et état hors ligne',
      (tester) async {
        await tester.pumpWidget(
          ProviderScope(
            overrides: appOverrides(
              authRepository: ScriptedAuthRepository(),
              signedIn: true,
            ),
            child: const EtareOpsApp(),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.byType(HomeScreen), findsOneWidget);
        expect(find.text('agent@sdis06.test'), findsOneWidget);
        expect(find.text('SDIS DEMO 06'), findsOneWidget);
        expect(find.text('Rédacteur prévision'), findsOneWidget);
        expect(find.text('Opérationnel'), findsOneWidget);
        // Tablette pas encore enrôlée : l'accueil le dit et propose le code.
        expect(find.text('Tablette non enrôlée'), findsOneWidget);
        expect(find.byKey(OfflineStatusCard.enrollButtonKey), findsOneWidget);
        for (final label in [
          'Risques',
          'Accès',
          'Plans',
          'Eau',
          'Coupures',
          'Contacts',
        ]) {
          await tester.scrollUntilVisible(
            find.text(label),
            200,
            scrollable: find.byType(Scrollable).first,
          );
          expect(find.text(label), findsOneWidget);
        }
      },
    );
  });
}
