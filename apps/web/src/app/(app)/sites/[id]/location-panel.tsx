'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { AddressCandidate, BuildingUpdate, SiteDetail, SiteUpdate } from '@etare/contracts';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@etare/ui';
import type { GeoJSONSource, MapMouseEvent, Marker } from 'maplibre-gl';
import type { TerraDraw } from 'terra-draw';
import { useEffect, useRef, useState } from 'react';
import { AddressSearch } from '@/components/address-search';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import {
  roundPosition,
  siteExtent,
  toMultiPolygon,
  toPolygons,
  type MultiPolygon,
  type Polygon,
  type Position,
} from '@/components/map/geometry';
import { BaseMapSwitch, BaseMapUnavailable } from '@/components/map/map-overlays';
import { mapColors, type MapColors } from '@/components/map/map-style';
import { useBaseMap, useMapLibre, type LoadedMap } from '@/components/map/use-map';
import { api } from '@/lib/api-client';
import {
  queryKeys,
  useApiMutation,
  useBuildings,
  useGeocodingClient,
  useMapCatalog,
  usePermissions,
} from '@/lib/queries';

type Editing =
  | { readonly kind: 'none' }
  | { readonly kind: 'point' }
  /** Footprint of the site or of a building (its id). */
  | { readonly kind: 'surface'; readonly target: 'site' | string };

const SOURCES = { site: 'site-footprint', buildings: 'building-footprints' } as const;
const EMPTY = { type: 'FeatureCollection' as const, features: [] };
type Hex = `#${string}`;

const formatPosition = ([longitude, latitude]: readonly number[]) =>
  `${latitude?.toFixed(6)}, ${longitude?.toFixed(6)}`;

function addFootprintLayers(loaded: LoadedMap, colors: MapColors, fontStack: readonly string[]) {
  const { map } = loaded;
  map.addSource(SOURCES.site, { type: 'geojson', data: EMPTY });
  map.addSource(SOURCES.buildings, { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'site-footprint-fill',
    type: 'fill',
    source: SOURCES.site,
    paint: { 'fill-color': colors.published, 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'site-footprint-line',
    type: 'line',
    source: SOURCES.site,
    paint: { 'line-color': colors.published, 'line-width': 2, 'line-dasharray': [2, 1] },
  });
  map.addLayer({
    id: 'building-fill',
    type: 'fill',
    source: SOURCES.buildings,
    paint: { 'fill-color': colors.cluster, 'fill-opacity': 0.3 },
  });
  map.addLayer({
    id: 'building-line',
    type: 'line',
    source: SOURCES.buildings,
    paint: { 'line-color': colors.cluster, 'line-width': 1.5 },
  });
  map.addLayer({
    id: 'building-label',
    type: 'symbol',
    source: SOURCES.buildings,
    minzoom: 16,
    layout: { 'text-field': ['get', 'name'], 'text-font': [...fontStack], 'text-size': 12 },
    paint: { 'text-color': colors.cluster, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  });
}

/** Terra Draw session on the map: polygons only, self-intersections refused while drawing and editing. */
async function startDrawing(loaded: LoadedMap, colors: MapColors, initial: MultiPolygon | null | undefined) {
  const [
    { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, ValidateNotSelfIntersecting },
    { TerraDrawMapLibreGLAdapter },
  ] = await Promise.all([import('terra-draw'), import('terra-draw-maplibre-gl-adapter')]);
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map: loaded.map }),
    modes: [
      new TerraDrawSelectMode({
        flags: {
          polygon: {
            feature: {
              draggable: true,
              validation: (feature) => ValidateNotSelfIntersecting(feature),
              coordinates: { midpoints: true, draggable: true, deletable: true },
            },
          },
        },
      }),
      new TerraDrawPolygonMode({
        validation: (feature, context) =>
          String(context.updateType) === 'provisional' ? { valid: true } : ValidateNotSelfIntersecting(feature),
        styles: {
          fillColor: colors.published as Hex,
          fillOpacity: 0.25,
          outlineColor: colors.published as Hex,
          outlineWidth: 2,
        },
      }),
    ],
  });
  draw.start();
  const polygons = toPolygons(initial);
  if (polygons.length > 0) {
    draw.addFeatures(
      polygons.map((polygon) => ({ type: 'Feature', geometry: polygon, properties: { mode: 'polygon' } })),
    );
  }
  draw.setMode(polygons.length > 0 ? 'select' : 'polygon');
  return draw;
}

