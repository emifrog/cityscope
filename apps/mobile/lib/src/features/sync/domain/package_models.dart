import 'package:etare_ops/src/core/json/json_reader.dart';
import 'package:etare_ops/src/features/sync/domain/removal_notice.dart';
import 'package:flutter/foundation.dart';

final _sha256Pattern = RegExp(r'^[0-9a-f]{64}$');
final _versionPattern = RegExp(r'^\d{1,4}\.\d{1,4}\.\d{1,4}$');
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

/// Chemin relatif d'un fichier de paquet (architecture §10) : jamais absolu,
/// sans remontée de répertoire, jeu de caractères restreint.
bool isSafePackagePath(String path) {
  if (path.isEmpty || path.length > 200) return false;
  if (!RegExp(r'^[A-Za-z0-9._/-]+$').hasMatch(path)) return false;
  return path
      .split('/')
      .every(
        (segment) => segment.isNotEmpty && segment != '.' && segment != '..',
      );
}

/// Format de catalogue ou de manifeste plus récent que ce que l'application
/// sait lire (SYN-02, architecture §10) : elle garde ce qu'elle a installé et
/// demande une mise à jour, au lieu de déclarer les données invalides.
final class NewerFormatException implements Exception {
  const NewerFormatException(this.what);

  final String what;

  @override
  String toString() => 'NewerFormatException($what)';
}

/// Compare deux versions `x.y.z` (négatif si [a] < [b]).
int compareVersions(String a, String b) {
  List<int> parts(String value) =>
      value.split('.').map((part) => int.tryParse(part) ?? 0).toList();
  final left = parts(a);
  final right = parts(b);
  for (var index = 0; index < 3; index++) {
    final l = left.elementAtOrNull(index) ?? 0;
    final r = right.elementAtOrNull(index) ?? 0;
    if (l != r) return l - r;
  }
  return 0;
}

/// Une publication que le terminal peut détenir (entrée du catalogue).
@immutable
final class CatalogEntry {
  const CatalogEntry({
    required this.siteId,
    required this.publicationId,
    required this.publicationNumber,
    required this.manifestHash,
    required this.publishedAt,
    required this.sizeBytes,
    required this.etareNumber,
    required this.siteName,
  });

  factory CatalogEntry.fromJson(JsonMap json) => CatalogEntry(
    siteId: _uuid(json, 'site_id'),
    publicationId: _uuid(json, 'publication_id'),
    publicationNumber: json.requireInt('publication_number'),
    manifestHash: _sha256(json, 'manifest_hash'),
    publishedAt: json.requireDateTime('published_at').toUtc(),
    sizeBytes: json.requireInt('size_bytes'),
    etareNumber: json.optionalString('etare_number'),
    siteName: json.requireString('site_name'),
  );

  final String siteId;
  final String publicationId;
  final int publicationNumber;
  final String manifestHash;
  final DateTime publishedAt;

  /// Taille totale des fichiers obligatoires hors ligne.
  final int sizeBytes;
  final String? etareNumber;
  final String siteName;
}

/// Catalogue signé de ce terminal : liste COMPLÈTE de ce qu'il peut détenir
/// (un site absent doit être retiré), génération monotone et droit de
/// consultation locale de l'utilisateur.
@immutable
final class SyncCatalog {
  const SyncCatalog({
    required this.tenantId,
    required this.tenantName,
    required this.deviceId,
    required this.generation,
    required this.issuedAt,
    required this.authorizedUserId,
    required this.authorizationExpiresAt,
    required this.publications,
    this.minAppVersion,
    this.withdrawals = const [],
  });

