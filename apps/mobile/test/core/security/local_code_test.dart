import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:etare_ops/src/core/security/local_code.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fakes.dart';

void main() {
  group('code personnel de la tablette (PER-02)', () {
    late InMemorySecureStore secure;
    late LocalCodeStore store;

    setUp(() {
      secure = InMemorySecureStore();
      store = LocalCodeStore(secure, iterations: 500);
    });

    test('six chiffres, rien du code conservé', () async {
      expect(isValidLocalCode('123456'), isTrue);
      expect(isValidLocalCode('12345'), isFalse);
      expect(isValidLocalCode('12345a'), isFalse);
      await expectLater(store.set('agent', '12ab56'), throwsArgumentError);

      await store.set('agent', '482913');
      expect(await store.isSetFor('agent'), isTrue);
      expect(await store.isSetFor('autre'), isFalse);
      final stored = await secure.read(LocalCodeKeys.record);
      expect(stored, isNot(contains('482913')));
    });

    test('le bon code rend toujours la même clé d’enveloppe', () async {
      final wrap = await store.set('agent', '482913');
      final check = await store.verify('agent', '482913');
      expect(check, isA<LocalCodeAccepted>());
      expect((check as LocalCodeAccepted).wrapKey, wrap);
      // Une autre installation (autre secret) ne dérive pas la même clé.
      final other = LocalCodeStore(InMemorySecureStore(), iterations: 500);
      expect(await other.set('agent', '482913'), isNot(wrap));
    });

    test(
      'cinq erreurs déconnectent l’agent, même après un redémarrage',
      () async {
        await store.set('agent', '482913');
        expect(
          await store.verify('agent', '000000'),
          isA<LocalCodeRejected>().having((c) => c.remaining, 'remaining', 4),
        );
        // Un succès remet le compte à zéro.
        expect(await store.verify('agent', '482913'), isA<LocalCodeAccepted>());
        for (var attempt = 1; attempt < maxLocalCodeAttempts; attempt++) {
          final restarted = LocalCodeStore(secure, iterations: 500);
          expect(
            await restarted.verify('agent', '111111'),
            isA<LocalCodeRejected>(),
          );
        }
        expect(
          await store.verify('agent', '111111'),
          isA<LocalCodeLockedOut>(),
        );
        // Même le bon code ne suffit plus : reconnexion en ligne.
        expect(
          await store.verify('agent', '482913'),
          isA<LocalCodeLockedOut>(),
        );
        await store.clear();
        expect(await store.isSetFor('agent'), isFalse);
      },
    );

    test('le code d’un autre agent n’ouvre rien', () async {
      await store.set('agent', '482913');
      expect(await store.verify('autre', '482913'), isA<LocalCodeLockedOut>());
    });
  });

  group('contenu scellé (AES-256-GCM)', () {
    test('se rouvre avec la clé, jamais avec une autre ni altéré', () async {
      final key = List<int>.generate(32, (index) => index);
      final sealed = await SealedBox.seal(key, utf8.encode('{"site":"x"}'));
      expect(utf8.decode(await SealedBox.open(key, sealed)), '{"site":"x"}');
      final wrongKey = List<int>.generate(32, (index) => 255 - index);
      await expectLater(
        SealedBox.open(wrongKey, sealed),
        throwsA(isA<SecretBoxAuthenticationError>()),
      );
      final altered = [...sealed]..[20] ^= 1;
      await expectLater(
        SealedBox.open(key, altered),
        throwsA(isA<SecretBoxAuthenticationError>()),
      );
    });

    test('PBKDF2-HMAC-SHA-256 conforme au vecteur de la RFC 7914', () {
      // RFC 7914 §11 : P = "passwd", S = "salt", c = 1, dkLen = 64 (premier bloc).
      final key = pbkdf2Sha256(utf8.encode('passwd'), utf8.encode('salt'), 1);
      expect(
        key.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join(),
        '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc',
      );
    });
  });
}
