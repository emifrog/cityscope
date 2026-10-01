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
      return DeviceIdentity(
        deviceId: json.requireString('device_id'),
        deviceName: json.requireString('device_name'),
        tenantId: json.requireString('tenant_id'),
        tenantName: json.requireString('tenant_name'),
        keySeed: base64.decode(json.requireString('key_seed')),
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
      'key_seed': base64.encode(identity.keySeed),
    }),
  );

  Future<void> clear() => _store.delete(SecureStorageKeys.deviceIdentity);
}
