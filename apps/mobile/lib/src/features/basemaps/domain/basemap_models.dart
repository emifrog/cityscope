import 'dart:math' as math;

import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:flutter/foundation.dart';

/// Fonds de carte de la tablette (CAR-01 à CAR-03, ADR-024) : un fichier par
/// secteur, préparé par le serveur, signé par la clé des publications, stocké
/// hors de la base chiffrée (donnée publique) et lu par plage.

/// Budget des fonds d'une tablette, tous secteurs confondus (architecture §12).
const basemapDeviceBudgetBytes = 2 * 1024 * 1024 * 1024;

/// Noms des fichiers d'un fond sur la tablette.
const basemapTilesFile = 'tiles.pmtiles';
const basemapStyleFile = 'style.json';

final _sha256Pattern = RegExp(r'^[0-9a-f]{64}$');
final _uuidPattern = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
);

String _sha256(JsonMap json, String key) {
  final value = json.requireString(key);
  if (!_sha256Pattern.hasMatch(value)) {
    throw FormatException('« $key » : empreinte SHA-256 attendue');
  }
  return value;
}

String _uuid(JsonMap json, String key) {
  final value = json.requireString(key);
  if (!_uuidPattern.hasMatch(value)) {
    throw FormatException('« $key » : identifiant attendu');
  }
  return value;
}

/// Les fichiers d'un fond sont des noms plats : la tablette les écrit dans un
/// seul dossier.
bool isSafeBasemapPath(String path) =>
    RegExp(r'^[a-z0-9][a-z0-9._@-]{0,63}$').hasMatch(path) &&
    !path.contains('..');

/// Un fond que la tablette doit détenir (entrée du catalogue signé).
@immutable
final class CatalogBasemap {
  const CatalogBasemap({
    required this.packId,
    required this.sectorId,
    required this.sectorName,
    required this.version,
    required this.manifestHash,
    required this.totalBytes,
    required this.builtAt,
    required this.renewAfter,
  });

  factory CatalogBasemap.fromJson(JsonMap json) => CatalogBasemap(
    packId: _uuid(json, 'pack_id'),
    sectorId: _uuid(json, 'sector_id'),
    sectorName: json.requireString('sector_name'),
    version: json.requireInt('version'),
    manifestHash: _sha256(json, 'manifest_hash'),
    totalBytes: json.requireInt('total_bytes'),
    builtAt: json.requireDateTime('built_at').toUtc(),
    renewAfter: json.requireDateTime('renew_after').toUtc(),
  );

  final String packId;
  final String sectorId;
  final String sectorName;
  final int version;
  final String manifestHash;
  final int totalBytes;
  final DateTime builtAt;
  final DateTime renewAfter;
}

@immutable
final class BasemapPart {
  const BasemapPart(this.sha256, this.sizeBytes);

  final String sha256;
  final int sizeBytes;
}

/// Fichier d'un fond : ses parties, dans l'ordre, forment le fichier.
@immutable
final class BasemapFile {
  const BasemapFile({
    required this.path,
    required this.sha256,
    required this.sizeBytes,
    required this.mediaType,
    required this.parts,
  });

  factory BasemapFile.fromJson(JsonMap json) {
    final path = json.requireString('path');
    if (!isSafeBasemapPath(path)) {
      throw FormatException('Nom de fichier de fond refusé : $path');
    }
    final parts = [
      for (final part in json.requireObjectList('parts'))
        BasemapPart(_sha256(part, 'sha256'), part.requireInt('size_bytes')),
    ];
    final size = json.requireInt('size_bytes');
    if (parts.isEmpty ||
        parts.any((part) => part.sizeBytes <= 0) ||
        parts.fold(0, (total, part) => total + part.sizeBytes) != size) {
      throw FormatException('Parties incohérentes pour $path');
    }
    return BasemapFile(
      path: path,
      sha256: _sha256(json, 'sha256'),
      sizeBytes: size,
      mediaType: json.requireString('media_type'),
      parts: List.unmodifiable(parts),
    );
  }

  final String path;
  final String sha256;
  final int sizeBytes;
  final String mediaType;
  final List<BasemapPart> parts;
}

/// Produit d'origine, tel que la carte l'affiche (attribution, essai).
@immutable
final class BasemapSourceRef {
  const BasemapSourceRef({
    required this.id,
    required this.product,
    required this.attribution,
    required this.synthetic,
  });

  factory BasemapSourceRef.fromJson(JsonMap json) => BasemapSourceRef(
    id: json.requireString('id'),
    product: json.requireString('product'),
    attribution: json.requireString('attribution'),
    synthetic: json.requireBool('synthetic'),
  );

  final String id;
  final String product;
  final String attribution;

  /// Fond d'essai généré par la plateforme : jamais une vraie carte.
  final bool synthetic;
}

