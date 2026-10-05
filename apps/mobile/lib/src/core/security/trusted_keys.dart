import 'dart:convert';

import 'package:flutter/foundation.dart';

/// Usage d'une clé serveur (ADR-015, ADR-027) : la clé de publication signe
/// les manifestes (worker), la clé de catalogue signe les catalogues (API), la
/// clé racine, gardée hors ligne, signe les jeux de clés. Une signature n'est
/// acceptée que par une clé de l'usage attendu.
enum KeyPurpose { publication, catalog, root }

/// Statut d'une clé dans le jeu de clés (SEC-04, ADR-027).
enum KeyStatus {
  /// Signe, et est reconnue.
  active,

  /// Ne signe plus : ce qu'elle a signé auparavant (publications, fonds) reste
  /// reconnu, jamais un catalogue (signé à chaque contact).
  retired,

  /// Compromise ou abandonnée : rien de ce qu'elle a signé n'est reconnu.
  revoked,
}

/// Clé publique Ed25519 approuvée : embarquée dans la configuration, ou lue
/// dans un jeu de clés vérifié par la clé racine.
@immutable
final class TrustedKey {
  const TrustedKey({
    required this.purpose,
    required this.keyId,
    required this.publicKey,
    this.status = KeyStatus.active,
  });

  final KeyPurpose purpose;
  final String keyId;
  final KeyStatus status;

  /// Clé publique brute (32 octets).
  final List<int> publicKey;
}

/// Ensemble des clés publiques approuvées. Celles de la configuration sont
/// lues depuis
/// `--dart-define=TRUSTED_SIGNING_KEYS=root:<id>:<base64>;publication:<id>:<base64>;catalog:<id>:<base64>`.
///
/// Rotation (ADR-027) : la clé racine signe un jeu de clés que la tablette lit
/// avant son catalogue ; les clés de publication et de catalogue de la
/// configuration ne servent qu'au premier contact.
@immutable
final class TrustedKeys {
  const TrustedKeys(this.keys);

  static const empty = TrustedKeys([]);

  static final _keyIdPattern = RegExp(r'^[A-Za-z0-9._-]{1,64}$');

  final List<TrustedKey> keys;

  /// Une clé ACTIVE de cet usage est connue.
  bool has(KeyPurpose purpose) => keys.any(
    (key) => key.purpose == purpose && key.status == KeyStatus.active,
  );

  /// Clés racine de la configuration (vérification des jeux de clés).
  List<TrustedKey> get roots => [
    for (final key in keys)
      if (key.purpose == KeyPurpose.root) key,
  ];

  /// Clé de cet identifiant ET de cet usage, si elle est reconnue pour
  /// vérifier une signature : active, ou retirée pour une publication.
  TrustedKey? find(String keyId, KeyPurpose purpose) => keys
      .where(
        (key) =>
            key.keyId == keyId &&
            key.purpose == purpose &&
            (key.status == KeyStatus.active ||
                (key.status == KeyStatus.retired &&
                    purpose == KeyPurpose.publication)),
      )
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
        throw FormatException('« ${parts[0]} » : root, publication ou catalog');
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
