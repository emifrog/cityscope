'use client';

import type {
  MapCatalog,
  ObjectType,
  OperationalObject,
  Plan,
  PlanPlacement,
  PlanPosition,
  PlanRevision,
  Risk,
  RiskType,
  Zone,
} from '@etare/contracts';
import { OBJECT_CATEGORIES, propertyDefinitions, type GeometryKind } from '@etare/domain';
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Select, cn } from '@etare/ui';
import type { TerraDraw } from 'terra-draw';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiErrorAlert } from '@/components/feedback';
import {
  CRITICALITY_LABELS,
  OBJECT_CATEGORY_LABELS,
  OBJECT_STATUS_LABELS,
  RISK_SEVERITY_LABELS,
  ZONE_TYPE_LABELS,
} from '@/components/labels';
import { drawnGeometries, startDrawing, type DrawnGeometry } from '@/components/map/drawing';
import { CATEGORY_COLORS } from '@/components/map/object-layers';
import type { LoadedMap } from '@/components/map/use-map';
import { geometryToFrame, geometryToLocal, type LocalGeometry } from '@/components/plan/local-frame';
import {
  ALL_PLAN_LAYERS,
  CLICKABLE_PLAN_LAYERS,
  PLAN_LAYER_GROUPS,
  addPlanLayers,
  filterPlanLayers,
  layerOfCategory,
  planItemsData,
  setPlanItemsData,
  type PlanLayerKey,
} from '@/components/plan/plan-layers';
import { PlanViewer } from '@/components/plan/plan-viewer';
import { RISK_COLOR, RiskPictogram, addRiskImages } from '@/components/plan/risk-pictograms';
import { api, type ApiCallOptions } from '@/lib/api-client';
import {
  queryKeys,
  useApiMutation,
  useObjectTypes,
  useRiskTypes,
  useSiteObjects,
  useSiteRisks,
  useSiteZones,
} from '@/lib/queries';
import { ObjectForm, type ObjectFormValues } from './object-form';
import { ObjectPhotos } from './object-photos';
import { RiskForm, ZoneForm, type RiskFormValues, type ZoneFormValues } from './plan-item-forms';

type ItemKind = 'object' | 'zone' | 'risk';

type Editing =
  | { readonly kind: 'none' }
  | { readonly kind: 'object'; readonly type: ObjectType; readonly item: OperationalObject | null }
  | { readonly kind: 'zone'; readonly item: Zone | null }
  | { readonly kind: 'risk'; readonly type: RiskType; readonly item: Risk | null; readonly shape: 'point' | 'polygon' };

/** Last actions, undone in reverse order (PLAN-02: "annulation"). */
interface UndoEntry {
  readonly label: string;
  readonly revert: (options: ApiCallOptions) => Promise<unknown>;
}

const MAX_UNDO = 20;
const ZONE_DRAW_COLOR = '#334155';

const drawKind = (editing: Exclude<Editing, { kind: 'none' }>): GeometryKind =>
  editing.kind === 'object' ? editing.type.geometry_kind : editing.kind === 'zone' ? 'polygon' : editing.shape;

const drawColor = (editing: Exclude<Editing, { kind: 'none' }>) =>
  editing.kind === 'object'
    ? CATEGORY_COLORS[editing.type.category]
    : editing.kind === 'zone'
      ? ZONE_DRAW_COLOR
      : RISK_COLOR;

function positionsOf(geometry: LocalGeometry): readonly (readonly number[])[] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates];
    case 'LineString':
      return geometry.coordinates;
    case 'Polygon':
      return geometry.coordinates.flat();
  }
}

const insideBackground = (geometry: LocalGeometry, revision: PlanRevision) =>
  positionsOf(geometry).every(([x = -1, y = -1]) => x >= 0 && y >= 0 && x <= revision.width && y <= revision.height);

/** Geometry to start from: the stored one when it fits the shown background (a replaced background: checked by eye). */
function initialGeometry(position: PlanPosition | null, revision: PlanRevision): DrawnGeometry[] {
  if (!position) return [];
  const geometry = position.geometry as LocalGeometry;
  return insideBackground(geometry, revision) ? [geometryToFrame(geometry) as DrawnGeometry] : [];
}

