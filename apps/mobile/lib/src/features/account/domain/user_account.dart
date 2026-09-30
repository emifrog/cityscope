import 'package:flutter/foundation.dart';

/// Rattachement d'un utilisateur à un SIS (tenant) avec ses rôles.
@immutable
final class Membership {
  const Membership({
    required this.tenantId,
    required this.tenantName,
    required this.tenantSlug,
    required this.roles,
  });

  final String tenantId;
  final String tenantName;
  final String tenantSlug;

  /// Codes de rôle bruts (ex. `OPS_USER`), cf. `role_labels.dart`.
  final List<String> roles;

  @override
  bool operator ==(Object other) =>
      other is Membership &&
      other.tenantId == tenantId &&
      other.tenantName == tenantName &&
      other.tenantSlug == tenantSlug &&
      listEquals(other.roles, roles);

  @override
  int get hashCode =>
      Object.hash(tenantId, tenantName, tenantSlug, Object.hashAll(roles));
}

/// Utilisateur courant tel que vu par l'API produit (`GET /me`).
@immutable
final class UserAccount {
  const UserAccount({
    required this.id,
    required this.email,
    required this.memberships,
    this.displayName,
  });

  final String id;
  final String email;
  final String? displayName;
  final List<Membership> memberships;
}

/// Choisit le SIS actif : celui mémorisé s'il fait toujours partie des
/// rattachements, sinon le premier ; `null` si l'utilisateur n'en a aucun.
Membership? resolveActiveMembership(
  List<Membership> memberships,
  String? storedTenantId,
) {
  if (memberships.isEmpty) return null;
  return memberships.where((m) => m.tenantId == storedTenantId).firstOrNull ??
      memberships.first;
}
