import 'package:flutter/foundation.dart';

/// Racine des erreurs applicatives typées.
///
/// [message] est un message technique (journalisation, débogage). Les textes
/// présentés à l'utilisateur sont produits par `describeError`
/// (`error_messages.dart`).
abstract class AppException implements Exception {
  const AppException(this.message);

  final String message;

  @override
  String toString() => 'AppException: $message';
}

/// Nature d'un échec réseau (aucune réponse HTTP exploitable).
enum NetworkFailure {
  /// Pas de connexion, hôte injoignable, DNS…
  offline,

  /// Délai de connexion / d'envoi / de réception dépassé.
  timeout,

  /// Certificat TLS refusé.
  badCertificate,

  /// Requête annulée par l'application.
  cancelled,
}

/// Aucune réponse HTTP n'a pu être obtenue.
final class NetworkException extends AppException {
  const NetworkException(this.failure, [super.message = 'Erreur réseau']);

  final NetworkFailure failure;

  @override
  String toString() => 'NetworkException(${failure.name}): $message';
}

/// La réponse du serveur ne respecte pas le contrat attendu.
final class UnexpectedResponseException extends AppException {
  const UnexpectedResponseException(super.message);

  @override
  String toString() => 'UnexpectedResponseException: $message';
}

/// Codes d'erreur du contrat de l'API produit (`error.code`).
enum ApiErrorCode {
  unauthenticated('UNAUTHENTICATED'),
  forbidden('FORBIDDEN'),
  notFound('NOT_FOUND'),
  validationFailed('VALIDATION_FAILED'),
  tenantRequired('TENANT_REQUIRED'),
  conflict('CONFLICT'),
  serviceUnavailable('SERVICE_UNAVAILABLE'),
  internal('INTERNAL'),

  /// Terminal inconnu dans ce SIS ou enrôlement non terminé.
  deviceNotEnrolled('DEVICE_NOT_ENROLLED'),

  /// Terminal révoqué : l'application efface ses données (OFF-04).
  deviceRevoked('DEVICE_REVOKED'),

  /// Requête non signée par la clé du terminal.
  deviceProofInvalid('DEVICE_PROOF_INVALID'),

  /// Horloge du terminal trop éloignée de celle du serveur.
  deviceClockSkew('DEVICE_CLOCK_SKEW'),

  /// Compte protégé par la double authentification : seules les requêtes
  /// signées par une tablette enrôlée s'en passent (ADR-022).
  mfaRequired('MFA_REQUIRED'),

  /// Trop de requêtes en peu de temps : réessayer plus tard (SEC-03).
  rateLimited('RATE_LIMITED'),

  /// Code absent ou inconnu de cette version de l'application.
  unknown('UNKNOWN');

  const ApiErrorCode(this.wireValue);

  final String wireValue;

  static ApiErrorCode fromWire(String? value) => ApiErrorCode.values.firstWhere(
    (c) => c.wireValue == value,
    orElse: () => unknown,
  );

  /// Code déduit du statut HTTP quand le corps n'est pas au format attendu.
  static ApiErrorCode fromStatus(int? status) => switch (status) {
    401 => unauthenticated,
    403 => forbidden,
    404 => notFound,
    429 => rateLimited,
    400 || 422 => validationFailed,
    final int s when s >= 500 => internal,
    _ => unknown,
  };
}

/// Erreur de validation portant sur un champ (`error.fields[]`).
@immutable
final class ApiFieldError {
  const ApiFieldError({required this.path, required this.message});

  final String path;
  final String message;
}

/// Erreur renvoyée par l'API produit :
/// `{"error":{"code","message","trace_id","fields":[...]}}`.
final class ApiException extends AppException {
  const ApiException({
    required this.code,
    required String message,
    this.statusCode,
    this.traceId,
    this.fields = const [],
  }) : super(message);

  final ApiErrorCode code;
  final int? statusCode;

  /// Identifiant de corrélation à communiquer au support.
  final String? traceId;
  final List<ApiFieldError> fields;

  @override
  String toString() =>
      'ApiException(${code.wireValue}, status: $statusCode, '
      'trace: $traceId): $message';
}
