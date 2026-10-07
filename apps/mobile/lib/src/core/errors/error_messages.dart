import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/storage/storage_guard.dart';

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
  ApiException(code: ApiErrorCode.deviceRevoked) => 'Cette tablette a été révoquée par votre SIS : ses données ont été effacées.',
  ApiException(code: ApiErrorCode.deviceNotEnrolled) =>
    'Cette tablette n’est pas enrôlée dans votre SIS.',
  ApiException(code: ApiErrorCode.deviceProofInvalid) =>
    'L’identité de la tablette n’a pas pu être prouvée : réenrôlez-la.',
  ApiException(code: ApiErrorCode.deviceClockSkew) =>
    'L’heure de la tablette est incorrecte : corrigez-la puis réessayez.',
  ApiException(code: ApiErrorCode.mfaRequired) =>
    'Ce compte est protégé par la double authentification : cette action '
        'se fait depuis le back-office.',
  ApiException(code: ApiErrorCode.rateLimited) =>
    'Trop de requêtes en peu de temps : réessayez dans quelques minutes.',
  ApiException(code: ApiErrorCode.serviceUnavailable) =>
    'Service momentanément indisponible. Réessayez plus tard.',
  // Les refus de validation de l'API sont rédigés pour l'utilisateur (ex. code
  // d'enrôlement expiré) : on les affiche tels quels.
  ApiException(code: ApiErrorCode.validationFailed, :final message) =>
    message.isEmpty
        ? 'La requête a été refusée par le serveur (données invalides).'
        : message,
  ApiException(:final traceId) => _withTrace(
    'Erreur du serveur. Réessayez plus tard.',
    traceId,
  ),
  UnexpectedResponseException() =>
    'Réponse inattendue du serveur. Mettez l’application à jour ou '
        'contactez le support.',
  StorageInsufficientException(:final message) => message,
  _ when isStorageFull(error) => storageFullMessage,
  _ => 'Une erreur inattendue est survenue.',
};

String _withTrace(String message, String? traceId) =>
    traceId == null ? message : '$message (réf. $traceId)';
