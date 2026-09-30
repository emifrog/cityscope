import 'package:drift/drift.dart';

/// Métadonnées locales clé/valeur (préférences non secrètes, marqueurs
/// techniques). Les secrets vont dans le stockage sécurisé, jamais ici.
@DataClassName('LocalMetaEntry')
class LocalMeta extends Table {
  @override
  String get tableName => 'local_meta';

  TextColumn get key => text()();

  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}

/// État de la synchronisation hors ligne (ligne unique, `id = 1`).
///
/// Sprint 0 : simple emplacement réservé pour la future synchronisation des
/// publications ETARE (générations de données publiées par la Prévision).
@DataClassName('SyncStateRow')
class SyncState extends Table {
  @override
  String get tableName => 'sync_state';

  /// Identifiant de la ligne unique.
  static const singletonId = 1;

  IntColumn get id => integer()();

  /// Génération de publication actuellement installée (null = aucune).
  IntColumn get activeGeneration => integer().nullable()();

  /// Horodatage (UTC) de la dernière synchronisation réussie.
  DateTimeColumn get lastSyncAt => dateTime().nullable()();

  /// `never` | `idle` | `running` | `failed` (valeurs futures possibles).
  TextColumn get status => text().withDefault(const Constant('never'))();

  @override
  Set<Column<Object>> get primaryKey => {id};

  /// Contrainte « ligne unique » (littéral exigé par l'analyse de drift_dev ;
  /// doit rester égal à [singletonId]).
  @override
  List<String> get customConstraints => const ['CHECK (id = 1)'];
}
