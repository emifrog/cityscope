import 'dart:typed_data';

import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:material_ui/material_ui.dart' show IconData, Icons;

/// Signalements terrain (OPS-04, ADR-017) : un écart constaté sur la version
/// publiée consultée, proposé à la Prévision. Il ne modifie jamais la fiche.

const maxReportPhotos = 5;
const maxReportPhotoBytes = 15 * 1024 * 1024;
const maxReportDescription = 2000;

/// Catégories de la maquette (écran 09) et du modèle de données.
enum ReportCategory {
  access('access', 'Accès', Icons.directions_outlined),
  water('water', 'Eau', Icons.water_drop_outlined),
  risk('risk', 'Risque', Icons.warning_amber_rounded),
  contact('contact', 'Contact', Icons.contact_phone_outlined),
  plan('plan', 'Plan', Icons.map_outlined),
  other('other', 'Autre', Icons.more_horiz);

  const ReportCategory(this.wire, this.label, this.icon);

  final String wire;
  final String label;
  final IconData icon;

  static ReportCategory fromWire(String value) =>
      values.firstWhere((c) => c.wire == value, orElse: () => other);
}

enum ReportSeverity {
  info('info', 'Information'),
  important('important', 'Important'),
  urgent('urgent', 'Urgent');

  const ReportSeverity(this.wire, this.label);

  final String wire;
  final String label;

  static ReportSeverity fromWire(String value) =>
      values.firstWhere((s) => s.wire == value, orElse: () => info);
}

/// Ce que voit l'agent (architecture §11) : « en attente » tant que le
/// serveur n'a pas tout reçu, « reçu » pendant l'instruction, « traité » une
/// fois décidé (décision documentée, pas forcément correction publiée).
enum AgentReportState { pending, received, processed, refused }

AgentReportState agentStateOf(FieldReportRow report) {
  if (report.localState == 'error') return AgentReportState.refused;
  if (report.localState != 'sent') return AgentReportState.pending;
  return switch (report.serverStatus) {
    'resolved' || 'rejected' => AgentReportState.processed,
    _ => AgentReportState.received,
  };
}

/// Type réel d'une image d'après ses premiers octets (jamais l'extension).
String? detectImageMime(Uint8List bytes) {
  bool startsWith(List<int> prefix, [int offset = 0]) {
    if (bytes.length < offset + prefix.length) return false;
    for (var index = 0; index < prefix.length; index++) {
      if (bytes[offset + index] != prefix[index]) return false;
    }
    return true;
  }

  if (startsWith(const [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(const [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith('RIFF'.codeUnits) && startsWith('WEBP'.codeUnits, 8)) {
    return 'image/webp';
  }
  return null;
}

String extensionOfImage(String mimeType) => switch (mimeType) {
  'image/png' => 'png',
  'image/webp' => 'webp',
  _ => 'jpg',
};

/// Corps transmis au serveur, reconstruit à l'identique à chaque envoi : le
/// renvoi après un accusé perdu rend le même signalement (idempotence).
JsonMap reportBody(FieldReportRow report, List<FieldReportPhotoRow> photos) => {
  'client_report_id': report.clientReportId,
  'site_id': report.siteId,
  'publication_id': report.publicationId,
  'category': report.category,
  'severity': report.severity,
  'description': report.description,
  'observed_at': report.observedAt,
  'item': report.itemType == null || report.itemId == null
      ? null
      : {'type': report.itemType, 'id': report.itemId},
  'plan_position':
      report.planRevisionId == null ||
          report.planX == null ||
          report.planY == null
      ? null
      : {
          'plan_revision_id': report.planRevisionId,
          'x': report.planX,
          'y': report.planY,
        },
  'photos': [
    for (final photo in photos)
      {
        'filename': photo.filename,
        'mime_type': photo.mimeType,
        'size_bytes': photo.content.length,
        'sha256': photo.sha256,
      },
  ],
};
