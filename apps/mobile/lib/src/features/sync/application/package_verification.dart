import 'dart:convert';

import 'package:etare_ops/src/core/config/app_info.dart';
import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/core/security/trusted_keys.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:etare_ops/src/features/sync/domain/signed_content.dart';
import 'package:flutter/foundation.dart';

/// Contenu refusé à la vérification : il n'est jamais installé.
final class SyncIntegrityException implements Exception {
  const SyncIntegrityException(this.code);

  /// Code stable remonté dans l'accusé (ex. MANIFEST_SIGNATURE_INVALID).
  final String code;

  @override
  String toString() => 'SyncIntegrityException($code)';
}

/// Paquet ou lecteur trop récent pour cette application (SYN-02).
const readerTooOldCode = 'READER_TOO_OLD';

/// Paquet dont la signature, le manifeste et le fichier de données ont été
/// vérifiés contre l'entrée du catalogue signé.
@immutable
final class VerifiedPackage {
  const VerifiedPackage({required this.manifest, required this.dataBytes});

  final PublicationManifest manifest;
  final Uint8List dataBytes;
}

/// Vérifie un paquet reçu pour [entry] : manifeste signé par la clé de
/// publication, empreinte annoncée par le catalogue, SIS, site et version,
/// version de lecteur, fichier de données identique au manifeste. Partagé
/// par la synchronisation et l'ouverture à la demande des sites sensibles.
Future<VerifiedPackage> verifyPackage({
  required TrustedKeys trustedKeys,
  required PackagePayload package,
  required CatalogEntry entry,
  required String tenantId,
}) async {
  final signatureValid = await verifyServerSignature(
    trustedKeys: trustedKeys,
    purpose: KeyPurpose.publication,
    envelope: package.signature,
    text: signedText(SignatureContexts.manifest, package.manifest),
  );
  if (!signatureValid) {
    throw const SyncIntegrityException('MANIFEST_SIGNATURE_INVALID');
  }
  if (sha256OfText(package.manifest) != entry.manifestHash) {
    throw const SyncIntegrityException('MANIFEST_HASH_MISMATCH');
  }
  final PublicationManifest manifest;
  try {
    manifest = PublicationManifest.fromJson(
      asJsonMap(jsonDecode(package.manifest)),
    );
  } on NewerFormatException {
    throw const SyncIntegrityException(readerTooOldCode);
  } on FormatException {
    throw const SyncIntegrityException('MANIFEST_INVALID');
  }
  if (manifest.tenantId != tenantId ||
      manifest.siteId != entry.siteId ||
      manifest.publicationId != entry.publicationId) {
    throw const SyncIntegrityException('MANIFEST_MISMATCH');
  }
  if (compareVersions(manifest.minReaderVersion, AppInfo.readerVersion) > 0) {
    throw const SyncIntegrityException(readerTooOldCode);
  }
  final dataBytes = utf8.encode(package.data);
  if (sha256Hex(dataBytes) != manifest.data.sha256 ||
      dataBytes.length != manifest.data.sizeBytes) {
    throw const SyncIntegrityException('DATA_HASH_MISMATCH');
  }
  return VerifiedPackage(manifest: manifest, dataBytes: dataBytes);
}
