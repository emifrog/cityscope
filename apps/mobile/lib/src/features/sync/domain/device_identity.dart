import 'package:flutter/foundation.dart';

/// Ce terminal tel qu'enrôlé dans un SIS (ADR-015). La graine de sa clé
/// privée ne quitte jamais le stockage sécurisé de l'appareil.
@immutable
final class DeviceIdentity {
  const DeviceIdentity({
    required this.deviceId,
    required this.deviceName,
    required this.tenantId,
    required this.tenantName,
    required this.keySeed,
  });

  final String deviceId;
  final String deviceName;
  final String tenantId;
  final String tenantName;

  /// Graine Ed25519 (32 octets).
  final List<int> keySeed;

  @override
  String toString() =>
      'DeviceIdentity(device: $deviceId, tenant: $tenantId, clé: <masquée>)';
}