const drawnPolygons = (draw: TerraDraw): Polygon[] =>
  draw
    .getSnapshot()
    .filter((feature) => feature.geometry.type === 'Polygon')
    .map((feature) => feature.geometry as Polygon);

export function LocationPanel({ site }: { site: SiteDetail }) {
  const canWrite = usePermissions().has('site:write');
  const catalog = useMapCatalog();
  const buildings = useBuildings(site.id);
  if (catalog.isPending || buildings.isPending) return <LoadingCard lines={8} />;
  if (catalog.error || buildings.error) return <ApiErrorAlert error={catalog.error ?? buildings.error} />;
  return <LocationEditor site={site} canWrite={canWrite} />;
}

function LocationEditor({ site, canWrite }: { site: SiteDetail; canWrite: boolean }) {
  const catalog = useMapCatalog();
  const buildings = useBuildings(site.id);
  const geocoding = useGeocodingClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const extent = siteExtent(site, buildings.data ?? []);
  const { loaded, baseUnavailable, clearBaseUnavailable } = useMapLibre(containerRef, catalog.data, {
    bounds: extent
      ? [
          [extent[0], extent[1]],
          [extent[2], extent[3]],
        ]
      : undefined,
  });
  const [base, setBase] = useState<string | null>(null);
  useBaseMap(loaded, catalog.data, base ?? catalog.data?.default_base ?? null);

  const [editing, setEditing] = useState<Editing>({ kind: 'none' });
  const [pendingPoint, setPendingPoint] = useState<Position | null>(null);
  const [nearest, setNearest] = useState<AddressCandidate | null>(null);
  const [applyNearest, setApplyNearest] = useState(false);
  const [drawCount, setDrawCount] = useState(0);
  const [selectedDrawing, setSelectedDrawing] = useState<string | number | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const initialSurface = useRef<MultiPolygon | null>(null);
  const fontStack = catalog.data?.glyphs.font_stack;

  const updateSite = useApiMutation(
    (options, patch: SiteUpdate) => api.updateSite(options, site.id, site.row_version, patch),
    (tenantId) => [queryKeys.site(tenantId, site.id), queryKeys.sites(tenantId)],
  );
  const updateBuilding = useApiMutation(
    (options, { id, version, patch }: { id: string; version: number; patch: BuildingUpdate }) =>
      api.updateBuilding(options, id, version, patch),
    (tenantId) => [queryKeys.siteRecords(tenantId, site.id, 'buildings'), queryKeys.sites(tenantId)],
  );
  const saving = updateSite.isPending || updateBuilding.isPending;
  const saveError = updateSite.error ?? updateBuilding.error;

  useEffect(() => {
    if (!loaded || !fontStack) return;
    addFootprintLayers(loaded, mapColors(getComputedStyle(document.documentElement)), fontStack);
  }, [loaded, fontStack]);

  // Stored footprints; the one being edited is drawn by Terra Draw instead.
  useEffect(() => {
    if (!loaded) return;
    const editedTarget = editing.kind === 'surface' ? editing.target : null;
    loaded.map.getSource<GeoJSONSource>(SOURCES.site)?.setData({
      type: 'FeatureCollection',
      features:
        site.footprint && editedTarget !== 'site'
          ? [{ type: 'Feature', geometry: site.footprint, properties: {} }]
          : [],
    });
    loaded.map.getSource<GeoJSONSource>(SOURCES.buildings)?.setData({
      type: 'FeatureCollection',
      features: (buildings.data ?? []).flatMap((building) =>
        building.footprint && building.id !== editedTarget
          ? [{ type: 'Feature' as const, geometry: building.footprint, properties: { name: building.name } }]
          : [],
      ),
    });
  }, [loaded, site.footprint, buildings.data, editing]);

  // Reference point marker, draggable while the point is being moved.
  useEffect(() => {
    if (!loaded) return;
    const position = pendingPoint ?? site.location?.coordinates ?? null;
    if (!position) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const colors = mapColors(getComputedStyle(document.documentElement));
      const marker = new loaded.lib.Marker({ color: colors.published }).setLngLat(position).addTo(loaded.map);
      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat();
        setPendingPoint(roundPosition([lng, lat]));
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat(position);
    }
    markerRef.current.setDraggable(editing.kind === 'point');
  }, [loaded, site.location, pendingPoint, editing.kind]);

  // While moving the point, a click on the map places it there.
  useEffect(() => {
    if (!loaded || editing.kind !== 'point') return;
    const { map } = loaded;
    const place = (event: MapMouseEvent) => setPendingPoint(roundPosition([event.lngLat.lng, event.lngLat.lat]));
    map.on('click', place);
    map.getCanvas().style.cursor = 'crosshair';
    return () => {
      map.off('click', place);
      map.getCanvas().style.cursor = '';
    };
  }, [loaded, editing.kind]);

  // Nearest address of the new position (suggested, applied only if asked).
  useEffect(() => {
    if (!pendingPoint) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      geocoding
        .reverse(pendingPoint[0], pendingPoint[1])
        .then((result) => !cancelled && setNearest(result.items[0] ?? null))
        .catch(() => !cancelled && setNearest(null));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingPoint, geocoding]);

  // Footprint drawing session.
  useEffect(() => {
    if (!loaded || editing.kind !== 'surface') return;
    let disposed = false;
    let draw: TerraDraw | undefined;
    const colors = mapColors(getComputedStyle(document.documentElement));
    void startDrawing(loaded, colors, initialSurface.current).then((session) => {
      if (disposed) {
        session.stop();
        return;
      }
      draw = session;
      drawRef.current = session;
      const refresh = () => setDrawCount(drawnPolygons(session).length);
      session.on('change', refresh);
      session.on('finish', () => {
        refresh();
        session.setMode('select');
      });
      session.on('select', (id) => setSelectedDrawing(id));
      session.on('deselect', () => setSelectedDrawing(null));
      refresh();
    });
    return () => {
      disposed = true;
      draw?.stop();
      drawRef.current = null;
    };
  }, [loaded, editing]);

  function startPoint() {
    updateSite.reset();
    setPendingPoint(site.location ? roundPosition(site.location.coordinates) : null);
    setNearest(null);
    setApplyNearest(false);
    setEditing({ kind: 'point' });
  }

  function startSurface(target: 'site' | string) {
    updateSite.reset();
    updateBuilding.reset();
    initialSurface.current =
      target === 'site'
        ? site.footprint
        : (buildings.data?.find((building) => building.id === target)?.footprint ?? null);
    setDrawCount(0);
    setSelectedDrawing(null);
    setEditing({ kind: 'surface', target });
  }

  function stopEditing() {
    setEditing({ kind: 'none' });
    setPendingPoint(null);
    setNearest(null);
  }

  function savePoint() {
    if (!pendingPoint) return;
    updateSite.mutate(
      {
        location: { type: 'Point', coordinates: pendingPoint },
        ...(applyNearest && nearest
          ? {
              address: {
                street: nearest.street,
                postal_code: nearest.postal_code,
                city: nearest.city,
                insee_code: nearest.insee_code,
              },
            }
          : {}),
      },
      { onSuccess: stopEditing },
    );
  }

  function saveSurface() {
    const draw = drawRef.current;
    if (!draw || editing.kind !== 'surface') return;
    const footprint = toMultiPolygon(drawnPolygons(draw));
    if (editing.target === 'site') {
      updateSite.mutate({ footprint }, { onSuccess: stopEditing });
      return;
    }
    const building = buildings.data?.find((candidate) => candidate.id === editing.target);
    if (!building) return;
    updateBuilding.mutate(
      { id: building.id, version: building.row_version, patch: { footprint } },
      { onSuccess: stopEditing },
    );
  }

  function goTo(candidate: AddressCandidate) {
    const position = roundPosition(candidate.location.coordinates);
    loaded?.map.flyTo({ center: position, zoom: candidate.kind === 'municipality' ? 13 : 18 });
    if (editing.kind === 'point') setPendingPoint(position);
  }

  const editedBuilding =
    editing.kind === 'surface' && editing.target !== 'site'
      ? buildings.data?.find((building) => building.id === editing.target)
      : undefined;
  const busy = editing.kind !== 'none';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div
        className="relative h-[70dvh] min-h-[420px] overflow-hidden rounded-card border border-border bg-subtle"
        role="region"
        aria-label="Carte du site"
      >
        <div ref={containerRef} className="h-full w-full" />
        <div className="pointer-events-none absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
          <div className="pointer-events-auto">
            {catalog.data ? (
              <BaseMapSwitch
                catalog={catalog.data}
                active={base ?? catalog.data.default_base}
                onChange={(id) => {
                  clearBaseUnavailable();
                  setBase(id);
                }}
              />
            ) : null}
          </div>
          {baseUnavailable ? <BaseMapUnavailable /> : null}
        </div>
        {!extent && editing.kind === 'none' ? (
          <p className="absolute inset-x-0 top-1/2 z-10 mx-auto w-fit max-w-sm rounded-md bg-surface/95 px-4 py-2 text-center text-sm shadow">
            Ce site n’est pas encore positionné. Recherchez son adresse, puis placez le point de référence.
          </p>
        ) : null}
      </div>

      <aside className="space-y-4">
        <Card>
          <CardContent className="space-y-2 pt-5">
            <label htmlFor="location-search" className="text-sm font-semibold">
              Aller à une adresse
            </label>
            <AddressSearch id="location-search" onSelect={goTo} />
            {editing.kind === 'point' ? (
              <p className="text-xs text-muted">Le point de référence sera placé sur l’adresse choisie.</p>
            ) : null}
          </CardContent>
        </Card>

        {saveError ? <ApiErrorAlert error={saveError} /> : null}

        <Card>
          <CardHeader>
            <CardTitle>Point de référence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {pendingPoint ? (
                <>
                  Nouvelle position : <span className="font-mono">{formatPosition(pendingPoint)}</span>
                </>
              ) : site.location ? (
                <span className="font-mono">{formatPosition(site.location.coordinates)}</span>
              ) : (
                <span className="text-muted">Non positionné</span>
              )}
            </p>
            {editing.kind === 'point' ? (
              <>
                <Alert tone="info">Cliquez sur la carte ou faites glisser le repère.</Alert>
                {nearest ? (
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-brand-accent"
                      checked={applyNearest}
                      onChange={(event) => setApplyNearest(event.target.checked)}
                    />
                    <span>
                      Remplacer l’adresse du site par l’adresse la plus proche : <strong>{nearest.label}</strong>
                    </span>
                  </label>
                ) : null}
                <div className="flex gap-2">
                  <Button size="sm" disabled={!pendingPoint || saving} onClick={savePoint}>
                    {saving ? 'Enregistrement…' : 'Enregistrer la position'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={stopEditing}>
                    Annuler
                  </Button>
                </div>
              </>
            ) : canWrite ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={startPoint}>
                {site.location ? 'Déplacer le point' : 'Placer le point'}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emprises</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {editing.kind === 'surface' ? (
              <>
                <p className="font-semibold">
                  {editing.target === 'site' ? 'Emprise du site' : `Bâtiment ${editedBuilding?.name ?? ''}`}
                </p>
                <Alert tone="info">
                  Cliquez pour poser les sommets, puis sur le premier pour fermer le contour. Sélectionnez un contour
                  pour déplacer ses sommets ; un contour ne doit pas se recouper.
                </Alert>
                <p className="text-muted">
                  {drawCount} contour{drawCount > 1 ? 's' : ''} tracé{drawCount > 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => drawRef.current?.setMode('polygon')}>
                    Ajouter un contour
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={selectedDrawing === null}
                    onClick={() => {
                      if (selectedDrawing !== null) drawRef.current?.removeFeatures([selectedDrawing]);
                      setSelectedDrawing(null);
                    }}
                  >
                    Supprimer le contour sélectionné
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={saving} onClick={saveSurface}>
                    {saving ? 'Enregistrement…' : drawCount === 0 ? 'Enregistrer sans emprise' : 'Enregistrer'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={stopEditing}>
                    Annuler
                  </Button>
                </div>
              </>
            ) : (
              <ul className="space-y-2">
                <li className="flex items-center justify-between gap-2">
                  <span>
                    Site{' '}
                    {site.footprint ? <Badge tone="success">Tracée</Badge> : <Badge tone="important">À tracer</Badge>}
                  </span>
                  {canWrite ? (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => startSurface('site')}>
                      {site.footprint ? 'Modifier' : 'Tracer'}
                    </Button>
                  ) : null}
                </li>
                {(buildings.data ?? []).map((building) => (
                  <li key={building.id} className="flex items-center justify-between gap-2">
                    <span>
                      {building.name}{' '}
                      {building.footprint ? <Badge tone="success">Tracée</Badge> : <Badge>Non tracée</Badge>}
                    </span>
                    {canWrite ? (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => startSurface(building.id)}>
                        {building.footprint ? 'Modifier' : 'Tracer'}
                      </Button>
                    ) : null}
                  </li>
                ))}
                {buildings.data?.length === 0 ? (
                  <li className="text-muted">Aucun bâtiment : créez-les dans l’onglet « Bâtiments & niveaux ».</li>
                ) : null}
              </ul>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
