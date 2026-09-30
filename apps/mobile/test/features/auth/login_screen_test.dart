import 'package:etare_ops/src/core/theme/app_theme.dart';
import 'package:etare_ops/src/features/auth/domain/auth_failure.dart';
import 'package:etare_ops/src/features/auth/presentation/login_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/app_harness.dart';

void main() {
  late ScriptedAuthRepository authRepository;

  setUp(() => authRepository = ScriptedAuthRepository());

  Future<void> pumpLogin(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: appOverrides(authRepository: authRepository),
        child: MaterialApp(theme: AppTheme.light(), home: const LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('champs vides : messages de validation, aucun appel réseau', (
    tester,
  ) async {
    await pumpLogin(tester);

    await tester.tap(find.byKey(LoginScreen.submitButtonKey));
    await tester.pumpAndSettle();

    expect(find.text('Saisissez votre adresse e-mail.'), findsOneWidget);
    expect(find.text('Saisissez votre mot de passe.'), findsOneWidget);
    expect(authRepository.signInCalls, 0);
  });

  testWidgets('adresse e-mail mal formée', (tester) async {
    await pumpLogin(tester);

    await tester.enterText(find.byKey(LoginScreen.emailFieldKey), 'agent@');
    await tester.enterText(find.byKey(LoginScreen.passwordFieldKey), 'secret');
    await tester.tap(find.byKey(LoginScreen.submitButtonKey));
    await tester.pumpAndSettle();

    expect(find.text('Adresse e-mail invalide.'), findsOneWidget);
    expect(find.text('Saisissez votre mot de passe.'), findsNothing);
    expect(authRepository.signInCalls, 0);
  });

  testWidgets('identifiants refusés : message d’erreur clair', (tester) async {
    authRepository.failure = AuthFailure.invalidCredentials;
    await pumpLogin(tester);

    await tester.enterText(
      find.byKey(LoginScreen.emailFieldKey),
      'agent@sdis06.test',
    );
    await tester.enterText(find.byKey(LoginScreen.passwordFieldKey), 'faux');
    await tester.tap(find.byKey(LoginScreen.submitButtonKey));
    await tester.pumpAndSettle();

    expect(authRepository.signInCalls, 1);
    expect(find.byKey(LoginScreen.errorBannerKey), findsOneWidget);
    expect(
      find.text('Adresse e-mail ou mot de passe incorrect.'),
      findsOneWidget,
    );
  });

  testWidgets('réseau indisponible : message dédié', (tester) async {
    authRepository.failure = AuthFailure.network;
    await pumpLogin(tester);

    await tester.enterText(
      find.byKey(LoginScreen.emailFieldKey),
      'agent@sdis06.test',
    );
    await tester.enterText(find.byKey(LoginScreen.passwordFieldKey), 'x');
    await tester.tap(find.byKey(LoginScreen.submitButtonKey));
    await tester.pumpAndSettle();

    expect(find.textContaining('Réseau indisponible'), findsOneWidget);
  });

  testWidgets('pas d’inscription ni de « mot de passe oublié »', (
    tester,
  ) async {
    await pumpLogin(tester);

    expect(find.textContaining('inscri'), findsNothing);
    expect(find.textContaining('oublié'), findsNothing);
  });

  test('validateurs', () {
    expect(validateEmail('  agent@sdis06.fr  '), isNull);
    expect(validateEmail('agent sdis06.fr'), 'Adresse e-mail invalide.');
    expect(validatePassword(''), 'Saisissez votre mot de passe.');
    expect(validatePassword(' '), isNull);
  });
}
