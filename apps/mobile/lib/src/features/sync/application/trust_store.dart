import 'dart:convert';

import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/security/trusted_keys.dart';
import 'package:etare_ops/src/data/local/daos/trust_dao.dart';
import 'package:etare_ops/src/features/sync/application/package_verification.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:etare_ops/src/features/sync/domain/keyset.dart';
import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:etare_ops/src/features/sync/domain/signed_content.dart';
import 'package:flutter/foundation.dart';

/// Ce qu'a changé l'acceptation d'un jeu de clés.
@immutable
final class KeysetChange {
  const KeysetChange({
    required this.sequence,
    required this.updated,
    this.newlyRevokedPublicationKeys = const {},
  });

  final int sequence;

  /// False : le même jeu était déjà retenu.
  final bool updated;

  /// Clés de publication révoquées par ce jeu et pas par le précédent.
  final Set<String> newlyRevokedPublicationKeys;
}

/// Clés auxquelles la tablette fait confiance (SEC-04, ADR-027).
///
/// La clé racine de la configuration vérifie le jeu de clés lu avant chaque
/// catalogue ; le jeu retenu est conservé, revérifié à chaque lecture, et
/// jamais remplacé par un jeu de numéro inférieur (rejeu d'un jeu où une clé
/// aujourd'hui révoquée était active). Sans jeu retenu, ce sont les clés de
/// la configuration qui valent (premier contact, serveur sans jeu).
final class TrustStore {
  TrustStore({
    required this._embedded,
    required this._dao,
    this._clock = DateTime.now,
  });

  static const _logger = AppLogger('trust');

  final TrustedKeys _embedded;
  final TrustDao _dao;
  final DateTime Function() _clock;

  /// Dernier jeu vérifié, par texte (évite de revérifier à chaque lecture).
  (String, Keyset)? _cache;

  /// La configuration embarque une clé racine : les jeux de clés sont lus.
  bool get verifiesKeysets => _embedded.roots.isNotEmpty;

  /// Clés reconnues maintenant : les racines de la configuration et le jeu
  /// retenu, ou les clés de la configuration s'il n'y en a pas.
  Future<TrustedKeys> current() async {
    final keyset = await _retained();
    if (keyset == null) return _embedded;
    return TrustedKeys(List.unmodifiable([..._embedded.roots, ...keyset.keys]));
  }

  /// Numéro du jeu retenu (déclaré dans les accusés), null sans jeu.
  Future<int?> sequence() async => (await _retained())?.sequence;

  /// Vérifie et retient un jeu reçu ; lève [SyncIntegrityException] s'il est
  /// faux, plus ancien que le jeu retenu ou en conflit avec lui.
  Future<KeysetChange> accept(SignedPayload signed) async {
    final valid = await _signedByRoot(signed.text, signed.signature);
    if (!valid) throw const SyncIntegrityException('KEYSET_SIGNATURE_INVALID');
    final keyset = _parse(signed.text);
    final row = await _dao.read();
    if (row != null) {
      if (keyset.sequence < row.sequence) {
        throw const SyncIntegrityException('KEYSET_REPLAYED');
      }
      if (keyset.sequence == row.sequence) {
        if (row.keysetText == signed.text) {
          return KeysetChange(sequence: keyset.sequence, updated: false);
        }
        throw const SyncIntegrityException('KEYSET_CONFLICT');
      }
    }
    final previous = await _retained();
    await _dao.save(
      sequence: keyset.sequence,
      keysetText: signed.text,
      rootKeyId: signed.signature.keyId,
      signature: signed.signature.signature,
      receivedAt: _clock().toUtc(),
    );
    _cache = (signed.text, keyset);
    _logger.info('Jeu de clés n° ${keyset.sequence} retenu.');
    return KeysetChange(
      sequence: keyset.sequence,
      updated: true,
      newlyRevokedPublicationKeys: keyset.revokedPublicationKeys.difference(
        previous?.revokedPublicationKeys ?? const {},
      ),
    );
  }

  Future<Keyset?> _retained() async {
    final row = await _dao.read();
    if (row == null) return null;
    final cached = _cache;
    if (cached != null && cached.$1 == row.keysetText) return cached.$2;
    final envelope = SignatureEnvelope(
      algorithm: 'Ed25519',
      keyId: row.rootKeyId,
      signature: row.signature,
    );
    if (!await _signedByRoot(row.keysetText, envelope)) {
      // Racine changée par une nouvelle version de l'application, ou base
      // altérée : le jeu n'est plus suivi (son numéro reste la référence).
      _logger.warning('Jeu de clés local non vérifié par la racine : ignoré.');
      return null;
    }
    try {
      final keyset = _parse(row.keysetText);
      _cache = (row.keysetText, keyset);
      return keyset;
    } on SyncIntegrityException {
      return null;
    }
  }

  Future<bool> _signedByRoot(String text, SignatureEnvelope signature) =>
      verifyServerSignature(
        trustedKeys: TrustedKeys(_embedded.roots),
        purpose: KeyPurpose.root,
        envelope: signature,
        text: signedText(SignatureContexts.keyset, text),
      );

  static Keyset _parse(String text) {
    try {
      return Keyset.fromJson(asJsonMap(jsonDecode(text)));
    } on NewerFormatException {
      throw const SyncIntegrityException(appUpdateRequiredCode);
    } on FormatException {
      throw const SyncIntegrityException('KEYSET_INVALID');
    }
  }
}
