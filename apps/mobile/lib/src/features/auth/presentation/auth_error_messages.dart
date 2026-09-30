import 'package:etare_ops/src/core/errors/error_messages.dart';
import 'package:etare_ops/src/features/auth/domain/auth_failure.dart';

/// Messages français des erreurs d'authentification.
String describeAuthError(Object error) => switch (error) {
  AuthException(failure: AuthFailure.invalidCredentials) =>
    'Adresse e-mail ou mot de passe incorrect.',
  AuthException(failure: AuthFailure.network) =>
    'Réseau indisponible : impossible de joindre le service de connexion. '
        'Vérifiez votre connexion puis réessayez.',
  AuthException(failure: AuthFailure.configuration) =>
    'Erreur de configuration de l’application (service de connexion '
        'inaccessible ou clé refusée). Contactez votre administrateur.',
  AuthException(failure: AuthFailure.sessionExpired) =>
    'Votre session a expiré. Reconnectez-vous.',
  AuthException(failure: AuthFailure.rateLimited) =>
    'Trop de tentatives de connexion. Patientez quelques minutes avant de '
        'réessayer.',
  AuthException(failure: AuthFailure.unexpected) =>
    'Le service de connexion a renvoyé une erreur inattendue. Réessayez.',
  _ => describeError(error),
};
