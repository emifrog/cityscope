import 'dart:convert';

import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';

/// Identité du terminal dans le stockage sécurisé (Keystore), jamais dans la
/// base ni les préférences : effacée à la révocation.
final class DeviceIdentityStore {
  DeviceIdentityStore(this._store);

  static const _logger = AppLogger('device');

  final SecureStore _store;

  Future<DeviceIdentity?> read() async {
    final raw = await _store.read(SecureStorageKeys.deviceIdentity);
    if (raw == null) return null;
    try {
      final json = asJsonMap(jsonDecode(raw));
      // Absent avant SEC-05 : clé Ed25519 et sa graine.
      final algorithm =
          json.optionalString('key_algorithm') ?? DeviceKeyAlgorithms.ed25519;
      final seed = json.optionalString('key_seed');
      final alias = json.optionalString('key_alias');
      if (algorithm == DeviceKeyAlgorithms.ed25519
          ? seed == null
          : alias == null) {
        throw const FormatException('Clé du terminal absente');
      }
      if (algorithm != DeviceKeyAlgorithms.ed25519 &&
          algorithm != DeviceKeyAlgorithms.ecdsaP256) {
        throw const FormatException('Algorithme de clé inconnu');
      }
      return DeviceIdentity(
        deviceId: json.requireString('device_id'),
        deviceName: json.requireString('device_name'),
        tenantId: json.requireString('tenant_id'),
        tenantName: json.requireString('tenant_name'),
        keyAlgorithm: algorithm,
        keySeed: seed == null ? const [] : base64.decode(seed),
        keyAlias: alias,
        pendingKeyAlias: json.optionalString('pending_key_alias'),
      );
    } on FormatException {
      _logger.warning('Identité du terminal illisible : suppression.');
      await clear();
      return null;
    }
  }

  Future<void> write(DeviceIdentity identity) => _store.write(
    SecureStorageKeys.deviceIdentity,
    jsonEncode({
      'device_id': identity.deviceId,
      'device_name': identity.deviceName,
      'tenant_id': identity.tenantId,
      'tenant_name': identity.tenantName,
      'key_algorithm': identity.keyAlgorithm,
      if (identity.keyAlgorithm == DeviceKeyAlgorithms.ed25519)
        'key_seed': base64.encode(identity.keySeed),
      'key_alias': ?identity.keyAlias,
      'pending_key_alias': ?identity.pendingKeyAlias,
    }),
  );

  Future<void> clear() => _store.delete(SecureStorageKeys.deviceIdentity);
}
