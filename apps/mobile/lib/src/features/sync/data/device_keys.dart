import 'dart:math';

import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/platform/platform_services.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';
import 'package:flutter/services.dart';

/// La clé qui prouve les requêtes de ce terminal (ADR-015, SEC-05).
abstract interface class DeviceSigner {
  /// [DeviceKeyAlgorithms.ed25519] ou [DeviceKeyAlgorithms.ecdsaP256].
  String get algorithm;

  /// Clé publique dans le format de son algorithme, en base64.
  Future<String> publicKeyBase64();

  /// Signature (base64) des octets UTF-8 de [text].
  Future<String> sign(String text);
}

/// Clé ECDSA P-256 du Keystore Android : la clé privée ne quitte jamais le
/// matériel, la tablette ne fait que lui demander des signatures.
final class KeystoreDeviceKey implements DeviceSigner {
  const KeystoreDeviceKey(this.alias, this._keys);

  final String alias;
  final HardwareKeys _keys;

  @override
  String get algorithm => DeviceKeyAlgorithms.ecdsaP256;

  @override
  Future<String> publicKeyBase64() async =>
      await _keys.publicKey(alias) ??
      (throw StateError('Clé du terminal absente du Keystore.'));

  @override
  Future<String> sign(String text) => _keys.sign(alias, text);

  Future<KeySecurity?> security() => _keys.security(alias);
}

/// Clé du Keystore indisponible alors que l'identité la désigne (réinitialisation
/// du Keystore) : le terminal ne peut plus prouver ses requêtes.
final class DeviceKeyLost implements Exception {
  const DeviceKeyLost();
}

/// Fabrique et retrouve les clés du terminal : Keystore quand la plateforme
/// en a un, sinon clé Ed25519 logicielle (iOS, tests).
final class DeviceKeys {
  DeviceKeys(this._platform, {Random? random})
    : _random = random ?? Random.secure();

  static const _logger = AppLogger('device');

  final PlatformServices _platform;
  final Random _random;

  /// Le Keystore matériel est disponible.
  bool get hardware => _platform.hardwareKeys != null;

  /// Alias d'une nouvelle clé : jamais réutilisé d'une clé à l'autre.
  String newAlias() =>
      'etare.device.${List.generate(16, (_) => _random.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';

  /// Clé d'un nouvel enrôlement : du Keystore si possible.
  Future<DeviceSigner> generate() async {
    final keys = _platform.hardwareKeys;
    if (keys != null) {
      final alias = newAlias();
      try {
        await keys.create(alias);
        return KeystoreDeviceKey(alias, keys);
      } on PlatformException catch (error) {
        _logger.warning(
          'Keystore indisponible : clé logicielle.',
          error: error,
        );
      } on MissingPluginException catch (error) {
        _logger.warning('Keystore absent : clé logicielle.', error: error);
      }
    }
    return DeviceKey.generate();
  }

  /// Clé du Keystore [alias], créée si elle n'existe pas encore (rotation).
  Future<KeystoreDeviceKey?> hardwareKey(String alias) async {
    final keys = _platform.hardwareKeys;
    if (keys == null) return null;
    await keys.create(alias);
    return KeystoreDeviceKey(alias, keys);
  }

  /// La clé que désigne [identity].
  Future<DeviceSigner> signerOf(DeviceIdentity identity) async {
    if (!identity.hardwareKey) return DeviceKey.fromSeed(identity.keySeed);
    final keys = _platform.hardwareKeys;
    final alias = identity.keyAlias;
    if (keys == null || alias == null || await keys.publicKey(alias) == null) {
      throw const DeviceKeyLost();
    }
    return KeystoreDeviceKey(alias, keys);
  }

  Future<DeviceCredentials> credentials(DeviceIdentity identity) async =>
      DeviceCredentials(identity, await signerOf(identity));

  /// Révocation : les clés du Keystore du terminal disparaissent.
  Future<void> discard(DeviceIdentity? identity) async {
    final keys = _platform.hardwareKeys;
    if (keys == null || identity == null) return;
    for (final alias in {
      identity.keyAlias,
      identity.pendingKeyAlias,
    }.nonNulls) {
      try {
        await keys.delete(alias);
      } on PlatformException catch (error) {
        _logger.warning('Clé du Keystore non effacée.', error: error);
      }
    }
  }
}
