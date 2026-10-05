import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/core/security/trusted_keys.dart';
import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:flutter/foundation.dart';

/// Identifiant d'une clé, dérivé de sa clé publique (`ed25519-` et 16
/// caractères du SHA-256), comme le serveur le calcule.
String keyIdOfPublicKey(List<int> publicKey) =>
    'ed25519-${crypto.sha256.convert(publicKey).toString().substring(0, 16)}';

/// Jeu de clés de signature de la plateforme (SEC-04, ADR-027), signé par la
/// clé racine : clés de publication et de catalogue avec leur statut, et un
/// numéro qui ne fait que croître.
@immutable
final class Keyset {
  const Keyset({
    required this.sequence,
    required this.issuedAt,
    required this.keys,
  });

  /// Lit le JSON canonique d'un jeu ; lève [FormatException] s'il est
  /// invalide, [NewerFormatException] si son format est plus récent.
  factory Keyset.fromJson(JsonMap json) {
    final version = json.requireInt('keyset_version');
    if (version > 1) throw const NewerFormatException('jeu de clés');
    if (version != 1) {
      throw const FormatException('Version de jeu de clés non prise en charge');
    }
    final sequence = json.requireInt('sequence');
    if (sequence < 1) throw const FormatException('« sequence » invalide');
    final keys = <TrustedKey>[];
    final ids = <String>{};
    for (final entry in json.requireObjectList('keys')) {
      final purpose = switch (entry.requireString('purpose')) {
        'publication' => KeyPurpose.publication,
        'catalog' => KeyPurpose.catalog,
        final other => throw FormatException('usage « $other » inconnu'),
      };
      final status = KeyStatus.values
          .where((value) => value.name == entry.requireString('status'))
          .firstOrNull;
      if (status == null) throw const FormatException('statut inconnu');
      final List<int> publicKey;
      try {
        publicKey = base64.decode(entry.requireString('public_key'));
      } on FormatException {
        throw const FormatException('clé publique invalide');
      }
      final keyId = entry.requireString('key_id');
      if (publicKey.length != 32 || keyIdOfPublicKey(publicKey) != keyId) {
        throw FormatException('clé $keyId : identifiant ou clé invalide');
      }
      if (!ids.add(keyId)) throw FormatException('clé $keyId en double');
      keys.add(
        TrustedKey(
          purpose: purpose,
          keyId: keyId,
          publicKey: publicKey,
          status: status,
        ),
      );
    }
    for (final purpose in [KeyPurpose.publication, KeyPurpose.catalog]) {
      if (!keys.any(
        (k) => k.purpose == purpose && k.status == KeyStatus.active,
      )) {
        throw FormatException('aucune clé active pour ${purpose.name}');
      }
    }
    return Keyset(
      sequence: sequence,
      issuedAt: json.requireDateTime('issued_at').toUtc(),
      keys: List.unmodifiable(keys),
    );
  }

  final int sequence;
  final DateTime issuedAt;
  final List<TrustedKey> keys;

  /// Identifiants des clés de publication que ce jeu révoque.
  Set<String> get revokedPublicationKeys => {
    for (final key in keys)
      if (key.purpose == KeyPurpose.publication &&
          key.status == KeyStatus.revoked)
        key.keyId,
  };
}
