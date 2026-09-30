// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'local_meta_dao.dart';

// ignore_for_file: type=lint
mixin _$LocalMetaDaoMixin on DatabaseAccessor<AppDatabase> {
  $LocalMetaTable get localMeta => attachedDatabase.localMeta;
  LocalMetaDaoManager get managers => LocalMetaDaoManager(this);
}

class LocalMetaDaoManager {
  final _$LocalMetaDaoMixin _db;
  LocalMetaDaoManager(this._db);
  $$LocalMetaTableTableManager get localMeta =>
      $$LocalMetaTableTableManager(_db.attachedDatabase, _db.localMeta);
}