const placement = (revision: PlanRevision, geometry: LocalGeometry): PlanPlacement => ({
  plan_revision_id: revision.id,
  geometry,
});

/**
 * The previous position can be restored only while it is on the shown (current) background. Judged
 * against the shown revision, not the item's is_current flag, which a cached list may not have updated.
 */
const previousPlacement = (position: PlanPosition | null, revision: PlanRevision) =>
  position?.plan_revision_id === revision.id
    ? { plan_position: { plan_revision_id: position.plan_revision_id, geometry: position.geometry } }
    : {};

const properties = (values: Readonly<Record<string, unknown>>) =>
  values as Record<string, string | number | boolean | null>;

const objectName = (object: OperationalObject) =>
  [object.type_name, object.label ?? object.name].filter(Boolean).join(' · ');
const riskName = (risk: Risk) => [risk.type_name, risk.label].filter(Boolean).join(' · ');

/**
 * Items of a plan (PLAN-02..04, RISK-02): objects, zones and risks drawn in
 * the pixels of the shown background, layers, creation, move, deletion and
 * undo of the last actions. Items left on a replaced background are listed to
 * be placed again, by eye, on the current one. Remount (key) per revision.
 */
export function PlanWorkspace({
  siteId,
  plan,
  revision,
  catalog,
  imageUrl,
  canWrite,
}: {
  siteId: string;
  plan: Plan;
  revision: PlanRevision;
  catalog: MapCatalog;
  imageUrl: string;
  canWrite: boolean;
}) {
  const objects = useSiteObjects(siteId);
  const zones = useSiteZones(siteId);
  const risks = useSiteRisks(siteId);
  const objectTypes = useObjectTypes();
  const riskTypes = useRiskTypes();
  const [loaded, setLoaded] = useState<LoadedMap | null>(null);
  const [visible, setVisible] = useState<readonly PlanLayerKey[]>(ALL_PLAN_LAYERS);
  const [editing, setEditing] = useState<Editing>({ kind: 'none' });
  const [viewing, setViewing] = useState<{ kind: ItemKind; id: string } | null>(null);
  const [repositioning, setRepositioning] = useState(false);
  const [drawCount, setDrawCount] = useState(0);
  const [addChoice, setAddChoice] = useState('');
  const [history, setHistory] = useState<readonly UndoEntry[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const initialRef = useRef<DrawnGeometry[]>([]);
  const editingRef = useRef<Editing>(editing);
  const openRef = useRef<(kind: ItemKind, id: string) => void>(() => undefined);
  const editable = canWrite && revision.is_current && plan.status === 'active';
  const fontStack = catalog.glyphs.font_stack;

  const run = useApiMutation(
    (options, operation: (options: ApiCallOptions) => Promise<unknown>) => operation(options),
    (tenantId) => (['objects', 'zones', 'risks'] as const).map((kind) => queryKeys.siteRecords(tenantId, siteId, kind)),
  );

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  /** Layers, pictograms and clicks, once the style is ready (called once per map). */
  function prepare(ready: LoadedMap) {
    const { map } = ready;
    addPlanLayers(map, fontStack);
    // Without pictograms the risks keep their outline and their label.
    void addRiskImages(map).catch(() => undefined);
    const kindOf = (layer: string): ItemKind =>
      layer.startsWith('plan-zones') ? 'zone' : layer.startsWith('plan-risk') ? 'risk' : 'object';
    const under = (point: { x: number; y: number }) =>
      map.queryRenderedFeatures([point.x, point.y], {
        layers: CLICKABLE_PLAN_LAYERS.filter((layer) => map.getLayer(layer)),
      })[0];
    // The topmost item under the pointer opens (a risk above its room).
    map.on('click', (event) => {
      if (editingRef.current.kind !== 'none') return;
      const feature = under(event.point);
      const id = feature?.properties['id'];
      if (feature && typeof id === 'string') openRef.current(kindOf(feature.layer.id), id);
    });
    map.on('mousemove', (event) => {
      if (editingRef.current.kind !== 'none') return;
      map.getCanvas().style.cursor = under(event.point) ? 'pointer' : '';
    });
    setLoaded(ready);
  }

  // Stored items of the shown background; the one being edited is drawn by Terra Draw instead.
  useEffect(() => {
    if (!loaded) return;
    setPlanItemsData(
      loaded.map,
      planItemsData(revision.id, { objects: objects.data ?? [], zones: zones.data ?? [], risks: risks.data ?? [] }),
    );
    filterPlanLayers(loaded.map, visible, editing.kind === 'none' ? null : (editing.item?.id ?? null));
  }, [loaded, revision.id, objects.data, zones.data, risks.data, visible, editing]);

  // Drawing session of the item being edited (one geometry).
  useEffect(() => {
    if (!loaded || editing.kind === 'none') return;
    let disposed = false;
    let draw: TerraDraw | undefined;
    const kind = drawKind(editing);
    void startDrawing(loaded, drawColor(editing), kind, initialRef.current).then((session) => {
      if (disposed) {
        session.stop();
        return;
      }
      draw = session;
      drawRef.current = session;
      const refresh = () => setDrawCount(drawnGeometries(session, kind).length);
      session.on('change', refresh);
      session.on('finish', (id) => {
        const previous = session
          .getSnapshot()
          .filter((feature) => feature.id !== id && feature.properties['mode'] !== 'select')
          .map((feature) => feature.id)
          .filter((featureId): featureId is string | number => featureId !== undefined);
        if (previous.length > 0) session.removeFeatures(previous);
        refresh();
        session.setMode('select');
      });
      refresh();
    });
    return () => {
      disposed = true;
      draw?.stop();
      drawRef.current = null;
    };
  }, [loaded, editing]);

  function start(next: Exclude<Editing, { kind: 'none' }>, position: PlanPosition | null) {
    run.reset();
    setProblem(null);
    setViewing(null);
    initialRef.current = initialGeometry(position, revision);
    setRepositioning(position !== null && position.plan_revision_id !== revision.id);
    setDrawCount(0);
    setEditing(next);
  }

  function stop() {
    setEditing({ kind: 'none' });
    setRepositioning(false);
    setProblem(null);
  }

  function open(kind: ItemKind, id: string) {
    if (!editable) {
      setViewing({ kind, id });
      return;
    }
    if (kind === 'object') {
      const item = objects.data?.find((candidate) => candidate.id === id);
      const type = objectTypes.data?.find((candidate) => candidate.id === item?.object_type_id);
      if (item && type) start({ kind, type, item }, item.plan_position);
    } else if (kind === 'zone') {
      const item = zones.data?.find((candidate) => candidate.id === id);
      if (item) start({ kind, item }, item.plan_position);
    } else {
      const item = risks.data?.find((candidate) => candidate.id === id);
      const type = riskTypes.data?.find((candidate) => candidate.id === item?.risk_type_id);
      const shape = item?.plan_position?.geometry.type === 'Polygon' ? 'polygon' : 'point';
      if (item && type) start({ kind, type, item, shape }, item.plan_position);
      else if (item) setViewing({ kind, id });
    }
  }

  useEffect(() => {
    openRef.current = open;
  });

  function addNew(choice: string, shape: 'point' | 'polygon' = 'point') {
    const [kind, id] = choice.split(':');
    if (kind === 'zone') start({ kind: 'zone', item: null }, null);
    const objectType = objectTypes.data?.find((candidate) => candidate.id === id);
    if (kind === 'object' && objectType) start({ kind: 'object', type: objectType, item: null }, null);
    const riskType = riskTypes.data?.find((candidate) => candidate.id === id);
    if (kind === 'risk' && riskType) start({ kind: 'risk', type: riskType, item: null, shape }, null);
  }

  /** The drawn geometry in plan pixels, or null (nothing drawn, or outside the background). */
  function drawnLocal(): LocalGeometry | null {
    const draw = drawRef.current;
    if (!draw || editing.kind === 'none') return null;
    const drawn = drawnGeometries(draw, drawKind(editing))[0];
    if (!drawn) return null;
    const local = geometryToLocal(drawn as LocalGeometry);
    if (!insideBackground(local, revision)) {
      setProblem('L’élément doit rester sur le fond du plan.');
      return null;
    }
    return local;
  }

  async function perform<T>(
    label: string,
    operation: (options: ApiCallOptions) => Promise<T>,
    revert: (result: T) => UndoEntry['revert'],
  ) {
    try {
      const result = (await run.mutateAsync(operation)) as T;
      setHistory((current) => [...current.slice(-(MAX_UNDO - 1)), { label, revert: revert(result) }]);
      stop();
    } catch {
      // Shown through run.error.
    }
  }

  function saveObject(values: ObjectFormValues) {
    if (editing.kind !== 'object') return;
    const geometry = drawnLocal();
    if (!geometry) return;
    const { item, type } = editing;
    const plan_position = placement(revision, geometry);
    if (item) {
      void perform(
        `modification de « ${objectName(item)} »`,
        (options) => api.updateObject(options, item.id, item.row_version, { ...values, plan_position }),
        (saved) => (options) =>
          api.updateObject(options, saved.id, saved.row_version, {
            label: item.label,
            name: item.name,
            criticality: item.criticality,
            status: item.status,
            instructions: item.instructions,
            properties: properties(item.properties),
            ...previousPlacement(item.plan_position, revision),
          }),
      );
      return;
    }
    void perform(
      `ajout de « ${type.name} »`,
      (options) =>
        api.createSiteObject(options, siteId, {
          ...values,
          status: values.status === 'archived' ? 'active' : values.status,
          object_type_id: type.id,
          plan_position,
        }),
      (created) => (options) => api.updateObject(options, created.id, created.row_version, { status: 'archived' }),
    );
  }

  function saveZone(values: ZoneFormValues) {
    if (editing.kind !== 'zone') return;
    const geometry = drawnLocal();
    if (!geometry) return;
    const { item } = editing;
    const plan_position = placement(revision, geometry);
    if (item) {
      void perform(
        `modification de la zone « ${item.name} »`,
        (options) => api.updateZone(options, item.id, item.row_version, { ...values, plan_position }),
        (saved) => (options) =>
          api.updateZone(options, saved.id, saved.row_version, {
            name: item.name,
            zone_type: item.zone_type,
            status: item.status,
            ...previousPlacement(item.plan_position, revision),
          }),
      );
      return;
    }
    void perform(
      `ajout de la zone « ${values.name} »`,
      (options) => api.createZone(options, siteId, { ...values, plan_position }),
      (created) => (options) => api.updateZone(options, created.id, created.row_version, { status: 'archived' }),
    );
  }

  function saveRisk(values: RiskFormValues) {
    if (editing.kind !== 'risk') return;
    const geometry = drawnLocal();
    if (!geometry) return;
    const { item, type } = editing;
    const plan_position = placement(revision, geometry);
    if (item) {
      void perform(
        `modification du risque « ${riskName(item)} »`,
        (options) => api.updateRisk(options, item.id, item.row_version, { ...values, plan_position }),
        (saved) => (options) =>
          api.updateRisk(options, saved.id, saved.row_version, {
            severity: item.severity,
            label: item.label,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            properties: properties(item.properties),
            status: item.status,
            ...previousPlacement(item.plan_position, revision),
          }),
      );
      return;
    }
    void perform(
      `ajout du risque « ${type.name} »`,
      (options) => api.createSiteRisk(options, siteId, { risk_type_id: type.id, ...values, plan_position }),
      (created) => (options) => api.updateRisk(options, created.id, created.row_version, { status: 'archived' }),
    );
  }

  /** Deletion of working data is an explicit, reversible transition (archived). */
  function remove() {
    if (editing.kind === 'none' || !editing.item) return;
    if (editing.kind === 'object') {
      const item = editing.item;
      void perform(
        `suppression de « ${objectName(item)} »`,
        (options) => api.updateObject(options, item.id, item.row_version, { status: 'archived' }),
        (saved) => (options) => api.updateObject(options, saved.id, saved.row_version, { status: item.status }),
      );
    } else if (editing.kind === 'zone') {
      const item = editing.item;
      void perform(
        `suppression de la zone « ${item.name} »`,
        (options) => api.updateZone(options, item.id, item.row_version, { status: 'archived' }),
        (saved) => (options) => api.updateZone(options, saved.id, saved.row_version, { status: item.status }),
      );
    } else {
      const item = editing.item;
      void perform(
        `suppression du risque « ${riskName(item)} »`,
        (options) => api.updateRisk(options, item.id, item.row_version, { status: 'archived' }),
        (saved) => (options) => api.updateRisk(options, saved.id, saved.row_version, { status: item.status }),
      );
    }
  }

  function undo() {
    const last = history.at(-1);
    if (!last) return;
    run.mutate(last.revert, { onSuccess: () => setHistory((current) => current.slice(0, -1)) });
  }

  const active = <T extends { status: string; plan_position: PlanPosition | null }>(items: readonly T[] | undefined) =>
    (items ?? []).filter((item) => item.status !== 'archived');
  const shown = {
    objects: active(objects.data).filter((item) => item.plan_position?.plan_revision_id === revision.id),
    zones: active(zones.data).filter((item) => item.plan_position?.plan_revision_id === revision.id),
    risks: active(risks.data).filter((item) => item.plan_position?.plan_revision_id === revision.id),
  };
  const stale = (position: PlanPosition | null) =>
    revision.is_current && position?.plan_id === plan.id && position.plan_revision_id !== revision.id;
  const toReplace = {
    objects: active(objects.data).filter((item) => stale(item.plan_position)),
    zones: active(zones.data).filter((item) => stale(item.plan_position)),
    risks: active(risks.data).filter((item) => stale(item.plan_position)),
  };
  const replaceCount = toReplace.objects.length + toReplace.zones.length + toReplace.risks.length;
  const failure = objects.error ?? zones.error ?? risks.error;
  const saving = run.isPending;
  const geometryReady = drawCount > 0;
  const lastAction = history.at(-1);

  const itemButton = (kind: ItemKind, id: string, label: ReactNode) => (
    <li key={id}>
      <button
        type="button"
        disabled={editing.kind !== 'none'}
        onClick={() => open(kind, id)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-subtle disabled:opacity-60"
      >
        {label}
      </button>
    </li>
  );

  return (
    <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_22rem]">
      <PlanViewer
        catalog={catalog}
        revision={revision}
        imageUrl={imageUrl}
        label={`Plan ${plan.title}`}
        onLoaded={prepare}
      />
      <aside
        className="grid content-start gap-3 md:grid-cols-2 2xl:max-h-[70dvh] 2xl:grid-cols-1 2xl:overflow-y-auto"
        aria-label="Éléments du plan"
      >
        {failure ? <ApiErrorAlert error={failure} /> : null}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Calques</CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
              <legend className="sr-only">Calques affichés</legend>
              {PLAN_LAYER_GROUPS.map((group) => (
                <label key={group.key} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-accent"
                    checked={visible.includes(group.key)}
                    onChange={(event) =>
                      setVisible((current) =>
                        event.target.checked ? [...current, group.key] : current.filter((key) => key !== group.key),
                      )
                    }
                  />
                  {group.label}
                </label>
              ))}
            </fieldset>
          </CardContent>
        </Card>

        {editable && editing.kind === 'none' ? (
          <Card>
            <CardContent className="space-y-3 pt-5">
              <Field label="Ajouter sur le plan" htmlFor={`add-${revision.id}`}>
                <Select
                  id={`add-${revision.id}`}
                  value={addChoice}
                  onChange={(event) => setAddChoice(event.target.value)}
                >
                  <option value="">Choisir…</option>
                  {plan.level_id ? <option value="zone">Zone (local, refuge, circulation…)</option> : null}
                  <optgroup label="Risques">
                    {(riskTypes.data ?? []).map((type) => (
                      <option key={type.id} value={`risk:${type.id}`}>
                        {type.name}
                        {type.owner === 'sis' ? ' (SIS)' : ''}
                      </option>
                    ))}
                  </optgroup>
                  {OBJECT_CATEGORIES.map((category) => (
                    <optgroup key={category} label={OBJECT_CATEGORY_LABELS[category]}>
                      {(objectTypes.data ?? [])
                        .filter((type) => type.category === category)
                        .map((type) => (
                          <option key={type.id} value={`object:${type.id}`}>
                            {type.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <div className="flex flex-wrap gap-2">
                {addChoice.startsWith('risk:') ? (
                  <>
                    <Button size="sm" onClick={() => addNew(addChoice, 'point')}>
                      Placer un point
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => addNew(addChoice, 'polygon')}>
                      Dessiner une surface
                    </Button>
                  </>
                ) : (
                  <Button size="sm" disabled={!addChoice} onClick={() => addNew(addChoice)}>
                    Placer sur le plan
                  </Button>
                )}
              </div>
              {lastAction ? (
                <div className="border-t border-border pt-3">
                  <Button size="sm" variant="ghost" disabled={saving} onClick={undo}>
                    Annuler la dernière action
                  </Button>
                  <p className="text-xs text-muted">Dernière action : {lastAction.label}.</p>
                </div>
              ) : null}
              {editing.kind === 'none' && run.error ? <ApiErrorAlert error={run.error} /> : null}
            </CardContent>
          </Card>
        ) : null}

        {editing.kind !== 'none' ? (
          <Card>
            <CardContent className="space-y-3 pt-5">
              {repositioning ? (
                <p className="rounded-md bg-important-soft px-3 py-2 text-sm text-important">
                  Le fond a changé : vérifiez la position sur le nouveau fond (ou redessinez l’élément), puis
                  enregistrez.
                </p>
              ) : null}
              {problem ? <p className="text-sm text-critical">{problem}</p> : null}
              {editing.kind === 'object' ? (
                <>
                  <ObjectForm
                    key={editing.item?.id ?? `new-${editing.type.id}`}
                    type={editing.type}
                    object={editing.item}
                    geometryReady={geometryReady}
                    saving={saving}
                    error={run.error}
                    surface="plan"
                    onSave={saveObject}
                    onCancel={stop}
                    onDelete={editing.item ? remove : undefined}
                  />
                  {editing.item ? <ObjectPhotos siteId={siteId} objectId={editing.item.id} /> : null}
                </>
              ) : editing.kind === 'zone' ? (
                <ZoneForm
                  key={editing.item?.id ?? 'new-zone'}
                  zone={editing.item}
                  geometryReady={geometryReady}
                  saving={saving}
                  error={run.error}
                  onSave={saveZone}
                  onCancel={stop}
                  onDelete={editing.item ? remove : undefined}
                />
              ) : (
                <RiskForm
                  key={editing.item?.id ?? `new-${editing.type.id}-${editing.shape}`}
                  type={editing.type}
                  risk={editing.item}
                  shape={editing.shape}
                  geometryReady={geometryReady}
                  saving={saving}
                  error={run.error}
                  onSave={saveRisk}
                  onCancel={stop}
                  onDelete={editing.item ? remove : undefined}
                />
              )}
            </CardContent>
          </Card>
        ) : null}

        {viewing ? (
          <ItemDetails
            kind={viewing.kind}
            object={objects.data?.find((item) => item.id === viewing.id)}
            objectType={objectTypes.data?.find(
              (type) => type.id === objects.data?.find((item) => item.id === viewing.id)?.object_type_id,
            )}
            zone={zones.data?.find((item) => item.id === viewing.id)}
            risk={risks.data?.find((item) => item.id === viewing.id)}
            riskType={riskTypes.data?.find(
              (type) => type.id === risks.data?.find((item) => item.id === viewing.id)?.risk_type_id,
            )}
            onClose={() => setViewing(null)}
          />
        ) : null}

        {replaceCount > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">À replacer sur le nouveau fond ({replaceCount})</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-xs text-muted">
                Ces éléments sont restés sur l’ancien fond : aucune translation automatique n’est fiable, replacez-les
                en contrôlant leur position.
              </p>
              <ul className="space-y-0.5">
                {toReplace.zones.map((zone) => itemButton('zone', zone.id, `Zone · ${zone.name}`))}
                {toReplace.risks.map((risk) => itemButton('risk', risk.id, riskName(risk)))}
                {toReplace.objects.map((object) => itemButton('object', object.id, objectName(object)))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sur ce fond</CardTitle>
          </CardHeader>
          <CardContent>
            {shown.zones.length + shown.risks.length + shown.objects.length === 0 ? (
              <p className="text-sm text-muted">Aucun élément placé sur ce fond.</p>
            ) : (
              <ul className="space-y-0.5">
                {shown.risks
                  .filter(() => visible.includes('risks'))
                  .map((risk) =>
                    itemButton(
                      'risk',
                      risk.id,
                      <>
                        <RiskPictogram iconKey={risk.icon_key} className="size-6" />
                        <span>
                          {riskName(risk)}
                          <span className="block text-xs text-muted">Gravité {risk.severity}</span>
                        </span>
                      </>,
                    ),
                  )}
                {shown.objects
                  .filter((object) => visible.includes(layerOfCategory(object.category)))
                  .map((object) =>
                    itemButton(
                      'object',
                      object.id,
                      <>
                        <span
                          aria-hidden="true"
                          className="size-3 shrink-0 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[object.category] }}
                        />
                        <span className={cn(object.criticality === 'critical' && 'font-semibold')}>
                          {objectName(object)}
                        </span>
                      </>,
                    ),
                  )}
                {shown.zones
                  .filter(() => visible.includes('zones'))
                  .map((zone) =>
                    itemButton('zone', zone.id, `Zone · ${zone.name} (${ZONE_TYPE_LABELS[zone.zone_type]})`),
                  )}
              </ul>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

/** Read-only card of an item (readers, or a replaced background). */
function ItemDetails({
  kind,
  object,
  objectType,
  zone,
  risk,
  riskType,
  onClose,
}: {
  kind: ItemKind;
  object: OperationalObject | undefined;
  objectType: ObjectType | undefined;
  zone: Zone | undefined;
  risk: Risk | undefined;
  riskType: RiskType | undefined;
  onClose: () => void;
}) {
  const rows: [string, string][] = [];
  let title = '';
  let schema: unknown = null;
  let values: Readonly<Record<string, unknown>> = {};
  let text: string | null = null;
  if (kind === 'object' && object) {
    title = objectName(object);
    rows.push(['Criticité', CRITICALITY_LABELS[object.criticality]], ['État', OBJECT_STATUS_LABELS[object.status]]);
    if (object.name) rows.push(['Nom', object.name]);
    schema = objectType?.properties_schema;
    values = object.properties;
    text = object.instructions;
  } else if (kind === 'zone' && zone) {
    title = `Zone · ${zone.name}`;
    rows.push(['Type', ZONE_TYPE_LABELS[zone.zone_type]]);
  } else if (kind === 'risk' && risk) {
    title = riskName(risk);
    rows.push(['Gravité', RISK_SEVERITY_LABELS[risk.severity] ?? String(risk.severity)]);
    if (risk.quantity !== null) rows.push(['Quantité', `${risk.quantity} ${risk.unit ?? ''}`.trim()]);
    schema = riskType?.properties_schema;
    values = risk.properties;
    text = risk.description;
  }
  for (const [name, definition] of Object.entries(propertyDefinitions(schema))) {
    const value = values[name];
    if (value === undefined || value === null || value === '') continue;
    const shown =
      typeof value === 'boolean'
        ? value
          ? 'oui'
          : 'non'
        : (definition.oneOf?.find((choice) => choice.const === value)?.title ?? String(value));
    rows.push([definition.title ?? name, `${shown}${definition.unit ? ` ${definition.unit}` : ''}`]);
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="text-sm">{title || 'Élément introuvable'}</CardTitle>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Fermer
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {text ? <p className="whitespace-pre-line">{text}</p> : null}
      </CardContent>
    </Card>
  );
}
