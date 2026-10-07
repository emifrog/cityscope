import 'dart:math' as math;

import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/errors/error_messages.dart';
import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/core/logging/app_logger.dart';
import 'package:etare_ops/src/core/platform/platform_services.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/data/local/daos/reports_dao.dart';
import 'package:etare_ops/src/features/reports/domain/field_report.dart';
import 'package:etare_ops/src/features/sync/data/device_identity_store.dart';
import 'package:etare_ops/src/features/sync/data/device_keys.dart';
import 'package:etare_ops/src/features/sync/data/sync_api.dart';
import 'package:flutter/foundation.dart';

/// Résultat d'un passage de la file d'envoi.
@immutable
final class ReportSendSummary {
  const ReportSendSummary({
    this.sent = 0,
    this.waiting = 0,
    this.refused = 0,
    this.offline = false,
  });

  final int sent;

  /// Encore à transmettre (réseau, stockage ou serveur indisponible).
  final int waiting;
  final int refused;

  /// Pas de réseau : la file reprendra au prochain contact.
  final bool offline;
}

/// Terminal refusé par le serveur pendant l'envoi (révocation, terminal
/// inconnu) : la synchronisation applique la purge.
final class ReportDeviceRefused implements Exception {
  const ReportDeviceRefused(this.code);

  final ApiErrorCode code;
}

/// Transmission montante des signalements (TER-03, ADR-017) : corps
/// reconstruit à l'identique (renvoi idempotent), photos déposées par URL
/// signée (un fichier déjà présent compte comme reçu), puis demande de
/// contrôle. Un échec temporaire laisse le signalement dans la file, avec un
/// délai croissant ; un refus du serveur le marque pour que l'agent décide.
final class ReportSender {
  ReportSender({
    required this._api,
    required this._reports,
    required this._identities,
    this._clock = DateTime.now,
    DeviceKeys? keys,
  }) : _keys = keys ?? DeviceKeys(const SoftwarePlatformServices());

  static const _logger = AppLogger('reports');

  /// Clé du terminal (Keystore, ou Ed25519 des premières tablettes).
  final DeviceKeys _keys;

  final SyncApi _api;
  final ReportsDao _reports;
  final DeviceIdentityStore _identities;
  final DateTime Function() _clock;

  DateTime get _now => _clock().toUtc();

  Future<ReportSendSummary> sendPending({required String userId}) async {
    final identity = await _identities.read();
    if (identity == null) return const ReportSendSummary();
    final device = await _keys.credentials(identity);
    var sent = 0;
    var waiting = 0;
    var refused = 0;
    var offline = false;
    for (final report in await _reports.due(userId, _now)) {
      if (offline) {
        waiting++;
        continue;
      }
      try {
        await _send(device, report);
        sent++;
      } on NetworkException catch (error) {
        offline = true;
        waiting++;
        await _reports.retryLater(report, describeError(error), _now);
      } on ApiException catch (error) {
        switch (error.code) {
          case ApiErrorCode.deviceRevoked ||
              ApiErrorCode.deviceNotEnrolled ||
              ApiErrorCode.deviceProofInvalid:
            throw ReportDeviceRefused(error.code);
          case ApiErrorCode.validationFailed ||
              ApiErrorCode.conflict ||
              ApiErrorCode.forbidden:
            refused++;
            await _reports.refused(report.clientReportId, describeError(error));
          default:
            waiting++;
            await _reports.retryLater(
              report,
              describeError(error),
              _now.add(_backoff(report.attempts)),
            );
        }
      } on UnexpectedResponseException catch (error) {
        waiting++;
        _logger.warning('Réponse inattendue à un signalement.', error: error);
        await _reports.retryLater(
          report,
          describeError(error),
          _now.add(_backoff(report.attempts)),
        );
      }
    }
    if (!offline) await refreshStatuses(device, userId);
    return ReportSendSummary(
      sent: sent,
      waiting: waiting,
      refused: refused,
      offline: offline,
    );
  }

  /// Reporte la suite donnée par la Prévision (un échec réseau est sans effet).
  Future<void> refreshStatuses(DeviceCredentials device, String userId) async {
    try {
      final items = await _api.reportStatuses(device);
      await _reports.applyStatuses(userId, [
        for (final item in items)
          ServerReportStatus(
            reportId: item.requireString('report_id'),
            clientReportId: item.requireString('client_report_id'),
            status: item.requireString('status'),
            decisionComment: item.optionalString('decision_comment'),
            decidedAt: DateTime.tryParse(
              item.optionalString('decided_at') ?? '',
            ),
            resolutionRevisionNo: item
                .optionalObject('resolution')
                ?.optionalInt('revision_no'),
            resolutionPublicationNumber: item
                .optionalObject('resolution')
                ?.optionalInt('publication_number'),
          ),
      ]);
    } on NetworkException {
      return;
    } on FormatException catch (error) {
      _logger.warning('Suivi des signalements illisible.', error: error);
    }
  }

  Future<void> _send(DeviceCredentials device, FieldReportRow report) async {
    final photos = await _reports.photosOf(report.clientReportId);
    final receipt = await _api.submitReport(device, reportBody(report, photos));
    final serverId = receipt.requireString('report_id');
    await _reports.acknowledged(
      report.clientReportId,
      serverReportId: serverId,
      contentHash: receipt.requireString('content_hash'),
      receivedAt: receipt.requireDateTime('received_at'),
    );
    for (final pending in receipt.requireObjectList('uploads')) {
      final sha256 = pending.requireString('sha256');
      final photo = photos.where((p) => p.sha256 == sha256).firstOrNull;
      if (photo == null) continue;
      final upload = pending.requireObject('upload');
      final url = Uri.tryParse(upload.requireString('url'));
      if (url == null) {
        throw const UnexpectedResponseException('URL de dépôt invalide');
      }
      final headers = {
        for (final MapEntry(:key, :value)
            in upload.requireObject('headers').entries)
          if (value is String) key: value,
      };
      await _api.upload(url, headers, photo.content);
      await _reports.photoUploaded(report.clientReportId, sha256);
    }
    if (photos.isNotEmpty) await _api.confirmReportUploads(device, serverId);
    await _reports.sent(report.clientReportId);
  }

  /// 1 min, 2, 4… jusqu'à 1 h entre deux essais d'un même signalement.
  static Duration _backoff(int attempts) =>
      Duration(minutes: math.min(60, 1 << math.min(attempts, 6)));
}
