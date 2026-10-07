import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:etare_ops/src/core/security/trusted_keys.dart';
import 'package:etare_ops/src/features/sync/data/device_keys.dart';
import 'package:etare_ops/src/features/sync/domain/device_identity.dart';
import 'package:etare_ops/src/features/sync/domain/signed_content.dart';

/// SHA-256 (hexadécimal) d'octets.
String sha256Hex(List<int> bytes) => crypto.sha256.convert(bytes).toString();

/// SHA-256 (hexadécimal) des octets UTF-8 d'un texte.
String sha256OfText(String text) => sha256Hex(utf8.encode(text));

final _ed25519 = Ed25519();

/// Clé Ed25519 logicielle des premières tablettes, générée sur l'appareil à
/// l'enrôlement. Seule sa graine (32 octets) est conservée, dans le stockage
/// sécurisé ; remplacée par une clé du Keystore à la première synchronisation
/// d'une version qui le permet (SEC-05).
final class DeviceKey implements DeviceSigner {
  DeviceKey._(this._keyPair);

  final SimpleKeyPair _keyPair;

  static Future<DeviceKey> generate() async =>
      DeviceKey._(await _ed25519.newKeyPair());

  static Future<DeviceKey> fromSeed(List<int> seed) async =>
      DeviceKey._(await _ed25519.newKeyPairFromSeed(seed));

  Future<List<int>> seed() => _keyPair.extractPrivateKeyBytes();

  @override
  String get algorithm => DeviceKeyAlgorithms.ed25519;

  /// Clé publique brute en base64 (format attendu par le serveur).
  @override
  Future<String> publicKeyBase64() async =>
      base64.encode((await _keyPair.extractPublicKey()).bytes);

  /// Signature Ed25519 (base64) des octets UTF-8 de [text].
  @override
  Future<String> sign(String text) async {
    final signature = await _ed25519.sign(utf8.encode(text), keyPair: _keyPair);
    return base64.encode(signature.bytes);
  }
}

/// Vérifie une signature serveur avec une clé APPROUVÉE de l'usage attendu.
/// Ne lève jamais : toute anomalie vaut refus.
Future<bool> verifyServerSignature({
  required TrustedKeys trustedKeys,
  required KeyPurpose purpose,
  required SignatureEnvelope envelope,
  required String text,
}) async {
  if (envelope.algorithm != 'Ed25519') return false;
  final key = trustedKeys.find(envelope.keyId, purpose);
  if (key == null) return false;
  try {
    final bytes = base64.decode(envelope.signature);
    if (bytes.length != 64) return false;
    return await _ed25519.verify(
      utf8.encode(text),
      signature: Signature(
        bytes,
        publicKey: SimplePublicKey(key.publicKey, type: KeyPairType.ed25519),
      ),
    );
  } on FormatException {
    return false;
  }
}
