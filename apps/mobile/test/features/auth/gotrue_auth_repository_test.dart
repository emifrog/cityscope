import 'package:etare_ops/src/features/auth/data/gotrue_auth_repository.dart';
import 'package:etare_ops/src/features/auth/domain/auth_failure.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fakes.dart';

const _authUrl = 'http://auth.test/auth/v1';
const _publishableKey = 'sb_publishable_test';

Matcher throwsAuthFailure(AuthFailure failure) =>
    throwsA(isA<AuthException>().having((e) => e.failure, 'failure', failure));

void main() {
  group('GoTrueAuthRepository', () {
    test('connexion réussie : requête conforme et session analysée', () async {
      final (dio, adapter) = fakeDio(
        _authUrl,
        (_) => FakeResponse(200, goTrueSessionJson()),
      );
      final repository = GoTrueAuthRepository(
        dio: dio,
        publishableKey: _publishableKey,
      );

      final session = await repository.signInWithPassword(
        email: 'agent@sdis06.test',
        password: 'mot-de-passe',
      );

      final request = adapter.requests.single;
      expect(request.method, 'POST');
      expect(request.uri.toString(), '$_authUrl/token?grant_type=password');
      expect(request.headers['apikey'], _publishableKey);
      expect(request.headers['content-type'], contains('application/json'));
      expect(request.data, {
        'email': 'agent@sdis06.test',
        'password': 'mot-de-passe',
      });

      expect(session.accessToken, 'access-1');
      expect(session.refreshToken, 'refresh-1');
      expect(session.user.id, '11111111-1111-1111-1111-111111111111');
      expect(session.user.email, 'agent@sdis06.test');
      expect(
        session.expiresAt,
        DateTime.fromMillisecondsSinceEpoch(1790000000 * 1000, isUtc: true),
      );
      expect(session.toString(), isNot(contains('access-1')));
    });

    test(
      'calcule l’échéance depuis expires_in si expires_at est absent',
      () async {
        final body = goTrueSessionJson()..remove('expires_at');
        final (dio, _) = fakeDio(_authUrl, (_) => FakeResponse(200, body));
        final now = DateTime.utc(2026, 9, 27, 10);
        final repository = GoTrueAuthRepository(
          dio: dio,
          publishableKey: _publishableKey,
          clock: () => now,
        );

        final session = await repository.signInWithPassword(
          email: 'a@b.fr',
          password: 'x',
        );

        expect(session.expiresAt, now.add(const Duration(hours: 1)));
      },
    );

    test(
      'identifiants invalides (format récent) → invalidCredentials',
      () async {
        final (dio, _) = fakeDio(
          _authUrl,
          (_) => const FakeResponse(400, {
            'code': 400,
            'error_code': 'invalid_credentials',
            'msg': 'Invalid login credentials',
          }),
        );
        final repository = GoTrueAuthRepository(
          dio: dio,
          publishableKey: _publishableKey,
        );

        await expectLater(
          repository.signInWithPassword(email: 'a@b.fr', password: 'faux'),
          throwsAuthFailure(AuthFailure.invalidCredentials),
        );
      },
    );

    test('identifiants invalides (ancien format invalid_grant)', () async {
      final (dio, _) = fakeDio(
        _authUrl,
        (_) => const FakeResponse(400, {
          'error': 'invalid_grant',
          'error_description': 'Invalid login credentials',
        }),
      );
      final repository = GoTrueAuthRepository(
        dio: dio,
        publishableKey: _publishableKey,
      );

      await expectLater(
        repository.signInWithPassword(email: 'a@b.fr', password: 'faux'),
        throwsAuthFailure(AuthFailure.invalidCredentials),
      );
    });

    test('clé publishable refusée (401) → configuration', () async {
      final (dio, _) = fakeDio(
        _authUrl,
        (_) => const FakeResponse(401, {'message': 'Invalid API key'}),
      );
      final repository = GoTrueAuthRepository(dio: dio, publishableKey: 'bad');

      await expectLater(
        repository.signInWithPassword(email: 'a@b.fr', password: 'x'),
        throwsAuthFailure(AuthFailure.configuration),
      );
    });

    test('réseau indisponible → network', () async {
      final (dio, _) = fakeDio(_authUrl, (_) => const FakeResponse.offline());
      final repository = GoTrueAuthRepository(
        dio: dio,
        publishableKey: _publishableKey,
      );

      await expectLater(
        repository.signInWithPassword(email: 'a@b.fr', password: 'x'),
        throwsAuthFailure(AuthFailure.network),
      );
    });

    test('trop de tentatives (429) → rateLimited', () async {
      final (dio, _) = fakeDio(
        _authUrl,
        (_) =>
            const FakeResponse(429, {'error_code': 'over_request_rate_limit'}),
      );
      final repository = GoTrueAuthRepository(
        dio: dio,
        publishableKey: _publishableKey,
      );

      await expectLater(
        repository.signInWithPassword(email: 'a@b.fr', password: 'x'),
        throwsAuthFailure(AuthFailure.rateLimited),
      );
    });

    test('réponse 200 malformée → unexpected', () async {
      final (dio, _) = fakeDio(
        _authUrl,
        (_) => const FakeResponse(200, {'access_token': 'a'}),
      );
      final repository = GoTrueAuthRepository(
        dio: dio,
        publishableKey: _publishableKey,
      );

      await expectLater(
        repository.signInWithPassword(email: 'a@b.fr', password: 'x'),
        throwsAuthFailure(AuthFailure.unexpected),
      );
    });

    test(
      'rafraîchissement : grant refresh_token et nouvelle session',
      () async {
        final (dio, adapter) = fakeDio(
          _authUrl,
          (_) => FakeResponse(
            200,
            goTrueSessionJson(
              accessToken: 'access-2',
              refreshToken: 'refresh-2',
            ),
          ),
        );
        final repository = GoTrueAuthRepository(
          dio: dio,
          publishableKey: _publishableKey,
        );

        final session = await repository.refreshSession('refresh-1');

        final request = adapter.requests.single;
        expect(
          request.uri.toString(),
          '$_authUrl/token?grant_type=refresh_token',
        );
        expect(request.headers['apikey'], _publishableKey);
        expect(request.data, {'refresh_token': 'refresh-1'});
        expect(session.accessToken, 'access-2');
        expect(session.refreshToken, 'refresh-2');
      },
    );

    test('rafraîchissement refusé → sessionExpired', () async {
      final (dio, _) = fakeDio(
        _authUrl,
        (_) => const FakeResponse(400, {
          'error_code': 'refresh_token_not_found',
          'msg': 'Invalid Refresh Token: Refresh Token Not Found',
        }),
      );
      final repository = GoTrueAuthRepository(
        dio: dio,
        publishableKey: _publishableKey,
      );

      await expectLater(
        repository.refreshSession('revoked'),
        throwsAuthFailure(AuthFailure.sessionExpired),
      );
    });

    test('déconnexion : POST /logout avec le jeton Bearer', () async {
      final (dio, adapter) = fakeDio(_authUrl, (_) => const FakeResponse(204));
      final repository = GoTrueAuthRepository(
        dio: dio,
        publishableKey: _publishableKey,
      );

      await repository.signOut('access-1');

      final request = adapter.requests.single;
      expect(request.method, 'POST');
      expect(request.uri.toString(), '$_authUrl/logout');
      expect(request.headers['Authorization'], 'Bearer access-1');
      expect(request.headers['apikey'], _publishableKey);
    });
  });
}
