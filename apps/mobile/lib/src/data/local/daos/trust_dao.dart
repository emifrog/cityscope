import 'package:drift/drift.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/tables.dart';

part 'trust_dao.g.dart';

/// Jeu de clés de signature accepté (SEC-04, ADR-027).
@DriftAccessor(tables: [TrustedKeysets])
class TrustDao extends DatabaseAccessor<AppDatabase> with _$TrustDaoMixin {
  TrustDao(super.attachedDatabase);

  Future<TrustedKeysetRow?> read() => (select(
    trustedKeysets,
  )..where((t) => t.id.equals(TrustedKeysets.singletonId))).getSingleOrNull();

  /// Remplace le jeu retenu (le service a vérifié signature et numéro).
  Future<void> save({
    required int sequence,
    required String keysetText,
    required String rootKeyId,
    required String signature,
    required DateTime receivedAt,
  }) => into(trustedKeysets).insertOnConflictUpdate(
    TrustedKeysetsCompanion.insert(
      id: const Value(TrustedKeysets.singletonId),
      sequence: sequence,
      keysetText: keysetText,
      rootKeyId: rootKeyId,
      signature: signature,
      receivedAt: receivedAt,
    ),
  );
}
