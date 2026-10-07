import 'package:etare_ops/src/app.dart';
import 'package:etare_ops/src/core/config/app_info.dart';
import 'package:etare_ops/src/core/config/licenses.dart';
import 'package:etare_ops/src/features/account/presentation/account_screen.dart';
import 'package:etare_ops/src/features/home/presentation/home_screen.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart' show LicensePage, Scrollable;

import '../../support/app_harness.dart';

void main() {
  test('version affichée : variante de préproduction et commit court', () {
    expect(AppInfo.describe(flavor: 'prod', commit: ''), AppInfo.version);
    expect(
      AppInfo.describe(flavor: 'staging', commit: '1a2b3c4d5e6f7a8b'),
      '${AppInfo.version} · préproduction · 1a2b3c4d',
    );
  });

  test('licences des composants natifs embarqués (SQLCipher, OpenSSL, '
      'glyphes de la carte)', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    registerBundledLicenses();

    final entries = await LicenseRegistry.licenses.toList();
    String textOf(String component) => entries
        .where((entry) => entry.packages.contains(component))
        .expand((entry) => entry.paragraphs)
        .map((paragraph) => paragraph.text)
        .join('\n');

    expect(textOf('SQLCipher Community Edition'), contains('ZETETIC LLC'));
    expect(textOf('OpenSSL'), contains('Apache License'));
    expect(
      textOf('Noto Sans (glyphes de la carte)'),
      contains('SIL OPEN FONT LICENSE'),
    );
  });

  testWidgets('« À propos » donne la version et ouvre les licences', (
    tester,
  ) async {
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
    await tester.tap(find.byKey(HomeScreen.accountButtonKey));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(AccountScreen.aboutKey),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    expect(
      find.text('Version ${AppInfo.describe()} · licences'),
      findsOneWidget,
    );
    await tester.tap(find.byKey(AccountScreen.aboutKey));
    // La page charge les licences en tâche de fond : pas d'attente de repos.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(LicensePage), findsOneWidget);
    expect(find.text(AppInfo.describe()), findsWidgets);
  });
}
