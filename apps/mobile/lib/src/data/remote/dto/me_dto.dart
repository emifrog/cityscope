import 'package:etare_ops/src/core/json/json_reader.dart';

/// DTO de `GET /me` (écrits à la main ; seront remplacés par le client
/// généré depuis l'OpenAPI).
final class MeResponseDto {
  const MeResponseDto({required this.user, required this.memberships});

  factory MeResponseDto.fromJson(JsonMap json) => MeResponseDto(
    user: MeUserDto.fromJson(json.requireObject('user')),
    memberships: [
      for (final item in json.requireObjectList('memberships'))
        MembershipDto.fromJson(item),
    ],
  );

  final MeUserDto user;
  final List<MembershipDto> memberships;
}

final class MeUserDto {
  const MeUserDto({required this.id, required this.email, this.displayName});

  factory MeUserDto.fromJson(JsonMap json) => MeUserDto(
    id: json.requireString('id'),
    email: json.requireString('email'),
    displayName: json.optionalString('display_name'),
  );

  final String id;
  final String email;
  final String? displayName;
}

final class MembershipDto {
  const MembershipDto({
    required this.tenantId,
    required this.tenantName,
    required this.tenantSlug,
    required this.roles,
  });

  factory MembershipDto.fromJson(JsonMap json) => MembershipDto(
    tenantId: json.requireString('tenant_id'),
    tenantName: json.requireString('tenant_name'),
    tenantSlug: json.requireString('tenant_slug'),
    roles: json.requireStringList('roles'),
  );

  final String tenantId;
  final String tenantName;
  final String tenantSlug;
  final List<String> roles;
}
