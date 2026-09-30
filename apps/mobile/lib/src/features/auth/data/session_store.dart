import 'dart:convert';

import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:etare_ops/src/features/auth/domain/auth_session.dart';

/// Persistance de la session dans le stockage sécurisé (jamais en clair).
final class SessionStore {
  SessionStore(this._store);

  static const _logger = AppLogger('auth');

  final SecureStore _store;

  Future<AuthSession?> read() async {
    final raw = await _store.read(SecureStorageKeys.authSession);
    if (raw == null) return null;
    try {
      final json = asJsonMap(jsonDecode(raw));
      final user = json.requireObject('user');
      return AuthSession(
        accessToken: json.requireString('access_token'),
        refreshToken: json.requireString('refresh_token'),
        expiresAt: json.requireDateTime('expires_at').toUtc(),
        user: AuthUser(
          id: user.requireString('id'),
          email: user.requireString('email'),
        ),
      );
    } on FormatException {
      _logger.warning('Session stockée illisible : suppression.');
      await clear();
      return null;
    }
  }

  Future<void> write(AuthSession session) => _store.write(
    SecureStorageKeys.authSession,
    jsonEncode({
      'access_token': session.accessToken,
      'refresh_token': session.refreshToken,
      'expires_at': session.expiresAt.toUtc().toIso8601String(),
      'user': {'id': session.user.id, 'email': session.user.email},
    }),
  );

  Future<void> clear() => _store.delete(SecureStorageKeys.authSession);
}
