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
/// Génération installée, dernière synchronisation réussie, dernière tentative
/// et droit de consultation locale reçu avec le dernier catalogue (ADR-015).
@DataClassName('SyncStateRow')
class SyncState extends Table {
  @override
  String get tableName => 'sync_state';

  /// Identifiant de la ligne unique.
  static const singletonId = 1;

  IntColumn get id => integer()();

  /// Génération de catalogue entièrement installée (null = aucune).
  IntColumn get activeGeneration => integer().nullable()();

  /// Horodatage (UTC) de la dernière synchronisation réussie.
  DateTimeColumn get lastSyncAt => dateTime().nullable()();

  /// `never` | `idle` | `running` | `failed` (valeurs futures possibles).
  TextColumn get status => text().withDefault(const Constant('never'))();

  /// Plus haute génération de catalogue acceptée (refus du rejeu).
  IntColumn get catalogGeneration => integer().nullable()();

  DateTimeColumn get lastAttemptAt => dateTime().nullable()();

  TextColumn get lastError => text().nullable()();

  /// Heure du serveur au dernier catalogue accepté.
  DateTimeColumn get serverTime => dateTime().nullable()();

  TextColumn get authorizedUserId => text().nullable()();

  DateTimeColumn get authorizationExpiresAt => dateTime().nullable()();

  /// Accusé d'installation à renvoyer au prochain contact.
  BoolColumn get receiptPending =>
      boolean().withDefault(const Constant(false))();

  /// Application trop ancienne pour le dernier contenu reçu (SYN-02) : version
  /// minimale exigée par le catalogue, ou chaîne vide quand un format plus
  /// récent ne dit pas laquelle. Null : application compatible.
  TextColumn get requiredAppVersion => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  /// Contrainte « ligne unique » (littéral exigé par l'analyse de drift_dev ;
  /// doit rester égal à [singletonId]).
  @override
  List<String> get customConstraints => const ['CHECK (id = 1)'];
}

/// Version publiée active d'un site sur ce terminal (une par site). Le
/// manifeste et sa signature sont conservés tels que reçus et vérifiés.
@DataClassName('InstalledPublicationRow')
class InstalledPublications extends Table {
  @override
  String get tableName => 'installed_publication';

  TextColumn get siteId => text()();

  TextColumn get publicationId => text()();

  IntColumn get publicationNumber => integer()();

  TextColumn get manifestHash => text()();

  /// JSON canonique du manifeste, octet pour octet celui qui a été signé.
  TextColumn get manifestText => text()();

  TextColumn get signatureKeyId => text()();

  TextColumn get signature => text()();

  TextColumn get etareNumber => text().nullable()();

  TextColumn get siteName => text()();

  DateTimeColumn get publishedAt => dateTime()();

  DateTimeColumn get installedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {siteId};
}

/// Fichiers d'une version installée, par chemin et empreinte.
@DataClassName('PublicationFileRow')
class PublicationFiles extends Table {
  @override
  String get tableName => 'publication_file';

  TextColumn get publicationId => text()();

  TextColumn get path => text()();

  TextColumn get sha256 => text()();

  IntColumn get sizeBytes => integer()();

  TextColumn get mediaType => text()();

  BoolColumn get required => boolean()();

  @override
  Set<Column<Object>> get primaryKey => {publicationId, path};
}

/// Contenu des fichiers, adressé par empreinte et partagé entre versions
/// (différentiel, OFF-02). Stocké DANS la base SQLCipher : chiffré au repos
/// (OFF-03) et activé dans la même transaction que les versions (ADR-016).
@DataClassName('FileBlobRow')
class FileBlobs extends Table {
  @override
  String get tableName => 'file_blob';

  TextColumn get sha256 => text()();

  IntColumn get sizeBytes => integer()();

  BlobColumn get content => blob()();

  DateTimeColumn get storedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {sha256};
}

/// Fichier de données d'une version installée (`data/site.json`), tel que reçu.
@DataClassName('SiteDataRow')
class SiteData extends Table {
  @override
  String get tableName => 'site_data';

  TextColumn get siteId => text()();

