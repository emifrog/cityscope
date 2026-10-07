import 'dart:async';

import 'package:etare_ops/src/core/formatting/date_formatting.dart';
import 'package:etare_ops/src/core/routing/app_routes.dart';
import 'package:etare_ops/src/core/theme/brand.dart';
import 'package:etare_ops/src/data/local/daos/offline_dao.dart';
import 'package:etare_ops/src/features/auth/application/auth_controller.dart';
import 'package:etare_ops/src/features/basemaps/domain/installed_basemap.dart';
import 'package:etare_ops/src/features/map/application/map_providers.dart';
import 'package:etare_ops/src/features/map/presentation/ops_map_view.dart';
import 'package:etare_ops/src/features/ops/application/ops_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Carte locale de la tablette (CAR-02, ADR-024) : le fond hors ligne du
/// secteur, les sites installés et les points extérieurs du site visé, la
/// position de l'agent s'il la demande (affichée, jamais transmise). Hors de
/// la couverture du fond, la carte le dit et les fiches restent accessibles.
class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({this.siteId, super.key});

  /// Site à situer (ouvert depuis sa fiche) ; null : vue du secteur.
  final String? siteId;

  static const locateButtonKey = Key('map.locate');
  static const coverageKey = Key('map.coverage');
  static const attributionKey = Key('map.attribution');
  static const markerCardKey = Key('map.marker');
  static const openSiteKey = Key('map.openSite');

  /// Message de la carte sans autorisation de consultation (SEC-05).
  static const lockedKey = Key('map.locked');
  static Key sectorKey(String packId) => Key('map.sector.$packId');

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  String? _preferredPackId;
  OpsMapControl? _control;
  (double, double, double)? _camera;
  MapMarker? _selected;
  bool _showUser = false;

  /// Vue par défaut sans site ni fond : le département des Alpes-Maritimes.
  static const _defaultView = (7.26, 43.70, 9.0);

  Future<void> _locate() async {
    final granted = await ref.read(locationPermissionProvider).request();
    if (!mounted) return;
    if (!granted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Localisation refusée : la carte reste utilisable sans votre position.',
          ),
        ),
      );
      return;
    }
    setState(() => _showUser = true);
    // La vue doit afficher la position avant de la suivre.
    await Future<void>.delayed(const Duration(milliseconds: 300));
    await _control?.followUser();
  }

  @override
  Widget build(BuildContext context) {
    // Noms, adresses et positions des sites sont des données opérationnelles :
    // pas sans l'autorisation de consultation en cours (SEC-05).
    if (!ref.watch(offlineAccessProvider)) {
      return Scaffold(
        appBar: AppBar(title: const Text('Carte')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Consultation hors ligne non autorisée : synchronisez la tablette.',
              key: MapScreen.lockedKey,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge
                  ?.copyWith(color: BrandColors.textMuted),
            ),
          ),
        ),
      );
    }
    final basemaps = ref.watch(installedBasemapListProvider);
    final locations = ref.watch(siteLocationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Carte')),
      floatingActionButton: FloatingActionButton(
        key: MapScreen.locateButtonKey,
        tooltip: 'Me situer sur la carte',
        onPressed: () => unawaited(_locate()),
        child: const Icon(Icons.my_location),
      ),
      body: switch ((basemaps, locations)) {
        (AsyncData(value: final installed), AsyncData(value: final sites)) =>
          _body(context, installed, sites),
        (AsyncError(), _) || (_, AsyncError()) => const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text('Carte indisponible : données locales illisibles.'),
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }

  Widget _body(
    BuildContext context,
    List<InstalledBasemap> installed,
    List<SiteLocation> sites,
  ) {
    final focusSite = sites
        .where((site) => site.siteId == widget.siteId)
        .firstOrNull;
    final focus = focusSite == null ? null : (focusSite.lon, focusSite.lat);
    final active = chooseBasemap(
      installed,
      focus: focus,
      preferredPackId: _preferredPackId,
    );
    final siteMarkers = [
      for (final site in sites)
        MapMarker(
          id: site.siteId,
          kind: MapMarkerKind.site,
          lon: site.lon,
          lat: site.lat,
          label: site.name,
          detail: site.addressLabel,
        ),
    ];
    final focusData = widget.siteId == null
        ? null
        : ref.watch(publishedSiteProvider(widget.siteId!)).value;
    final objectMarkers = [
      if (focusData != null)
        for (final object in focusData.objects)
          if (object.location case (final lon, final lat))
            MapMarker(
              id: object.id,
              kind: MapMarkerKind.object,
              lon: lon,
              lat: lat,
              label: object.title,
              detail: object.typeName,
              siteId: focusData.siteId,
            ),
    ];
    final (startLon, startLat, startZoom) = focusSite != null
        ? (focusSite.lon, focusSite.lat, 16.0)
        : active != null
        ? (active.coverage.centerLon, active.coverage.centerLat, 12.0)
        : sites.isNotEmpty
        ? (sites.first.lon, sites.first.lat, 11.0)
        : _defaultView;
    final (lon, lat, zoom) = _camera ?? (startLon, startLat, startZoom);
    final style = ref.watch(mapStyleProvider(active?.packId));
    final builder = ref.watch(opsMapBuilderProvider);
    final now = ref.watch(clockProvider)();

    return Stack(
      children: [
        Positioned.fill(
          child: switch (style) {
            AsyncData(value: final document) => builder(
              context,
              OpsMapSpec(
                styleKey: active?.packId ?? 'sans-fond',
                style: document,
                centerLon: startLon,
                centerLat: startLat,
                zoom: startZoom,
                sites: siteMarkers,
                objects: objectMarkers,
                showUserLocation: _showUser,
              ),
              OpsMapEvents(
                onReady: (control) => _control = control,
                onMarkerTap: (marker) => setState(() => _selected = marker),
                onCameraIdle: (lon, lat, zoom) =>
                    setState(() => _camera = (lon, lat, zoom)),
              ),
            ),
            AsyncError() => const Center(
              child: Text(
                'Fond de carte illisible : relancez la synchronisation.',
              ),
            ),
            _ => const Center(child: CircularProgressIndicator()),
          },
        ),
        Positioned(
          top: 8,
          left: 8,
          right: 8,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (installed.length > 1)
                _SectorChoice(
                  installed: installed,
                  active: active,
                  onSelected: (basemap) => setState(() {
                    _preferredPackId = basemap.packId;
                    _camera = null;
                  }),
                ),
              _CoverageNotice(
                state: coverageAt(active, lon: lon, lat: lat, zoom: zoom),
                other: otherCovering(installed, active, lon: lon, lat: lat),
                hasSites: sites.isNotEmpty,
                onSwitch: (basemap) =>
                    setState(() => _preferredPackId = basemap.packId),
              ),
            ],
          ),
        ),
        Positioned(
          left: 8,
          bottom: 8,
          right: 88,
          child: _Attribution(basemap: active, now: now),
        ),
        if (_selected case final marker?)
          Positioned(
            left: 8,
            right: 88,
            bottom: 48,
            child: _MarkerCard(
              marker: marker,
              onClose: () => setState(() => _selected = null),
            ),
          ),
      ],
    );
  }
}

