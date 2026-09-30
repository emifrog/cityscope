import type { z } from 'zod';
import {
  assetDownloadSchema,
  documentCreateSchema,
  documentListResponseSchema,
  documentSchema,
  documentUpdateSchema,
  documentUploadResponseSchema,
  documentVersionCreateSchema,
  uploadConfirmationSchema,
} from './documents';
import { addressCandidatesSchema, addressSearchQuerySchema, reverseGeocodingQuerySchema } from './geocoding';
import { mapCatalogSchema, mapSitesQuerySchema, mapSitesResponseSchema } from './map';
import {
  mapFeaturesQuerySchema,
  mapFeaturesResponseSchema,
  objectTypeListSchema,
  operationalObjectCreateSchema,
  operationalObjectListSchema,
  operationalObjectSchema,
  operationalObjectUpdateSchema,
} from './objects';
import {
  planCreateSchema,
  planListResponseSchema,
  planRevisionCreateSchema,
  planSchema,
  planUpdateSchema,
  planUploadResponseSchema,
} from './plans';
import {
  memberInvitationSchema,
  memberInviteSchema,
  memberListResponseSchema,
  memberSchema,
  memberUpdateSchema,
} from './members';
import {
  buildingCreateSchema,
  buildingListResponseSchema,
  buildingSchema,
  buildingUpdateSchema,
  classificationCreateSchema,
  classificationListResponseSchema,
  classificationSchema,
  classificationUpdateSchema,
  contactCreateSchema,
  contactListResponseSchema,
  contactSchema,
  contactUpdateSchema,
  externalIdCreateSchema,
  externalIdListResponseSchema,
  externalIdSchema,
  idParamsSchema,
  levelCreateSchema,
  levelSchema,
  levelUpdateSchema,
  siteCreateSchema,
  siteUpdateSchema,
} from './referential';
import {
  healthResponseSchema,
  meResponseSchema,
  siteDetailSchema,
  siteListQuerySchema,
  siteListResponseSchema,
} from './resources';

export const API_VERSION = 'v1';
export const API_BASE_PATH = `/api/${API_VERSION}`;

/**
 * Framework-agnostic description of an endpoint. The same objects drive the
 * OpenAPI document, the server-side validation (services/api) and the typed
 * clients, so they cannot drift apart silently.
 */
export interface EndpointContract {
  readonly operationId: string;
  readonly method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  /** OpenAPI path template relative to API_BASE_PATH, e.g. /sites/{id}. */
  readonly path: string;
  readonly summary: string;
  readonly tags: readonly string[];
  /** 'user': a valid access token is required. */
  readonly auth: 'public' | 'user';
  /** true: the X-Tenant-Id header (active SIS) is required. */
  readonly tenantScoped: boolean;
  readonly params?: z.ZodObject;
  readonly query?: z.ZodObject;
  /** JSON request body. */
  readonly body?: z.ZodType;
  /**
   * Optimistic concurrency. 'etag': the response carries an ETag (row version).
   * 'if-match': the request must carry If-Match (428 otherwise, 412 if stale).
   */
  readonly concurrency?: 'etag' | 'if-match';
  readonly successStatus: 200 | 201 | 202;
  readonly response: z.ZodType;
}

/** Shorthand for the many tenant-scoped, authenticated endpoints. */
function tenantEndpoint<const E extends Omit<EndpointContract, 'auth' | 'tenantScoped'>>(endpoint: E) {
  return { ...endpoint, auth: 'user', tenantScoped: true } as const;
}

