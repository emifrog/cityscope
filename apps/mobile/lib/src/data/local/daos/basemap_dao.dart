import 'package:drift/drift.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/tables.dart';

part 'basemap_dao.g.dart';

/// Fonds de carte installés (ADR-024) : une ligne par fond complet et vérifié.
@DriftAccessor(tables: [InstalledBasemaps])
class BasemapDao extends DatabaseAccessor<AppDatabase> with _$BasemapDaoMixin {
  BasemapDao(super.attachedDatabase);

  Future<List<InstalledBasemapRow>> all() =>
      (select(installedBasemaps)..orderBy([
            (row) => OrderingTerm(expression: row.sectorName.lower()),
          ]))
          .get();

  Stream<List<InstalledBasemapRow>> watchAll() =>
      (select(installedBasemaps)..orderBy([
            (row) => OrderingTerm(expression: row.sectorName.lower()),
          ]))
          .watch();

  /// Un fond complet entre en vigueur ; l'ancienne version du secteur sort
  /// dans la même transaction.
  Future<void> install(InstalledBasemapsCompanion row) => transaction(() async {
    await (delete(installedBasemaps)..where(
          (old) =>
              old.sectorId.equals(row.sectorId.value) &
              old.packId.equals(row.packId.value).not(),
        ))
        .go();
    await into(installedBasemaps).insertOnConflictUpdate(row);
  });

  Future<void> remove(String packId) => (delete(
    installedBasemaps,
  )..where((row) => row.packId.equals(packId))).go();

  Future<void> purgeAll() => delete(installedBasemaps).go();

  /// Manifeste revérifié avec une signature renouvelée (SEC-04).
  Future<void> updateSignatureKey(String packId, String keyId) =>
      (update(installedBasemaps)..where((t) => t.packId.equals(packId))).write(
        InstalledBasemapsCompanion(signatureKeyId: Value(keyId)),
      );
}
