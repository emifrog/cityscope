'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type {
  AddressCandidate,
  BuildingUpdate,
  ObjectType,
  OperationalObject,
  OperationalObjectCreateInput,
  OperationalObjectUpdate,
  Risk,
  RiskCreateInput,
  RiskType,
  RiskUpdate,
  SiteDetail,
  SiteUpdate,
} from '@etare/contracts';
import { OBJECT_CATEGORIES, type ObjectCategory } from '@etare/domain';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Select } from '@etare/ui';
import type { GeoJSONSource, MapLayerMouseEvent, MapMouseEvent, Marker } from 'maplibre-gl';
import type { TerraDraw } from 'terra-draw';
import { useEffect, useRef, useState } from 'react';
import { AddressSearch } from '@/components/address-search';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import {
  CRITICALITY_LABELS,
  OBJECT_CATEGORY_LABELS,
  OBJECT_STATUS_LABELS,
  RISK_SEVERITY_LABELS,
} from '@/components/labels';
import { drawnGeometries, startDrawing, type DrawnGeometry } from '@/components/map/drawing';
import { roundPosition, siteExtent, toMultiPolygon, toPolygons, type Position } from '@/components/map/geometry';
import { BaseMapSwitch, BaseMapUnavailable } from '@/components/map/map-overlays';
import { mapColors, type MapColors } from '@/components/map/map-style';
import {
  CATEGORY_COLORS,
  filterObjectLayers,
  objectLayerId,
  objectLayers,
  siteObjectsData,
} from '@/components/map/object-layers';
import { filterRiskLayers, RISK_COLORS, riskLayerId, riskLayers, siteRisksData } from '@/components/map/risk-layers';
import { useBaseMap, useMapLibre, type LoadedMap } from '@/components/map/use-map';
import { api } from '@/lib/api-client';
import {
  queryKeys,
  useApiMutation,
  useBuildings,
  useGeocodingClient,
  useMapCatalog,
  useObjectTypes,
  usePermissions,
  useRiskTypes,
  useSiteObjects,
  useSiteRisks,
} from '@/lib/queries';
import { ObjectForm, type ObjectFormValues } from './object-form';
import { RiskForm, type RiskFormValues } from './plan-item-forms';
import { ObjectPhotos } from './object-photos';

type Editing =
  | { readonly kind: 'none' }
  | { readonly kind: 'point' }
  /** Footprint of the site or of a building (its id). */
  | { readonly kind: 'surface'; readonly target: 'site' | string }
  /** Operational object: an existing one, or a new one of this type. */
  | { readonly kind: 'object'; readonly type: ObjectType; readonly object: OperationalObject | null }
  /** Risk located on the map (MET-02): an existing one, or a new one of this type, as a point or a surface. */
  | { readonly kind: 'risk'; readonly type: RiskType; readonly risk: Risk | null; readonly shape: 'point' | 'polygon' };

const RISK_POINT_HINT = 'Cliquez sur la carte pour placer le risque.';
const RISK_SURFACE_HINT = 'Cliquez pour poser les sommets de la zone de danger, puis sur le premier pour la fermer.';

const SOURCES = {
  site: 'site-footprint',
  buildings: 'building-footprints',
  objects: 'site-objects',
  risks: 'site-risks',
} as const;
const OBJECTS = 'site-objects';
const RISKS = 'site-risks';
const EMPTY = { type: 'FeatureCollection' as const, features: [] };

const formatPosition = ([longitude, latitude]: readonly number[]) =>
  `${latitude?.toFixed(6)}, ${longitude?.toFixed(6)}`;

function addStaticLayers(loaded: LoadedMap, colors: MapColors, fontStack: readonly string[]) {
  const { map } = loaded;
  for (const source of Object.values(SOURCES)) map.addSource(source, { type: 'geojson', data: EMPTY });
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
  for (const layer of riskLayers(RISKS, SOURCES.risks, fontStack, 16)) map.addLayer(layer);
  for (const layer of objectLayers(OBJECTS, SOURCES.objects, fontStack, 16)) map.addLayer(layer);
}

