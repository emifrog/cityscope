import type { RequestSession, SessionFactory } from '@etare/application';
import {
  AccessDenied,
  Conflict,
  InvalidInput,
  NotFound,
  PreconditionFailed,
  Unauthenticated,
  isPermission,
  type RequestContext,
  type ResolvedAccess,
} from '@etare/domain';
import { z } from 'zod';
import { PostgresBuildingRepository } from './building-repository';
import { PostgresAssetRepository, PostgresDocumentRepository } from './document-repository';
import { PostgresIdentityReader } from './identity-reader';
import { PostgresMemberRepository } from './member-repository';
import { PostgresOperationalObjectRepository } from './operational-object-repository';
import { PostgresPlanRepository } from './plan-repository';
import { PostgresRiskRepository } from './risk-repository';
import { PostgresZoneRepository } from './zone-repository';
import { sqlState, type Pool, type PoolClient } from './pool';
import { PostgresAuditRecorder, PostgresJobScheduler } from './request-services';
import {
  PostgresClassificationRepository,
  PostgresContactRepository,
  PostgresExternalIdRepository,
} from './site-records';
import { PostgresSiteRepository } from './site-repository';

const beginRequestRowSchema = z.object({
  user_id: z.string(),
  tenant_id: z.string().nullable(),
  permissions: z.array(z.string()),
});

/**
 * Opens one transaction per request. Its first statement, app.begin_request,
 * re-checks the account and the membership in the database and sets the
 * transaction-local context read by RLS policies. The context disappears at
 * COMMIT/ROLLBACK, so nothing leaks to the next user of a pooled connection.
 */
export class PostgresSessionFactory implements SessionFactory {
  constructor(private readonly pool: Pool) {}

  async run<T>(context: RequestContext, work: (session: RequestSession) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('begin');
      const access = await openRequest(client, context);
      const result = await work({
        access,
        identity: new PostgresIdentityReader(client),
        sites: new PostgresSiteRepository(client),
        buildings: new PostgresBuildingRepository(client),
        classifications: new PostgresClassificationRepository(client),
        contacts: new PostgresContactRepository(client),
        externalIds: new PostgresExternalIdRepository(client),
        documents: new PostgresDocumentRepository(client),
        assets: new PostgresAssetRepository(client),
        members: new PostgresMemberRepository(client),
        objects: new PostgresOperationalObjectRepository(client),
        plans: new PostgresPlanRepository(client),
        zones: new PostgresZoneRepository(client),
        risks: new PostgresRiskRepository(client),
        jobs: new PostgresJobScheduler(client),
        audit: new PostgresAuditRecorder(client),
      });
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => {
        broken = true;
      });
      throw translateDatabaseError(error);
    } finally {
      client.release(broken);
    }
  }
}

async function openRequest(client: PoolClient, context: RequestContext): Promise<ResolvedAccess> {
  const result = await client.query(
    'select user_id, tenant_id, permissions from app.begin_request($1, $2, $3, $4, $5, $6)',
    [
      context.principal.provider,
      context.principal.subject,
      context.tenantId,
      context.principal.assurance,
      isUuid(context.traceId) ? context.traceId : null,
      context.origin,
    ],
  );
  const row = beginRequestRowSchema.parse(result.rows[0]);
  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    permissions: new Set(row.permissions.filter(isPermission)),
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Messages of the unique constraints a user can legitimately hit. */
const UNIQUE_MESSAGES: Readonly<Record<string, string>> = {
  site_etare_number_uq: 'Ce numéro ETARE est déjà utilisé dans votre SIS.',
  level_building_id_label_key: 'Ce niveau existe déjà dans ce bâtiment.',
  external_identifier_tenant_id_system_code_external_id_key: 'Cet identifiant externe est déjà utilisé dans votre SIS.',
  membership_tenant_id_user_id_key: 'Cette personne est déjà membre de votre SIS (réactivez-la si elle est suspendue).',
  user_account_auth_provider_email_key: 'Cette adresse est rattachée à une autre identité : contactez le support.',
  catalog_code_national: 'Ce code appartient au catalogue national : choisissez-en un autre.',
  risk_type_tenant_code_uq: 'Ce code est déjà utilisé dans le catalogue de votre SIS.',
};

/** Messages of the placement rules (plans, scope of objects and risks). */
const CHECK_MESSAGES: Readonly<Record<string, string>> = {
  operational_object_geometry_kind: 'La géométrie ne correspond pas au type d’objet (point, ligne ou surface).',
  operational_object_position_check: 'Un point opérationnel doit être placé sur la carte ou sur un plan.',
  risk_occurrence_geometry_kind: 'Un risque se place comme un point ou une surface.',
  plan_position_current: 'Le fond de ce plan a été remplacé : placez l’élément sur le fond actuel.',
  plan_position_bounds: 'L’élément doit rester sur le fond du plan.',
  plan_position_level:
    'Ce plan ne correspond pas au niveau de l’élément (les zones se dessinent sur un plan de niveau).',
  plan_position_missing: 'Position sur le plan manquante.',
  placement_scope: 'Bâtiment, niveau et zone ne concordent pas.',
  // Validity of the geometries drawn on plans (st_isvalid, unnamed checks of the initial schema).
  zone_check: 'Tracé invalide sur le plan : le contour ne doit pas se recouper.',
  operational_object_check: 'Tracé invalide sur le plan : le contour ne doit pas se recouper.',
  risk_occurrence_check2: 'Tracé invalide sur le plan : le contour ne doit pas se recouper.',
};

function constraintOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'constraint' in error && typeof error.constraint === 'string') {
    return error.constraint;
  }
  return undefined;
}

/** Translates the SQLSTATEs raised by our guards and constraints into domain errors; anything else stays internal. */
export function translateDatabaseError(error: unknown): unknown {
  switch (sqlState(error)) {
    case 'ET401':
      return new Unauthenticated('Compte inconnu ou désactivé.');
    case 'ET403':
      return new AccessDenied('Vous n’êtes pas membre de ce SIS.');
    case '42501':
      return new AccessDenied();
    case 'ETSLF':
      return new AccessDenied('Vous ne pouvez pas modifier vos propres habilitations.');
    case 'ETADM':
      return new Conflict('Le SIS doit conserver au moins un administrateur actif.');
    case 'ET404':
      return new NotFound('Membre introuvable dans votre SIS.');
    case 'ET412':
      return new PreconditionFailed('Ce membre a été modifié entre-temps : rechargez la liste avant d’enregistrer.');
    case '23505':
      return new Conflict(UNIQUE_MESSAGES[constraintOf(error) ?? ''] ?? 'Cet élément existe déjà.');
    case '23503':
      return new NotFound('Élément lié introuvable dans votre SIS.');
    case '23514':
      // PostGIS validity checks (st_isvalid) on drawn geometries.
      if (CHECK_MESSAGES[constraintOf(error) ?? '']) {
        return new InvalidInput(CHECK_MESSAGES[constraintOf(error) ?? ''] ?? '');
      }
      if (/_(geom|footprint)_check$/.test(constraintOf(error) ?? '')) {
        return new InvalidInput('Contour invalide : il ne doit pas se recouper ni se refermer sur lui-même.');
      }
      return new InvalidInput('Valeur refusée par une règle de cohérence des données.');
    case '23502':
    case '22P02':
    case '22023':
      return new InvalidInput('Valeur refusée par une règle de cohérence des données.');
    default:
      return error;
  }
}
