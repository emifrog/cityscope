import type {
  Risk,
  RiskCreate,
  RiskType,
  RiskTypeCreate,
  RiskTypeUpdate,
  RiskUpdate,
  Zone,
  ZoneCreate,
  ZoneUpdate,
} from '@etare/contracts';
import {
  AccessDenied,
  InvalidInput,
  schemaFromFields,
  validateObjectProperties,
  type RequestContext,
} from '@etare/domain';
import type { SessionFactory } from './ports';
import { found, inTenant } from './use-cases';

/**
 * Risks (RISK-01, RISK-02) and zones of the levels. National risk types are
 * reference data; a SIS extends the catalogue with its own types and fields
 * (catalog:manage). An occurrence is scoped to the site, a building, a level
 * or a zone, and may be drawn on a plan.
 */
function checkRiskProperties(type: RiskType, properties: Readonly<Record<string, unknown>> | undefined): void {
  if (!properties) return;
  const issues = validateObjectProperties(type.properties_schema, properties);
  if (issues.length > 0) throw new InvalidInput('Champs non conformes au type de risque.', issues);
}

export function listRiskTypes(
  sessions: SessionFactory,
  context: RequestContext,
  options: { includeDeprecated?: boolean } = {},
): Promise<RiskType[]> {
  return inTenant(sessions, context, 'site:read', (session) =>
    session.risks.types({
      includeDeprecated: options.includeDeprecated === true && session.access.permissions.has('catalog:manage'),
    }),
  );
}

export function createRiskType(
  sessions: SessionFactory,
  context: RequestContext,
  input: RiskTypeCreate,
): Promise<RiskType> {
  return inTenant(sessions, context, 'catalog:manage', (session) =>
    session.risks.createType({ ...input, properties_schema: { ...schemaFromFields(input.fields) } }),
  );
}

export function updateRiskType(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  patch: RiskTypeUpdate,
): Promise<RiskType> {
  return inTenant(sessions, context, 'catalog:manage', async (session) => {
    const current = found(await session.risks.type(id), 'Type de risque introuvable.');
    if (current.owner === 'national') {
      throw new AccessDenied('Le catalogue national ne se modifie pas : ajoutez un type propre à votre SIS.');
    }
    const { fields, ...rest } = patch;
    return found(
      await session.risks.updateType(id, expectedVersion, {
        ...rest,
        ...(fields ? { properties_schema: { ...schemaFromFields(fields) } } : {}),
      }),
      'Type de risque introuvable.',
    );
  });
}

export function listSiteRisks(sessions: SessionFactory, context: RequestContext, siteId: string): Promise<Risk[]> {
  return inTenant(sessions, context, 'site:read', async (session) =>
    found(await session.risks.listBySite(siteId), 'Site introuvable.'),
  );
}

export function createSiteRisk(
  sessions: SessionFactory,
  context: RequestContext,
  siteId: string,
  input: RiskCreate,
): Promise<Risk> {
  return inTenant(sessions, context, 'site:write', async (session) => {
    const type = await session.risks.type(input.risk_type_id);
    if (!type || type.status !== 'active') {
      throw new InvalidInput('Type de risque inconnu ou retiré.', [
        { path: 'risk_type_id', message: 'Type de risque inconnu ou retiré.' },
      ]);
    }
    checkRiskProperties(type, input.properties);
    return found(
      await session.risks.create(siteId, { ...input, severity: input.severity ?? type.default_severity }),
      'Site introuvable.',
    );
  });
}

export function updateSiteRisk(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  patch: RiskUpdate,
): Promise<Risk> {
  return inTenant(sessions, context, 'site:write', async (session) => {
    const current = found(await session.risks.get(id), 'Risque introuvable.');
    if (patch.properties) {
      checkRiskProperties(
        found(await session.risks.type(current.risk_type_id), 'Type de risque introuvable.'),
        patch.properties,
      );
    }
    return found(await session.risks.update(id, expectedVersion, patch), 'Risque introuvable.');
  });
}

// ------------------------------------------------------------------ zones
export function listSiteZones(sessions: SessionFactory, context: RequestContext, siteId: string): Promise<Zone[]> {
  return inTenant(sessions, context, 'site:read', async (session) =>
    found(await session.zones.listBySite(siteId), 'Site introuvable.'),
  );
}

export function createZone(
  sessions: SessionFactory,
  context: RequestContext,
  siteId: string,
  input: ZoneCreate,
): Promise<Zone> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.zones.create(siteId, input), 'Site ou plan introuvable.'),
  );
}

export function updateZone(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  patch: ZoneUpdate,
): Promise<Zone> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.zones.update(id, expectedVersion, patch), 'Zone introuvable.'),
  );
}
