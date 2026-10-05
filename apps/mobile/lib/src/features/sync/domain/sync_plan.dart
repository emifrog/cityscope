import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:flutter/foundation.dart';

/// Version installée d'un site, telle que la base locale la connaît.
@immutable
final class InstalledVersion {
  const InstalledVersion({
    required this.siteId,
    required this.publicationId,
    required this.manifestHash,
    this.signatureKeyId,
  });

  final String siteId;
  final String publicationId;
  final String manifestHash;

  /// Clé qui a signé le manifeste installé.
  final String? signatureKeyId;
}

/// Ce que la synchronisation doit faire pour rejoindre le catalogue.
@immutable
final class SyncPlan {
  const SyncPlan({
    required this.toInstall,
    required this.toRemove,
    required this.unchanged,
    this.reverified = 0,
  });

  /// Sites nouveaux ou dont la version publiée a changé, et versions à
  /// revérifier parce que la clé qui les a signées a été révoquée.
  final List<CatalogEntry> toInstall;

  /// Dont versions installées à revérifier (même version, nouvelle
  /// signature) : leurs fichiers sont déjà là, seul le manifeste revient.
  final int reverified;

  /// Sites installés absents du catalogue (retirés ou plus autorisés).
  final List<String> toRemove;

  /// Sites déjà à jour : rien n'est retéléchargé (différentiel, OFF-02).
  final int unchanged;

  /// Volume annoncé des sites à installer (avant déduction des fichiers déjà
  /// présents localement par empreinte).
  int get announcedBytes =>
      toInstall.fold(0, (total, entry) => total + entry.sizeBytes);
}

/// Compare les versions installées au catalogue (fonction pure).
/// [trusted] dit si la clé qui a signé une version installée est encore
/// reconnue (SEC-04) ; sinon la même version est revérifiée.
SyncPlan planSync(
  List<InstalledVersion> installed,
  SyncCatalog catalog, {
  bool Function(String keyId)? trusted,
}) {
  final bySite = {for (final version in installed) version.siteId: version};
  final inCatalog = {for (final entry in catalog.publications) entry.siteId};
  final toInstall = <CatalogEntry>[];
  var unchanged = 0;
  var reverified = 0;
  for (final entry in catalog.publications) {
    final current = bySite[entry.siteId];
    if (current != null &&
        current.publicationId == entry.publicationId &&
        current.manifestHash == entry.manifestHash) {
      final keyId = current.signatureKeyId;
      if (trusted != null && keyId != null && !trusted(keyId)) {
        toInstall.add(entry);
        reverified++;
      } else {
        unchanged++;
      }
    } else {
      toInstall.add(entry);
    }
  }
  return SyncPlan(
    toInstall: List.unmodifiable(toInstall),
    toRemove: List.unmodifiable([
      for (final version in installed)
        if (!inCatalog.contains(version.siteId)) version.siteId,
    ]),
    unchanged: unchanged,
    reverified: reverified,
  );
}
