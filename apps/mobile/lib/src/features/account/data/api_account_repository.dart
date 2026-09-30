import 'package:etare_ops/src/data/local/daos/local_meta_dao.dart';
import 'package:etare_ops/src/data/remote/etare_api_client.dart';
import 'package:etare_ops/src/features/account/domain/account_repository.dart';
import 'package:etare_ops/src/features/account/domain/user_account.dart';

/// Implémentation adossée à `GET /me` (mapping DTO → domaine).
final class ApiAccountRepository implements AccountRepository {
  ApiAccountRepository(this._client);

  final EtareApiClient _client;

  @override
  Future<UserAccount> fetchCurrentAccount() async {
    final dto = await _client.getMe();
    return UserAccount(
      id: dto.user.id,
      email: dto.user.email,
      displayName: dto.user.displayName,
      memberships: List.unmodifiable([
        for (final m in dto.memberships)
          Membership(
            tenantId: m.tenantId,
            tenantName: m.tenantName,
            tenantSlug: m.tenantSlug,
            roles: List.unmodifiable(m.roles),
          ),
      ]),
    );
  }
}

/// SIS sélectionné mémorisé dans `local_meta` (donnée non secrète).
final class LocalTenantSelectionRepository
    implements TenantSelectionRepository {
  LocalTenantSelectionRepository(this._dao);

  static const metaKey = 'active_tenant_id';

  final LocalMetaDao _dao;

  @override
  Future<String?> readSelectedTenantId() => _dao.readValue(metaKey);

  @override
  Future<void> saveSelectedTenantId(String tenantId) =>
      _dao.writeValue(metaKey, tenantId);
}
