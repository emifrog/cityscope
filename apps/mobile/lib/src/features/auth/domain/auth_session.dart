import 'package:flutter/foundation.dart';

/// Identité minimale de l'utilisateur authentifié (issue de Supabase Auth).
@immutable
final class AuthUser {
  const AuthUser({required this.id, required this.email});

  final String id;
  final String email;

  @override
  bool operator ==(Object other) =>
      other is AuthUser && other.id == id && other.email == email;

  @override
  int get hashCode => Object.hash(id, email);
}

/// Session ouverte : jetons + échéance.
///
/// `toString` ne révèle jamais les jetons.
@immutable
final class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAt,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;

  /// Échéance du jeton d'accès (UTC).
  final DateTime expiresAt;
  final AuthUser user;

  /// Vrai si le jeton d'accès expire avant `now + margin`.
  bool expiresWithin(Duration margin, {required DateTime now}) =>
      !expiresAt.isAfter(now.toUtc().add(margin));

  @override
  bool operator ==(Object other) =>
      other is AuthSession &&
      other.accessToken == accessToken &&
      other.refreshToken == refreshToken &&
      other.expiresAt == expiresAt &&
      other.user == user;

  @override
  int get hashCode => Object.hash(accessToken, refreshToken, expiresAt, user);

  @override
  String toString() =>
      'AuthSession(user: ${user.id}, expiresAt: ${expiresAt.toIso8601String()})';
}
