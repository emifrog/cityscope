import 'package:etare_ops/src/core/errors/app_exception.dart';

/// Traduit une erreur technique en message français destiné à l'utilisateur.
///
/// Les fonctionnalités peuvent spécialiser ce comportement pour leurs propres
/// erreurs (ex. `describeAuthError`) puis déléguer ici.
String describeError(Object error) => switch (error) {
  NetworkException(failure: NetworkFailure.offline) =>
    'Réseau indisponible. Vérifiez votre connexion puis réessayez.',
  NetworkException(failure: NetworkFailure.timeout) =>
    'Le serveur ne répond pas. Réessayez dans quelques instants.',
  NetworkException(failure: NetworkFailure.badCertificate) =>
    'Connexion non sécurisée refusée (certificat invalide).',
  NetworkException(failure: NetworkFailure.cancelled) => 'Requête annulée.',
  ApiException(code: ApiErrorCode.unauthenticated) =>
    'Votre session a expiré. Reconnectez-vous.',
  ApiException(code: ApiErrorCode.forbidden) =>
    'Accès refusé pour ce SIS avec vos droits actuels.',
  ApiException(code: ApiErrorCode.notFound) => 'Élément introuvable.',
  ApiException(code: ApiErrorCode.tenantRequired) =>
    'Aucun SIS sélectionné. Choisissez un SIS puis réessayez.',
  ApiException(code: ApiErrorCode.validationFailed) =>
    'La requête a été refusée par le serveur (données invalides).',
  ApiException(:final traceId) => _withTrace(
    'Erreur du serveur. Réessayez plus tard.',
    traceId,
  ),
  UnexpectedResponseException() =>
    'Réponse inattendue du serveur. Mettez l’application à jour ou '
        'contactez le support.',
  _ => 'Une erreur inattendue est survenue.',
};

String _withTrace(String message, String? traceId) =>
    traceId == null ? message : '$message (réf. $traceId)';