  factory SyncCatalog.fromJson(JsonMap json) {
    final version = json.requireInt('catalog_version');
    if (version > 1) throw const NewerFormatException('catalogue');
    if (version != 1) {
      throw const FormatException('Version de catalogue non prise en charge');
    }
    final minApp = json.optionalString('min_app_version');
    if (minApp != null && !_versionPattern.hasMatch(minApp)) {
      throw const FormatException('« min_app_version » invalide');
    }
    final authorization = json.requireObject('authorization');
    return SyncCatalog(
      tenantId: _uuid(json, 'tenant_id'),
      tenantName: json.requireString('tenant_name'),
      deviceId: _uuid(json, 'device_id'),
      generation: json.requireInt('generation'),
      issuedAt: json.requireDateTime('issued_at').toUtc(),
      authorizedUserId: authorization.requireString('subject'),
      authorizationExpiresAt: authorization
          .requireDateTime('expires_at')
          .toUtc(),
      publications: [
        for (final entry in json.requireObjectList('publications'))
          CatalogEntry.fromJson(entry),
      ],
      minAppVersion: minApp,
      // Absent des catalogues antérieurs au Sprint 8 (MET-04).
      withdrawals: json['withdrawals'] == null
          ? const []
          : [
              for (final entry in json.requireObjectList('withdrawals'))
                RemovalNotice.fromJson(entry),
            ],
    );
  }

  final String tenantId;
  final String tenantName;
  final String deviceId;
  final int generation;

  /// Heure du serveur à l'émission (référence contre un recul d'horloge).
  final DateTime issuedAt;
  final String authorizedUserId;
  final DateTime authorizationExpiresAt;
  final List<CatalogEntry> publications;

  /// Plus ancienne application autorisée à installer depuis ce catalogue
  /// (SYN-02) ; null : pas de minimum.
  final String? minAppVersion;

  /// Sites détenus par la tablette dont la version a été retirée ou qui ont
  /// été archivés, avec le motif (MET-04).
  final List<RemovalNotice> withdrawals;
}

/// Fichier d'un paquet, identifié par son empreinte.
@immutable
final class ManifestFile {
  const ManifestFile({
    required this.path,
    required this.sha256,
    required this.sizeBytes,
    required this.mediaType,
    required this.required,
  });

  factory ManifestFile.fromJson(JsonMap json) {
    final path = json.requireString('path');
    if (!isSafePackagePath(path)) {
      throw FormatException('« $path » : chemin de paquet refusé');
    }
    return ManifestFile(
      path: path,
      sha256: _sha256(json, 'sha256'),
      sizeBytes: json.requireInt('size_bytes'),
      mediaType: json.requireString('media_type'),
      required: json.requireBool('required'),
    );
  }

  final String path;
  final String sha256;
  final int sizeBytes;
  final String mediaType;
  final bool required;
}

/// Manifeste signé d'une publication (architecture §10).
@immutable
final class PublicationManifest {
  const PublicationManifest({
    required this.tenantId,
    required this.publicationId,
    required this.siteId,
    required this.publicationNumber,
    required this.minReaderVersion,
    required this.dataFile,
    required this.files,
  });

  factory PublicationManifest.fromJson(JsonMap json) {
    final version = json.requireInt('manifest_version');
    if (version > 1) throw const NewerFormatException('manifeste');
    if (version != 1) {
      throw const FormatException('Version de manifeste non prise en charge');
    }
    final dataFile = json.requireString('data_file');
    final files = [
      for (final file in json.requireObjectList('files'))
        ManifestFile.fromJson(file),
    ];
    if (!files.any((file) => file.path == dataFile)) {
      throw const FormatException('Fichier de données absent du manifeste');
    }
    final minReader = json.requireString('min_reader_version');
    if (!_versionPattern.hasMatch(minReader)) {
      throw const FormatException('« min_reader_version » invalide');
    }
    return PublicationManifest(
      tenantId: _uuid(json, 'tenant_id'),
      publicationId: _uuid(json, 'publication_id'),
      siteId: _uuid(json, 'site_id'),
      publicationNumber: json.requireInt('publication_number'),
      minReaderVersion: minReader,
      dataFile: dataFile,
      files: List.unmodifiable(files),
    );
  }

  final String tenantId;
  final String publicationId;
  final String siteId;
  final int publicationNumber;
  final String minReaderVersion;
  final String dataFile;
  final List<ManifestFile> files;

  ManifestFile get data => files.firstWhere((file) => file.path == dataFile);

  /// Fichiers à installer avant activation (le fichier de données excepté).
  List<ManifestFile> get requiredFiles => [
    for (final file in files)
      if (file.required && file.path != dataFile) file,
  ];
}
