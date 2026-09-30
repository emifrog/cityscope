import 'package:etare_ops/src/core/errors/app_exception.dart';

/// Causes d'échec d'authentification exploitables par l'interface.
enum AuthFailure {
  /// Identifiants refusés (ou compte non confirmé).
  invalidCredentials,

  /// Service d'authentification injoignable.
  network,

  /// Application mal configurée (URL ou clé publishable refusée).
  configuration,

  /// Session révoquée ou jeton de rafraîchissement expiré.
  sessionExpired,

  /// Trop de tentatives.
  rateLimited,

  /// Toute autre réponse inattendue.
  unexpected,
}

/// Erreur typée de la couche d'authentification.
final class AuthException extends AppException {
  const AuthException(
    this.failure, [
    super.message = 'Échec d’authentification',
  ]);

  final AuthFailure failure;

  @override
  String toString() => 'AuthException(${failure.name}): $message';
}
