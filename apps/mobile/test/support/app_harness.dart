import 'dart:convert';

import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:etare_ops/src/features/account/application/account_providers.dart';
import 'package:etare_ops/src/features/account/domain/account_repository.dart';
import 'package:etare_ops/src/features/account/domain/user_account.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/auth/domain/auth_failure.dart';
import 'package:etare_ops/src/features/auth/domain/auth_repository.dart';
import 'package:etare_ops/src/features/auth/domain/auth_session.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:etare_ops/src/features/sync/domain/sync_status.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;

import 'fakes.dart';

final testSession = AuthSession(
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: DateTime.utc(2099),
  user: const AuthUser(id: 'user-1', email: 'agent@sdis06.test'),
);

/// Dépôt d'authentification scriptable pour les tests d'interface.
final class ScriptedAuthRepository implements AuthRepository {
  AuthFailure? failure;
  int signInCalls = 0;
  int signOutCalls = 0;

  @override
  Future<AuthSession> signInWithPassword({
    required String email,
    required String password,
  }) async {
    signInCalls++;
    if (failure case final f?) throw AuthException(f);
    return testSession;
  }

  @override
  Future<AuthSession> refreshSession(String refreshToken) async => testSession;

  @override
  Future<void> signOut(String accessToken) async => signOutCalls++;
}

final class InMemoryTenantSelection implements TenantSelectionRepository {
  String? value;

  @override
  Future<String?> readSelectedTenantId() async => value;

  @override
  Future<void> saveSelectedTenantId(String tenantId) async => value = tenantId;
}

const testAccount = UserAccount(
  id: 'user-1',
  email: 'agent@sdis06.test',
  memberships: [
    Membership(
      tenantId: 'tenant-06',
      tenantName: 'SDIS DEMO 06',
      tenantSlug: 'sdis-demo-06',
      roles: ['PREVISION_EDITOR', 'OPS_USER'],
    ),
  ],
);

/// Surcharges communes : aucun accès réseau ni base réelle.
List<Override> appOverrides({
  required ScriptedAuthRepository authRepository,
  bool signedIn = false,
  UserAccount account = testAccount,
}) {
  final store = InMemorySecureStore({
    if (signedIn)
      SecureStorageKeys.authSession: jsonEncode({
        'access_token': testSession.accessToken,
        'refresh_token': testSession.refreshToken,
        'expires_at': testSession.expiresAt.toIso8601String(),
        'user': {'id': testSession.user.id, 'email': testSession.user.email},
      }),
  });
  return [
    secureStoreProvider.overrideWithValue(store),
    authRepositoryProvider.overrideWithValue(authRepository),
    tenantSelectionRepositoryProvider.overrideWithValue(
      InMemoryTenantSelection(),
    ),
    currentAccountProvider.overrideWith((ref) async {
      final userId = ref.watch(
        authControllerProvider.select((s) => s.value?.user.id),
      );
      return userId == null ? null : account;
    }),
    syncStatusProvider.overrideWith(
      (ref) => Stream<SyncStatus>.value(SyncStatus.initial),
    ),
  ];
}