  TextColumn get publicationId => text()();

  TextColumn get dataText => text()();

  @override
  Set<Column<Object>> get primaryKey => {siteId};
}

/// Index local de recherche (OPS-03) : nom, adresse, commune, n° ETARE.
@DataClassName('SiteSearchRow')
class SiteSearch extends Table {
  @override
  String get tableName => 'site_search';

  TextColumn get siteId => text()();

  TextColumn get name => text()();

  TextColumn get etareNumber => text().nullable()();

  TextColumn get addressLabel => text().nullable()();

  TextColumn get city => text().nullable()();

  /// Texte normalisé (minuscules, sans accents) sur lequel porte la recherche.
  TextColumn get searchText => text()();

  @override
  Set<Column<Object>> get primaryKey => {siteId};
}

/// Signalements terrain de l'agent (OPS-04, ADR-017) : conservés dans la base
/// chiffrée jusqu'à l'accusé du serveur, liés à leur auteur. Le corps envoyé
/// est reconstruit à l'identique depuis ces colonnes (renvoi idempotent).
@DataClassName('FieldReportRow')
class FieldReports extends Table {
  @override
  String get tableName => 'field_report';

  /// Identifiant attribué hors ligne : clé d'idempotence côté serveur.
  TextColumn get clientReportId => text()();

  /// Sujet du jeton de l'auteur : seul lui voit et envoie ce signalement.
  TextColumn get authorUserId => text()();

  TextColumn get tenantId => text()();

  TextColumn get siteId => text()();

  TextColumn get siteName => text()();

  /// Version publiée consultée lors du constat.
  TextColumn get publicationId => text()();

  IntColumn get publicationNumber => integer()();

  TextColumn get category => text()();

  TextColumn get severity => text()();

  TextColumn get description => text()();

  /// Heure du constat, texte ISO 8601 exact (le corps renvoyé doit être identique).
  TextColumn get observedAt => text()();

  TextColumn get itemType => text().nullable()();

  TextColumn get itemId => text().nullable()();

  TextColumn get itemLabel => text().nullable()();

  TextColumn get planRevisionId => text().nullable()();

  TextColumn get planTitle => text().nullable()();

  RealColumn get planX => real().nullable()();

  RealColumn get planY => real().nullable()();

  IntColumn get photoCount => integer().withDefault(const Constant(0))();

  /// `pending` (à transmettre ou photos en cours), `sent` (accusé et photos
  /// transmises), `error` (refusé : à supprimer ou à corriger).
  TextColumn get localState => text().withDefault(const Constant('pending'))();

  TextColumn get lastError => text().nullable()();

  IntColumn get attempts => integer().withDefault(const Constant(0))();

  DateTimeColumn get nextAttemptAt => dateTime().nullable()();

  TextColumn get serverReportId => text().nullable()();

  TextColumn get contentHash => text().nullable()();

  DateTimeColumn get receivedAt => dateTime().nullable()();

  /// État d'instruction côté serveur (`new`, `triaged`, `resolved`, `rejected`).
  TextColumn get serverStatus => text().nullable()();

  TextColumn get decisionComment => text().nullable()();

  DateTimeColumn get decidedAt => dateTime().nullable()();

  IntColumn get resolutionRevisionNo => integer().nullable()();

  IntColumn get resolutionPublicationNumber => integer().nullable()();

  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {clientReportId};
}

/// Photos d'un signalement, chiffrées dans la base jusqu'à leur transmission
/// (jamais conservées en clair sur la tablette).
@DataClassName('FieldReportPhotoRow')
class FieldReportPhotos extends Table {
  @override
  String get tableName => 'field_report_photo';

  TextColumn get clientReportId => text().references(
    FieldReports,
    #clientReportId,
    onDelete: KeyAction.cascade,
  )();

  IntColumn get position => integer()();

  TextColumn get sha256 => text()();

  TextColumn get mimeType => text()();

  TextColumn get filename => text()();

  BlobColumn get content => blob()();

  BoolColumn get uploaded => boolean().withDefault(const Constant(false))();

  @override
  Set<Column<Object>> get primaryKey => {clientReportId, position};
}
