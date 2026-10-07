import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/device_keys.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';
import 'package:etare_ops/src/features/sync/domain/signed_content.dart';
import 'package:flutter/foundation.dart';

/// Code saisi qui ne peut pas être un code d'enrôlement.
final class EnrollmentCodeInvalid implements Exception {
  const EnrollmentCodeInvalid();
}

/// Enrôlement de cette tablette (ADR-015) : la clé est générée SUR
/// l'appareil, dans le Keystore quand il existe (SEC-05) ; seule la clé
/// publique part au serveur avec la preuve de sa détention (signature du code).
final class EnrollmentService {
  EnrollmentService({
    required this._api,
    required this._identities,
    this._generateKey = DeviceKey.generate,
    this._platformName = _platform,
  });

  final SyncApi _api;
  final DeviceIdentityStore _identities;
  final Future<DeviceSigner> Function() _generateKey;
  final String Function() _platformName;

  static String _platform() =>
      defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  Future<DeviceIdentity> enroll({
    required String tenantId,
    required String code,
  }) async {
    final normalized = normalizeEnrollmentCode(code);
    if (normalized == null) throw const EnrollmentCodeInvalid();
    final key = await _generateKey();
    final result = await _api.enroll(
      tenantId: tenantId,
      code: normalized,
      key: key,
      platform: _platformName(),
    );
    final identity = DeviceIdentity(
      deviceId: result.deviceId,
      deviceName: result.deviceName,
      tenantId: result.tenantId,
      tenantName: result.tenantName,
      keyAlgorithm: key.algorithm,
      keySeed: key is DeviceKey ? await key.seed() : const [],
      keyAlias: key is KeystoreDeviceKey ? key.alias : null,
    );
    await _identities.write(identity);
    return identity;
  }
}
