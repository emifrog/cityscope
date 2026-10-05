import 'dart:convert';

import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/data/local/app_database.dart';
import 'package:etare_ops/src/features/basemaps/domain/basemap_models.dart';
import 'package:flutter/foundation.dart';

/// Fond installé, tel que la carte l'utilise : son secteur, son emprise, sa
/// source (attribution) et ses dates, lus dans le manifeste vérifié.
@immutable
final class InstalledBasemap {
  const InstalledBasemap({
    required this.packId,
    required this.sectorName,
    required this.version,
    required this.coverage,
    required this.source,
    required this.builtAt,
    required this.renewAfter,
    required this.totalBytes,
  });

  /// Null quand le manifeste enregistré est illisible (jamais affiché).
  static InstalledBasemap? fromRow(InstalledBasemapRow row) {
    try {
      final manifest = BasemapManifest.fromJson(
        asJsonMap(jsonDecode(row.manifestText)),
      );
      return InstalledBasemap(
        packId: row.packId,
        sectorName: row.sectorName,
        version: row.version,
        coverage: manifest.coverage,
        source: manifest.source,
        builtAt: row.builtAt,
        renewAfter: row.renewAfter,
        totalBytes: row.totalBytes,
      );
    } on FormatException {
      return null;
    }
  }

  final String packId;
  final String sectorName;
  final int version;
  final BasemapCoverage coverage;
  final BasemapSourceRef source;
  final DateTime builtAt;
  final DateTime renewAfter;
  final int totalBytes;

  /// Renouvellement semestriel dépassé (le fond reste affiché).
  bool outdatedAt(DateTime now) => now.isAfter(renewAfter);
}

/// Ce que la carte peut montrer à un endroit, avec le fond actif.
enum BasemapCoverageState {
  /// Fond général et détail (près d'un site diffusé, ou zoom de vue générale).
  covered,

  /// Dans l'emprise, mais sans le détail des grands zooms.
  generalOnly,

  /// Hors de l'emprise du fond actif : « fond non disponible ici ».
  outside,

  /// Aucun fond installé sur la tablette.
  none,
}

/// État de la couverture au centre de la vue.
BasemapCoverageState coverageAt(
  InstalledBasemap? basemap, {
  required double lon,
  required double lat,
  required double zoom,
}) {
  if (basemap == null) return BasemapCoverageState.none;
  final coverage = basemap.coverage;
  if (!coverage.contains(lon, lat)) return BasemapCoverageState.outside;
  if (zoom > coverage.generalMaxZoom + 1 && !coverage.detailAt(lon, lat)) {
    return BasemapCoverageState.generalOnly;
  }
  return BasemapCoverageState.covered;
}

/// Fond à afficher : celui qui couvre le site visé (de préférence en détail),
/// sinon le dernier choisi, sinon le premier.
InstalledBasemap? chooseBasemap(
  List<InstalledBasemap> installed, {
  (double, double)? focus,
  String? preferredPackId,
}) {
  if (installed.isEmpty) return null;
  if (focus != null) {
    final (lon, lat) = focus;
    final detailed = installed.where(
      (basemap) => basemap.coverage.detailAt(lon, lat),
    );
    if (detailed.isNotEmpty) return detailed.first;
    final covering = installed.where(
      (basemap) => basemap.coverage.contains(lon, lat),
    );
    if (covering.isNotEmpty) return covering.first;
  }
  return installed
          .where((basemap) => basemap.packId == preferredPackId)
          .firstOrNull ??
      installed.first;
}

/// Autre fond installé qui couvre un endroit (proposé quand l'actif ne le
/// couvre pas).
InstalledBasemap? otherCovering(
  List<InstalledBasemap> installed,
  InstalledBasemap? active, {
  required double lon,
  required double lat,
}) => installed
    .where(
      (basemap) =>
          basemap.packId != active?.packId &&
          basemap.coverage.contains(lon, lat),
    )
    .firstOrNull;
