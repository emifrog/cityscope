import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/features/account/data/api_account_repository.dart';
import 'package:etare_ops/src/features/account/domain/account_repository.dart';
import 'package:etare_ops/src/features/account/domain/user_account.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final accountRepositoryProvider = Provider<AccountRepository>(
  (ref) => ApiAccountRepository(ref.watch(etareApiClientProvider)),
);

final tenantSelectionRepositoryProvider = Provider<TenantSelectionRepository>(
  (ref) => LocalTenantSelectionRepository(
    ref.watch(appDatabaseProvider).localMetaDao,
  ),
);

/// Profil de l'utilisateur connecté (`GET /me`), `null` si déconnecté.
/// Rechargé automatiquement quand l'utilisateur change.
final currentAccountProvider = FutureProvider<UserAccount?>((ref) async {
  final userId = ref.watch(
    authControllerProvider.select((state) => state.value?.user.id),
  );
  if (userId == null) return null;
  return ref.watch(accountRepositoryProvider).fetchCurrentAccount();
});

/// SIS actif de la session.
final activeTenantControllerProvider =
    AsyncNotifierProvider<ActiveTenantController, Membership?>(
      ActiveTenantController.new,
    );

/// Identifiant du SIS actif, lu de façon synchrone par la couche HTTP
/// (`X-Tenant-Id`). Simple porteur mis à jour par [ActiveTenantController] :
/// il ne dépend de rien, car l'intercepteur le lit PENDANT `GET /me`, dont
/// le SIS actif dépend lui-même (sinon : dépendance circulaire).
final activeTenantIdProvider = NotifierProvider<ActiveTenantId, String?>(
  ActiveTenantId.new,
);

class ActiveTenantId extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String? tenantId) => state = tenantId;
}

class ActiveTenantController extends AsyncNotifier<Membership?> {
  TenantSelectionRepository get _selection =>
      ref.read(tenantSelectionRepositoryProvider);

  @override
  Future<Membership?> build() async {
    final account = await ref.watch(currentAccountProvider.future);
    if (account == null) {
      ref.read(activeTenantIdProvider.notifier).set(null);
      return null;
    }
    final storedId = await _selection.readSelectedTenantId();
    final active = resolveActiveMembership(account.memberships, storedId);
    if (active != null && active.tenantId != storedId) {
      await _selection.saveSelectedTenantId(active.tenantId);
    }
    ref.read(activeTenantIdProvider.notifier).set(active?.tenantId);
    return active;
  }

  /// Sélectionne un SIS parmi les rattachements de l'utilisateur.
  Future<void> select(String tenantId) async {
    final account = await ref.read(currentAccountProvider.future);
    final membership = account?.memberships
        .where((m) => m.tenantId == tenantId)
        .firstOrNull;
    if (membership == null) {
      throw ArgumentError.value(tenantId, 'tenantId', 'SIS non autorisé');
    }
    await _selection.saveSelectedTenantId(tenantId);
    ref.read(activeTenantIdProvider.notifier).set(tenantId);
    state = AsyncData(membership);
  }
}
