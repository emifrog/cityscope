import 'package:etare_platform/etare_platform.dart';
import 'package:flutter/foundation.dart';

export 'package:etare_platform/etare_platform.dart'
    show KeySecurity, MonotonicTime;

/// Clés du Keystore Android (SEC-05) : ECDSA P-256, jamais extractibles.
abstract interface class HardwareKeys {
  /// Crée la clé [alias] si elle n'existe pas ; sa clé publique (SPKI, base64).
  Future<String> create(String alias);

  /// Clé publique de [alias], ou null si elle n'existe pas.
  Future<String?> publicKey(String alias);

  /// Signature SHA256withECDSA (DER, base64) des octets UTF-8 de [text].
  Future<String> sign(String alias, String text);

  Future<void> delete(String alias);

  Future<KeySecurity?> security(String alias);
}

/// Services de la plateforme utilisés par la sécurité du terminal et le
/// stockage. Chaque service absent (iOS, tests) a un repli : clé logicielle,
/// horloge murale, pas de contrôle d'espace, pas de protection d'écran.
abstract interface class PlatformServices {
  /// Null : pas de Keystore matériel sur cette plateforme.
  HardwareKeys? get hardwareKeys;

  /// Temps depuis le démarrage, veille comprise ; null si indisponible.
  Future<MonotonicTime?> monotonicTime();

  /// Octets disponibles sur le volume de [path] ; null si inconnu.
  Future<int?> availableBytes(String path);

  /// Captures d'écran et aperçu des applications récentes interdits ou non.
  Future<void> setSecureWindow({required bool secure});
}

/// Services Android du paquet `etare_platform`.
final class AndroidPlatformServices implements PlatformServices {
  const AndroidPlatformServices();

  static const _keys = _AndroidHardwareKeys();

  static bool get _android =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  @override
  HardwareKeys? get hardwareKeys => _android ? _keys : null;

  @override
  Future<MonotonicTime?> monotonicTime() async {
    if (!_android) return null;
    try {
      return await EtarePlatform.monotonicTime();
    } on Object {
      // Pas de canal (moteur sans plugin, tests) : le repli s'applique.
      return null;
    }
  }

  @override
  Future<int?> availableBytes(String path) async {
    if (!_android) return null;
    try {
      return await EtarePlatform.availableBytes(path);
    } on Object {
      // Pas de canal (moteur sans plugin, tests) : le repli s'applique.
      return null;
    }
  }

  @override
  Future<void> setSecureWindow({required bool secure}) async {
    if (!_android) return;
    try {
      await EtarePlatform.setSecureWindow(secure: secure);
    } on Object {
      // Moteur sans activité (tâche de fond) ou sans canal : rien à protéger.
    }
  }
}

final class _AndroidHardwareKeys implements HardwareKeys {
  const _AndroidHardwareKeys();

  @override
  Future<String> create(String alias) => EtarePlatform.createDeviceKey(alias);

  @override
  Future<String?> publicKey(String alias) =>
      EtarePlatform.devicePublicKey(alias);

  @override
  Future<String> sign(String alias, String text) =>
      EtarePlatform.signWithDeviceKey(alias, text);

  @override
  Future<void> delete(String alias) => EtarePlatform.deleteDeviceKey(alias);

  @override
  Future<KeySecurity?> security(String alias) =>
      EtarePlatform.deviceKeySecurity(alias);
}

/// Aucun service de plateforme : clé logicielle, horloge murale, pas de
/// contrôle d'espace ni de protection d'écran (tests, outils).
final class SoftwarePlatformServices implements PlatformServices {
  const SoftwarePlatformServices();

  @override
  HardwareKeys? get hardwareKeys => null;

  @override
  Future<MonotonicTime?> monotonicTime() async => null;

  @override
  Future<int?> availableBytes(String path) async => null;

  @override
  Future<void> setSecureWindow({required bool secure}) async {}
}
