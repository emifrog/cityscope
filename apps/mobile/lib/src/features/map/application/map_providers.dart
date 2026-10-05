import 'dart:io';

import 'package:etare_ops/src/core/di/providers.dart';
import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/features/basemaps/application/basemap_providers.dart';
import 'package:etare_ops/src/features/basemaps/data/basemap_style.dart';
import 'package:etare_ops/src/features/basemaps/domain/installed_basemap.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';

/// Fonds installés, avec leur emprise et leur source (manifestes vérifiés).
final installedBasemapListProvider =
    Provider<AsyncValue<List<InstalledBasemap>>>(
      (ref) => ref
          .watch(installedBasemapsProvider)
          .whenData(
            (rows) => [for (final row in rows) ?InstalledBasemap.fromRow(row)],
          ),
    );

/// Sites installés localisés (carte locale, CAR-02).
final siteLocationsProvider = StreamProvider<List<SiteLocation>>(
  (ref) => ref.watch(appDatabaseProvider).offlineDao.watchSiteLocations(),
);

/// Dossier des glyphes copiés depuis l'application (une fois par version).
final mapGlyphsProvider = FutureProvider<Directory>((ref) async {
  final root = await ref.watch(basemapRootProvider)();
  return installMapGlyphs(root);
});

/// Style local de la carte : le fond installé [packId], ou un aplat sans fond.
final mapStyleProvider = FutureProvider.family<String, String?>((
  ref,
  packId,
) async {
  final glyphs = await ref.watch(mapGlyphsProvider.future);
  if (packId == null) return blankMapStyle(glyphs: glyphs);
  final directory = await ref.watch(basemapStoreProvider).directoryOf(packId);
  return resolveBasemapStyle(basemap: directory, glyphs: glyphs);
});

/// Autorisation de localiser l'agent sur la carte : demandée au premier
/// usage, la position reste sur la tablette (jamais transmise, ADR-025).
abstract interface class LocationPermissionGate {
  Future<bool> request();
}

final class SystemLocationPermission implements LocationPermissionGate {
  const SystemLocationPermission();

  @override
  Future<bool> request() async =>
      (await Permission.locationWhenInUse.request()).isGranted;
}

final locationPermissionProvider = Provider<LocationPermissionGate>(
  (ref) => const SystemLocationPermission(),
);
