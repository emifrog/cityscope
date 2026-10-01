import 'package:drift/drift.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/tables.dart';
import 'package:flutter/foundation.dart';

part 'reports_dao.g.dart';

/// Photo jointe à un signalement en cours de saisie.
@immutable
final class NewReportPhoto {
  const NewReportPhoto({
    required this.sha256,
    required this.mimeType,
    required this.filename,
    required this.content,
  });

  final String sha256;
  final String mimeType;
  final String filename;
  final Uint8List content;
}

/// Suite donnée par la Prévision, reçue du serveur (`GET /sync/reports`).
@immutable
final class ServerReportStatus {
  const ServerReportStatus({
    required this.reportId,
    required this.clientReportId,
    required this.status,
    this.decisionComment,
    this.decidedAt,
    this.resolutionRevisionNo,
    this.resolutionPublicationNumber,
  });

  final String reportId;
  final String clientReportId;
  final String status;
  final String? decisionComment;
  final DateTime? decidedAt;
  final int? resolutionRevisionNo;
  final int? resolutionPublicationNumber;
}

/// File locale des signalements terrain (OPS-04, ADR-017), dans la base
/// chiffrée. Toutes les lectures sont restreintes à l'auteur : un autre
/// utilisateur de la tablette ne voit ni n'envoie ces signalements.
@DriftAccessor(tables: [FieldReports, FieldReportPhotos])
class ReportsDao extends DatabaseAccessor<AppDatabase> with _$ReportsDaoMixin {
  ReportsDao(super.attachedDatabase);

  /// Enregistre un signalement et ses photos, à transmettre.
  Future<void> save(
    FieldReportsCompanion report,
    List<NewReportPhoto> photos,
  ) => transaction(() async {
    await into(fieldReports)
        .insert(report.copyWith(photoCount: Value(photos.length)));
    for (final (position, photo) in photos.indexed) {
      await into(fieldReportPhotos).insert(
        FieldReportPhotosCompanion.insert(
          clientReportId: report.clientReportId.value,
          position: position,
          sha256: photo.sha256,
          mimeType: photo.mimeType,
          filename: photo.filename,
          content: photo.content,
        ),
      );
    }
  });

  Stream<List<FieldReportRow>> watchForAuthor(String userId) =>
      (select(fieldReports)
            ..where((t) => t.authorUserId.equals(userId))
            ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
          .watch();

  /// Signalements de l'auteur pas encore entièrement transmis.
  Stream<int> watchPendingCount(String userId) {
    final count = fieldReports.clientReportId.count();
    return (selectOnly(fieldReports)
          ..addColumns([count])
          ..where(
            fieldReports.authorUserId.equals(userId) &
                fieldReports.localState.equals('pending'),
          ))
        .map((row) => row.read(count) ?? 0)
        .watchSingle();
  }

  /// Signalements de l'auteur dont l'envoi est dû.
  Future<List<FieldReportRow>> due(String userId, DateTime now) =>
      (select(fieldReports)
            ..where(
              (t) =>
                  t.authorUserId.equals(userId) &
                  t.localState.equals('pending') &
                  (t.nextAttemptAt.isNull() |
                      t.nextAttemptAt.isSmallerOrEqualValue(now)),
            )
            ..orderBy([(t) => OrderingTerm.asc(t.createdAt)]))
          .get();

  Future<List<FieldReportPhotoRow>> photosOf(String clientReportId) =>
      (select(fieldReportPhotos)
            ..where((t) => t.clientReportId.equals(clientReportId))
            ..orderBy([(t) => OrderingTerm.asc(t.position)]))
          .get();

  Future<void> acknowledged(
    String clientReportId, {
    required String serverReportId,
    required String contentHash,
    required DateTime receivedAt,
  }) =>
      (update(
        fieldReports,
      )..where((t) => t.clientReportId.equals(clientReportId))).write(
        FieldReportsCompanion(
          serverReportId: Value(serverReportId),
          contentHash: Value(contentHash),
          receivedAt: Value(receivedAt),
          serverStatus: const Value('new'),
          lastError: const Value(null),
        ),
      );

  Future<void> photoUploaded(String clientReportId, String sha256) =>
      (update(fieldReportPhotos)..where(
            (t) =>
                t.clientReportId.equals(clientReportId) &
                t.sha256.equals(sha256),
          ))
          .write(const FieldReportPhotosCompanion(uploaded: Value(true)));

  /// Transmis : les photos, désormais au serveur, quittent la tablette.
  Future<void> sent(String clientReportId) => transaction(() async {
    await (delete(
      fieldReportPhotos,
    )..where((t) => t.clientReportId.equals(clientReportId))).go();
    await (update(
      fieldReports,
    )..where((t) => t.clientReportId.equals(clientReportId))).write(
      const FieldReportsCompanion(
        localState: Value('sent'),
        lastError: Value(null),
        nextAttemptAt: Value(null),
      ),
    );
  });

  /// Échec temporaire : nouvel essai plus tard.
  Future<void> retryLater(
    FieldReportRow report,
    String message,
    DateTime nextAttemptAt,
  ) =>
      (update(
        fieldReports,
      )..where((t) => t.clientReportId.equals(report.clientReportId))).write(
        FieldReportsCompanion(
          attempts: Value(report.attempts + 1),
          lastError: Value(message),
          nextAttemptAt: Value(nextAttemptAt),
        ),
      );

  /// Refusé par le serveur : l'agent le supprime (le constat reste lisible).
  Future<void> refused(String clientReportId, String message) =>
      (update(
        fieldReports,
      )..where((t) => t.clientReportId.equals(clientReportId))).write(
        FieldReportsCompanion(
          localState: const Value('error'),
          lastError: Value(message),
          nextAttemptAt: const Value(null),
        ),
      );

  /// Reporte la suite donnée par la Prévision sur les signalements de l'auteur.
  Future<void> applyStatuses(
    String userId,
    List<ServerReportStatus> statuses,
  ) => transaction(() async {
    for (final status in statuses) {
      await (update(fieldReports)..where(
            (t) =>
                t.authorUserId.equals(userId) &
                t.clientReportId.equals(status.clientReportId),
          ))
          .write(
            FieldReportsCompanion(
              serverReportId: Value(status.reportId),
              serverStatus: Value(status.status),
              decisionComment: Value(status.decisionComment),
              decidedAt: Value(status.decidedAt),
              resolutionRevisionNo: Value(status.resolutionRevisionNo),
              resolutionPublicationNumber: Value(
                status.resolutionPublicationNumber,
              ),
            ),
          );
    }
  });

  /// Retire un signalement de l'auteur de la tablette (non transmis, ou suivi terminé).
  Future<void> discard(String userId, String clientReportId) =>
      (delete(fieldReports)..where(
            (t) =>
                t.authorUserId.equals(userId) &
                t.clientReportId.equals(clientReportId),
          ))
          .go();

  /// Nombre de signalements non transmis, tous auteurs (avant une purge).
  Future<int> pendingCount() async {
    final count = fieldReports.clientReportId.count();
    final row =
        await (selectOnly(fieldReports)
              ..addColumns([count])
              ..where(fieldReports.localState.isNotValue('sent')))
            .getSingle();
    return row.read(count) ?? 0;
  }

  /// Révocation : la file part avec le reste (ADR-017).
  Future<void> purgeAll() => transaction(() async {
    await delete(fieldReportPhotos).go();
    await delete(fieldReports).go();
  });
}
