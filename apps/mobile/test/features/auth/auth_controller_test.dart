import 'dart:async';

import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/auth/data/session_store.dart';
import 'package:etare_ops/src/features/auth/domain/auth_failure.dart';
import 'package:etare_ops/src/features/auth/domain/auth_repository.dart';
import 'package:etare_ops/src/features/auth/domain/auth_session.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fakes.dart';

AuthSession session(String suffix, {DateTime? expiresAt}) => AuthSession(
  accessToken: 'access-$suffix',
  refreshToken: 'refresh-$suffix',
  expiresAt: expiresAt ?? DateTime.utc(2030),
  user: const AuthUser(id: 'user-1', email: 'agent@sdis06.test'),
);

final class FakeAuthRepository implements AuthRepository {
  AuthSession? signInResult;
  Exception? signInError;
  Completer<AuthSession>? refreshCompleter;
  Exception? refreshError;
  int refreshCalls = 0;
  final List<String> refreshedTokens = [];
  final List<String> signedOutTokens = [];

  @override
  Future<AuthSession> signInWithPassword({
    required String email,
    required String password,
  }) async {
    if (signInError case final error?) throw error;
    return signInResult!;
  }

  @override
  Future<AuthSession> refreshSession(String refreshToken) async {
    refreshCalls++;
    refreshedTokens.add(refreshToken);
    if (refreshError case final error?) throw error;
    return refreshCompleter!.future;
  }

  @override
  Future<void> signOut(String accessToken) async =>
      signedOutTokens.add(accessToken);
}

void main() {
  late FakeAuthRepository repository;
  late InMemorySecureStore store;

  ProviderContainer createContainer() => ProviderContainer.test(
    overrides: [
      authRepositoryProvider.overrideWithValue(repository),
      secureStoreProvider.overrideWithValue(store),
      clockProvider.overrideWithValue(() => DateTime.utc(2026, 9, 27)),
    ],
  );

  setUp(() {
    repository = FakeAuthRepository();
    store = InMemorySecureStore();
  });

  test('démarre déconnecté sans session stockée', () async {
    final container = createContainer();
    expect(await container.read(authControllerProvider.future), isNull);
  });

  test('connexion : persiste la session puis passe authentifié', () async {
    repository.signInResult = session('1');
    final container = createContainer();
    await container.read(authControllerProvider.future);

    await container
        .read(authControllerProvider.notifier)
        .signIn(email: ' agent@sdis06.test ', password: 'x');

    expect(container.read(authControllerProvider).value, session('1'));
    expect(store.values[SecureStorageKeys.authSession], contains('access-1'));

    // Une nouvelle instance restaure la session depuis le stockage sécurisé.
    final restarted = createContainer();
    expect(await restarted.read(authControllerProvider.future), session('1'));
  });

  test('connexion refusée : l’erreur typée remonte, état inchangé', () async {
    repository.signInError = const AuthException(
      AuthFailure.invalidCredentials,
    );
    final container = createContainer();
    await container.read(authControllerProvider.future);

    await expectLater(
      container
          .read(authControllerProvider.notifier)
          .signIn(email: 'a@b.fr', password: 'x'),
      throwsA(isA<AuthException>()),
    );
    expect(container.read(authControllerProvider).value, isNull);
  });

  test('déconnexion : révocation serveur puis effacement local', () async {
    repository.signInResult = session('1');
    final container = createContainer();
    await container.read(authControllerProvider.future);
    final controller = container.read(authControllerProvider.notifier);
    await controller.signIn(email: 'a@b.fr', password: 'x');

    await controller.signOut();

    expect(repository.signedOutTokens, ['access-1']);
    expect(store.values, isEmpty);
    expect(container.read(authControllerProvider).value, isNull);
  });

  test('rafraîchissements concurrents : un seul appel serveur', () async {
    repository
      ..signInResult = session('1')
      ..refreshCompleter = Completer<AuthSession>();
    final container = createContainer();
    await container.read(authControllerProvider.future);
    final controller = container.read(authControllerProvider.notifier);
    await controller.signIn(email: 'a@b.fr', password: 'x');

    final first = controller.refreshAccessToken();
    final second = controller.refreshAccessToken();
    repository.refreshCompleter!.complete(session('2'));

    expect(await first, 'access-2');
    expect(await second, 'access-2');
    expect(repository.refreshCalls, 1);
    expect(store.values[SecureStorageKeys.authSession], contains('access-2'));
  });

  test('jeton proche de l’expiration : rafraîchi avant l’appel API', () async {
    repository
      ..signInResult = session('1', expiresAt: DateTime.utc(2026, 9, 27))
      ..refreshCompleter = (Completer<AuthSession>()..complete(session('2')));
    final container = createContainer();
    await container.read(authControllerProvider.future);
    final controller = container.read(authControllerProvider.notifier);
    await controller.signIn(email: 'a@b.fr', password: 'x');

    expect(await controller.validAccessToken(), 'access-2');
  });

  test('session expirée au rafraîchissement : déconnexion locale', () async {
    repository
      ..signInResult = session('1')
      ..refreshError = const AuthException(AuthFailure.sessionExpired);
    final container = createContainer();
    await container.read(authControllerProvider.future);
    final controller = container.read(authControllerProvider.notifier);
    await controller.signIn(email: 'a@b.fr', password: 'x');

    expect(await controller.refreshAccessToken(), isNull);
    expect(container.read(authControllerProvider).value, isNull);
    expect(store.values, isEmpty);
  });

  group('session partagée avec la tâche de fond (SYN-01)', () {
    Future<AuthController> signedIn(ProviderContainer container) async {
      repository.signInResult = session('1');
      await container.read(authControllerProvider.future);
      final controller = container.read(authControllerProvider.notifier);
      await controller.signIn(email: 'a@b.fr', password: 'x');
      return controller;
    }

    test('session déjà renouvelée par la tâche de fond : reprise, sans '
        'rejouer l’ancien jeton', () async {
      final container = createContainer();
      final controller = await signedIn(container);
      await SessionStore(store).write(session('fond'));

      expect(await controller.refreshAccessToken(), 'access-fond');
      expect(repository.refreshCalls, 0);
      expect(container.read(authControllerProvider).value, session('fond'));
    });

    test('session renouvelée mais déjà expirante : rafraîchie avec le jeton '
        'le plus récent', () async {
      final container = createContainer();
      final controller = await signedIn(container);
      await SessionStore(store)
          .write(session('fond', expiresAt: DateTime.utc(2026, 9, 27)));
      repository.refreshCompleter = Completer<AuthSession>()
        ..complete(session('3'));

      expect(await controller.refreshAccessToken(), 'access-3');
      expect(repository.refreshedTokens, ['refresh-fond']);
    });

    test(
      'session effacée par la tâche de fond (expirée) : déconnexion',
      () async {
        final container = createContainer();
        final controller = await signedIn(container);
        await SessionStore(store).clear();

        expect(await controller.refreshAccessToken(), isNull);
        expect(repository.refreshCalls, 0);
        expect(container.read(authControllerProvider).value, isNull);
      },
    );
  });
}
