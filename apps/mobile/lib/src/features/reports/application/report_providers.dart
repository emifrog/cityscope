import 'dart:async';
import 'dart:math';

import 'package:drift/drift.dart' show Value;
import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/reports_dao.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/reports/application/report_sender.dart';
import 'package:etare_ops/src/features/reports/data/photo_picker.dart';
import 'package:etare_ops/src/features/reports/domain/field_report.dart';
import 'package:etare_ops/src/features/sync/application/sync_providers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final reportsDaoProvider = Provider<ReportsDao>(
  (ref) => ref.watch(appDatabaseProvider).reportsDao,
);

/// Prise de photo (surchargée dans les tests).
final photoPickerProvider = Provider<PhotoPicker>((ref) => SystemPhotoPicker());

final reportSenderProvider = Provider<ReportSender>(
  (ref) => ReportSender(
    api: ref.watch(syncApiProvider),
    reports: ref.watch(reportsDaoProvider),
    identities: ref.watch(deviceIdentityStoreProvider),
    clock: ref.watch(clockProvider),
    keys: ref.watch(deviceKeysProvider),
  ),
);

final _currentUserId = Provider<String?>(
  (ref) =>
      ref.watch(authControllerProvider.select((state) => state.value?.user.id)),
);

/// Signalements de l'agent connecté, les plus récents d'abord (jamais ceux
/// d'un autre utilisateur de la tablette).
final myReportsProvider = StreamProvider<List<FieldReportRow>>((ref) {
  final userId = ref.watch(_currentUserId);
  if (userId == null) return Stream.value(const []);
  return ref.watch(reportsDaoProvider).watchForAuthor(userId);
});

/// Signalements de l'agent pas encore transmis.
final pendingReportCountProvider = StreamProvider<int>((ref) {
  final userId = ref.watch(_currentUserId);
  if (userId == null) return Stream.value(0);
  return ref.watch(reportsDaoProvider).watchPendingCount(userId);
});

/// Constat saisi par l'agent, sur la version publiée installée.
@immutable
final class ReportDraft {
  const ReportDraft({
    required this.siteId,
    required this.siteName,
    required this.publicationId,
    required this.publicationNumber,
    required this.category,
    required this.severity,
    required this.description,
    required this.photos,
    this.itemType,
    this.itemId,
    this.itemLabel,
    this.planRevisionId,
    this.planTitle,
    this.planX,
    this.planY,
  });

  final String siteId;
  final String siteName;
  final String publicationId;
  final int publicationNumber;
  final ReportCategory category;
  final ReportSeverity severity;
  final String description;
  final List<NewReportPhoto> photos;
  final String? itemType;
  final String? itemId;
  final String? itemLabel;
  final String? planRevisionId;
  final String? planTitle;
  final double? planX;
  final double? planY;
}

/// Identifiant aléatoire (UUID v4), attribué hors ligne au signalement.
String newClientReportId([Random? random]) {
  final source = random ?? Random.secure();
  final bytes = List<int>.generate(16, (_) => source.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

@immutable
final class ReportOutboxState {
  const ReportOutboxState({this.sending = false, this.lastSummary});

  final bool sending;
  final ReportSendSummary? lastSummary;
}

final reportOutboxProvider = NotifierProvider<ReportOutbox, ReportOutboxState>(
  ReportOutbox.new,
);

/// File d'envoi des signalements : enregistrement local immédiat (hors
/// ligne), puis transmission dès que possible (un seul envoi à la fois).
class ReportOutbox extends Notifier<ReportOutboxState> {
  static const _logger = AppLogger('reports');

  @override
  ReportOutboxState build() => const ReportOutboxState();

  /// Enregistre le constat dans la base chiffrée ; renvoie son identifiant.
  Future<String> save(ReportDraft draft) async {
    final userId = ref.read(_currentUserId);
    final tenantId = (await ref.read(deviceIdentityProvider.future))?.tenantId;
    if (userId == null || tenantId == null) {
      throw StateError('Signalement sans agent connecté ni tablette enrôlée.');
    }
    final now = ref.read(clockProvider)().toUtc();
    final id = newClientReportId();
    await ref
        .read(reportsDaoProvider)
        .save(
          FieldReportsCompanion.insert(
            clientReportId: id,
            authorUserId: userId,
            tenantId: tenantId,
            siteId: draft.siteId,
            siteName: draft.siteName,
            publicationId: draft.publicationId,
            publicationNumber: draft.publicationNumber,
            category: draft.category.wire,
            severity: draft.severity.wire,
            description: draft.description.trim(),
            observedAt: now.toIso8601String(),
            itemType: Value(draft.itemType),
            itemId: Value(draft.itemId),
            itemLabel: Value(draft.itemLabel),
            planRevisionId: Value(draft.planRevisionId),
            planTitle: Value(draft.planTitle),
            planX: Value(draft.planX),
            planY: Value(draft.planY),
            createdAt: now,
          ),
          draft.photos,
        );
    sendInBackground();
    return id;
  }

  /// Transmet les signalements en attente de l'agent connecté.
  Future<void> send() async {
    if (state.sending) return;
    final userId = ref.read(_currentUserId);
    if (userId == null) return;
    state = ReportOutboxState(sending: true, lastSummary: state.lastSummary);
    try {
      final summary = await ref
          .read(reportSenderProvider)
          .sendPending(userId: userId);
      state = ReportOutboxState(lastSummary: summary);
    } on ReportDeviceRefused {
      state = ReportOutboxState(lastSummary: state.lastSummary);
      // La synchronisation constate le refus et applique la purge.
      unawaited(ref.read(syncControllerProvider.notifier).synchronize());
    } on Object catch (error) {
      _logger.warning('Envoi des signalements interrompu.', error: error);
      state = ReportOutboxState(lastSummary: state.lastSummary);
    }
  }

  void sendInBackground() => unawaited(send());

  Future<void> discard(String clientReportId) async {
    final userId = ref.read(_currentUserId);
    if (userId == null) return;
    await ref.read(reportsDaoProvider).discard(userId, clientReportId);
  }
}
