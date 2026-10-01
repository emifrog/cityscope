import 'dart:typed_data';

import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/ed25519_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';

/// Pourquoi un document « à la demande » n'a pas pu être enregistré.
enum DocumentDownloadFailure {
  /// Tablette non enrôlée (ou purgée) : aucune requête possible.
  notEnrolled(
    'Tablette non enrôlée : le document ne peut pas être téléchargé.',
  ),

  /// Le document n'est pas proposé par la version installée du site.
  notOffered(
    'Ce document n’est pas proposé sur la tablette pour la version '
    'installée : synchronisez la tablette.',
  ),

  /// Le serveur ne le distribue plus (une nouvelle version a été publiée).
  unavailable(
    'Ce document n’est plus distribué pour la version installée : '
    'synchronisez la tablette, puis réessayez.',
  ),

  /// Taille ou empreinte différente de celles du manifeste signé.
  corrupted('Fichier reçu altéré : il n’a pas été enregistré. Réessayez.');

  const DocumentDownloadFailure(this.message);

  final String message;
}

final class DocumentDownloadException implements Exception {
  const DocumentDownloadException(this.failure);

  final DocumentDownloadFailure failure;

  @override
  String toString() => 'DocumentDownloadException(${failure.name})';
}

/// Téléchargement explicite d'un document « à la demande » (DOC-02) : requête
/// signée par le terminal, fichier vérifié contre la taille et l'empreinte du
/// manifeste signé de la version installée, puis rangé dans la base chiffrée,
/// où il reste tant que cette version le référence (ou jusqu'à son retrait
/// par l'agent, ou la purge du terminal).
class DocumentDownloader {
  DocumentDownloader({
    required this._api,
    required this._offline,
    required this._identities,
    this._clock = DateTime.now,
  });

  final SyncApi _api;
  final OfflineDao _offline;
  final DeviceIdentityStore _identities;
  final DateTime Function() _clock;

  /// Lève [DocumentDownloadException], `ApiException` ou `NetworkException`.
  Future<void> download({
    required String siteId,
    required String sha256,
    void Function(int received, int total)? onProgress,
  }) async {
    final identity = await _identities.read();
    if (identity == null) {
      throw const DocumentDownloadException(
        DocumentDownloadFailure.notEnrolled,
      );
    }
    final site = await _offline.installedSite(siteId);
    final file = await _offline.installedFile(siteId, sha256);
    if (site == null || file == null || file.required) {
      throw const DocumentDownloadException(DocumentDownloadFailure.notOffered);
    }
    if ((await _offline.presentBlobs([sha256])).isNotEmpty) return;

    final device = DeviceCredentials(
      identity,
      await DeviceKey.fromSeed(identity.keySeed),
    );
    final urls = await _api.downloadUrls(device, site.publicationId, [sha256]);
    final url = urls[sha256];
    if (url == null) {
      throw const DocumentDownloadException(
        DocumentDownloadFailure.unavailable,
      );
    }
    final bytes = await _api.download(url, onProgress: onProgress);
    if (bytes.length != file.sizeBytes || sha256Hex(bytes) != sha256) {
      throw const DocumentDownloadException(DocumentDownloadFailure.corrupted);
    }
    final stored = await _offline.storeOnDemandBlob(
      sha256,
      Uint8List.fromList(bytes),
      _clock().toUtc(),
    );
    if (!stored) {
      throw const DocumentDownloadException(
        DocumentDownloadFailure.unavailable,
      );
    }
  }

  /// Libère la place d'un document téléchargé : il faudra le retélécharger.
  Future<bool> discard(String sha256) => _offline.discardOnDemandBlob(sha256);
}
