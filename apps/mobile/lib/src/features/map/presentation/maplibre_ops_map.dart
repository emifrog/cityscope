import 'dart:async';
import 'dart:math';

import 'package:etare_ops/src/features/map/presentation/ops_map_view.dart';
import 'package:flutter/widgets.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

const _sitesSource = 'firescape-sites';
const _objectsSource = 'firescape-objects';

Map<String, Object?> _featureCollection(List<MapMarker> markers) => {
  'type': 'FeatureCollection',
  'features': [
    for (final marker in markers)
      {
        'type': 'Feature',
        'id': marker.id,
        'properties': {'id': marker.id, 'label': marker.label},
        'geometry': {
          'type': 'Point',
          'coordinates': [marker.lon, marker.lat],
        },
      },
  ],
};

/// Carte locale par MapLibre Native (ADR-024) : le fond est lu dans le
/// fichier PMTiles installé, les libellés avec les glyphes de l'application ;
/// les sites et les points du site visé sont ajoutés en couches GeoJSON.
class MapLibreOpsMap extends StatefulWidget {
  const MapLibreOpsMap({required this.spec, required this.events, super.key});

  final OpsMapSpec spec;
  final OpsMapEvents events;

  @override
  State<MapLibreOpsMap> createState() => _MapLibreOpsMapState();
}

class _MapLibreOpsMapState extends State<MapLibreOpsMap>
    implements OpsMapControl {
  MapLibreMapController? _controller;
  bool _styleLoaded = false;

  @override
  void didUpdateWidget(MapLibreOpsMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    final controller = _controller;
    if (controller == null || !_styleLoaded) return;
    if (!identical(oldWidget.spec.sites, widget.spec.sites)) {
      unawaited(
        controller.setGeoJsonSource(
          _sitesSource,
          _featureCollection(widget.spec.sites),
        ),
      );
    }
    if (!identical(oldWidget.spec.objects, widget.spec.objects)) {
      unawaited(
        controller.setGeoJsonSource(
          _objectsSource,
          _featureCollection(widget.spec.objects),
        ),
      );
    }
  }

  @override
  void dispose() {
    _controller?.onFeatureTapped.remove(_onFeatureTapped);
    super.dispose();
  }

  void _onFeatureTapped(
    Point<double> point,
    LatLng coordinates,
    String id,
    String layerId,
    Annotation? annotation,
  ) {
    final marker = [
      ...widget.spec.objects,
      ...widget.spec.sites,
    ].where((candidate) => candidate.id == id).firstOrNull;
    if (marker != null) widget.events.onMarkerTap(marker);
  }

  Future<void> _addLayers() async {
    final controller = _controller;
    if (controller == null) return;
    await controller.addGeoJsonSource(
      _sitesSource,
      _featureCollection(widget.spec.sites),
    );
    await controller.addGeoJsonSource(
      _objectsSource,
      _featureCollection(widget.spec.objects),
    );
    await controller.addCircleLayer(
      _objectsSource,
      'firescape-objects-points',
      const CircleLayerProperties(
        circleColor: '#1565c0',
        circleRadius: 7,
        circleStrokeColor: '#ffffff',
        circleStrokeWidth: 2,
      ),
    );
    await controller.addSymbolLayer(
      _objectsSource,
      'firescape-objects-labels',
      const SymbolLayerProperties(
        textField: [Expressions.get, 'label'],
        textFont: ['NotoSans-Medium'],
        textSize: 13,
        textOffset: [0, 1.1],
        textAnchor: 'top',
        textColor: '#0d47a1',
        textHaloColor: '#ffffff',
        textHaloWidth: 1.5,
        textOptional: true,
      ),
      minzoom: 15,
    );
    await controller.addCircleLayer(
      _sitesSource,
      'firescape-sites-points',
      const CircleLayerProperties(
        circleColor: '#c62828',
        circleRadius: 9,
        circleStrokeColor: '#ffffff',
        circleStrokeWidth: 2.5,
      ),
    );
    await controller.addSymbolLayer(
      _sitesSource,
      'firescape-sites-labels',
      const SymbolLayerProperties(
        textField: [Expressions.get, 'label'],
        textFont: ['NotoSans-Medium'],
        textSize: 14,
        textOffset: [0, 1.2],
        textAnchor: 'top',
        textColor: '#b71c1c',
        textHaloColor: '#ffffff',
        textHaloWidth: 2,
        textOptional: true,
      ),
      minzoom: 11,
    );
    _styleLoaded = true;
  }

  @override
  Future<void> moveTo(double lon, double lat, double zoom) async {
    await _controller?.animateCamera(
      CameraUpdate.newLatLngZoom(LatLng(lat, lon), zoom),
    );
  }

  @override
  Future<void> followUser() async {
    await _controller?.updateMyLocationTrackingMode(
      MyLocationTrackingMode.tracking,
    );
  }

  @override
  Widget build(BuildContext context) {
    final spec = widget.spec;
    return MapLibreMap(
      styleString: spec.style,
      initialCameraPosition: CameraPosition(
        target: LatLng(spec.centerLat, spec.centerLon),
        zoom: spec.zoom,
      ),
      minMaxZoomPreference: const MinMaxZoomPreference(3, 20),
      // Nord en haut : une carte d'intervention ne tourne pas sous les doigts.
      rotateGesturesEnabled: false,
      tiltGesturesEnabled: false,
      compassEnabled: false,
      trackCameraPosition: true,
      myLocationEnabled: spec.showUserLocation,
      attributionButtonPosition: AttributionButtonPosition.bottomRight,
      onMapCreated: (controller) {
        _controller = controller;
        controller.onFeatureTapped.add(_onFeatureTapped);
        widget.events.onReady(this);
      },
      onStyleLoadedCallback: () => unawaited(_addLayers()),
      onCameraIdle: () {
        final position = _controller?.cameraPosition;
        if (position == null) return;
        widget.events.onCameraIdle(
          position.target.longitude,
          position.target.latitude,
          position.zoom,
        );
      },
    );
  }
}
