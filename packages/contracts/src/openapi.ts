import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { API_BASE_PATH, API_VERSION, endpoints } from './endpoints';
import { apiErrorSchema } from './errors';
import { TENANT_HEADER } from './resources';

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

  for (const endpoint of Object.values(endpoints)) {
    const headers = endpoint.tenantScoped
      ? z.object({
          [TENANT_HEADER]: z.uuid().meta({
            description: 'SIS actif. Indication seulement : l’appartenance est revérifiée côté serveur.',
          }),
        })
      : undefined;

    registry.registerPath({
      operationId: endpoint.operationId,
      method: endpoint.method,
      path: endpoint.path,
      summary: endpoint.summary,
      tags: [...endpoint.tags],
      security: endpoint.auth === 'user' ? [{ [bearer.name]: [] }] : [],
      request: {
        ...('params' in endpoint ? { params: endpoint.params } : {}),
        ...('query' in endpoint ? { query: endpoint.query } : {}),
        ...(headers ? { headers } : {}),
      },
      responses: {
        [endpoint.successStatus]: {
          description: 'Succès',
          content: { 'application/json': { schema: endpoint.response } },
        },
        400: errorResponse('Requête invalide (VALIDATION_FAILED, TENANT_REQUIRED)'),
        ...(endpoint.auth === 'user'
          ? {
              401: errorResponse('Authentification requise'),
              403: errorResponse('Accès refusé'),
            }
          : {}),
        ...('params' in endpoint ? { 404: errorResponse('Ressource introuvable ou non autorisée') } : {}),
        500: errorResponse('Erreur interne (sans détail)'),
      },
    });
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
