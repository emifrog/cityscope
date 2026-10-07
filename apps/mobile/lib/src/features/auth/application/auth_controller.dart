import 'dart:async';

import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/features/auth/data/gotrue_auth_repository.dart';
import 'package:etare_ops/src/features/auth/data/session_store.dart';
import 'package:etare_ops/src/features/auth/domain/auth_failure.dart';
import 'package:etare_ops/src/features/auth/domain/auth_repository.dart';
import 'package:etare_ops/src/features/auth/domain/auth_session.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => GoTrueAuthRepository(
    dio: ref.watch(authDioProvider),
    publishableKey: ref.watch(appConfigProvider).authPublishableKey,
  ),
);

final sessionStoreProvider = Provider<SessionStore>(
  (ref) => SessionStore(ref.watch(secureStoreProvider)),
);

/// Horloge injectable (tests).
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// Heure retenue pour la connexion par mot de passe (SEC-05) : l'heure de
/// confiance une fois le verrou de la tablette chargé, l'horloge sinon.
final signInClockProvider = Provider<DateTime Function()>(
  (ref) => ref.watch(clockProvider),
);

/// État d'authentification : `AsyncLoading` pendant la restauration de la
/// session au démarrage, puis `AsyncData(null)` (déconnecté) ou
/// `AsyncData(session)` (connecté).
final authControllerProvider =
    AsyncNotifierProvider<AuthController, AuthSession?>(AuthController.new);

/// Statut simplifié consommé par le routeur.
enum AuthStatus { unknown, authenticated, unauthenticated }

AuthStatus authStatusOf(AsyncValue<AuthSession?> state) => switch (state) {
  AsyncData(value: null) => AuthStatus.unauthenticated,
  AsyncData() => AuthStatus.authenticated,
  AsyncError() => AuthStatus.unauthenticated,
  _ => AuthStatus.unknown,
};

class AuthController extends AsyncNotifier<AuthSession?> {
  static const _logger = AppLogger('auth');

  /// Rafraîchissement anticipé si le jeton expire dans moins de 60 s.
  static const _refreshMargin = Duration(seconds: 60);

  /// Délai maximal accordé à la révocation serveur lors de la déconnexion.
  static const _signOutTimeout = Duration(seconds: 5);

  Future<AuthSession?>? _pendingRefresh;

  AuthRepository get _repository => ref.read(authRepositoryProvider);
  SessionStore get _store => ref.read(sessionStoreProvider);

  @override
  Future<AuthSession?> build() => _store.read();

  /// Connexion. Lève `AuthException` en cas d'échec (affichée par l'écran).
  Future<void> signIn({required String email, required String password}) async {
    final session = (await _repository.signInWithPassword(
      email: email.trim(),
      password: password,
    )).signedInOn(ref.read(signInClockProvider)());
    await _store.write(session);
    state = AsyncData(session);
    _logger.info('Connexion réussie.');
  }

  /// Déconnexion : révocation serveur (au mieux, bornée dans le temps) puis
  /// effacement systématique des jetons locaux.
  Future<void> signOut() async {
    final session = state.value;
    if (session != null) {
      try {
        await _repository.signOut(session.accessToken).timeout(_signOutTimeout);
      } on Object catch (error) {
        _logger.warning(
          'Révocation serveur impossible (ignorée).',
          error: error,
        );
      }
    }
    await _clearLocalSession();
  }

  /// Session ouverte avant SEC-05, sans heure de connexion : le délai fixé
  /// par le SIS part de [at].
  Future<void> markSignedIn(DateTime at) async {
    final session = state.value;
    if (session == null || session.signedInAt != null) return;
    final marked = session.signedInOn(at);
    await _store.write(marked);
    state = AsyncData(marked);
  }

  /// Jeton utilisable pour un appel API, rafraîchi à l'avance si besoin.
  /// En cas d'échec transitoire du rafraîchissement, renvoie le jeton actuel
  /// (l'appel échouera proprement ou déclenchera le rafraîchissement sur 401).
  Future<String?> validAccessToken() async {
    final session = state.value;
    if (session == null) return null;
    final now = ref.read(clockProvider)();
    if (!session.expiresWithin(_refreshMargin, now: now)) {
      return session.accessToken;
    }
    try {
      return (await _refreshOnce())?.accessToken;
    } on Object catch (error) {
      _logger.warning('Rafraîchissement anticipé impossible.', error: error);
      return session.accessToken;
    }
  }

  /// Rafraîchissement forcé (après un 401). Renvoie `null` si la session est
  /// définitivement expirée (l'utilisateur est alors déconnecté).
  Future<String?> refreshAccessToken() async =>
      (await _refreshOnce())?.accessToken;

  /// Un seul rafraîchissement à la fois, partagé par les appels concurrents.
  Future<AuthSession?> _refreshOnce() =>
      _pendingRefresh ??= _refresh().whenComplete(() => _pendingRefresh = null);

  Future<AuthSession?> _refresh() async {
    var current = state.value;
    if (current == null) return null;
    // Une tâche de fond (autre moteur, SYN-01) a pu renouveler la session :
    // reprendre la sienne plutôt que de rejouer un jeton déjà utilisé, ce que
    // le serveur d'authentification traiterait comme un vol de session.
    final stored = await _store.read();
    if (stored == null) {
      await _clearLocalSession();
      return null;
    }
    if (stored.refreshToken != current.refreshToken) {
      state = AsyncData(stored);
      final now = ref.read(clockProvider)();
      if (!stored.expiresWithin(_refreshMargin, now: now)) return stored;
      current = stored;
    }
    try {
      // Le rafraîchissement n'est pas une nouvelle connexion par mot de passe.
      final session = (await _repository.refreshSession(current.refreshToken))
          .signedInOn(current.signedInAt);
      await _store.write(session);
      state = AsyncData(session);
      return session;
    } on AuthException catch (error) {
      if (error.failure == AuthFailure.sessionExpired ||
          error.failure == AuthFailure.invalidCredentials) {
        _logger.info('Session expirée : déconnexion locale.');
        await _clearLocalSession();
        return null;
      }
      rethrow;
    }
  }

  Future<void> _clearLocalSession() async {
    try {
      await _store.clear();
    } finally {
      // Même si l'effacement échoue, l'application repasse déconnectée.
      state = const AsyncData(null);
    }
  }
}
