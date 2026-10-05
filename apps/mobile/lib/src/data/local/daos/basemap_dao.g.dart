// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'basemap_dao.dart';

// ignore_for_file: type=lint
mixin _$BasemapDaoMixin on DatabaseAccessor<AppDatabase> {
  $InstalledBasemapsTable get installedBasemaps =>
      attachedDatabase.installedBasemaps;
  BasemapDaoManager get managers => BasemapDaoManager(this);
}

class BasemapDaoManager {
  final _$BasemapDaoMixin _db;
  BasemapDaoManager(this._db);
  $$InstalledBasemapsTableTableManager get installedBasemaps =>
      $$InstalledBasemapsTableTableManager(
        _db.attachedDatabase,
        _db.installedBasemaps,
      );
}
