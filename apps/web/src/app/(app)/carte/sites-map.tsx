'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapSitesResponse } from '@etare/contracts';
import { OBJECT_CATEGORIES, SITE_STATUSES, SITE_TYPES, type ObjectCategory } from '@etare/domain';
import { Badge, Button, Card, Input, Label, Select, cn } from '@etare/ui';
import type { GeoJSONSource, LngLatBoundsLike } from 'maplibre-gl';
import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { useBaseMap, useMapLibre } from '@/components/map/use-map';
import { PageHeader } from '@/components/page-header';
import { useMapCatalog, useMapFeatures, useMapSites, type MapSiteFilters } from '@/lib/queries';

const isSiteType = (value: string | null): value is (typeof SITE_TYPES)[number] =>
  (SITE_TYPES as readonly (string | null)[]).includes(value);
const isSiteStatus = (value: string | null): value is (typeof SITE_STATUSES)[number] =>
  (SITE_STATUSES as readonly (string | null)[]).includes(value);

/** Same URL parameters as the site list: a search can move from one view to the other. */
function useFiltersFromUrl(): MapSiteFilters {
  const params = useSearchParams();
  const q = params.get('q')?.trim();
  const siteType = params.get('type');
  const status = params.get('statut');
  return {
    ...(q && q.length >= 2 ? { q } : {}),
    ...(isSiteType(siteType) ? { site_type: siteType } : {}),
    ...(isSiteStatus(status) ? { status } : {}),
  };
}

/** From this zoom (street level), building footprints and operational points are shown (MAP-02). */
const DETAIL_ZOOM = 15;
const DETAIL_BUILDINGS = 'detail-buildings';
const DETAIL_OBJECTS = 'detail-objects';
const EMPTY = { type: 'FeatureCollection' as const, features: [] };

function extentBounds(extent: NonNullable<MapSitesResponse['extent']>): LngLatBoundsLike {
  return [
    [extent[0], extent[1]],
    [extent[2], extent[3]],
  ];
}

function Legend() {
  const item = (swatch: string, label: string) => (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className={cn('inline-block size-3 rounded-full', swatch)} />
      {label}
    </li>
  );
  return (
    <ul className="space-y-1 rounded-md bg-surface/95 px-3 py-2 text-xs shadow" aria-label="Légende">
      {item('bg-brand-accent', 'ETARE publié')}
      {item('bg-muted', 'Site connu, sans version publiée')}
      {item('border-2 border-success bg-transparent', 'Vérifié il y a moins de 12 mois')}
      {item('bg-brand-navy', 'Regroupement de sites')}
    </ul>
  );
}

export function SitesMapView() {
  const filters = useFiltersFromUrl();
  const filtersKey = JSON.stringify(filters);
  const router = useRouter();
  const pathname = usePathname();
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
  }, [loaded, details.data, detailBbox]);

  useEffect(() => {
    if (loaded) filterObjectLayers(loaded.map, DETAIL_OBJECTS, visibleCategories);
  }, [loaded, visibleCategories]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['q', 'type', 'statut']) {
      const value = String(form.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    setBbox(null);
    setSelectedId(null);
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  }

  const shown = sites.data?.features.length ?? 0;
  const listLink = `/sites${searchKey ? `?${searchKey}` : ''}`;

  return (
    <>
      <PageHeader
        title="Carte"
        description="Navigation géographique dans le référentiel des sites du SIS."
        actions={
          <Button asChild variant="secondary">
            <Link href={listLink}>Voir en liste</Link>
          </Button>
        }
      />
      <form
        key={searchKey}
        role="search"
        onSubmit={applyFilters}
        className="mb-3 flex flex-wrap items-end gap-3"
        aria-label="Filtrer les sites de la carte"
      >
        <div className="min-w-56 flex-1">
          <Label htmlFor="map-q">Recherche</Label>
          <Input id="map-q" name="q" defaultValue={filters.q ?? ''} placeholder="Nom, adresse, n° ETARE…" />
        </div>
        <div>
          <Label htmlFor="map-type">Type</Label>
          <Select id="map-type" name="type" defaultValue={filters.site_type ?? ''}>
            <option value="">Tous</option>
            {SITE_TYPES.map((type) => (
              <option key={type} value={type}>
                {SITE_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="map-status">Statut</Label>
          <Select id="map-status" name="statut" defaultValue={filters.status ?? ''}>
            <option value="">Non archivés</option>
            {SITE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SITE_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">Filtrer</Button>
      </form>

      {catalog.error ? <ApiErrorAlert error={catalog.error} /> : null}
      {sites.error ? <ApiErrorAlert error={sites.error} /> : null}

      <div
        className="relative h-[calc(100dvh-16rem)] min-h-[420px] overflow-hidden rounded-card border border-border bg-subtle"
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
            <p className="pointer-events-auto max-w-56 rounded-md bg-surface/95 px-3 py-2 text-xs shadow">
              Zoomez au niveau de la rue pour afficher bâtiments et points opérationnels.
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
          className="absolute top-3 right-14 z-10 rounded-md bg-surface/95 px-3 py-1.5 text-xs shadow"
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

        {selected ? (
          <Card className="absolute right-3 bottom-10 z-10 w-80 max-w-[calc(100%-1.5rem)] space-y-3 p-4 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{selected.properties.name}</p>
                <p className="text-sm text-muted">
                  {[SITE_TYPE_LABELS[selected.properties.site_type], selected.properties.city]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
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
              <Badge>{SITE_STATUS_LABELS[selected.properties.status]}</Badge>
              {selected.properties.verified_recently ? <Badge tone="info">Vérifié &lt; 12 mois</Badge> : null}
            </div>
            {selected.properties.etare_number ? (
              <p className="text-sm text-muted">N° ETARE {selected.properties.etare_number}</p>
            ) : null}
            <Button asChild size="sm" className="w-full">
              <Link href={`/sites/${selected.id}`}>Ouvrir le site</Link>
            </Button>
          </Card>
        ) : null}
      </div>
    </>
  );
}
