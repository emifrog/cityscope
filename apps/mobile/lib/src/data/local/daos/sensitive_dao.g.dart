// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sensitive_dao.dart';

// ignore_for_file: type=lint
mixin _$SensitiveDaoMixin on DatabaseAccessor<AppDatabase> {
  $OnDemandSitesTable get onDemandSites => attachedDatabase.onDemandSites;
  $SensitiveSitesTable get sensitiveSites => attachedDatabase.sensitiveSites;
  $SensitiveFilesTable get sensitiveFiles => attachedDatabase.sensitiveFiles;
  $AccessEventOutboxTable get accessEventOutbox =>
      attachedDatabase.accessEventOutbox;
  SensitiveDaoManager get managers => SensitiveDaoManager(this);
}

class SensitiveDaoManager {
  final _$SensitiveDaoMixin _db;
  SensitiveDaoManager(this._db);
  $$OnDemandSitesTableTableManager get onDemandSites =>
      $$OnDemandSitesTableTableManager(_db.attachedDatabase, _db.onDemandSites);
  $$SensitiveSitesTableTableManager get sensitiveSites =>
      $$SensitiveSitesTableTableManager(
        _db.attachedDatabase,
        _db.sensitiveSites,
      );
  $$SensitiveFilesTableTableManager get sensitiveFiles =>
      $$SensitiveFilesTableTableManager(
        _db.attachedDatabase,
        _db.sensitiveFiles,
      );
  $$AccessEventOutboxTableTableManager get accessEventOutbox =>
      $$AccessEventOutboxTableTableManager(
        _db.attachedDatabase,
        _db.accessEventOutbox,
      );
}
