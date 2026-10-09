'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapSiteFeature, MapSitesResponse } from '@etare/contracts';
import { OBJECT_CATEGORIES, type ObjectCategory } from '@etare/domain';
import { Badge, Button, Card, cn } from '@etare/ui';
import type { GeoJSONSource, LngLatBoundsLike } from 'maplibre-gl';
import { Info, List, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiErrorAlert } from '@/components/feedback';
import {
  CRITICALITY_LABELS,
  OBJECT_CATEGORY_LABELS,
  OBJECT_STATUS_LABELS,
  SITE_STATUS_LABELS,
  SITE_TYPE_LABELS,
} from '@/components/labels';
import { BaseMapSwitch, BaseMapUnavailable } from '@/components/map/map-overlays';
import { SITE_LAYERS, SITE_SOURCE, bboxParam, mapColors, siteLayers, toSourceData } from '@/components/map/map-style';
import {
  CATEGORY_COLORS,
  detailObjectsData,
  filterObjectLayers,
  objectLayerId,
  objectLayers,
} from '@/components/map/object-layers';
import { describeWaterPoint, nearestWaterPoint } from '@/components/map/nearest-water';
import { riskLayers } from '@/components/map/risk-layers';
import { useBaseMap, useMapLibre } from '@/components/map/use-map';
import { SiteFilterBar, useSiteFiltersFromUrl } from '@/components/site-filter-bar';
import { SITE_TYPE_ICONS } from '@/components/site-type-icon';
import { useMapCatalog, useMapFeatures, useMapSites, useSiteObjects } from '@/lib/queries';
import { MapResultsList } from './map-results-list';

/** From this zoom (street level), building footprints and operational points are shown (MAP-02). */
const DETAIL_ZOOM = 15;
/** Zoom reached when a site is chosen in the list: the street around it. */
const FOCUS_ZOOM = 15;
const DETAIL_BUILDINGS = 'detail-buildings';
const DETAIL_OBJECTS = 'detail-objects';
const DETAIL_RISKS = 'detail-risks';
const EMPTY = { type: 'FeatureCollection' as const, features: [] };
/** Height of the map and of the list beside it: the viewport minus the bars and the toolbar. */
const PANEL_HEIGHT = 'h-[calc(100dvh-13.5rem)] min-h-[480px]';

function extentBounds(extent: NonNullable<MapSitesResponse['extent']>): LngLatBoundsLike {
  return [
    [extent[0], extent[1]],
    [extent[2], extent[3]],
  ];
}

/** Meaning of the marks, behind a button: the map keeps its room. */
function Legend() {
  const [open, setOpen] = useState(false);
  const item = (swatch: string, label: string) => (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className={cn('inline-block size-3 rounded-full', swatch)} />
      {label}
    </li>
  );
  return (
    <div className="rounded-md bg-surface/95 text-xs shadow">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 px-3 py-1.5 font-semibold text-foreground hover:bg-subtle"
      >
        <Info aria-hidden="true" className="size-3.5" />
        Légende
      </button>
      {open ? (
        <ul className="space-y-1 border-t border-border px-3 py-2" aria-label="Légende">
          {item('bg-brand-accent', 'ETARE publié')}
          {item('bg-muted', 'Site connu, sans version publiée')}
          {item('border-2 border-success bg-transparent', 'Vérifié il y a moins de 12 mois')}
          {item('bg-brand-navy', 'Regroupement de sites')}
        </ul>
      ) : null}
    </div>
  );
}