class _SectorChoice extends StatelessWidget {
  const _SectorChoice({
    required this.installed,
    required this.active,
    required this.onSelected,
  });

  final List<InstalledBasemap> installed;
  final InstalledBasemap? active;
  final void Function(InstalledBasemap basemap) onSelected;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    child: Row(
      children: [
        for (final basemap in installed)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              key: MapScreen.sectorKey(basemap.packId),
              label: Text(basemap.sectorName),
              selected: basemap.packId == active?.packId,
              onSelected: (_) => onSelected(basemap),
            ),
          ),
      ],
    ),
  );
}

/// Distingue l'absence de fond, la sortie de sa couverture et le détail
/// manquant, de l'absence de données opérationnelles.
class _CoverageNotice extends StatelessWidget {
  const _CoverageNotice({
    required this.state,
    required this.other,
    required this.hasSites,
    required this.onSwitch,
  });

  final BasemapCoverageState state;
  final InstalledBasemap? other;
  final bool hasSites;
  final void Function(InstalledBasemap basemap) onSwitch;

  @override
  Widget build(BuildContext context) {
    final (text, color) = switch (state) {
      BasemapCoverageState.none => (
        'Aucun fond de carte sur cette tablette : il se télécharge en Wi-Fi '
            'après la synchronisation. Les sites restent placés.',
        BrandColors.important,
      ),
      BasemapCoverageState.outside => (
        'Fond de carte non disponible ici. Les fiches et les plans restent '
            'consultables.',
        BrandColors.important,
      ),
      BasemapCoverageState.generalOnly => (
        'Détail non disponible ici : vue générale seulement.',
        BrandColors.textMuted,
      ),
      BasemapCoverageState.covered => ('', BrandColors.textMuted),
    };
    final lines = [
      if (text.isNotEmpty) text,
      if (!hasSites) 'Aucune donnée opérationnelle installée sur la tablette.',
    ];
    if (lines.isEmpty) return const SizedBox.shrink();
    return Card(
      key: MapScreen.coverageKey,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            Icon(Icons.layers_clear_outlined, color: color),
            const SizedBox(width: 8),
            Expanded(child: Text(lines.join('\n'))),
            if (state == BasemapCoverageState.outside && other != null)
              TextButton(
                onPressed: () => onSwitch(other!),
                child: Text('Fond « ${other!.sectorName} »'),
              ),
          ],
        ),
      ),
    );
  }
}

/// Source et date du fond, distinctes de celles des ETARE (ADR-024).
class _Attribution extends StatelessWidget {
  const _Attribution({required this.basemap, required this.now});

  final InstalledBasemap? basemap;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final current = basemap;
    final text = current == null
        ? 'Sans fond de carte'
        : '${current.source.attribution} · fond du '
              '${formatDateFr(current.builtAt)}'
              '${current.outdatedAt(now) ? ' (à renouveler)' : ''}';
    return Align(
      alignment: Alignment.bottomLeft,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.85),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
          child: Text(
            text,
            key: MapScreen.attributionKey,
            style: Theme.of(context).textTheme.labelSmall,
          ),
        ),
      ),
    );
  }
}

class _MarkerCard extends StatelessWidget {
  const _MarkerCard({required this.marker, required this.onClose});

  final MapMarker marker;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final siteId = marker.kind == MapMarkerKind.site
        ? marker.id
        : marker.siteId;
    return Card(
      key: MapScreen.markerCardKey,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(
                  marker.kind == MapMarkerKind.site
                      ? Icons.apartment
                      : Icons.place_outlined,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(marker.label, style: textTheme.titleMedium),
                      if (marker.detail case final detail?)
                        Text(detail, style: textTheme.bodyMedium),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Fermer',
                  onPressed: onClose,
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            if (siteId != null) ...[
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilledButton(
                  key: MapScreen.openSiteKey,
                  onPressed: () => context.push(AppRoutes.site(siteId)),
                  child: Text(
                    marker.kind == MapMarkerKind.site
                        ? 'Ouvrir la fiche'
                        : 'Fiche du site',
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
