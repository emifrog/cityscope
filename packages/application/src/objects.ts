import type {
  MapFeaturesQuery,
  MapFeaturesResponse,
  ObjectPhoto,
  ObjectPhotoCreate,
  ObjectPhotoUpdate,
  ObjectPhotoUpload,
  ObjectType,
  OperationalObject,
  OperationalObjectCreate,
  OperationalObjectUpdate,
} from '@etare/contracts';
import { InvalidInput, geometryMatchesKind, validateObjectProperties, type RequestContext } from '@etare/domain';
import type { SessionFactory } from './ports';
import { requireStorage, uploadTicket, type DocumentDependencies } from './uploads';
import { found, inTenant } from './use-cases';

const GEOMETRY_LABELS = { point: 'un point', line: 'une ligne', polygon: 'une surface' } as const;

interface Drawn {
  readonly geometry?: { readonly type: string } | undefined;
  readonly plan_position?: { readonly geometry: { readonly type: string } } | null | undefined;
  readonly properties?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * The geometries drawn on the map and on a plan, and the properties, must
 * follow the object type (PostgreSQL re-checks the geometries).
 */
function checkAgainstType(type: ObjectType, { geometry, plan_position: onPlan, properties }: Drawn): void {
  for (const [path, drawn] of [
    ['geometry', geometry],
    ['plan_position.geometry', onPlan?.geometry],
  ] as const) {
    if (drawn && !geometryMatchesKind(drawn.type, type.geometry_kind)) {
      throw new InvalidInput(`« ${type.name} » se place comme ${GEOMETRY_LABELS[type.geometry_kind]}.`, [
        { path, message: `Géométrie attendue : ${GEOMETRY_LABELS[type.geometry_kind]}.` },
      ]);
    }
  }
  if (properties) {
    const issues = validateObjectProperties(type.properties_schema, properties);
    if (issues.length > 0) throw new InvalidInput('Propriétés non conformes au type d’objet.', issues);
  }
}

export async function listObjectTypes(sessions: SessionFactory, context: RequestContext): Promise<ObjectType[]> {
  return inTenant(sessions, context, 'site:read', (session) => session.objects.types());
}

export async function listSiteObjects(
  sessions: SessionFactory,
  context: RequestContext,
  siteId: string,
): Promise<OperationalObject[]> {
  return inTenant(sessions, context, 'site:read', async (session) =>
    found(await session.objects.listBySite(siteId), 'Site introuvable.'),
  );
}

export async function createSiteObject(
  sessions: SessionFactory,
  context: RequestContext,
  siteId: string,
  input: OperationalObjectCreate,
): Promise<OperationalObject> {
  return inTenant(sessions, context, 'site:write', async (session) => {
    const type = await session.objects.type(input.object_type_id);
    if (!type) {
      throw new InvalidInput('Type d’objet inconnu.', [{ path: 'object_type_id', message: 'Type d’objet inconnu.' }]);
    }
    checkAgainstType(type, input);
    return found(await session.objects.create(siteId, input), 'Site introuvable.');
  });
}

export async function updateSiteObject(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  patch: OperationalObjectUpdate,
): Promise<OperationalObject> {
  return inTenant(sessions, context, 'site:write', async (session) => {
    const current = found(await session.objects.get(id), 'Objet introuvable.');
    if (patch.geometry || patch.plan_position || patch.properties) {
      const type = found(await session.objects.type(current.object_type_id), 'Type d’objet introuvable.');
      checkAgainstType(type, patch);
    }
    return found(await session.objects.update(id, expectedVersion, patch), 'Objet introuvable.');
  });
}

export async function listMapFeatures(
  sessions: SessionFactory,
  context: RequestContext,
  query: MapFeaturesQuery,
): Promise<MapFeaturesResponse> {
  return inTenant(sessions, context, 'site:read', (session) => session.objects.mapFeatures(query));
}

/**
 * Photos of an object (PLAN-05): the image follows the controlled upload
 * chain of documents; it reaches the snapshot and the tablets once checked.
 */
export async function createObjectPhoto(
  deps: DocumentDependencies,
  context: RequestContext,
  objectId: string,
  input: ObjectPhotoCreate,
): Promise<ObjectPhotoUpload> {
  const storage = requireStorage(deps);
  const created = await inTenant(deps.sessions, context, 'site:write', async (session) =>
    found(await session.objects.createPhoto(objectId, input), 'Objet introuvable.'),
  );
  return { photo: created.photo, upload: await uploadTicket(storage, created.upload) };
}

export function updateObjectPhoto(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  patch: ObjectPhotoUpdate,
): Promise<ObjectPhoto> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.objects.updatePhoto(id, expectedVersion, patch), 'Photo introuvable.'),
  );
}