export function SitesMapView() {
  const filters = useSiteFiltersFromUrl();
  const filtersKey = JSON.stringify(filters);
  const searchKey = useSearchParams().toString();
  const catalog = useMapCatalog();
  // Null: every matching site at once (clustered). Set only when the SIS has more sites than one answer holds.
  const [bbox, setBbox] = useState<string | null>(null);
  const sites = useMapSites(filters, bbox);
  const containerRef = useRef<HTMLDivElement>(null);
  const truncatedRef = useRef(false);
  const fittedFor = useRef<string | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Visible extent once zoomed in enough for details; null otherwise (nothing requested).
  const [detailBbox, setDetailBbox] = useState<string | null>(null);
  const details = useMapFeatures(detailBbox);
  const [visibleCategories, setVisibleCategories] = useState<readonly ObjectCategory[]>(OBJECT_CATEGORIES);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const selectedObject =
    (detailBbox && details.data?.objects.features.find((feature) => feature.id === selectedObjectId)) || null;
  const activeBase = base ?? catalog.data?.default_base ?? null;
  const selected = sites.data?.features.find((feature) => feature.id === selectedId) ?? null;
  const selectedObjects = useSiteObjects(selectedId);
  const nearestWater = nearestWaterPoint(selectedObjects.data ?? []);
  const { loaded, baseUnavailable, clearBaseUnavailable } = useMapLibre(containerRef, catalog.data, {});
  useBaseMap(loaded, catalog.data, activeBase);
  const fontStack = catalog.data?.glyphs.font_stack;

  // Business layers and interactions, once the base style is ready.
  useEffect(() => {
    if (!loaded || !fontStack) return;
    const { map } = loaded;
    map.addSource(SITE_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 13,
    });
    const colors = mapColors(getComputedStyle(document.documentElement));
    map.addSource(DETAIL_BUILDINGS, { type: 'geojson', data: EMPTY });
    map.addSource(DETAIL_OBJECTS, { type: 'geojson', data: EMPTY });
    map.addSource(DETAIL_RISKS, { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'detail-building-fill',
      type: 'fill',
      source: DETAIL_BUILDINGS,
      paint: { 'fill-color': colors.cluster, 'fill-opacity': 0.25 },
    });
    map.addLayer({
      id: 'detail-building-line',
      type: 'line',
      source: DETAIL_BUILDINGS,
      paint: { 'line-color': colors.cluster, 'line-width': 1.5 },
    });
    for (const layer of riskLayers(DETAIL_RISKS, DETAIL_RISKS, fontStack, 17)) map.addLayer(layer);
    for (const layer of objectLayers(DETAIL_OBJECTS, DETAIL_OBJECTS, fontStack, 17)) map.addLayer(layer);
    for (const layer of siteLayers(colors, fontStack)) map.addLayer(layer);
    for (const role of ['point', 'line', 'fill'] as const) {
      const layer = objectLayerId(DETAIL_OBJECTS, role);
      map.on('click', layer, (event) => {
        const id = event.features?.[0]?.properties?.['id'];
        if (typeof id !== 'string') return;
        setSelectedObjectId(id);
        setSelectedId(null);
      });
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }

    map.on('click', SITE_LAYERS.clusters, (event) => {
      const cluster = event.features?.[0];
      const clusterId = cluster?.properties?.['cluster_id'] as number | undefined;
      if (!cluster || clusterId === undefined || cluster.geometry.type !== 'Point') return;
      const center = cluster.geometry.coordinates as [number, number];
      void map
        .getSource<GeoJSONSource>(SITE_SOURCE)
        ?.getClusterExpansionZoom(clusterId)
        .then((zoom) => map.easeTo({ center, zoom }));
    });
    map.on('click', SITE_LAYERS.points, (event) => {
      const siteId = event.features?.[0]?.properties?.['site_id'];
      if (typeof siteId !== 'string') return;
      setSelectedId(siteId);
      setSelectedObjectId(null);
    });
    for (const layer of [SITE_LAYERS.clusters, SITE_LAYERS.points]) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }
    map.on('moveend', () => {
      if (truncatedRef.current) setBbox(bboxParam(map.getBounds()));
      setDetailBbox(map.getZoom() >= DETAIL_ZOOM ? bboxParam(map.getBounds()) : null);
    });
  }, [loaded, fontStack]);

  // Sites: new data replaces the source; a new search frames all its results once.
  useEffect(() => {
    const data = sites.data;
    if (!loaded || !data) return;
    truncatedRef.current = data.truncated;
    loaded.map.getSource<GeoJSONSource>(SITE_SOURCE)?.setData(toSourceData(data));
    if (fittedFor.current !== filtersKey && bbox === null && !sites.isPlaceholderData) {
      fittedFor.current = filtersKey;
      if (data.extent) loaded.map.fitBounds(extentBounds(data.extent), { padding: 64, maxZoom: 15, duration: 0 });
    }
  }, [loaded, sites.data, sites.isPlaceholderData, filtersKey, bbox]);

  useEffect(() => {
    loaded?.map.setFilter(SITE_LAYERS.selected, ['==', ['get', 'site_id'], selectedId ?? '']);
  }, [loaded, selectedId]);

  useEffect(() => {
    if (!loaded) return;
    const data = detailBbox ? details.data : undefined;
    loaded.map.getSource<GeoJSONSource>(DETAIL_BUILDINGS)?.setData(data ? data.buildings : EMPTY);
    loaded.map.getSource<GeoJSONSource>(DETAIL_OBJECTS)?.setData(data ? detailObjectsData(data) : EMPTY);
    loaded.map.getSource<GeoJSONSource>(DETAIL_RISKS)?.setData(
      data
        ? {
            type: 'FeatureCollection',
            features: data.risks.features.map((feature) => ({
              ...feature,
              properties: { ...feature.properties, id: feature.id },
            })),
          }
        : EMPTY,
    );
  }, [loaded, details.data, detailBbox]);

  useEffect(() => {
    if (loaded) filterObjectLayers(loaded.map, DETAIL_OBJECTS, visibleCategories);
  }, [loaded, visibleCategories]);

  /** A site chosen in the list: selected on the map, the map brought to its street. */
  function focusSite(feature: MapSiteFeature) {
    setSelectedId(feature.id);
    setSelectedObjectId(null);
    if (!loaded) return;
    const [lng, lat] = feature.geometry.coordinates;
    loaded.map.flyTo({ center: [lng, lat], zoom: Math.max(loaded.map.getZoom(), FOCUS_ZOOM), duration: 600 });
  }

  const shown = sites.data?.features.length ?? 0;
  const listLink = `/sites${searchKey ? `?${searchKey}` : ''}`;
  const SelectedIcon = selected ? SITE_TYPE_ICONS[selected.properties.site_type] : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Carte</h1>
          <p className="mt-1 text-sm text-muted">
            Les sites du SIS sur le fond de plan, puis bâtiments et points opérationnels au niveau de la rue.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={listLink}>
            <List aria-hidden="true" className="size-4" />
            Voir en liste
          </Link>
        </Button>
      </div>
      <SiteFilterBar
        filters={filters}
        idPrefix="map"
        label="Filtrer les sites de la carte"
        onApply={() => {
          setBbox(null);
          setSelectedId(null);
        }}
      />

      {catalog.error ? <ApiErrorAlert error={catalog.error} /> : null}
      {sites.error ? <ApiErrorAlert error={sites.error} /> : null}

      <div className="grid gap-3 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside
          className={cn('hidden overflow-hidden rounded-card border border-border bg-surface xl:block', PANEL_HEIGHT)}
          aria-label="Résultats"
        >
          <MapResultsList
            features={sites.data?.features ?? []}
            selectedId={selectedId}
            truncated={sites.data?.truncated ?? false}
            listLink={listLink}
            onSelect={focusSite}
          />
        </aside>

        <div
          className={cn('relative overflow-hidden rounded-card border border-border bg-subtle', PANEL_HEIGHT)}
          role="region"
          aria-label="Carte des sites"
        >
          {/* MapLibre's stylesheet (unlayered) makes its container position:relative: size it, do not position it. */}
          <div ref={containerRef} className="h-full w-full" />

          <div className="pointer-events-none absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
            <div className="pointer-events-auto">
              {catalog.data && activeBase ? (
                <BaseMapSwitch
                  catalog={catalog.data}
                  active={activeBase}
                  onChange={(id) => {
                    clearBaseUnavailable();
                    setBase(id);
                  }}
                />
              ) : null}
            </div>
            <div className="pointer-events-auto">
              <Legend />
            </div>
            {detailBbox ? (
              <fieldset className="pointer-events-auto max-w-56 rounded-md bg-surface/95 px-3 py-2 text-xs shadow">
                <legend className="float-left mb-1 font-semibold">Points opérationnels</legend>
                <div className="clear-both space-y-0.5">
                  {OBJECT_CATEGORIES.map((category) => (
                    <label key={category} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="size-3.5"
                        checked={visibleCategories.includes(category)}
                        onChange={(event) =>
                          setVisibleCategories((current) =>
                            event.target.checked ? [...current, category] : current.filter((item) => item !== category),
                          )
                        }
                      />
                      <span
                        aria-hidden="true"
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[category] }}
                      />
                      {OBJECT_CATEGORY_LABELS[category]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <p className="pointer-events-auto max-w-56 rounded-md bg-surface/95 px-3 py-1.5 text-xs text-muted shadow">
                Zoomez au niveau de la rue pour les bâtiments et points opérationnels.
              </p>
            )}
            {details.error && detailBbox ? (
              <p className="pointer-events-auto max-w-56 rounded-md bg-surface/95 px-3 py-2 text-xs text-critical shadow">
                Bâtiments et points opérationnels indisponibles pour cette zone.
              </p>
            ) : null}
            {baseUnavailable ? <BaseMapUnavailable /> : null}
          </div>

          <p
            className="absolute top-20 right-3 z-10 rounded-md bg-surface/95 px-3 py-1.5 text-xs shadow sm:top-3 sm:right-14"
            aria-live="polite"
          >
            {sites.isFetching ? 'Chargement…' : `${shown} site${shown > 1 ? 's' : ''} affiché${shown > 1 ? 's' : ''}`}
            {sites.data?.truncated ? ' (zone visible)' : ''}
          </p>

          {sites.data && shown === 0 && !sites.isFetching ? (
            <p className="absolute inset-x-0 top-1/2 z-10 mx-auto w-fit rounded-md bg-surface/95 px-4 py-2 text-sm shadow">
              Aucun site positionné ne correspond à ces critères.
            </p>
          ) : null}

          {sites.data && sites.data.unlocated > 0 ? (
            <p className="absolute bottom-10 left-3 z-10 max-w-sm rounded-md bg-surface/95 px-3 py-2 text-xs shadow">
              {sites.data.unlocated} site{sites.data.unlocated > 1 ? 's' : ''} sans position n’
              {sites.data.unlocated > 1 ? 'apparaissent' : 'apparaît'} pas sur la carte.{' '}
              <Link href={listLink} className="font-semibold text-info hover:underline">
                Voir la liste
              </Link>
            </p>
          ) : null}

          {selectedObject ? (
            <Card className="absolute right-3 bottom-10 z-10 w-80 max-w-[calc(100%-1.5rem)] space-y-3 p-4 shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {selectedObject.properties.label ??
                      selectedObject.properties.name ??
                      selectedObject.properties.type_name}
                  </p>
                  <p className="text-sm text-muted">
                    {selectedObject.properties.type_name} · {selectedObject.properties.site_name}
                  </p>
                </div>
                <Button size="sm" variant="ghost" aria-label="Fermer" onClick={() => setSelectedObjectId(null)}>
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{OBJECT_CATEGORY_LABELS[selectedObject.properties.category]}</Badge>
                {selectedObject.properties.status !== 'active' ? (
                  <Badge tone="critical">{OBJECT_STATUS_LABELS[selectedObject.properties.status]}</Badge>
                ) : null}
                {selectedObject.properties.criticality !== 'info' ? (
                  <Badge tone="important">{CRITICALITY_LABELS[selectedObject.properties.criticality]}</Badge>
                ) : null}
              </div>
              <Button asChild size="sm" className="w-full">
                <Link href={`/sites/${selectedObject.properties.site_id}?onglet=localisation`}>
                  Voir sur la fiche du site
                </Link>
              </Button>
            </Card>
          ) : null}

          {selected && SelectedIcon ? (
            <Card className="absolute right-3 bottom-10 z-10 w-80 max-w-[calc(100%-1.5rem)] space-y-3 p-4 shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-navy text-white"
                  >
                    <SelectedIcon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{selected.properties.name}</p>
                    <p className="text-sm text-muted">
                      {[SITE_TYPE_LABELS[selected.properties.site_type], selected.properties.city]
                        .filter(Boolean)
                        .join(' · ')}
                      {selected.properties.etare_number ? ` · n° ${selected.properties.etare_number}` : ''}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" aria-label="Fermer" onClick={() => setSelectedId(null)}>
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.properties.published ? (
                  <Badge tone="success">Version publiée n° {selected.properties.publication_number}</Badge>
                ) : (
                  <Badge tone="important">Aucune version publiée</Badge>
                )}
                {selected.properties.status !== 'active' ? (
                  <Badge>{SITE_STATUS_LABELS[selected.properties.status]}</Badge>
                ) : null}
                {selected.properties.verified_recently ? <Badge tone="info">Vérifié &lt; 12 mois</Badge> : null}
              </div>
              <p className="text-sm">
                <span className="text-muted">Point d’eau le plus proche : </span>
                {selectedObjects.isPending
                  ? '…'
                  : nearestWater
                    ? describeWaterPoint(nearestWater)
                    : 'aucun point d’eau en service renseigné'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild size="sm">
                  <Link href={`/sites/${selected.id}`}>Ouvrir la fiche</Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/sites/${selected.id}?onglet=etare`}>Dossier ETARE</Link>
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
