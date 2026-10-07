import 'dart:io';

import 'package:drift/isolate.dart' show DriftRemoteException;
import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/platform/platform_services.dart';
import 'package:sqlite3/common.dart' show SqliteException;

/// Place insuffisante sur la tablette pour un téléchargement : rien n'est
/// commencé, ce qui est installé reste consultable (CAP-02).
final class StorageInsufficientException implements Exception {
  const StorageInsufficientException({
    required this.neededBytes,
    required this.availableBytes,
  });

  final int neededBytes;
  final int availableBytes;

  /// Code remonté dans l'accusé de synchronisation.
  static const code = 'STORAGE_INSUFFICIENT';

  String get message =>
      'Stockage de la tablette insuffisant : environ '
      '${formatBytesFr(neededBytes)} nécessaires, '
      '${formatBytesFr(availableBytes)} libres. Libérez de la place '
      '(documents téléchargés, autres applications), puis synchronisez.';

  @override
  String toString() =>
      'StorageInsufficientException($neededBytes > $availableBytes)';
}

/// Code remonté quand l'écriture a échoué faute de place.
const storageFullCode = 'STORAGE_FULL';

/// Message d'un stockage plein en cours d'écriture.
const storageFullMessage =
    'Stockage de la tablette plein : le téléchargement s’est arrêté et '
    'reprendra là où il en était. Libérez de la place, puis synchronisez.';

/// L'erreur vient d'un disque plein : `SQLITE_FULL` de la base chiffrée ou
/// `ENOSPC` du système de fichiers (fonds de carte).
bool isStorageFull(Object error) {
  final cause = error is DriftRemoteException ? error.remoteCause : error;
  return switch (cause) {
    SqliteException(:final resultCode) => resultCode == _sqliteFull,
    FileSystemException(:final osError?) => osError.errorCode == _enospc,
    _ => false,
  };
}

const _sqliteFull = 13;
const _enospc = 28;

/// Contrôle de l'espace libre avant un téléchargement (CAP-02) : la place
/// demandée, plus 10 % (pages et journal de la base chiffrée) et une marge
/// fixe laissée au système. Sans mesure possible (iOS, tests), rien n'est
/// bloqué : l'écriture signalera un disque plein.
class StorageGuard {
  StorageGuard({required this._platform, required this._directory});

  final PlatformServices _platform;
  final Future<Directory> Function() _directory;

  /// Marge laissée libre en plus de chaque téléchargement.
  static const marginBytes = 64 * 1024 * 1024;

  /// Place réellement demandée pour ranger [bytes].
  static int neededFor(int bytes) => bytes + bytes ~/ 10 + marginBytes;

  /// Lève [StorageInsufficientException] si [bytes] ne tiennent pas.
  /// [reusable] : place libre dans la base chiffrée elle-même (fichiers
  /// effacés), que le système ne compte pas.
  Future<void> ensure(int bytes, {int reusable = 0}) async {
    if (bytes <= 0) return;
    final measured = await _platform.availableBytes((await _directory()).path);
    if (measured == null) return;
    final available = measured + reusable;
    final needed = neededFor(bytes);
    if (available < needed) {
      throw StorageInsufficientException(
        neededBytes: needed,
        availableBytes: available,
      );
    }
  }
}
