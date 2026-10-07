import 'package:drift/drift.dart';
import 'package:etare_ops/src/data/local/app_database.steps.dart';
import 'package:etare_ops/src/data/local/daos/basemap_dao.dart';
import 'package:etare_ops/src/data/local/daos/local_meta_dao.dart';
import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/data/local/daos/reports_dao.dart';
import 'package:etare_ops/src/data/local/daos/sensitive_dao.dart';
import 'package:etare_ops/src/data/local/daos/sync_state_dao.dart';
import 'package:etare_ops/src/data/local/daos/trust_dao.dart';
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
    FieldReports,
    FieldReportPhotos,
    OnDemandSites,
    SensitiveSites,
    SensitiveFiles,
    AccessEventOutbox,
    InstalledBasemaps,
    TrustedKeysets,
    TrustedTime,
    FileChunks,
  ],
  daos: [
    LocalMetaDao,
    SyncStateDao,
    OfflineDao,
    ReportsDao,
    SensitiveDao,
    BasemapDao,
    TrustDao,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  /// Incrémenter à chaque évolution du schéma, puis :
  /// `dart run drift_dev make-migrations` (instantanés, tests générés et
  /// `app_database.steps.dart`, définitions de tables par version). Une étape
  /// qui crée une table modifiée plus tard prend sa définition versionnée.
  static const currentSchemaVersion = 10;

  @override
  int get schemaVersion => currentSchemaVersion;

  /// Étapes de migration indexées par version CIBLE.
  static const Map<int, Future<void> Function(Migrator m, AppDatabase db)>
  _migrationSteps = {
    2: _migrateToV2,
    3: _migrateToV3,
    4: _migrateToV4,
    5: _migrateToV5,
    6: _migrateToV6,
    7: _migrateToV7,
    8: _migrateToV8,
    9: _migrateToV9,
    10: _migrateToV10,
  };

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
    // Telle qu'en v2 : l'étape v10 lui ajoute ses colonnes de morceaux.
    await m.createTable(Schema2(database: db).fileBlob);
    await m.createTable(db.siteData);
    await m.createTable(db.siteSearch);
  }

  /// v3 (Sprint 5) : file chiffrée des signalements terrain et de leurs photos.
  static Future<void> _migrateToV3(Migrator m, AppDatabase db) async {
    await m.createTable(db.fieldReports);
    await m.createTable(db.fieldReportPhotos);
  }

  /// v4 (Sprint 6) : application trop ancienne pour le contenu reçu (SYN-02).
  static Future<void> _migrateToV4(Migrator m, AppDatabase db) async {
    await m.addColumn(db.syncState, db.syncState.requiredAppVersion);
  }

  /// v5 (Sprint 6) : bail de la synchronisation, partagé entre l'application
  /// et la tâche de fond Android (SYN-01).
  static Future<void> _migrateToV5(Migrator m, AppDatabase db) async {
    await m.addColumn(db.syncState, db.syncState.syncLeaseOwner);
    await m.addColumn(db.syncState, db.syncState.syncLeaseExpiresAt);
  }

  /// v6 (Sprint 10) : sites sensibles ouverts à la demande, chiffrés par le
  /// code de l'agent, et file de leurs consultations (PER-02).
  static Future<void> _migrateToV6(Migrator m, AppDatabase db) async {
    await m.createTable(db.onDemandSites);
    await m.createTable(db.sensitiveSites);
    await m.createTable(db.sensitiveFiles);
    await m.createTable(db.accessEventOutbox);
  }

  /// v7 (Sprint 11) : fonds de carte installés, un par secteur (ADR-024).
  /// La table telle qu'elle était en v7 (instantané généré par drift_dev) :
  /// l'étape v8 lui ajoute ensuite sa colonne.
  static Future<void> _migrateToV7(Migrator m, AppDatabase db) async {
    await m.createTable(Schema7(database: db).installedBasemaps);
  }

  /// v8 (Sprint 12) : jeu de clés de signature accepté, et clé qui a signé
  /// chaque fond installé (rotation et révocation, ADR-027).
  static Future<void> _migrateToV8(Migrator m, AppDatabase db) async {
    await m.createTable(db.trustedKeysets);
    await m.addColumn(
      db.installedBasemaps,
      db.installedBasemaps.signatureKeyId,
    );
  }

  /// v9 (Sprint 13) : politique des tablettes reçue avec le catalogue et
  /// repère de temps de confiance (SEC-05, ADR-029).
  static Future<void> _migrateToV9(Migrator m, AppDatabase db) async {
    await m.addColumn(db.syncState, db.syncState.terminalPolicy);
    await m.createTable(db.trustedTime);
  }

  /// v10 (Sprint 13) : fichiers rangés par morceaux et téléchargements
  /// repris en cours de fichier (CAP-02). Les fichiers déjà rangés gardent
  /// leur contenu entier.
  static Future<void> _migrateToV10(Migrator m, AppDatabase db) async {
    await m.addColumn(db.fileBlobs, db.fileBlobs.chunkCount);
    await m.addColumn(db.fileBlobs, db.fileBlobs.receivedBytes);
    await m.createTable(db.fileChunks);
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
      // Repère de temps de confiance (v9) : absent des schémas plus anciens,
      // que les tests de migration ouvrent aussi.
      if (details.versionNow >= 9) {
        await into(trustedTime).insert(
          const TrustedTimeCompanion(id: Value(TrustedTime.singletonId)),
          mode: InsertMode.insertOrIgnore,
        );
      }
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
