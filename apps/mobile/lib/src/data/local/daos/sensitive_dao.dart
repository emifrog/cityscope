import 'package:drift/drift.dart';
import 'package:etare_ops/src/core/text/search_text.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/tables.dart';
import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:flutter/foundation.dart';

part 'sensitive_dao.g.dart';

/// Fichier obligatoire d'un site sensible, déjà chiffré par la clé du site.
@immutable
final class SealedFile {
  const SealedFile({
    required this.sha256,
    required this.path,
    required this.mediaType,
    required this.cipher,
  });

  final String sha256;
  final String path;
  final String mediaType;
  final Uint8List cipher;
}

/// Sites sensibles (PER-02, ADR-025) : la liste proposée à la demande par le
/// catalogue, les sites ouverts (chiffrés par le code de l'agent, 24 h au
/// plus) et la file des consultations à remonter au journal.
@DriftAccessor(
  tables: [OnDemandSites, SensitiveSites, SensitiveFiles, AccessEventOutbox],
)
class SensitiveDao extends DatabaseAccessor<AppDatabase>
    with _$SensitiveDaoMixin {
  SensitiveDao(super.attachedDatabase);

  /// Remplace la liste par celle du catalogue reçu ; un site qui n'y est plus
  /// (habilitation retirée, site devenu « élevé », hors périmètre) est effacé.
  Future<void> replaceOnDemand(List<CatalogEntry> entries) =>
      transaction(() async {
        await delete(onDemandSites).go();
        for (final entry in entries) {
          await into(onDemandSites).insert(
            OnDemandSitesCompanion.insert(
              siteId: entry.siteId,
              publicationId: entry.publicationId,
              publicationNumber: entry.publicationNumber,
              manifestHash: entry.manifestHash,
              siteName: entry.siteName,
              etareNumber: Value(entry.etareNumber),
              sizeBytes: entry.sizeBytes,
              publishedAt: entry.publishedAt,
              searchText: normalizeForSearch(
                [entry.siteName, entry.etareNumber ?? ''].join(' '),
              ),
            ),
          );
        }
        final offered = {for (final entry in entries) entry.publicationId};
        final opened = await select(sensitiveSites).get();
        for (final site in opened) {
          if (!offered.contains(site.publicationId)) {
            await removeSite(site.siteId);
          }
        }
      });

  /// Sites proposés dont le texte contient tous les mots de [tokens].
  Stream<List<OnDemandSiteRow>> watchOnDemand(List<String> tokens) {
    final query = select(onDemandSites);
    for (final token in tokens) {
      query.where((t) => t.searchText.contains(token));
    }
    query.orderBy([(t) => OrderingTerm(expression: t.siteName.lower())]);
    return query.watch();
  }

  Future<OnDemandSiteRow?> offered(String siteId) => (select(
    onDemandSites,
  )..where((t) => t.siteId.equals(siteId))).getSingleOrNull();

  Stream<SensitiveSiteRow?> watchOpened(String siteId) => (select(
    sensitiveSites,
  )..where((t) => t.siteId.equals(siteId))).watchSingleOrNull();

  Future<SensitiveSiteRow?> opened(String siteId) => (select(
    sensitiveSites,
  )..where((t) => t.siteId.equals(siteId))).getSingleOrNull();

  /// Enregistre un site ouvert et ses fichiers chiffrés, en une transaction.
  Future<void> saveOpened(
    SensitiveSitesCompanion site,
    List<SealedFile> files,
  ) => transaction(() async {
    await removeSite(site.siteId.value);
    await into(sensitiveSites).insert(site);
    for (final file in files) {
      await into(sensitiveFiles).insert(
        SensitiveFilesCompanion.insert(
          siteId: site.siteId.value,
          sha256: file.sha256,
          path: file.path,
          mediaType: file.mediaType,
          cipher: file.cipher,
        ),
        mode: InsertMode.insertOrReplace,
      );
    }
  });

  Future<SensitiveFileRow?> file(String siteId, String sha256) =>
      (select(sensitiveFiles)
            ..where((t) => t.siteId.equals(siteId) & t.sha256.equals(sha256)))
          .getSingleOrNull();

  Future<List<SensitiveFileRow>> files(String siteId) =>
      (select(sensitiveFiles)..where((t) => t.siteId.equals(siteId))).get();

  Future<void> removeSite(String siteId) => transaction(() async {
    await (delete(sensitiveFiles)..where((t) => t.siteId.equals(siteId))).go();
    await (delete(sensitiveSites)..where((t) => t.siteId.equals(siteId))).go();
  });

  /// Efface les sites dont la consultation locale a expiré (24 h) ; renvoie
  /// leur nombre.
  Future<int> purgeExpired(DateTime now) => transaction(() async {
    final expired = await (select(
      sensitiveSites,
    )..where((t) => t.expiresAt.isSmallerOrEqualValue(now))).get();
    for (final site in expired) {
      await removeSite(site.siteId);
    }
    return expired.length;
  });

  /// Efface les sites ouverts par d'autres agents que [userId] (tablette
  /// partagée : un site sensible n'est rouvert que par celui qui l'a ouvert).
  Future<void> purgeOtherUsers(String? userId) => transaction(() async {
    final others =
        await (select(sensitiveSites)..where(
              (t) => userId == null
                  ? const Constant(true)
                  : t.userId.isNotValue(userId),
            ))
            .get();
    for (final site in others) {
      await removeSite(site.siteId);
    }
  });

  /// Révocation, déconnexion : tout ce qui touche aux sites sensibles.
  Future<void> purgeAll({bool keepEvents = false}) => transaction(() async {
    await delete(sensitiveFiles).go();
    await delete(sensitiveSites).go();
    await delete(onDemandSites).go();
    if (!keepEvents) await delete(accessEventOutbox).go();
  });

  Future<void> queueEvent(AccessEventOutboxCompanion event) =>
      into(accessEventOutbox).insert(event, mode: InsertMode.insertOrIgnore);

  /// Consultations de [userId] à remonter, les plus anciennes d'abord.
  Future<List<AccessEventRow>> dueEvents(String userId, {int limit = 200}) =>
      (select(accessEventOutbox)
            ..where((t) => t.userId.equals(userId))
            ..orderBy([(t) => OrderingTerm(expression: t.occurredAt)])
            ..limit(limit))
          .get();

  Future<void> sentEvents(Iterable<String> clientEventIds) => (delete(
    accessEventOutbox,
  )..where((t) => t.clientEventId.isIn(clientEventIds))).go();
}