export function LocationPanel({ site }: { site: SiteDetail }) {
  const canWrite = usePermissions().has('site:write');
  const catalog = useMapCatalog();
  const buildings = useBuildings(site.id);
  const objects = useSiteObjects(site.id);
  const types = useObjectTypes();
  const risks = useSiteRisks(site.id);
  const riskTypes = useRiskTypes(true);
  if (
    catalog.isPending ||
    buildings.isPending ||
    objects.isPending ||
    types.isPending ||
    risks.isPending ||
    riskTypes.isPending
  ) {
    return <LoadingCard lines={8} />;
  }
  const failure = catalog.error ?? buildings.error ?? objects.error ?? types.error ?? risks.error ?? riskTypes.error;
  if (failure) return <ApiErrorAlert error={failure} />;
  return <LocationEditor site={site} canWrite={canWrite} />;
}

function LocationEditor({ site, canWrite }: { site: SiteDetail; canWrite: boolean }) {
  const catalog = useMapCatalog();
  const buildings = useBuildings(site.id);
  const objects = useSiteObjects(site.id);
  const types = useObjectTypes();
  const risks = useSiteRisks(site.id);
  const riskTypes = useRiskTypes(true);
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
  const [visibleCategories, setVisibleCategories] = useState<readonly ObjectCategory[]>(OBJECT_CATEGORIES);
  const [newTypeId, setNewTypeId] = useState('');
  const [newRiskTypeId, setNewRiskTypeId] = useState('');
  const [newRiskShape, setNewRiskShape] = useState<'point' | 'polygon'>('point');
  /** Scope of the risk being edited: the site ('') or a building. */
  const [riskBuilding, setRiskBuilding] = useState('');
  const markerRef = useRef<Marker | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const initialGeometries = useRef<DrawnGeometry[]>([]);
  const editingRef = useRef<Editing>(editing);
  /** Latest "open this object" action, called by map clicks registered once. */
  const openObjectRef = useRef<(id: string) => void>(() => undefined);
  const openRiskRef = useRef<(id: string) => void>(() => undefined);
  const fontStack = catalog.data?.glyphs.font_stack;

  const invalidateSite = (tenantId: string) => [queryKeys.site(tenantId, site.id), queryKeys.sites(tenantId)];
  const updateSite = useApiMutation(
    (options, patch: SiteUpdate) => api.updateSite(options, site.id, site.row_version, patch),
    invalidateSite,
  );
  const updateBuilding = useApiMutation(
    (options, { id, version, patch }: { id: string; version: number; patch: BuildingUpdate }) =>
      api.updateBuilding(options, id, version, patch),
    (tenantId) => [queryKeys.siteRecords(tenantId, site.id, 'buildings'), queryKeys.sites(tenantId)],
  );
  const invalidateObjects = (tenantId: string) => [
    queryKeys.siteRecords(tenantId, site.id, 'objects'),
    queryKeys.sites(tenantId),
  ];
  const createObject = useApiMutation(
    (options, input: OperationalObjectCreateInput) => api.createSiteObject(options, site.id, input),
    invalidateObjects,
  );
  const updateObject = useApiMutation(
    (options, { object, patch }: { object: OperationalObject; patch: OperationalObjectUpdate }) =>
      api.updateObject(options, object.id, object.row_version, patch),
    invalidateObjects,
  );
  const invalidateRisks = (tenantId: string) => [
    queryKeys.siteRecords(tenantId, site.id, 'risks'),
    queryKeys.sites(tenantId),
  ];
  const createRisk = useApiMutation(
    (options, input: RiskCreateInput) => api.createSiteRisk(options, site.id, input),
    invalidateRisks,
  );
  const updateRisk = useApiMutation(
    (options, { risk, patch }: { risk: Risk; patch: RiskUpdate }) =>
      api.updateRisk(options, risk.id, risk.row_version, patch),
    invalidateRisks,
  );
  const saving =
    updateSite.isPending ||
    updateBuilding.isPending ||
    createObject.isPending ||
    updateObject.isPending ||
    createRisk.isPending ||
    updateRisk.isPending;
  const siteSaveError = updateSite.error ?? updateBuilding.error;

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    if (!loaded || !fontStack) return;
    addStaticLayers(loaded, mapColors(getComputedStyle(document.documentElement)), fontStack);
    // A click on an object opens it (when nothing else is being edited).
    const open = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.['id'];
      if (editingRef.current.kind !== 'none' || typeof id !== 'string') return;
      openObjectRef.current(id);
    };
    for (const role of ['point', 'line', 'fill'] as const) {
      const layer = objectLayerId(OBJECTS, role);
      loaded.map.on('click', layer, open);
      loaded.map.on('mouseenter', layer, () => (loaded.map.getCanvas().style.cursor = 'pointer'));
      loaded.map.on('mouseleave', layer, () => (loaded.map.getCanvas().style.cursor = ''));
    }
    const openRisk = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.['id'];
      if (editingRef.current.kind !== 'none' || typeof id !== 'string') return;
      openRiskRef.current(id);
    };
    for (const role of ['point', 'fill'] as const) {
      const layer = riskLayerId(RISKS, role);
      loaded.map.on('click', layer, openRisk);
      loaded.map.on('mouseenter', layer, () => (loaded.map.getCanvas().style.cursor = 'pointer'));
      loaded.map.on('mouseleave', layer, () => (loaded.map.getCanvas().style.cursor = ''));
    }
  }, [loaded, fontStack]);

  // Stored geometries; the one being edited is drawn by Terra Draw instead.
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
    loaded.map.getSource<GeoJSONSource>(SOURCES.objects)?.setData(siteObjectsData(objects.data ?? []));
    filterObjectLayers(
      loaded.map,
      OBJECTS,
      visibleCategories,
      editing.kind === 'object' ? (editing.object?.id ?? null) : null,
    );
    loaded.map.getSource<GeoJSONSource>(SOURCES.risks)?.setData(siteRisksData(risks.data ?? []));
    filterRiskLayers(loaded.map, RISKS, editing.kind === 'risk' ? (editing.risk?.id ?? null) : null);
  }, [loaded, site.footprint, buildings.data, objects.data, risks.data, editing, visibleCategories]);

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

  // Drawing session: footprints (polygons) or one operational object of the kind of its type.
  useEffect(() => {
    if (!loaded || editing.kind === 'none' || editing.kind === 'point') return;
    let disposed = false;
    let draw: TerraDraw | undefined;
    const kind =
      editing.kind === 'surface' ? 'polygon' : editing.kind === 'risk' ? editing.shape : editing.type.geometry_kind;
    const color =
      editing.kind === 'surface'
        ? mapColors(getComputedStyle(document.documentElement)).published
        : editing.kind === 'risk'
          ? RISK_COLORS.high
          : CATEGORY_COLORS[editing.type.category];
    const single = editing.kind !== 'surface';
    void startDrawing(loaded, color, kind, initialGeometries.current).then((session) => {
      if (disposed) {
        session.stop();
        return;
      }
      draw = session;
      drawRef.current = session;
      const refresh = () => setDrawCount(drawnGeometries(session, kind).length);
      session.on('change', refresh);
      session.on('finish', (id) => {
        // An object has one geometry: a new drawing replaces the previous one.
        if (single) {
          const previous = session
            .getSnapshot()
            .filter((feature) => feature.id !== id && feature.properties['mode'] !== 'select')
            .map((feature) => feature.id)
            .filter((featureId): featureId is string | number => featureId !== undefined);
          if (previous.length > 0) session.removeFeatures(previous);
        }
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

  function resetMutations() {
    for (const mutation of [updateSite, updateBuilding, createObject, updateObject, createRisk, updateRisk]) {
      mutation.reset();
    }
  }

  function startPoint() {
    resetMutations();
    setPendingPoint(site.location ? roundPosition(site.location.coordinates) : null);
    setNearest(null);
    setApplyNearest(false);
    setEditing({ kind: 'point' });
  }

  function startSurface(target: 'site' | string) {
    resetMutations();
    const surface =
      target === 'site'
        ? site.footprint
        : (buildings.data?.find((building) => building.id === target)?.footprint ?? null);
    initialGeometries.current = toPolygons(surface);
    setDrawCount(0);
    setSelectedDrawing(null);
    setEditing({ kind: 'surface', target });
  }

  function startObject(type: ObjectType, object: OperationalObject | null) {
    resetMutations();
    initialGeometries.current = object?.geometry ? [object.geometry as DrawnGeometry] : [];
    setDrawCount(0);
    setEditing({ kind: 'object', type, object });
  }

  function startRisk(type: RiskType, risk: Risk | null, shape: 'point' | 'polygon') {
    resetMutations();
    initialGeometries.current = risk?.geometry ? [risk.geometry as DrawnGeometry] : [];
    setRiskBuilding(risk?.building_id ?? '');
    setDrawCount(0);
    setEditing({ kind: 'risk', type, risk, shape: risk?.geometry?.type === 'Polygon' ? 'polygon' : shape });
  }

  const riskTypeOf = (risk: Risk) => riskTypes.data?.find((candidate) => candidate.id === risk.risk_type_id);

  // Objects and risks clicked on the map open their form.
  useEffect(() => {
    openObjectRef.current = (id) => {
      const object = objects.data?.find((candidate) => candidate.id === id);
      const type = types.data?.find((candidate) => candidate.id === object?.object_type_id);
      if (object && type && canWrite) startObject(type, object);
    };
    openRiskRef.current = (id) => {
      const risk = risks.data?.find((candidate) => candidate.id === id);
      const type = risk ? riskTypeOf(risk) : undefined;
      if (risk && type && canWrite) startRisk(type, risk, 'point');
    };
  });

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
    const footprint = toMultiPolygon(
      drawnGeometries(draw, 'polygon').map((geometry) => geometry as Extract<DrawnGeometry, { type: 'Polygon' }>),
    );
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

  function saveObject(values: ObjectFormValues) {
    const draw = drawRef.current;
    if (!draw || editing.kind !== 'object') return;
    const geometry = drawnGeometries(draw, editing.type.geometry_kind)[0];
    if (!geometry) return;
    const rounded = roundGeometry(geometry);
    if (editing.object) {
      updateObject.mutate(
        { object: editing.object, patch: { ...values, geometry: rounded } },
        { onSuccess: stopEditing },
      );
    } else {
      createObject.mutate(
        {
          ...values,
          status: values.status === 'archived' ? 'active' : values.status,
          object_type_id: editing.type.id,
          geometry: rounded,
        },
        { onSuccess: stopEditing },
      );
    }
  }

  function saveRisk(values: RiskFormValues) {
    const draw = drawRef.current;
    if (!draw || editing.kind !== 'risk') return;
    const drawn = drawnGeometries(draw, editing.shape)[0];
    if (!drawn || drawn.type === 'LineString') return;
    const geometry = roundGeometry(drawn) as NonNullable<Risk['geometry']>;
    const building = riskBuilding || null;
    if (editing.risk) {
      updateRisk.mutate(
        {
          risk: editing.risk,
          patch: {
            ...values,
            geometry,
            ...(building !== editing.risk.building_id ? { building_id: building } : {}),
          },
        },
        { onSuccess: stopEditing },
      );
    } else {
      createRisk.mutate(
        { ...values, risk_type_id: editing.type.id, building_id: building, geometry },
        { onSuccess: stopEditing },
      );
    }
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
  const placed = (objects.data ?? []).filter((object) => object.geometry && object.status !== 'archived');
  const onPlans = (objects.data ?? []).filter((object) => !object.geometry && object.status !== 'archived');
  const archived = (objects.data ?? []).filter((object) => object.status === 'archived');
  const presentCategories = OBJECT_CATEGORIES.filter((category) =>
    placed.some((object) => object.category === category),
  );
  const activeRisks = (risks.data ?? []).filter((risk) => risk.status === 'active');
  const risksOnMap = activeRisks.filter((risk) => risk.geometry);
  const risksElsewhere = activeRisks.filter((risk) => !risk.geometry);
  const offeredRiskTypes = (riskTypes.data ?? []).filter((type) => type.status === 'active');
  const typesByCategory = OBJECT_CATEGORIES.map((category) => ({
    category,
    types: (types.data ?? []).filter((type) => type.category === category),
  })).filter((group) => group.types.length > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div
        className="relative h-[75dvh] min-h-[460px] overflow-hidden rounded-card border border-border bg-subtle"
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

        {siteSaveError ? <ApiErrorAlert error={siteSaveError} /> : null}

        {editing.kind === 'object' ? (
          <Card>
            <CardContent className="pt-5">
              <ObjectForm
                key={editing.object?.id ?? `new-${editing.type.id}`}
                type={editing.type}
                object={editing.object}
                geometryReady={drawCount > 0}
                saving={saving}
                error={createObject.error ?? updateObject.error}
                onSave={saveObject}
                onCancel={stopEditing}
                onVerify={
                  editing.object
                    ? () => {
                        const object = editing.object;
                        if (object)
                          updateObject.mutate({ object, patch: { verified: true } }, { onSuccess: stopEditing });
                      }
                    : undefined
                }
              />
              {editing.object ? <ObjectPhotos siteId={site.id} objectId={editing.object.id} /> : null}
            </CardContent>
          </Card>
        ) : null}

        {editing.kind === 'risk' ? (
          <Card>
            <CardContent className="space-y-3 pt-5">
              <div className="space-y-1 text-sm">
                <label htmlFor="risk-scope" className="font-semibold">
                  Portée
                </label>
                <Select id="risk-scope" value={riskBuilding} onChange={(event) => setRiskBuilding(event.target.value)}>
                  <option value="">Site entier</option>
                  {(buildings.data ?? []).map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.name}
                    </option>
                  ))}
                </Select>
              </div>
              <RiskForm
                key={editing.risk?.id ?? `new-${editing.type.id}-${editing.shape}`}
                type={editing.type}
                risk={editing.risk}
                shape={editing.shape}
                hint={editing.shape === 'point' ? RISK_POINT_HINT : RISK_SURFACE_HINT}
                place="map"
                geometryReady={drawCount > 0}
                saving={saving}
                error={createRisk.error ?? updateRisk.error}
                onSave={saveRisk}
                onCancel={stopEditing}
                onDelete={
                  editing.risk?.geometry
                    ? () => {
                        const risk = editing.risk;
                        if (risk) updateRisk.mutate({ risk, patch: { geometry: null } }, { onSuccess: stopEditing });
                      }
                    : undefined
                }
              />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Risques sur la carte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-2">
              {risksOnMap.map((risk) => (
                <li key={risk.id} className="flex items-start justify-between gap-2">
                  <span className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-1 inline-block size-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: risk.severity >= 4 ? RISK_COLORS.high : RISK_COLORS.other }}
                    />
                    <span>
                      <span className="block font-semibold">{risk.label ?? risk.type_name}</span>
                      <span className="block text-xs text-muted">
                        {[
                          risk.type_name,
                          `gravité ${RISK_SEVERITY_LABELS[risk.severity]}`,
                          risk.geometry?.type === 'Polygon' ? 'zone' : 'point',
                        ].join(' · ')}
                      </span>
                    </span>
                  </span>
                  {canWrite ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        const type = riskTypeOf(risk);
                        if (type) startRisk(type, risk, 'point');
                      }}
                    >
                      Modifier
                    </Button>
                  ) : null}
                </li>
              ))}
              {risksOnMap.length === 0 ? <li className="text-muted">Aucun risque placé sur la carte.</li> : null}
            </ul>
            {risksElsewhere.length > 0 ? (
              <details className="text-xs">
                <summary className="cursor-pointer text-info">
                  Sans position sur la carte ({risksElsewhere.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {risksElsewhere.map((risk) => (
                    <li key={risk.id} className="flex items-center justify-between gap-2">
                      <span>
                        {risk.label ?? risk.type_name}
                        {risk.plan_position ? <span className="text-muted"> · sur plan</span> : null}
                      </span>
                      {canWrite ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            const type = riskTypeOf(risk);
                            if (type) startRisk(type, risk, 'point');
                          }}
                        >
                          Placer
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {canWrite && !busy ? (
              <div className="space-y-2 border-t border-border pt-3">
                <label htmlFor="new-risk-type" className="text-xs font-semibold">
                  Placer un risque extérieur
                </label>
                <Select
                  id="new-risk-type"
                  value={newRiskTypeId}
                  onChange={(event) => setNewRiskTypeId(event.target.value)}
                >
                  <option value="">Type de risque…</option>
                  {offeredRiskTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </Select>
                <div className="flex items-center justify-between gap-2">
                  <fieldset className="flex gap-3 text-xs">
                    <legend className="sr-only">Forme</legend>
                    {(['point', 'polygon'] as const).map((shape) => (
                      <label key={shape} className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="new-risk-shape"
                          className="size-3.5"
                          checked={newRiskShape === shape}
                          onChange={() => setNewRiskShape(shape)}
                        />
                        {shape === 'point' ? 'Point' : 'Zone'}
                      </label>
                    ))}
                  </fieldset>
                  <Button
                    size="sm"
                    disabled={!newRiskTypeId}
                    onClick={() => {
                      const type = riskTypes.data?.find((candidate) => candidate.id === newRiskTypeId);
                      if (type) startRisk(type, null, newRiskShape);
                    }}
                  >
                    Placer
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Points opérationnels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {presentCategories.length > 0 ? (
              <fieldset className="flex flex-wrap gap-x-3 gap-y-1">
                <legend className="sr-only">Calques affichés</legend>
                {presentCategories.map((category) => (
                  <label key={category} className="flex items-center gap-1.5 text-xs">
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
              </fieldset>
            ) : null}
            <ul className="space-y-2">
              {placed.map((object) => (
                <li key={object.id} className="flex items-start justify-between gap-2">
                  <span className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-1 inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[object.category] }}
                    />
                    <span>
                      <span className="block font-semibold">{object.label ?? object.name ?? object.type_name}</span>
                      <span className="block text-xs text-muted">
                        {[
                          object.type_name,
                          object.distance_m !== null ? `à ${Math.round(object.distance_m)} m` : null,
                          object.criticality !== 'info' ? CRITICALITY_LABELS[object.criticality] : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {object.status !== 'active' ? (
                        <Badge tone="critical" className="mt-1">
                          {OBJECT_STATUS_LABELS[object.status]}
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                  {canWrite ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        const type = types.data?.find((candidate) => candidate.id === object.object_type_id);
                        if (type) startObject(type, object);
                      }}
                    >
                      Modifier
                    </Button>
                  ) : null}
                </li>
              ))}
              {placed.length === 0 ? <li className="text-muted">Aucun point placé sur la carte.</li> : null}
            </ul>
            {onPlans.length > 0 ? (
              <p className="text-xs text-muted">
                {onPlans.length} objet{onPlans.length > 1 ? 's' : ''} placé{onPlans.length > 1 ? 's' : ''} sur les plans
                intérieurs (éditeur de plans à venir).
              </p>
            ) : null}
            {archived.length > 0 ? (
              <details className="text-xs">
                <summary className="cursor-pointer text-info">Archivés ({archived.length})</summary>
                <ul className="mt-2 space-y-1">
                  {archived.map((object) => (
                    <li key={object.id} className="flex items-center justify-between gap-2">
                      {object.label ?? object.name ?? object.type_name}
                      {canWrite ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || saving}
                          onClick={() => updateObject.mutate({ object, patch: { status: 'active' } })}
                        >
                          Réactiver
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {canWrite && !busy ? (
              <div className="flex items-end gap-2 border-t border-border pt-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor="new-object-type" className="text-xs font-semibold">
                    Placer un point
                  </label>
                  <Select id="new-object-type" value={newTypeId} onChange={(event) => setNewTypeId(event.target.value)}>
                    <option value="">Type d’objet…</option>
                    {typesByCategory.map((group) => (
                      <optgroup key={group.category} label={OBJECT_CATEGORY_LABELS[group.category]}>
                        {group.types.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </div>
                <Button
                  size="sm"
                  disabled={!newTypeId}
                  onClick={() => {
                    const type = types.data?.find((candidate) => candidate.id === newTypeId);
                    if (type) startObject(type, null);
                  }}
                >
                  Placer
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

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

/** About 1 cm: coordinates sent to the API are rounded. */
function roundGeometry(geometry: DrawnGeometry): DrawnGeometry {
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: roundPosition(geometry.coordinates) };
    case 'LineString':
      return { type: 'LineString', coordinates: geometry.coordinates.map(roundPosition) };
    case 'Polygon':
      return { type: 'Polygon', coordinates: geometry.coordinates.map((ring) => ring.map(roundPosition)) };
  }
}