/// Ce que couvre un fond : vue générale jusqu'à [generalMaxZoom] sur
/// l'emprise, détail jusqu'à [detailMaxZoom] autour des sites diffusés.
@immutable
final class BasemapCoverage {
  const BasemapCoverage({
    required this.west,
    required this.south,
    required this.east,
    required this.north,
    required this.centerLon,
    required this.centerLat,
    required this.generalMaxZoom,
    required this.detailMaxZoom,
    required this.detailRadiusMeters,
    required this.detailPoints,
  });

  factory BasemapCoverage.fromJson(JsonMap json) {
    final bounds = json.requireNumberList('bounds');
    final center = json.requireNumberList('center');
    if (bounds.length != 4 || center.length != 2) {
      throw const FormatException('Emprise du fond invalide');
    }
    return BasemapCoverage(
      west: bounds[0],
      south: bounds[1],
      east: bounds[2],
      north: bounds[3],
      centerLon: center[0],
      centerLat: center[1],
      generalMaxZoom: json.requireInt('general_max_zoom'),
      detailMaxZoom: json.requireInt('detail_max_zoom'),
      detailRadiusMeters: json.requireInt('detail_radius_m'),
      detailPoints: List.unmodifiable([
        for (final point in json.requireList('detail_points'))
          switch (point) {
            [final num lon, final num lat] => (lon.toDouble(), lat.toDouble()),
            _ => throw const FormatException('Point de détail invalide'),
          },
      ]),
    );
  }

  final double west;
  final double south;
  final double east;
  final double north;
  final double centerLon;
  final double centerLat;
  final int generalMaxZoom;
  final int detailMaxZoom;
  final int detailRadiusMeters;
  final List<(double, double)> detailPoints;

  /// Le point est dans l'emprise du fond (vue générale).
  bool contains(double lon, double lat) =>
      lon >= west && lon <= east && lat >= south && lat <= north;

  /// Le point est dans une zone de détail (près d'un site diffusé).
  bool detailAt(double lon, double lat) {
    const metersPerDegree = 111320.0;
    for (final (pointLon, pointLat) in detailPoints) {
      final dy = (lat - pointLat) * metersPerDegree;
      final dx =
          (lon - pointLon) *
          metersPerDegree *
          math.cos((lat + pointLat) / 2 * math.pi / 180);
      if (dx * dx + dy * dy <= detailRadiusMeters * detailRadiusMeters) {
        return true;
      }
    }
    return false;
  }
}

/// Manifeste signé d'un fond : ce qu'il couvre, d'où il vient, ses fichiers.
@immutable
final class BasemapManifest {
  const BasemapManifest({
    required this.packId,
    required this.tenantId,
    required this.sectorId,
    required this.sectorName,
    required this.version,
    required this.source,
    required this.builtAt,
    required this.renewAfter,
    required this.coverage,
    required this.tileCount,
    required this.totalBytes,
    required this.files,
  });

  factory BasemapManifest.fromJson(JsonMap json) {
    final version = json.requireInt('manifest_version');
    if (version > 1) throw const NewerFormatException('fond de carte');
    if (version != 1 || json.requireString('kind') != 'basemap') {
      throw const FormatException('Manifeste de fond non pris en charge');
    }
    if (json.requireString('tiles') != basemapTilesFile ||
        json.requireString('style') != basemapStyleFile) {
      throw const FormatException('Fichiers du fond inattendus');
    }
    final files = [
      for (final file in json.requireObjectList('files'))
        BasemapFile.fromJson(file),
    ];
    final paths = files.map((file) => file.path).toSet();
    if (paths.length != files.length ||
        !paths.contains(basemapTilesFile) ||
        !paths.contains(basemapStyleFile)) {
      throw const FormatException('Fichiers du fond incomplets');
    }
    final total = json.requireInt('total_bytes');
    if (files.fold(0, (sum, file) => sum + file.sizeBytes) != total) {
      throw const FormatException('Taille du fond incohérente');
    }
    return BasemapManifest(
      packId: _uuid(json, 'pack_id'),
      tenantId: _uuid(json, 'tenant_id'),
      sectorId: _uuid(json, 'sector_id'),
      sectorName: json.requireString('sector_name'),
      version: json.requireInt('version'),
      source: BasemapSourceRef.fromJson(json.requireObject('source')),
      builtAt: json.requireDateTime('built_at').toUtc(),
      renewAfter: json.requireDateTime('renew_after').toUtc(),
      coverage: BasemapCoverage.fromJson(json.requireObject('coverage')),
      tileCount: json.requireInt('tile_count'),
      totalBytes: total,
      files: List.unmodifiable(files),
    );
  }

  final String packId;
  final String tenantId;
  final String sectorId;
  final String sectorName;
  final int version;
  final BasemapSourceRef source;
  final DateTime builtAt;
  final DateTime renewAfter;
  final BasemapCoverage coverage;
  final int tileCount;
  final int totalBytes;
  final List<BasemapFile> files;

  BasemapFile get tiles =>
      files.firstWhere((file) => file.path == basemapTilesFile);
}
