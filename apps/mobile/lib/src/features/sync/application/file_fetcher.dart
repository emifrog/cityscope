import 'dart:convert' show ByteConversionSink;
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';

/// Taille des morceaux rangés dans la base chiffrée (CAP-02) : la mémoire
/// tenue pendant un téléchargement ne dépend pas de la taille du fichier.
const fileChunkBytes = 1024 * 1024;

/// Fichier reçu différent de l'annoncé (taille ou empreinte) : rien n'en est
/// gardé.
final class FileMismatchException implements Exception {
  const FileMismatchException(this.sha256);

  final String sha256;

  @override
  String toString() => 'FileMismatchException($sha256)';
}

/// Téléchargement d'un fichier du stockage par morceaux (CAP-02) : chaque
/// morceau est rangé dans la base chiffrée dès qu'il est complet, l'empreinte
/// est calculée au fil de l'eau, et une coupure reprend au morceau suivant
/// (requête `Range`). Le fichier reste invisible (« en cours ») tant que
/// l'appelant ne l'a pas rendu utilisable, après vérification.
class FileFetcher {
  FileFetcher({
    required this._api,
    required this._offline,
    this._clock = DateTime.now,
    this._chunkBytes = fileChunkBytes,
  });

  static const _logger = AppLogger('files');

  final SyncApi _api;
  final OfflineDao _offline;
  final DateTime Function() _clock;
  final int _chunkBytes;

  /// Octets déjà reçus pour [sha256] (téléchargement interrompu).
  Future<int> resumable(String sha256) => _offline.receivedBytes(sha256);

  /// Télécharge et vérifie [sha256]. [url] donne l'URL signée ; `renew` :
  /// la précédente a été refusée (expirée pendant un long transfert), une
  /// seule fois. [onProgress] reçoit, pour chaque morceau du flux, les octets
  /// acquis et ceux venus du réseau (une reprise compte pour acquis).
  ///
  /// Lève [FileMismatchException], `NetworkException` (la suite reprendra),
  /// `ApiException`, ou l'erreur d'un disque plein.
  Future<void> fetch({
    required String sha256,
    required int sizeBytes,
    required Future<Uri> Function({required bool renew}) url,
    void Function(int done, int downloaded)? onProgress,
  }) async {
    var renew = false;
    while (true) {
      final digest = _Digest();
      var received = await _resume(sha256, sizeBytes, digest);
      if (received > 0) onProgress?.call(received, 0);
      if (received == sizeBytes && sizeBytes > 0) {
        return _verify(sha256, sizeBytes, received, digest);
      }
      final (int start, Stream<Uint8List> body) opened;
      try {
        opened = await _api.openDownload(
          await url(renew: renew),
          from: received,
        );
      } on ApiException {
        if (renew) rethrow;
        renew = true;
        continue;
      }
      final (start, body) = opened;
      if (start != received) {
        // Le stockage a ignoré la plage : tout est repris depuis le début.
        _logger.info('Reprise refusée par le stockage : fichier repris.');
        await _offline.discardFile(sha256);
        digest.restart();
        received = 0;
      }
      return _receive(sha256, sizeBytes, received, body, digest, onProgress);
    }
  }

  /// Morceaux déjà rangés, relus pour l'empreinte ; une reprise incohérente
  /// (morceaux d'une autre taille) est effacée.
  Future<int> _resume(String sha256, int sizeBytes, _Digest digest) async {
    final received = await _offline.receivedBytes(sha256);
    if (received == 0) return 0;
    var counted = 0;
    var consistent = received <= sizeBytes;
    await for (final chunk in _offline.receivedChunks(sha256)) {
      if (!consistent) break;
      final last = counted + chunk.length == sizeBytes;
      if (chunk.length != _chunkBytes && !last) consistent = false;
      digest.add(chunk);
      counted += chunk.length;
    }
    if (consistent && counted == received) return received;
    await _offline.discardFile(sha256);
    digest.restart();
    return 0;
  }

  Future<void> _receive(
    String sha256,
    int sizeBytes,
    int alreadyReceived,
    Stream<Uint8List> body,
    _Digest digest,
    void Function(int done, int downloaded)? onProgress,
  ) async {
    var received = alreadyReceived;
    var index = received ~/ _chunkBytes;
    final pending = BytesBuilder(copy: false);

    Future<void> store(Uint8List chunk) async {
      digest.add(chunk);
      received += chunk.length;
      await _offline.appendChunk(
        sha256,
        sizeBytes: sizeBytes,
        index: index++,
        content: chunk,
        receivedBytes: received,
        now: _clock().toUtc(),
      );
    }

    // `await for` suspend le flux pendant l'écriture d'un morceau : la
    // mémoire tenue reste bornée à un morceau et une lecture réseau.
    await for (final piece in body) {
      if (received + pending.length + piece.length > sizeBytes) {
        await _offline.discardFile(sha256);
        throw FileMismatchException(sha256);
      }
      pending.add(piece);
      onProgress?.call(piece.length, piece.length);
      while (pending.length >= _chunkBytes) {
        final all = pending.takeBytes();
        if (all.length > _chunkBytes) {
          pending.add(Uint8List.sublistView(all, _chunkBytes));
        }
        await store(Uint8List.sublistView(all, 0, _chunkBytes));
      }
    }
    // Dernier morceau, plus court ; un fichier vide a un morceau vide.
    if (pending.isNotEmpty || index == 0) await store(pending.takeBytes());
    await _verify(sha256, sizeBytes, received, digest);
  }

  Future<void> _verify(
    String sha256,
    int sizeBytes,
    int received,
    _Digest digest,
  ) async {
    if (received != sizeBytes || digest.close() != sha256) {
      await _offline.discardFile(sha256);
      throw FileMismatchException(sha256);
    }
  }
}

/// SHA-256 calculé morceau par morceau.
final class _Digest {
  _Digest() {
    restart();
  }

  final _result = _DigestResult();
  late ByteConversionSink _input;

  void restart() => _input = crypto.sha256.startChunkedConversion(_result);

  void add(List<int> bytes) => _input.add(bytes);

  String close() {
    _input.close();
    _result.close();
    return _result.value.toString();
  }
}

final class _DigestResult implements Sink<crypto.Digest> {
  crypto.Digest? value;

  @override
  void add(crypto.Digest data) => value = data;

  @override
  void close() {}
}
