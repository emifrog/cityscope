import 'dart:io';

import 'package:drift/native.dart';
import 'package:etare_ops/src/core/storage/secure_store.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/encrypted_database.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqlite3/sqlite3.dart';

import '../../support/fakes.dart';

/// Ces tests s'exécutent sur l'hôte avec la MÊME bibliothèque que l'appareil
/// (SQLCipher, sélectionnée par `hooks.user_defines` dans pubspec.yaml).
void main() {
  late Directory tempDir;
  late InMemorySecureStore store;

  setUp(() {
    tempDir = Directory.systemTemp.createTempSync('etare_db_test_');
    store = InMemorySecureStore();
  });

  tearDown(() async {
    if (tempDir.existsSync()) await tempDir.delete(recursive: true);
  });

  Future<AppDatabase> open() => openEncryptedAppDatabase(
    secureStore: store,
    directory: () async => tempDir,
    tempDirectoryPath: () async => null,
  );

  File dbFile() => File(p.join(tempDir.path, databaseFileName));

  test('la bibliothèque SQLite chargée est bien SQLCipher', () async {
    final database = AppDatabase(NativeDatabase.memory());
    addTearDown(database.close);

    expect(await database.cipherVersion(), isNotNull);
  });

  test('DatabaseKeyStore génère 32 octets aléatoires en hexadécimal', () async {
    final keys = DatabaseKeyStore(store);

    final first = await keys.createKey();

    expect(first, matches(RegExp(r'^[0-9a-f]{64}$')));
    expect(await keys.readKey(), first);
    expect(store.values[SecureStorageKeys.databaseKey], first);
    expect(
      await DatabaseKeyStore(InMemorySecureStore()).createKey(),
      isNot(first),
    );
  });

  test('sqlCipherSetup refuse une clé mal formée (anti-injection)', () {
    expect(() => sqlCipherSetup("abc'; DROP TABLE x; --"), throwsArgumentError);
  });

  test(
    'crée une base chiffrée, illisible sans la clé, relisible avec',
    () async {
      final database = await open();
      await database.localMetaDao.writeValue('marker', 'valeur-secrète');
      await database.close();

      // En-tête chiffré : pas de signature SQLite en clair.
      final header = dbFile().readAsBytesSync().take(15).toList();
      expect(String.fromCharCodes(header), isNot('SQLite format 3'));

      // Ouverture sans clé : SQLITE_NOTADB.
      final raw = sqlite3.open(dbFile().path);
      addTearDown(raw.close);
      expect(
        () => raw.select('SELECT count(*) FROM sqlite_master'),
        throwsA(isA<SqliteException>()),
      );

      // Réouverture avec la clé du stockage sécurisé.
      final reopened = await open();
      addTearDown(reopened.close);
      expect(await reopened.localMetaDao.readValue('marker'), 'valeur-secrète');
    },
  );

  test(
    'clé perdue : la base orpheline est recréée (cache re-téléchargeable)',
    () async {
      final database = await open();
      await database.localMetaDao.writeValue('marker', 'ancien');
      await database.close();

      store.values.remove(SecureStorageKeys.databaseKey);
      final recreated = await open();
      addTearDown(recreated.close);

      expect(await recreated.localMetaDao.readValue('marker'), isNull);
      expect(store.values[SecureStorageKeys.databaseKey], isNotNull);
    },
  );

  test('clé erronée : SQLITE_NOTADB détecté puis base recréée', () async {
    final database = await open();
    await database.localMetaDao.writeValue('marker', 'ancien');
    await database.close();

    store.values[SecureStorageKeys.databaseKey] = 'ab' * 32;
    final recreated = await open();
    addTearDown(recreated.close);

    expect(await recreated.localMetaDao.readValue('marker'), isNull);
    expect((await recreated.syncStateDao.read()).status, 'never');
  });
}