export const endpoints = {
  getHealth: {
    operationId: 'getHealth',
    method: 'get',
    path: '/health',
    summary: 'État du service',
    tags: ['system'],
    auth: 'public',
    tenantScoped: false,
    successStatus: 200,
    response: healthResponseSchema,
  },
  getMe: {
    operationId: 'getMe',
    method: 'get',
    path: '/me',
    summary: 'Utilisateur connecté et SIS auxquels il appartient',
    tags: ['identity'],
    auth: 'user',
    tenantScoped: false,
    successStatus: 200,
    response: meResponseSchema,
  },

  // ---------------------------------------------------------------- map
  getMapCatalog: {
    operationId: 'getMapCatalog',
    method: 'get',
    path: '/map/sources',
    summary: 'Fonds de carte autorisés (catalogue serveur : URL, zooms, attribution, droits)',
    tags: ['map'],
    auth: 'user',
    tenantScoped: false,
    successStatus: 200,
    response: mapCatalogSchema,
  },
  listMapSites: tenantEndpoint({
    operationId: 'listMapSites',
    method: 'get',
    path: '/map/sites',
    summary: 'Sites positionnés du SIS actif en GeoJSON, filtrables et limités à l’emprise visible',
    tags: ['map'],
    query: mapSitesQuerySchema,
    successStatus: 200,
    response: mapSitesResponseSchema,
  }),

  listMapFeatures: tenantEndpoint({
    operationId: 'listMapFeatures',
    method: 'get',
    path: '/map/features',
    summary: 'Emprises des bâtiments et points opérationnels d’une zone restreinte (vue rapprochée)',
    tags: ['map'],
    query: mapFeaturesQuerySchema,
    successStatus: 200,
    response: mapFeaturesResponseSchema,
  }),
  searchAddresses: tenantEndpoint({
    operationId: 'searchAddresses',
    method: 'get',
    path: '/geocoding/search',
    summary: 'Rechercher une adresse (géocodeur IGN, appelé par le serveur)',
    tags: ['map'],
    query: addressSearchQuerySchema,
    successStatus: 200,
    response: addressCandidatesSchema,
  }),
  reverseGeocode: tenantEndpoint({
    operationId: 'reverseGeocode',
    method: 'get',
    path: '/geocoding/reverse',
    summary: 'Adresse la plus proche d’un point (géocodeur IGN, appelé par le serveur)',
    tags: ['map'],
    query: reverseGeocodingQuerySchema,
    successStatus: 200,
    response: addressCandidatesSchema,
  }),

  // ---------------------------------------------------------------- sites
  listSites: tenantEndpoint({
    operationId: 'listSites',
    method: 'get',
    path: '/sites',
    summary: 'Rechercher les sites du SIS actif (données de travail)',
    tags: ['sites'],
    query: siteListQuerySchema,
    successStatus: 200,
    response: siteListResponseSchema,
  }),
  createSite: tenantEndpoint({
    operationId: 'createSite',
    method: 'post',
    path: '/sites',
    summary: 'Créer un site',
    tags: ['sites'],
    body: siteCreateSchema,
    concurrency: 'etag',
    successStatus: 201,
    response: siteDetailSchema,
  }),
  getSite: tenantEndpoint({
    operationId: 'getSite',
    method: 'get',
    path: '/sites/{id}',
    summary: 'Détail d’un site du SIS actif',
    tags: ['sites'],
    params: idParamsSchema,
    concurrency: 'etag',
    successStatus: 200,
    response: siteDetailSchema,
  }),
  updateSite: tenantEndpoint({
    operationId: 'updateSite',
    method: 'patch',
    path: '/sites/{id}',
    summary: 'Modifier un site',
    tags: ['sites'],
    params: idParamsSchema,
    body: siteUpdateSchema,
    concurrency: 'if-match',
    successStatus: 200,
    response: siteDetailSchema,
  }),

  // ---------------------------------------------------------------- buildings and levels
  listBuildings: tenantEndpoint({
    operationId: 'listBuildings',
    method: 'get',
    path: '/sites/{id}/buildings',
    summary: 'Bâtiments et niveaux d’un site',
    tags: ['buildings'],
    params: idParamsSchema,
    successStatus: 200,
    response: buildingListResponseSchema,
  }),
  createBuilding: tenantEndpoint({
    operationId: 'createBuilding',
    method: 'post',
    path: '/sites/{id}/buildings',
    summary: 'Ajouter un bâtiment à un site',
    tags: ['buildings'],
    params: idParamsSchema,
    body: buildingCreateSchema,
    concurrency: 'etag',
    successStatus: 201,
    response: buildingSchema,
  }),
  updateBuilding: tenantEndpoint({
    operationId: 'updateBuilding',
    method: 'patch',
    path: '/buildings/{id}',
    summary: 'Modifier un bâtiment',
    tags: ['buildings'],
    params: idParamsSchema,
    body: buildingUpdateSchema,
    concurrency: 'if-match',
    successStatus: 200,
    response: buildingSchema,
  }),
  createLevel: tenantEndpoint({
    operationId: 'createLevel',
    method: 'post',
    path: '/buildings/{id}/levels',
    summary: 'Ajouter un niveau à un bâtiment',
    tags: ['buildings'],
    params: idParamsSchema,
    body: levelCreateSchema,
    concurrency: 'etag',
    successStatus: 201,
    response: levelSchema,
  }),
  updateLevel: tenantEndpoint({
    operationId: 'updateLevel',
    method: 'patch',
    path: '/levels/{id}',
    summary: 'Modifier un niveau',
    tags: ['buildings'],
    params: idParamsSchema,
    body: levelUpdateSchema,
    concurrency: 'if-match',
    successStatus: 200,
    response: levelSchema,
  }),

  // ---------------------------------------------------------------- classifications
  listClassifications: tenantEndpoint({
    operationId: 'listClassifications',
    method: 'get',
    path: '/sites/{id}/classifications',
    summary: 'Classifications réglementaires d’un site (ERP, IGH, ICPE...)',
    tags: ['classifications'],
    params: idParamsSchema,
    successStatus: 200,
    response: classificationListResponseSchema,
  }),
  createClassification: tenantEndpoint({
    operationId: 'createClassification',
    method: 'post',
    path: '/sites/{id}/classifications',
    summary: 'Ajouter une classification datée',
    tags: ['classifications'],
    params: idParamsSchema,
    body: classificationCreateSchema,
    concurrency: 'etag',
    successStatus: 201,
    response: classificationSchema,
  }),
  updateClassification: tenantEndpoint({
    operationId: 'updateClassification',
    method: 'patch',
    path: '/classifications/{id}',
    summary: 'Modifier ou clore une classification',
    tags: ['classifications'],
    params: idParamsSchema,
    body: classificationUpdateSchema,
    concurrency: 'if-match',
    successStatus: 200,
    response: classificationSchema,
  }),

  // ---------------------------------------------------------------- contacts
  listContacts: tenantEndpoint({
    operationId: 'listContacts',
    method: 'get',
    path: '/sites/{id}/contacts',
    summary: 'Contacts et astreintes d’un site',
    tags: ['contacts'],
    params: idParamsSchema,
    successStatus: 200,
    response: contactListResponseSchema,
  }),
  createContact: tenantEndpoint({
    operationId: 'createContact',
    method: 'post',
    path: '/sites/{id}/contacts',
    summary: 'Ajouter un contact',
    tags: ['contacts'],
    params: idParamsSchema,
    body: contactCreateSchema,
    concurrency: 'etag',
    successStatus: 201,
    response: contactSchema,
  }),
  updateContact: tenantEndpoint({
    operationId: 'updateContact',
    method: 'patch',
    path: '/contacts/{id}',
    summary: 'Modifier, vérifier ou archiver un contact',
    tags: ['contacts'],
    params: idParamsSchema,
    body: contactUpdateSchema,
    concurrency: 'if-match',
    successStatus: 200,
    response: contactSchema,
  }),

  // ---------------------------------------------------------------- external identifiers
  listExternalIds: tenantEndpoint({
    operationId: 'listExternalIds',
    method: 'get',
    path: '/sites/{id}/external-ids',
    summary: 'Identifiants externes (SIG, SGO, DECI...) du site et de ses éléments',
    tags: ['sites'],
    params: idParamsSchema,
    successStatus: 200,
    response: externalIdListResponseSchema,
  }),
  createExternalId: tenantEndpoint({
    operationId: 'createExternalId',
    method: 'post',
    path: '/sites/{id}/external-ids',
    summary: 'Associer un identifiant externe',
    tags: ['sites'],
    params: idParamsSchema,
    body: externalIdCreateSchema,
    successStatus: 201,
    response: externalIdSchema,
  }),

  // ---------------------------------------------------------------- operational objects
  listObjectTypes: tenantEndpoint({
    operationId: 'listObjectTypes',
    method: 'get',
    path: '/object-types',
    summary: 'Catalogue des types d’objets opérationnels (global et propre au SIS)',
    tags: ['objects'],
    successStatus: 200,
    response: objectTypeListSchema,
  }),
  listSiteObjects: tenantEndpoint({
    operationId: 'listSiteObjects',
    method: 'get',
    path: '/sites/{id}/objects',
    summary: 'Points opérationnels d’un site (accès, eau, coupures…)',
    tags: ['objects'],
    params: idParamsSchema,
    successStatus: 200,
    response: operationalObjectListSchema,
  }),
  createSiteObject: tenantEndpoint({
    operationId: 'createSiteObject',
    method: 'post',
    path: '/sites/{id}/objects',
    summary: 'Placer un point opérationnel sur la carte',
    tags: ['objects'],
    params: idParamsSchema,
    body: operationalObjectCreateSchema,
    successStatus: 201,
    response: operationalObjectSchema,
  }),
  updateObject: tenantEndpoint({
    operationId: 'updateObject',
    method: 'patch',
    path: '/objects/{id}',
    summary: 'Modifier, déplacer, vérifier ou archiver un point opérationnel',
    tags: ['objects'],
    params: idParamsSchema,
    body: operationalObjectUpdateSchema,
    concurrency: 'if-match',
    successStatus: 200,
    response: operationalObjectSchema,
  }),

  // ---------------------------------------------------------------- plans
  listSitePlans: tenantEndpoint({
    operationId: 'listSitePlans',
    method: 'get',
    path: '/sites/{id}/plans',
    summary: 'Plans d’un site (masse, niveaux, réseaux, évacuation) et leurs révisions de fond',
    tags: ['plans'],
    params: idParamsSchema,
    successStatus: 200,
    response: planListResponseSchema,
  }),
  createPlan: tenantEndpoint({
    operationId: 'createPlan',
    method: 'post',
    path: '/sites/{id}/plans',
    summary: 'Créer un plan et obtenir l’URL de dépôt de son fond (quarantaine)',
    tags: ['plans'],
    params: idParamsSchema,
    body: planCreateSchema,
    successStatus: 201,
    response: planUploadResponseSchema,
  }),
  updatePlan: tenantEndpoint({
    operationId: 'updatePlan',
    method: 'patch',
    path: '/plans/{id}',
    summary: 'Renommer ou archiver un plan',
    tags: ['plans'],
    params: idParamsSchema,
    body: planUpdateSchema,
    concurrency: 'if-match',
    successStatus: 200,
    response: planSchema,
  }),
  createPlanRevision: tenantEndpoint({
    operationId: 'createPlanRevision',
    method: 'post',
    path: '/plans/{id}/revisions',
    summary: 'Remplacer le fond d’un plan (nouvelle révision, les précédentes sont conservées)',
    tags: ['plans'],
    params: idParamsSchema,
    body: planRevisionCreateSchema,
    successStatus: 201,
    response: planUploadResponseSchema,
  }),

  // ---------------------------------------------------------------- documents and files
  listDocuments: tenantEndpoint({
    operationId: 'listDocuments',
    method: 'get',
    path: '/sites/{id}/documents',
    summary: 'Documents d’un site et état de contrôle de leurs fichiers',
    tags: ['documents'],
    params: idParamsSchema,
    successStatus: 200,
    response: documentListResponseSchema,
  }),
  createDocument: tenantEndpoint({
    operationId: 'createDocument',
    method: 'post',
    path: '/sites/{id}/documents',
    summary: 'Créer un document et obtenir l’URL de dépôt de son fichier (quarantaine)',
    tags: ['documents'],
    params: idParamsSchema,
    body: documentCreateSchema,
    successStatus: 201,
    response: documentUploadResponseSchema,
  }),
  updateDocument: tenantEndpoint({
    operationId: 'updateDocument',
    method: 'patch',
    path: '/documents/{id}',
    summary: 'Modifier ou archiver un document',
    tags: ['documents'],
    params: idParamsSchema,
    body: documentUpdateSchema,
    concurrency: 'if-match',
    successStatus: 200,
    response: documentSchema,
  }),
  createDocumentVersion: tenantEndpoint({
    operationId: 'createDocumentVersion',
    method: 'post',
    path: '/documents/{id}/versions',
    summary: 'Ajouter une nouvelle version (les précédentes sont conservées)',
    tags: ['documents'],
    params: idParamsSchema,
    body: documentVersionCreateSchema,
    successStatus: 201,
    response: documentUploadResponseSchema,
  }),
  confirmUpload: tenantEndpoint({
    operationId: 'confirmUpload',
    method: 'post',
    path: '/assets/{id}/uploaded',
    summary: 'Signaler la fin du dépôt : le contrôle du fichier est planifié',
    tags: ['documents'],
    params: idParamsSchema,
    successStatus: 202,
    response: uploadConfirmationSchema,
  }),
  getAssetDownload: tenantEndpoint({
    operationId: 'getAssetDownload',
    method: 'get',
    path: '/assets/{id}/download',
    summary: 'URL de téléchargement de courte durée d’un fichier contrôlé (accès tracé)',
    tags: ['documents'],
    params: idParamsSchema,
    successStatus: 200,
    response: assetDownloadSchema,
  }),

  // ---------------------------------------------------------------- members of the SIS
  listMembers: tenantEndpoint({
    operationId: 'listMembers',
    method: 'get',
    path: '/members',
    summary: 'Membres du SIS et leurs rôles (administration, double authentification exigée)',
    tags: ['members'],
    successStatus: 200,
    response: memberListResponseSchema,
  }),
  inviteMember: tenantEndpoint({
    operationId: 'inviteMember',
    method: 'post',
    path: '/members',
    summary: 'Inviter une personne dans le SIS (ou rattacher un compte existant)',
    tags: ['members'],
    body: memberInviteSchema,
    successStatus: 201,
    response: memberInvitationSchema,
  }),
  updateMember: tenantEndpoint({
    operationId: 'updateMember',
    method: 'patch',
    path: '/members/{id}',
    summary: 'Modifier les rôles d’un membre, le suspendre ou le réactiver (jamais soi-même)',
    tags: ['members'],
    params: idParamsSchema,
    body: memberUpdateSchema,
    concurrency: 'if-match',
    successStatus: 200,
    response: memberSchema,
  }),
} as const satisfies Record<string, EndpointContract>;

export type EndpointName = keyof typeof endpoints;
export type EndpointResponse<N extends EndpointName> = z.infer<(typeof endpoints)[N]['response']>;
