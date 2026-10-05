import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;
import 'package:etare_ops/src/features/basemaps/domain/basemap_models.dart';
import 'package:path/path.dart' as p;

/// Dossier des fonds de carte (ADR-024) : donnée publique, hors de la base
/// chiffrée, lue par plage par le moteur de carte. Un fond en cours de
/// téléchargement vit dans `.incoming/<fond>/` : ses parties vérifiées sont
/// ajoutées au fichier partiel, et un téléchargement interrompu reprend à la
/// partie suivante. Le dossier final n'apparaît qu'une fois tout vérifié.
final class BasemapStore {
  BasemapStore(this._root);

  /// Dossier de l'application qui accueille `basemaps/`.
  final Future<Directory> Function() _root;

  Future<Directory> _base() async {
    final directory = Directory(p.join((await _root()).path, 'basemaps'));
    await directory.create(recursive: true);
    return directory;
  }

  /// Dossier d'un fond installé (il n'existe qu'une fois le fond complet).
  Future<Directory> directoryOf(String packId) async =>
      Directory(p.join((await _base()).path, packId));

  /// Téléchargement d'un fond, repris là où il s'était arrêté s'il s'agit du
  /// même manifeste ; recommencé sinon.
  Future<IncomingBasemap> incoming(String packId, String manifestHash) async {
    final directory = Directory(
      p.join((await _base()).path, '.incoming', packId),
    );
    final progress = File(p.join(directory.path, _progressFile));
    if (await progress.exists()) {
      try {
        final json = jsonDecode(await progress.readAsString());
        if (json
            case {
              'manifest_hash': final String hash,
              'parts': final int parts,
              'length': final int length,
            }
            when hash == manifestHash) {
          return IncomingBasemap._(directory, manifestHash, parts, length);
        }
      } on FormatException {
        // Progression illisible : on recommence.
      }
    }
    if (await directory.exists()) await directory.delete(recursive: true);
    await directory.create(recursive: true);
    final incoming = IncomingBasemap._(directory, manifestHash, 0, 0);
    await incoming._saveProgress();
    return incoming;
  }

  /// Retire un fond installé et son éventuel téléchargement en cours.
  Future<void> remove(String packId) async {
    final base = await _base();
    for (final path in [
      p.join(base.path, packId),
      p.join(base.path, '.incoming', packId),
    ]) {
      final directory = Directory(path);
      if (await directory.exists()) await directory.delete(recursive: true);
    }
  }

  /// Abandonne les téléchargements de fonds que le catalogue ne demande plus.
  Future<void> discardIncoming({required Set<String> except}) async {
    final directory = Directory(p.join((await _base()).path, '.incoming'));
    if (!await directory.exists()) return;
    await for (final entry in directory.list()) {
      if (entry is Directory && !except.contains(p.basename(entry.path))) {
        await entry.delete(recursive: true);
      }
    }
  }

  /// Retire les dossiers de fonds qui ne correspondent à aucun fond installé
  /// (installation interrompue entre le dossier et la base).
  Future<void> discardOrphans({required Set<String> installed}) async {
    final base = await _base();
    await for (final entry in base.list()) {
      final name = p.basename(entry.path);
      if (entry is Directory &&
          name != '.incoming' &&
          !installed.contains(name)) {
        await entry.delete(recursive: true);
      }
    }
  }

  /// Révocation : tous les fonds sont effacés.
  Future<void> purgeAll() async {
    final base = await _base();
    if (await base.exists()) await base.delete(recursive: true);
  }

  static const _progressFile = 'progress.json';
}

final class _DigestSink implements Sink<crypto.Digest> {
  crypto.Digest? value;

  @override
  void add(crypto.Digest data) => value = data;

  @override
  void close() {}
}

/// Fond en cours de téléchargement.
final class IncomingBasemap {
  IncomingBasemap._(
    this.directory,
    this._manifestHash,
    this._completedParts,
    this._partialLength,
  );

  final Directory directory;
  final String _manifestHash;
  int _completedParts;
  int _partialLength;

  /// Parties du fichier des tuiles déjà vérifiées et écrites.
  int get completedParts => _completedParts;

  /// Octets du fichier des tuiles déjà écrits.
  int get partialLength => _partialLength;

  File get _partial =>
      File(p.join(directory.path, '$basemapTilesFile.partial'));

  Future<void> _saveProgress() async {
    final progress = File(p.join(directory.path, BasemapStore._progressFile));
    final temporary = File('${progress.path}.tmp');
    await temporary.writeAsString(
      jsonEncode({
        'manifest_hash': _manifestHash,
        'parts': _completedParts,
        'length': _partialLength,
      }),
      flush: true,
    );
    await temporary.rename(progress.path);
  }

  /// Ajoute une partie vérifiée du fichier des tuiles. Ce qui dépasse la
  /// longueur enregistrée (écriture interrompue) est d'abord tronqué.
  Future<void> appendPart(int index, List<int> bytes) async {
    if (index != _completedParts) {
      throw StateError('Partie $index attendue après $_completedParts.');
    }
    final file = await _partial.open(mode: FileMode.append);
    try {
      await file.truncate(_partialLength);
      await file.setPosition(_partialLength);
      await file.writeFrom(bytes);
      await file.flush();
    } finally {
      await file.close();
    }
    _completedParts++;
    _partialLength += bytes.length;
    await _saveProgress();
  }

  /// SHA-256 du fichier des tuiles reconstitué, lu par morceaux.
  Future<String> tilesSha256() async {
    final sink = _DigestSink();
    final input = crypto.sha256.startChunkedConversion(sink);
    await for (final chunk in _partial.openRead()) {
      input.add(chunk);
    }
    input.close();
    return '${sink.value}';
  }

  /// Écrit un petit fichier vérifié (style, pictogrammes).
  Future<void> writeFile(String path, List<int> bytes) async {
    if (!isSafeBasemapPath(path) || path == basemapTilesFile) {
      throw ArgumentError.value(path, 'path');
    }
    await File(p.join(directory.path, path)).writeAsBytes(bytes, flush: true);
  }

  /// Le fond complet devient le dossier [target] (remplacé s'il existe).
  Future<Directory> finalize(Directory target, String manifestText) async {
    await _partial.rename(p.join(directory.path, basemapTilesFile));
    await File(p.join(directory.path, 'manifest.json'))
        .writeAsString(manifestText, flush: true);
    await File(p.join(directory.path, BasemapStore._progressFile)).delete();
    if (await target.exists()) await target.delete(recursive: true);
    return directory.rename(target.path);
  }
}
