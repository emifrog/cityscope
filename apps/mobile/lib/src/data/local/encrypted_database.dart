import 'dart:io';
import 'dart:math';

import 'package:drift/isolate.dart' show DriftRemoteException;
import 'package:drift_flutter/drift_flutter.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/common.dart';

/// Nom du fichier de base dans le répertoire privé de l'application.
const databaseFileName = 'etare_ops.sqlite';

/// Longueur de la clé brute SQLCipher (256 bits).
const databaseKeyLength = 32;

const _logger = AppLogger('database');
final _hexKeyPattern = RegExp(r'^[0-9a-f]{64}$');

/// Levée quand la bibliothèque SQLite chargée n'est pas SQLCipher : la base
/// ne serait PAS chiffrée, l'application refuse donc de démarrer.
final class DatabaseEncryptionUnavailable implements Exception {
  const DatabaseEncryptionUnavailable(this.message);

  final String message;

  @override
  String toString() => 'DatabaseEncryptionUnavailable: $message';
}

/// Gestion de la clé de chiffrement de la base, conservée dans le stockage
/// sécurisé (Keystore / Keychain), jamais sur disque en clair.
final class DatabaseKeyStore {
  DatabaseKeyStore(this._store, {Random? random})
    : _random = random ?? Random.secure();

  final SecureStore _store;
  final Random _random;

  /// Clé existante (hexadécimal, 64 caractères) ou `null`.
  Future<String?> readKey() async {
    final key = await _store.read(SecureStorageKeys.databaseKey);
    if (key == null) return null;
    if (!_hexKeyPattern.hasMatch(key)) {
      throw const FormatException('Clé de base locale corrompue');
    }
    return key;
  }

  /// Génère 32 octets aléatoires (générateur cryptographique), les persiste
  /// et renvoie leur représentation hexadécimale.
  Future<String> createKey() async {
    final buffer = StringBuffer();
    for (var i = 0; i < databaseKeyLength; i++) {
      buffer.write(_random.nextInt(256).toRadixString(16).padLeft(2, '0'));
    }
    final key = buffer.toString();
    await _store.write(SecureStorageKeys.databaseKey, key);
    return key;
  }
}

/// Construit la fonction de configuration exécutée à CHAQUE ouverture de
/// connexion (dans l'isolat de la base) :
/// 1. `PRAGMA key` en toute première instruction ;
/// 2. vérification que SQLCipher est bien actif (`PRAGMA cipher_version`) ;
/// 3. lecture de `sqlite_master` pour valider la clé immédiatement.
///
/// La fonction renvoyée ne capture que [hexKey] (chaîne transférable entre
/// isolats), condition imposée par drift.
void Function(CommonDatabase) sqlCipherSetup(String hexKey) {
  if (!_hexKeyPattern.hasMatch(hexKey)) {
    // Jamais de concaténation d'une valeur non contrôlée dans un PRAGMA.
    throw ArgumentError('Clé SQLCipher invalide (64 caractères hex attendus)');
  }
  return (database) {
    // Clé brute (x'…') : pas de dérivation PBKDF2, la clé est déjà aléatoire.
    database.execute("PRAGMA key = \"x'$hexKey'\";");
    final rows = database.select('PRAGMA cipher_version;');
    final version = rows.isEmpty ? null : rows.first.columnAt(0);
    if (version is! String || version.isEmpty) {
      throw const DatabaseEncryptionUnavailable(
        'SQLCipher inactif : la bibliothèque SQLite chargée ne chiffre pas. '
        'Vérifiez `hooks.user_defines.sqlite3.source: sqlcipher`.',
      );
    }
    database.select('SELECT count(*) FROM sqlite_master;');
  };
}

/// Ouvre (ou crée) la base locale chiffrée.
///
/// Politique de récupération : la base locale n'est qu'une copie
/// re-téléchargeable des données publiées. Si la clé a disparu du stockage
/// sécurisé (réinstallation, restauration, reset du Keystore) ou si le
/// fichier est illisible avec la clé connue, le fichier est supprimé puis
/// recréé. En revanche, l'absence de SQLCipher est TOUJOURS fatale.
///
/// [directory] et [tempDirectoryPath] ne sont surchargés que par les tests.
Future<AppDatabase> openEncryptedAppDatabase({
  required SecureStore secureStore,
  Future<Directory> Function() directory = getApplicationSupportDirectory,
  Future<String?> Function()? tempDirectoryPath,
}) async {
  final dir = await directory();
  final file = File(p.join(dir.path, databaseFileName));
  final keys = DatabaseKeyStore(secureStore);

  String? hexKey;
  try {
    hexKey = await keys.readKey();
  } on FormatException {
    _logger.warning('Clé de base corrompue : régénération.');
  }
  if (hexKey == null) {
    await _deleteDatabaseFiles(file);
    hexKey = await keys.createKey();
  }

  try {
    return await _openAndVerify(file, hexKey, tempDirectoryPath);
  } on Object catch (error) {
    // SQLITE_NOTADB (26) : fichier chiffré avec une autre clé ou corrompu.
    final cause = unwrapDatabaseError(error);
    if (cause is! SqliteException || cause.resultCode != _sqliteNotADb) {
      rethrow;
    }
    _logger.warning('Base locale illisible avec la clé connue : recréation.');
    await _deleteDatabaseFiles(file);
    return _openAndVerify(file, hexKey, tempDirectoryPath);
  }
}

const _sqliteNotADb = 26;

/// Les erreurs levées dans l'isolat de la base arrivent enveloppées dans une
/// [DriftRemoteException] : renvoie la cause d'origine.
Object unwrapDatabaseError(Object error) =>
    error is DriftRemoteException ? error.remoteCause : error;

Future<AppDatabase> _openAndVerify(
  File file,
  String hexKey,
  Future<String?> Function()? tempDirectoryPath,
) async {
  final database = AppDatabase(
    driftDatabase(
      name: p.basenameWithoutExtension(file.path),
      native: DriftNativeOptions(
        databasePath: () async => file.path,
        tempDirectoryPath: tempDirectoryPath,
        setup: sqlCipherSetup(hexKey),
      ),
    ),
  );
  try {
    // Première requête : déclenche l'ouverture, le `setup` et les migrations.
    final version = await database.cipherVersion();
    if (version == null) {
      throw const DatabaseEncryptionUnavailable('PRAGMA cipher_version vide');
    }
    _logger.info('Base locale ouverte (SQLCipher $version).');
    return database;
  } on Object {
    await database.close();
    rethrow;
  }
}

Future<void> _deleteDatabaseFiles(File file) async {
  for (final suffix in const ['', '-wal', '-shm', '-journal']) {
    final candidate = File('${file.path}$suffix');
    if (candidate.existsSync()) {
      await candidate.delete();
    }
  }
}
