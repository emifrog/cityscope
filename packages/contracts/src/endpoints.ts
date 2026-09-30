import type { z } from 'zod';
import {
  healthResponseSchema,
  meResponseSchema,
  siteDetailSchema,
  siteListQuerySchema,
  siteListResponseSchema,
  siteParamsSchema,
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
  readonly successStatus: 200 | 201 | 202;
  readonly response: z.ZodType;
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
  listSites: {
    operationId: 'listSites',
    method: 'get',
    path: '/sites',
    summary: 'Sites du SIS actif (données de travail)',
    tags: ['sites'],
    auth: 'user',
    tenantScoped: true,
    query: siteListQuerySchema,
    successStatus: 200,
    response: siteListResponseSchema,
  },
  getSite: {
    operationId: 'getSite',
    method: 'get',
    path: '/sites/{id}',
    summary: 'Détail d’un site du SIS actif',
    tags: ['sites'],
    auth: 'user',
    tenantScoped: true,
    params: siteParamsSchema,
    successStatus: 200,
    response: siteDetailSchema,
  },
} as const satisfies Record<string, EndpointContract>;

export type EndpointName = keyof typeof endpoints;
export type EndpointResponse<N extends EndpointName> = z.infer<(typeof endpoints)[N]['response']>;
