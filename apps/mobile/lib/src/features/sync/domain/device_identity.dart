import 'package:flutter/foundation.dart';

/// Algorithmes de la clé du terminal (SEC-05, ADR-029).
abstract final class DeviceKeyAlgorithms {
  /// Clé logicielle des premières tablettes : graine dans le stockage sécurisé.
  static const ed25519 = 'ed25519';

  /// Clé du Keystore Android, jamais extractible.
  static const ecdsaP256 = 'ecdsa-p256';
}

/// Ce terminal tel qu'enrôlé dans un SIS (ADR-015). Sa clé privée ne quitte
/// jamais l'appareil : graine Ed25519 dans le stockage sécurisé pour les
/// premières tablettes, clé du Keystore (désignée par son alias) depuis
/// SEC-05.
@immutable
final class DeviceIdentity {
  const DeviceIdentity({
    required this.deviceId,
    required this.deviceName,
    required this.tenantId,
    required this.tenantName,
    this.keyAlgorithm = DeviceKeyAlgorithms.ed25519,
    this.keySeed = const [],
    this.keyAlias,
    this.pendingKeyAlias,
  });

  final String deviceId;
  final String deviceName;
  final String tenantId;
  final String tenantName;

  /// [DeviceKeyAlgorithms.ed25519] ou [DeviceKeyAlgorithms.ecdsaP256].
  final String keyAlgorithm;

  /// Graine Ed25519 (32 octets) ; vide pour une clé du Keystore.
  final List<int> keySeed;

  /// Alias de la clé du Keystore ; null pour une clé Ed25519.
  final String? keyAlias;

  /// Rotation commencée vers cette clé du Keystore : le serveur l'a peut-être
  /// déjà retenue si sa réponse s'est perdue (SEC-05).
  final String? pendingKeyAlias;

  bool get hardwareKey => keyAlgorithm == DeviceKeyAlgorithms.ecdsaP256;

  /// La rotation vers [alias] est engagée.
  DeviceIdentity withPendingKey(String alias) => _copy(pendingKeyAlias: alias);

  /// La clé du Keystore [alias] remplace la précédente, dont la graine disparaît.
  DeviceIdentity withHardwareKey(String alias) => DeviceIdentity(
    deviceId: deviceId,
    deviceName: deviceName,
    tenantId: tenantId,
    tenantName: tenantName,
    keyAlgorithm: DeviceKeyAlgorithms.ecdsaP256,
    keyAlias: alias,
  );

  DeviceIdentity _copy({String? pendingKeyAlias}) => DeviceIdentity(
    deviceId: deviceId,
    deviceName: deviceName,
    tenantId: tenantId,
    tenantName: tenantName,
    keyAlgorithm: keyAlgorithm,
    keySeed: keySeed,
    keyAlias: keyAlias,
    pendingKeyAlias: pendingKeyAlias,
  );

  @override
  String toString() =>
      'DeviceIdentity(device: $deviceId, tenant: $tenantId, clé: $keyAlgorithm <masquée>)';
}
