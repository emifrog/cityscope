import 'package:etare_ops/src/features/map/presentation/maplibre_ops_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Repère posé sur la carte locale : un site installé ou un point extérieur
/// du site visé (accès, eau…).
@immutable
final class MapMarker {
  const MapMarker({
    required this.id,
    required this.kind,
    required this.lon,
    required this.lat,
    required this.label,
    this.detail,
    this.siteId,
  });

  final String id;
  final MapMarkerKind kind;
  final double lon;
  final double lat;
  final String label;

  /// Adresse d'un site, type d'un point.
  final String? detail;

  /// Site auquel appartient un point.
  final String? siteId;
}

enum MapMarkerKind { site, object }

/// Ce que la vue de carte affiche : un style local (fond hors ligne ou aplat),
/// une position de départ, les repères et la position de l'agent si demandée.
@immutable
final class OpsMapSpec {
  const OpsMapSpec({
    required this.styleKey,
    required this.style,
    required this.centerLon,
    required this.centerLat,
    required this.zoom,
    required this.sites,
    required this.objects,
    required this.showUserLocation,
  });

  /// Identifie le style (fond actif) : un autre fond recrée la vue.
  final String styleKey;

  /// Document de style MapLibre (JSON), entièrement local.
  final String style;
  final double centerLon;
  final double centerLat;
  final double zoom;
  final List<MapMarker> sites;
  final List<MapMarker> objects;

  /// Position de l'agent affichée sur la tablette, jamais transmise.
  final bool showUserLocation;
}

/// Commandes de la vue, données à l'écran quand elle est prête.
abstract interface class OpsMapControl {
  Future<void> moveTo(double lon, double lat, double zoom);

  /// Centre la vue sur l'agent et la suit.
  Future<void> followUser();
}

/// Ce que la vue signale à l'écran.
@immutable
final class OpsMapEvents {
  const OpsMapEvents({
    required this.onReady,
    required this.onMarkerTap,
    required this.onCameraIdle,
  });

  final void Function(OpsMapControl control) onReady;
  final void Function(MapMarker marker) onMarkerTap;
  final void Function(double lon, double lat, double zoom) onCameraIdle;
}

typedef OpsMapBuilder = Widget Function(
  BuildContext context,
  OpsMapSpec spec,
  OpsMapEvents events,
);

/// Moteur de la carte : MapLibre dans l'application, une doublure dans les
/// tests de widgets (la vue native n'existe pas sous `flutter test`).
final opsMapBuilderProvider = Provider<OpsMapBuilder>(
  (ref) =>
      (context, spec, events) => MapLibreOpsMap(
        key: ValueKey(spec.styleKey),
        spec: spec,
        events: events,
      ),
);
