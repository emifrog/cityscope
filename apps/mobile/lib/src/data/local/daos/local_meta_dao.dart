import 'package:drift/drift.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/tables.dart';

part 'local_meta_dao.g.dart';

/// Accès à la table `local_meta` (clé/valeur non secrète).
@DriftAccessor(tables: [LocalMeta])
class LocalMetaDao extends DatabaseAccessor<AppDatabase>
    with _$LocalMetaDaoMixin {
  LocalMetaDao(super.attachedDatabase);

  Future<String?> readValue(String key) => (select(
    localMeta,
  )..where((t) => t.key.equals(key))).map((row) => row.value).getSingleOrNull();

  Future<void> writeValue(String key, String value) => into(
    localMeta,
  ).insertOnConflictUpdate(LocalMetaCompanion.insert(key: key, value: value));

  Future<void> removeValue(String key) async {
    await (delete(localMeta)..where((t) => t.key.equals(key))).go();
  }
}
