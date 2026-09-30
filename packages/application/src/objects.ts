import type {
  ExteriorGeometry,
  MapFeaturesQuery,
  MapFeaturesResponse,
  ObjectType,
  OperationalObject,
  OperationalObjectCreate,
  OperationalObjectUpdate,
} from '@etare/contracts';
import { InvalidInput, geometryMatchesKind, validateObjectProperties, type RequestContext } from '@etare/domain';
import type { SessionFactory } from './ports';
import { found, inTenant } from './use-cases';

const GEOMETRY_LABELS = { point: 'un point', line: 'une ligne', polygon: 'une surface' } as const;

/** The drawn geometry and the properties must follow the object type (PostgreSQL re-checks the geometry). */
function checkAgainstType(
  type: ObjectType,
  geometry: ExteriorGeometry | undefined,
  properties: Readonly<Record<string, unknown>> | undefined,
): void {
  if (geometry && !geometryMatchesKind(geometry.type, type.geometry_kind)) {
    throw new InvalidInput(`« ${type.name} » se place comme ${GEOMETRY_LABELS[type.geometry_kind]}.`, [
      { path: 'geometry', message: `Géométrie attendue : ${GEOMETRY_LABELS[type.geometry_kind]}.` },
    ]);
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
    checkAgainstType(type, input.geometry, input.properties);
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
    if (patch.geometry || patch.properties) {
      const type = found(await session.objects.type(current.object_type_id), 'Type d’objet introuvable.');
      checkAgainstType(type, patch.geometry, patch.properties);
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
