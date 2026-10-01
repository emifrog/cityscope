import 'dart:convert';

import 'package:flutter/foundation.dart';

/// Usage d'une clé serveur (ADR-015) : la clé de publication signe les
/// manifestes (worker), la clé de catalogue signe les catalogues (API). Une
/// signature n'est acceptée que par une clé de l'usage attendu.
enum KeyPurpose { publication, catalog }

/// Clé publique Ed25519 approuvée, embarquée dans la configuration.
@immutable
final class TrustedKey {
  const TrustedKey({
    required this.purpose,
    required this.keyId,
    required this.publicKey,
  });

  final KeyPurpose purpose;
  final String keyId;

  /// Clé publique brute (32 octets).
  final List<int> publicKey;
}

/// Ensemble des clés publiques approuvées, lu depuis
/// `--dart-define=TRUSTED_SIGNING_KEYS=publication:<id>:<base64>;catalog:<id>:<base64>`.
///
/// Rotation : ajouter la nouvelle clé publique dans une version de
/// l'application, puis changer la clé privée du serveur.
@immutable
final class TrustedKeys {
  const TrustedKeys(this.keys);

  static const empty = TrustedKeys([]);

  static final _keyIdPattern = RegExp(r'^[A-Za-z0-9._-]{1,64}$');

  final List<TrustedKey> keys;

  bool has(KeyPurpose purpose) => keys.any((key) => key.purpose == purpose);

  /// Clé de cet identifiant ET de cet usage, sinon `null`.
  TrustedKey? find(String keyId, KeyPurpose purpose) => keys
      .where((key) => key.keyId == keyId && key.purpose == purpose)
      .firstOrNull;

  /// Lève une [FormatException] décrivant l'entrée invalide.
  static TrustedKeys parse(String raw) {
    final entries = raw
        .split(RegExp('[;,]'))
        .map((entry) => entry.trim())
        .where((entry) => entry.isNotEmpty);
    final keys = <TrustedKey>[];
    for (final entry in entries) {
      final parts = entry.split(':');
      if (parts.length != 3) {
        throw FormatException('« $entry » : usage:identifiant:clé attendu');
      }
      final purpose = KeyPurpose.values
          .where((value) => value.name == parts[0])
          .firstOrNull;
      if (purpose == null) {
        throw FormatException('« ${parts[0]} » : publication ou catalog');
      }
      if (!_keyIdPattern.hasMatch(parts[1])) {
        throw FormatException('« ${parts[1]} » : identifiant de clé invalide');
      }
      final List<int> bytes;
      try {
        bytes = base64.decode(parts[2]);
      } on FormatException {
        throw FormatException('clé ${parts[1]} : base64 invalide');
      }
      if (bytes.length != 32) {
        throw FormatException('clé ${parts[1]} : 32 octets Ed25519 attendus');
      }
      keys.add(TrustedKey(purpose: purpose, keyId: parts[1], publicKey: bytes));
    }
    return TrustedKeys(List.unmodifiable(keys));
  }
}
