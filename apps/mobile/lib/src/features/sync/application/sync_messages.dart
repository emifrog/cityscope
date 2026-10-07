import 'package:etare_ops/src/core/errors/app_exception.dart';
import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/storage/storage_guard.dart';
import 'package:etare_ops/src/features/basemaps/application/basemap_sync.dart';
import 'package:etare_ops/src/features/sync/application/package_verification.dart';

/// Message lisible d'une purge (révocation, terminal inconnu).
String purgeMessage(ApiErrorCode reason, {int discardedReports = 0}) {
  final base = switch (reason) {
    ApiErrorCode.deviceRevoked =>
      'Tablette révoquée par votre SIS : données hors ligne effacées.',
    _ => 'Tablette inconnue du serveur : données effacées, réenrôlez-la.',
  };
  return switch (discardedReports) {
    0 => base,
    1 => '$base 1 signalement non transmis a été effacé.',
    _ => '$base $discardedReports signalements non transmis ont été effacés.',
  };
}

/// Bilan des fonds de carte d'un passage (CAR-03, CAP-02) ; null si rien à
/// signaler. Un fond non installé ne bloque jamais les ETARE.
String? basemapSummary(BasemapSyncReport? report) {
  if (report == null) return null;
  final parts = <String>[
    if (report.installed > 0)
      '${report.installed} fond(s) de carte installé(s)',
    for (final failure in report.failures)
      'fond « ${failure.sectorName} » non installé (${_reason(failure)})',
    if (report.deferredBytes > 0) _waitingForWifi(report.deferredBytes),
  ];
  if (parts.isEmpty) return null;
  final text = parts.join(', ');
  return '${text[0].toUpperCase()}${text.substring(1)}.';
}

String _reason(BasemapFailure failure) => basemapFailureReason(failure.code);

String _waitingForWifi(int bytes) =>
    'fond(s) de carte de ${formatBytesFr(bytes)} en attente du Wi-Fi';

/// Cause lisible d'un fond non installé.
String basemapFailureReason(String code) => switch (code) {
  StorageInsufficientException.code => 'place insuffisante sur la tablette',
  storageFullCode => 'stockage plein',
  'BASEMAP_BUDGET' => 'place réservée aux fonds atteinte',
  'BASEMAP_STORAGE' => 'écriture impossible',
  readerTooOldCode => 'mise à jour de l’application requise',
  'BASEMAP_SIGNATURE_INVALID' ||
  'BASEMAP_PART_MISMATCH' ||
  'BASEMAP_HASH_MISMATCH' => 'fichier refusé à la vérification',
  _ => 'erreur $code',
};
