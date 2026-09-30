import 'package:etare_ops/src/features/account/domain/user_account.dart';

/// Accès au profil de l'utilisateur courant.
abstract interface class AccountRepository {
  /// Lève `AppException` (réseau, API…) en cas d'échec.
  Future<UserAccount> fetchCurrentAccount();
}

/// Mémorisation locale (non secrète) du SIS sélectionné.
abstract interface class TenantSelectionRepository {
  Future<String?> readSelectedTenantId();

  Future<void> saveSelectedTenantId(String tenantId);
}
