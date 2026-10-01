import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { API_BASE_PATH, API_VERSION, endpoints, type EndpointContract } from './endpoints';
import { apiErrorSchema } from './errors';
import { TENANT_HEADER } from './resources';
import {
  APP_VERSION_HEADER,
  DEVICE_ID_HEADER,
  DEVICE_SIGNATURE_HEADER,
  DEVICE_TIME_HEADER,
  publicationManifestSchema,
  syncCatalogSchema,
} from './sync';

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: apiErrorSchema } },
});

/** Builds the OpenAPI 3.1 document from the endpoint contracts. */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const bearer = registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Jeton d’accès du fournisseur d’identité (Supabase Auth au MVP).',
  });

  for (const endpoint of Object.values(endpoints) as EndpointContract[]) {
    const headerFields: Record<string, z.ZodType> = {};
    if (endpoint.tenantScoped) {
      headerFields[TENANT_HEADER] = z.uuid().meta({
        description: 'SIS actif. Indication seulement : l’appartenance est revérifiée côté serveur.',
      });
    }
    if (endpoint.concurrency === 'if-match') {
      headerFields['if-match'] = z.string().meta({
        description: 'Version sur laquelle porte la modification (valeur de l’ETag reçu), ex. "3".',
        example: '"3"',
      });
    }
    if (endpoint.deviceProof) {
      headerFields[DEVICE_ID_HEADER] = z.uuid().meta({ description: 'Terminal enrôlé qui signe la requête.' });
      headerFields[DEVICE_TIME_HEADER] = z
        .string()
        .regex(/^\d{1,15}$/)
        .meta({
          description: 'Horloge du terminal (millisecondes depuis 1970), à 5 min près de celle du serveur.',
        });
      headerFields[DEVICE_SIGNATURE_HEADER] = z.string().meta({
        description:
          'Ed25519 (base64) du texte « etare.device-request.v1 », méthode, chemin, horloge et SHA-256 du corps, un par ligne.',
      });
      headerFields[APP_VERSION_HEADER] = z.string().optional().meta({ description: 'Version de l’application OPS.' });
    }
    const etag =
      endpoint.concurrency !== undefined
        ? {
            headers: {
              ETag: { description: 'Version de la ressource (row_version)', schema: { type: 'string' as const } },
            },
          }
        : {};

    registry.registerPath({
      operationId: endpoint.operationId,
      method: endpoint.method,
      path: endpoint.path,
      summary: endpoint.summary,
      tags: [...endpoint.tags],
      security: endpoint.auth === 'user' ? [{ [bearer.name]: [] }] : [],
      request: {
        ...(endpoint.params ? { params: endpoint.params } : {}),
        ...(endpoint.query ? { query: endpoint.query } : {}),
        ...(Object.keys(headerFields).length > 0 ? { headers: z.object(headerFields) } : {}),
        ...(endpoint.body
          ? { body: { required: true, content: { 'application/json': { schema: endpoint.body } } } }
          : {}),
      },
      responses: {
        [endpoint.successStatus]: {
          description: 'Succès',
          ...etag,
          content: { 'application/json': { schema: endpoint.response } },
        },
        400: errorResponse('Requête invalide (VALIDATION_FAILED, TENANT_REQUIRED)'),
        ...(endpoint.auth === 'user'
          ? {
              401: errorResponse(
                endpoint.deviceProof
                  ? 'Authentification requise (UNAUTHENTICATED, DEVICE_PROOF_INVALID, DEVICE_CLOCK_SKEW)'
                  : 'Authentification requise',
              ),
              403: errorResponse(
                endpoint.deviceProof
                  ? 'Accès refusé (FORBIDDEN, DEVICE_NOT_ENROLLED, DEVICE_REVOKED)'
                  : 'Accès refusé (FORBIDDEN, MFA_REQUIRED)',
              ),
            }
          : {}),
        ...(endpoint.params ? { 404: errorResponse('Ressource introuvable ou non autorisée') } : {}),
        ...(endpoint.body ? { 409: errorResponse('Conflit avec des données existantes (CONFLICT)') } : {}),
        ...(endpoint.concurrency === 'if-match'
          ? {
              412: errorResponse('Modifiée entre-temps : relire puis réessayer (PRECONDITION_FAILED)'),
              428: errorResponse('En-tête If-Match manquant (PRECONDITION_REQUIRED)'),
            }
          : {}),
        500: errorResponse('Erreur interne (sans détail)'),
      },
    });
  }

  // Signed texts travel as strings: what they contain is documented as components (inlined JSON Schema).
  const signedContents = { SyncCatalog: syncCatalogSchema, PublicationManifest: publicationManifestSchema };
  for (const [name, schema] of Object.entries(signedContents)) {
    const jsonSchema: Record<string, unknown> = z.toJSONSchema(schema, {
      metadata: z.registry(),
      unrepresentable: 'any',
    });
    delete jsonSchema['$schema'];
    registry.registerComponent('schemas', name, jsonSchema);
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'etare-platform API',
      version: API_VERSION,
      description:
        'API métier de la plateforme ETARE numérique. Toutes les réponses sont limitées au SIS actif et aux droits de l’appelant.',
    },
    servers: [{ url: API_BASE_PATH }],
  });
}
