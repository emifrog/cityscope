import type { RequestSession, SessionFactory, SessionOptions } from '@etare/application';
import {
  AccessDenied,
  Conflict,
  DeviceNotEnrolled,
  DeviceProofInvalid,
  DeviceRevoked,
  InvalidInput,
  NotFound,
  PreconditionFailed,
  SelfApprovalForbidden,
  SerializationConflict,
  StrongAuthenticationRequired,
  Unauthenticated,
  isPermission,
  type RequestContext,
  type ResolvedAccess,
} from '@etare/domain';
import { z } from 'zod';
import { PostgresAccountRepository, PostgresSecuritySettingsRepository } from './account-repository';
import { PostgresBuildingRepository } from './building-repository';
import { PostgresDeviceRepository } from './device-repository';
import { PostgresEtareRepository } from './etare-repository';
import { PostgresFieldReportRepository } from './field-report-repository';
import { PostgresContributionRepository } from './contribution-repository';
import { PostgresNotificationRepository } from './notification-repository';
import { PostgresPortalAccessRepository } from './portal-repository';
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

  async run<T>(
    context: RequestContext,
    work: (session: RequestSession) => Promise<T>,
    options?: SessionOptions,
  ): Promise<T> {
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query(options?.isolation === 'repeatable_read' ? 'begin isolation level repeatable read' : 'begin');
      const access = await openRequest(client, context);
      let deviceProven = false;
      const result = await work({
        access,
        confirmDeviceProof: () => {
          deviceProven = true;
        },
        account: new PostgresAccountRepository(client),
        security: new PostgresSecuritySettingsRepository(client),
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
        etare: new PostgresEtareRepository(client),
        devices: new PostgresDeviceRepository(client),
        fieldReports: new PostgresFieldReportRepository(client),
        portal: new PostgresPortalAccessRepository(client),
        contributions: new PostgresContributionRepository(client),
        notifications: new PostgresNotificationRepository(client),
        jobs: new PostgresJobScheduler(client),
        audit: new PostgresAuditRecorder(client),
      });
      // The terminal named by the request may have stood for the second factor of the
      // account: nothing commits nor answers unless its signature was verified.
      if (context.deviceId && !deviceProven) throw new DeviceProofInvalid();
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
    'select user_id, tenant_id, permissions from app.begin_request($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [
      context.principal.provider,
      context.principal.subject,
      context.tenantId,
      context.principal.assurance,
      isUuid(context.traceId) ? context.traceId : null,
      context.origin,
      context.principal.sessionId ?? null,
      context.deviceId ?? null,
      context.purpose ?? null,
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
  etare_revision_open_uq: 'Une révision est déjà en cours pour ce site (brouillon ou en attente de validation).',
  device_name_uq: 'Un terminal actif ou en attente porte déjà ce nom dans votre SIS.',
  device_public_key_uq: 'Cette clé de terminal est déjà enrôlée : réinstallez l’application.',
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

/** Messages of the refusals raised by app.sync_submit_report (SQLSTATE ETRPI). */
const REPORT_MESSAGES: readonly (readonly [string, string])[] = [
  ['FIELD_REPORT_ITEM', 'Élément ou position absent de la version consultée.'],
  ['FIELD_REPORT_TIME', 'Constat daté dans le futur : vérifiez l’heure de la tablette.'],
  ['FIELD_REPORT_PHOTOS', 'Cinq photos au plus, images PNG, JPEG ou WebP de 15 Mo au plus.'],
];

/** Messages of the exploitant portal rules (POR-01). */
const PORTAL_MESSAGES: readonly (readonly [string, string])[] = [
  ['PORTAL_INVITATION_SITES', 'Choisissez de un à cinquante sites de votre SIS.'],
  [
    'PORTAL_INVITATION_DATES',
    'Une invitation est valable de 1 à 30 jours ; la fin de l’accès vient après, dans les 5 ans.',
  ],
  ['EXPLOITANT_SCOPE', 'Un exploitant n’accède qu’à des sites, jamais à tout le SIS.'],
];

/** Messages of the refusals of a proposal (SQLSTATE ETCTV). */
const CONTRIBUTION_MESSAGES: readonly (readonly [string, string])[] = [
  ['CONTRIBUTION_LIMIT', 'Vingt propositions au plus en cours par site : attendez la réponse du SIS.'],
  ['CONTRIBUTION_VALUE', 'Valeur proposée inattendue pour cet élément.'],
  ['CONTRIBUTION_FILES', 'Cinq fichiers au plus, PDF, PNG, JPEG ou WebP de 50 Mo au plus.'],
];

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function constraintOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'constraint' in error && typeof error.constraint === 'string') {
    return error.constraint;
  }
  return undefined;
}

