import 'package:etare_ops/src/features/sync/domain/package_models.dart';
import 'package:flutter/foundation.dart';

/// Version installée d'un site, telle que la base locale la connaît.
@immutable
final class InstalledVersion {
  const InstalledVersion({
    required this.siteId,
    required this.publicationId,
    required this.manifestHash,
  });

  final String siteId;
  final String publicationId;
  final String manifestHash;
}

/// Ce que la synchronisation doit faire pour rejoindre le catalogue.
@immutable
final class SyncPlan {
  const SyncPlan({
    required this.toInstall,
    required this.toRemove,
    required this.unchanged,
  });

  /// Sites nouveaux ou dont la version publiée a changé.
  final List<CatalogEntry> toInstall;

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
SyncPlan planSync(List<InstalledVersion> installed, SyncCatalog catalog) {
  final bySite = {for (final version in installed) version.siteId: version};
  final inCatalog = {for (final entry in catalog.publications) entry.siteId};
  final toInstall = <CatalogEntry>[];
  var unchanged = 0;
  for (final entry in catalog.publications) {
    final current = bySite[entry.siteId];
    if (current != null &&
        current.publicationId == entry.publicationId &&
        current.manifestHash == entry.manifestHash) {
      unchanged++;
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
  );
}
