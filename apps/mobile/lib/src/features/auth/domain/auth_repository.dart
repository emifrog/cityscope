import 'package:etare_ops/src/features/auth/domain/auth_session.dart';

/// Contrat d'authentification, indépendant du fournisseur (aujourd'hui
/// Supabase Auth / GoTrue via un adaptateur HTTP léger et remplaçable).
///
/// Toutes les méthodes lèvent `AuthException` en cas d'échec.
abstract interface class AuthRepository {
  /// Connexion e-mail + mot de passe (produit sur invitation : pas
  /// d'inscription ni de réinitialisation dans l'application).
  Future<AuthSession> signInWithPassword({
    required String email,
    required String password,
  });

  /// Échange un jeton de rafraîchissement contre une nouvelle session.
  Future<AuthSession> refreshSession(String refreshToken);

  /// Révoque la session côté serveur.
  Future<void> signOut(String accessToken);
}