/** Translates the SQLSTATEs raised by our guards and constraints into domain errors; anything else stays internal. */
export function translateDatabaseError(error: unknown): unknown {
  switch (sqlState(error)) {
    case '40001':
    case '40P01':
      return new SerializationConflict();
    case 'ET401':
      return new Unauthenticated('Compte inconnu ou désactivé.');
    case 'ET403':
      return new AccessDenied('Vous n’êtes pas membre de ce SIS.');
    case 'ETSES':
      return new Unauthenticated('Session fermée : reconnectez-vous.');
    case 'ETMFA':
      return new StrongAuthenticationRequired(
        'Votre compte est protégé par la double authentification : saisissez le code de votre application.',
      );
    case 'ETMFE':
      return new StrongAuthenticationRequired(
        'Votre SIS exige la double authentification : activez-la dans « Mon compte ».',
      );
    case '42501':
      if (messageOf(error).includes('SELF_APPROVAL_FORBIDDEN')) return new SelfApprovalForbidden();
      if (messageOf(error).includes('PORTAL_MEMBERSHIP_INACTIVE')) {
        return new AccessDenied('Votre accès à ce SIS est suspendu ou révoqué : contactez le SIS.');
      }
      return new AccessDenied();
    case 'ETSLF':
      return new AccessDenied('Vous ne pouvez pas modifier vos propres habilitations.');
    case 'ETADM':
      return new Conflict('Le SIS doit conserver au moins un administrateur actif.');
    case 'ET404':
      return new NotFound('Membre introuvable dans votre SIS.');
    case 'ETD04':
      return new NotFound('Terminal introuvable dans votre SIS.');
    case 'ETD12':
      return new PreconditionFailed('Ce terminal a été modifié entre-temps : rechargez la liste.');
    case 'ETD09':
      return new Conflict('Action impossible dans l’état actuel du terminal (déjà enrôlé ou révoqué).');
    case 'ETENR':
      return new InvalidInput('Code d’enrôlement inconnu, déjà utilisé ou expiré : demandez-en un nouveau.');
    case 'ETDNE':
      return new DeviceNotEnrolled();
    case 'ETDRV':
      return new DeviceRevoked();
    case 'ETRPM':
      return new Conflict(
        'Un autre signalement utilise déjà cet identifiant : il n’a pas été enregistré une seconde fois.',
      );
    case 'ETRPB':
      return new InvalidInput('Version consultée inconnue pour ce site : synchronisez la tablette puis réessayez.');
    case 'ETRPI':
      return new InvalidInput(
        REPORT_MESSAGES.find(([code]) => messageOf(error).includes(code))?.[1] ?? 'Signalement refusé.',
      );
    case 'ETRPU':
      return new NotFound('Signalement introuvable pour ce terminal.');
    case 'ET412':
      return new PreconditionFailed('Ce membre a été modifié entre-temps : rechargez la liste avant d’enregistrer.');
    case 'ETPIS':
      return new NotFound('Site introuvable dans votre SIS.');
    case 'ETPIN':
      return new NotFound('Invitation introuvable dans votre SIS.');
    case 'ETPIU':
      return new NotFound(
        'Invitation introuvable, déjà utilisée, révoquée ou expirée : demandez-en une nouvelle au SIS.',
      );
    case 'ETCTS':
      return new NotFound('Site introuvable dans votre SIS.');
    case 'ETCTT':
      return new InvalidInput('Cet élément ne figure plus dans la version publiée : rechargez la page.');
    case 'ETCTV':
      return new InvalidInput(
        CONTRIBUTION_MESSAGES.find(([code]) => messageOf(error).includes(code))?.[1] ?? 'Proposition refusée.',
      );
    case 'ETCTN':
      return new NotFound('Proposition introuvable.');
    case 'ETNTN':
      return new NotFound('Notification introuvable.');
    case 'ETNTP':
      return new Conflict('Cette notification attend déjà son envoi.');
    case 'ETPI2':
      return new PreconditionFailed('Cette invitation a été modifiée entre-temps : rechargez la liste.');
    case '23505':
      return new Conflict(UNIQUE_MESSAGES[constraintOf(error) ?? ''] ?? 'Cet élément existe déjà.');
    case '23503':
      return new NotFound('Élément lié introuvable dans votre SIS.');
    case '23514':
      if (messageOf(error).includes('FIELD_REPORT_CLOSED')) {
        return new Conflict('Ce signalement a déjà été décidé : la décision est définitive.');
      }
      if (messageOf(error).includes('FIELD_REPORT_ASSIGNEE')) {
        return new InvalidInput('Affectez le signalement à un membre actif du SIS.');
      }
      if (messageOf(error).includes('SITE_PUBLISHED')) {
        return new Conflict('Une version est en vigueur : un validateur doit d’abord la retirer (onglet ETARE).');
      }
      if (messageOf(error).includes('SITE_PUBLICATION_PENDING')) {
        return new Conflict('Une publication est en cours de fabrication : attendez sa fin avant d’archiver.');
      }
      if (messageOf(error).includes('SITE_REVISION_SUBMITTED')) {
        return new Conflict('Une révision attend la décision d’un validateur : obtenez-la avant d’archiver.');
      }
      if (messageOf(error).includes('SITE_ARCHIVED')) {
        return new Conflict('Ce site est archivé : restaurez-le avant de travailler sur son dossier.');
      }
      if (constraintOf(error) === 'site_archive_reason') {
        return new InvalidInput('Archivez le site depuis son dossier ETARE, avec un motif.');
      }
      if (constraintOf(error) === 'publication_withdrawal_reason_length') {
        return new InvalidInput('Motivez le retrait (3 à 1 000 caractères).');
      }
      if (messageOf(error).includes('CONTRIBUTION_CLOSED')) {
        return new Conflict('Cette proposition est déjà décidée ou retirée : c’est définitif.');
      }
      if (messageOf(error).includes('CONTRIBUTION_CONFLICT')) {
        return new Conflict(
          'La valeur a changé dans les données de travail depuis la proposition : indiquez comment le conflit est résolu.',
        );
      }
      if (messageOf(error).includes('CONTRIBUTION_REVISION')) {
        return new InvalidInput('Une proposition acceptée s’intègre à une révision en brouillon de ce site.');
      }
      if (messageOf(error).includes('CONTRIBUTION_ASSIGNEE')) {
        return new InvalidInput('Affectez la proposition à un membre actif du SIS.');
      }
      if (messageOf(error).includes('FIELD_REPORT_REVISION')) {
        return new InvalidInput('Un signalement s’intègre à une révision en brouillon de ce site.');
      }
      for (const [code, message] of PORTAL_MESSAGES) {
        if (messageOf(error).includes(code)) return new InvalidInput(message);
      }
      if (messageOf(error).includes('PORTAL_INVITATION_REVOKED')) {
        return new Conflict('Cette invitation est déjà révoquée : la révocation est définitive.');
      }
      if (messageOf(error).includes('REVISION_HASH_MISMATCH')) {
        return new PreconditionFailed('La révision a changé depuis votre lecture : rechargez-la avant de décider.');
      }
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
