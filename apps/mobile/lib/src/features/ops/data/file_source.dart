import 'dart:typed_data';

/// Contenu d'un fichier installé, lu par plages (PDF, CAP-02) : le lecteur ne
/// demande que les octets des pages qu'il affiche.
sealed class FileSource {
  /// Taille du fichier en octets.
  int get length;

  /// Copie dans [buffer] au plus [size] octets à partir de [position] ; rend
  /// le nombre d'octets copiés (0 en fin de fichier).
  Future<int> read(Uint8List buffer, int position, int size);
}

/// Fichier déjà en mémoire : site sensible déchiffré, ou fichier rangé avant
/// CAP-02 (contenu entier).
final class MemorySource implements FileSource {
  MemorySource(this._bytes);

  final Uint8List _bytes;

  @override
  int get length => _bytes.length;

  @override
  Future<int> read(Uint8List buffer, int position, int size) async {
    if (position >= _bytes.length) return 0;
    final end = position + size < _bytes.length
        ? position + size
        : _bytes.length;
    buffer.setRange(0, end - position, _bytes, position);
    return end - position;
  }
}

/// Fichier rangé par morceaux dans la base chiffrée : seuls les derniers
/// morceaux lus restent en mémoire, quelle que soit la taille du fichier.
final class ChunkedSource implements FileSource {
  ChunkedSource({
    required this.length,
    required this._chunk,
    this._cachedChunks = 4,
  });

  @override
  final int length;

  /// Lit le morceau d'indice donné dans la base chiffrée.
  final Future<Uint8List> Function(int index) _chunk;

  /// Morceaux gardés en mémoire au plus.
  final int _cachedChunks;

  /// Morceaux récents, du plus ancien au plus récent.
  final _cache = <int, Uint8List>{};

  /// Taille des morceaux, lue sur le premier (tous l'ont, sauf le dernier).
  int? _chunkSize;

  Future<Uint8List> _chunkAt(int index) async {
    final hit = _cache.remove(index);
    if (hit != null) return _cache[index] = hit;
    final loaded = await _chunk(index);
    _cache[index] = loaded;
    if (_cache.length > _cachedChunks) _cache.remove(_cache.keys.first);
    return loaded;
  }

  @override
  Future<int> read(Uint8List buffer, int position, int size) async {
    if (position >= length || size <= 0) return 0;
    final end = position + size < length ? position + size : length;
    final chunkSize = _chunkSize ??= (await _chunkAt(0)).length;
    var copied = 0;
    while (position + copied < end) {
      final offset = position + copied;
      final chunk = await _chunkAt(offset ~/ chunkSize);
      final start = offset % chunkSize;
      final available = chunk.length - start;
      if (available <= 0) {
        throw StateError(
          'Morceau ${offset ~/ chunkSize} plus court qu’annoncé.',
        );
      }
      final take = end - offset < available ? end - offset : available;
      buffer.setRange(copied, copied + take, chunk, start);
      copied += take;
    }
    return copied;
  }
}
