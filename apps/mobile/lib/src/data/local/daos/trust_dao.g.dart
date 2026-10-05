// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_dao.dart';

// ignore_for_file: type=lint
mixin _$TrustDaoMixin on DatabaseAccessor<AppDatabase> {
  $TrustedKeysetsTable get trustedKeysets => attachedDatabase.trustedKeysets;
  TrustDaoManager get managers => TrustDaoManager(this);
}

class TrustDaoManager {
  final _$TrustDaoMixin _db;
  TrustDaoManager(this._db);
  $$TrustedKeysetsTableTableManager get trustedKeysets =>
      $$TrustedKeysetsTableTableManager(
        _db.attachedDatabase,
        _db.trustedKeysets,
      );
}
