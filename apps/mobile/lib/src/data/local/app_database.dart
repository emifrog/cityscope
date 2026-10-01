import 'package:drift/drift.dart';
import 'package:etare_ops/src/data/local/daos/local_meta_dao.dart';
import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/data/local/daos/sync_state_dao.dart';
import 'package:etare_ops/src/data/local/tables.dart';

part 'app_database.g.dart';

/// Base locale de l'application OPS (Drift + SQLCipher).
///
/// Le constructeur accepte n'importe quel [QueryExecutor] : l'application
/// passe une connexion chiffrée (`openEncryptedAppDatabase`), les tests une
/// base en mémoire (`NativeDatabase.memory()`).
@DriftDatabase(
  tables: [
    LocalMeta,
    SyncState,
    InstalledPublications,
    PublicationFiles,
    FileBlobs,
    SiteData,
    SiteSearch,
  ],
  daos: [LocalMetaDao, SyncStateDao, OfflineDao],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  /// Incrémenter à chaque évolution du schéma, puis :
  /// `dart run drift_dev make-migrations` (instantané + tests générés).
  static const currentSchemaVersion = 2;

  @override
  int get schemaVersion => currentSchemaVersion;

  /// Étapes de migration indexées par version CIBLE.
  static const Map<int, Future<void> Function(Migrator m, AppDatabase db)>
  _migrationSteps = {2: _migrateToV2};

  /// v2 (Sprint 4) : contenu hors ligne installé et état de synchronisation
  /// complet (génération acceptée, autorisation locale, dernière erreur).
  static Future<void> _migrateToV2(Migrator m, AppDatabase db) async {
    for (final column in [
      db.syncState.catalogGeneration,
      db.syncState.lastAttemptAt,
      db.syncState.lastError,
      db.syncState.serverTime,
      db.syncState.authorizedUserId,
      db.syncState.authorizationExpiresAt,
      db.syncState.receiptPending,
    ]) {
      await m.addColumn(db.syncState, column);
    }
    await m.createTable(db.installedPublications);
    await m.createTable(db.publicationFiles);
    await m.createTable(db.fileBlobs);
    await m.createTable(db.siteData);
    await m.createTable(db.siteSearch);
  }

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) => m.createAll(),
    onUpgrade: (m, from, to) async {
      if (to < from) {
        throw StateError(
          'Rétrogradation du schéma local non supportée (v$from → v$to).',
        );
      }
      // Migrations pas à pas : chaque version cible a son étape explicite.
      // Une étape manquante est une erreur de développement, jamais un cas à
      // ignorer silencieusement.
      for (var target = from + 1; target <= to; target++) {
        final step = _migrationSteps[target];
        if (step == null) {
          throw StateError(
            'Migration du schéma local vers v$target non implémentée.',
          );
        }
        await step(m, this);
      }
    },
    beforeOpen: (details) async {
      await customStatement('PRAGMA foreign_keys = ON');
      // Garantit l'existence de la ligne unique de `sync_state`.
      await into(syncState).insert(
        const SyncStateCompanion(id: Value(SyncState.singletonId)),
        mode: InsertMode.insertOrIgnore,
      );
    },
  );

  /// Version de SQLCipher liée, ou `null` si la bibliothèque SQLite chargée
  /// n'est pas SQLCipher.
  Future<String?> cipherVersion() async {
    final row = await customSelect('PRAGMA cipher_version').getSingleOrNull();
    final version = row?.data.values.firstOrNull;
    return version is String && version.isNotEmpty ? version : null;
  }
}
