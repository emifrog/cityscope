// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'offline_dao.dart';

// ignore_for_file: type=lint
mixin _$OfflineDaoMixin on DatabaseAccessor<AppDatabase> {
  $InstalledPublicationsTable get installedPublications =>
      attachedDatabase.installedPublications;
  $PublicationFilesTable get publicationFiles =>
      attachedDatabase.publicationFiles;
  $FileBlobsTable get fileBlobs => attachedDatabase.fileBlobs;
  $SiteDataTable get siteData => attachedDatabase.siteData;
  $SiteSearchTable get siteSearch => attachedDatabase.siteSearch;
  $SyncStateTable get syncState => attachedDatabase.syncState;
  OfflineDaoManager get managers => OfflineDaoManager(this);
}

class OfflineDaoManager {
  final _$OfflineDaoMixin _db;
  OfflineDaoManager(this._db);
  $$InstalledPublicationsTableTableManager get installedPublications =>
      $$InstalledPublicationsTableTableManager(
        _db.attachedDatabase,
        _db.installedPublications,
      );
  $$PublicationFilesTableTableManager get publicationFiles =>
      $$PublicationFilesTableTableManager(
        _db.attachedDatabase,
        _db.publicationFiles,
      );
  $$FileBlobsTableTableManager get fileBlobs =>
      $$FileBlobsTableTableManager(_db.attachedDatabase, _db.fileBlobs);
  $$SiteDataTableTableManager get siteData =>
      $$SiteDataTableTableManager(_db.attachedDatabase, _db.siteData);
  $$SiteSearchTableTableManager get siteSearch =>
      $$SiteSearchTableTableManager(_db.attachedDatabase, _db.siteSearch);
  $$SyncStateTableTableManager get syncState =>
      $$SyncStateTableTableManager(_db.attachedDatabase, _db.syncState);
}
