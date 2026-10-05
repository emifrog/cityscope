import type { SupervisionRepository } from '@etare/application';
import { tenantSupervisionSchema, type TenantSupervision } from '@etare/contracts';
import type { PoolClient } from './pool';

const iso = (value: unknown) => (typeof value === 'string' ? new Date(value).toISOString() : null);

/** Board of the current SIS, through app.tenant_supervision() (audit:read, checked in PostgreSQL). */
export class PostgresSupervisionRepository implements SupervisionRepository {
  constructor(private readonly client: PoolClient) {}

  async read(): Promise<TenantSupervision> {
    const { rows } = await this.client.query<{ board: Record<string, unknown> }>(
      'select app.tenant_supervision() as board',
    );
    const board = rows[0]?.board ?? {};
    const reports = (board['field_reports'] ?? {}) as Record<string, unknown>;
    return tenantSupervisionSchema.parse({
      ...board,
      generated_at: iso(board['generated_at']),
      field_reports: { ...reports, oldest_new_at: iso(reports['oldest_new_at']) },
    });
  }
}
