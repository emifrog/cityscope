/// Services Android de l'application OPS (SEC-05, CAP-02) : clé du terminal
/// dans le Keystore, horloge monotone, espace libre, protection de l'écran.
///
/// Sur une plateforme sans implémentation (iOS, tests), chaque appel lève
/// `MissingPluginException` : l'application retombe sur ses replis logiciels.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Horloge monotone : temps écoulé depuis le démarrage de la tablette, veille
/// comprise, et nombre de démarrages (-1 si inconnu). Insensible au réglage
/// de l'heure.
@immutable
final class MonotonicTime {
  const MonotonicTime({required this.elapsedMs, required this.bootCount});

  final int elapsedMs;
  final int bootCount;
}

/// Niveau de protection matérielle de la clé du terminal.
enum KeySecurity { strongbox, tee, software, unknown }

abstract final class EtarePlatform {
  static const _channel = MethodChannel('fr.etare.platform');

  /// Crée la clé ECDSA P-256 [alias] dans le Keystore si elle n'existe pas ;
  /// renvoie sa clé publique (SubjectPublicKeyInfo DER, base64).
  static Future<String> createDeviceKey(String alias) async => _required(
    await _channel.invokeMethod<String>('createDeviceKey', {'alias': alias}),
  );

  /// Clé publique de [alias], ou null si la clé n'existe pas.
  static Future<String?> devicePublicKey(String alias) =>
      _channel.invokeMethod<String>('devicePublicKey', {'alias': alias});

  /// Signature SHA256withECDSA (DER, base64) des octets UTF-8 de [text].
  static Future<String> signWithDeviceKey(String alias, String text) async =>
      _required(
        await _channel.invokeMethod<String>('signWithDeviceKey', {
          'alias': alias,
          'text': text,
        }),
      );

  static Future<void> deleteDeviceKey(String alias) =>
      _channel.invokeMethod<void>('deleteDeviceKey', {'alias': alias});

  static Future<KeySecurity?> deviceKeySecurity(String alias) async {
    final value = await _channel.invokeMethod<String>('deviceKeySecurity', {
      'alias': alias,
    });
    if (value == null) return null;
    return KeySecurity.values
            .where((level) => level.name == value)
            .firstOrNull ??
        KeySecurity.unknown;
  }

  static Future<MonotonicTime> monotonicTime() async {
    final value = await _channel.invokeMapMethod<String, Object?>(
      'monotonicTime',
    );
    return MonotonicTime(
      elapsedMs: (value?['elapsedMs'] as num?)?.toInt() ?? 0,
      bootCount: (value?['bootCount'] as num?)?.toInt() ?? -1,
    );
  }

  /// Octets disponibles pour l'application sur le volume de [path].
  static Future<int> availableBytes(String path) async => _required(
    await _channel.invokeMethod<int>('availableBytes', {'path': path}),
  );

  /// Interdit (ou permet) captures d'écran et aperçu dans les applications
  /// récentes. Interdit par défaut tant que rien n'est demandé.
  static Future<void> setSecureWindow({required bool secure}) =>
      _channel.invokeMethod<void>('setSecureWindow', {'secure': secure});

  static T _required<T>(T? value) {
    if (value == null) {
      throw PlatformException(
        code: 'NO_VALUE',
        message: 'Réponse vide du service Android.',
      );
    }
    return value;
  }
}
