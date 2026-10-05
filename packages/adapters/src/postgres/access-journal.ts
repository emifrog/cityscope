import type { AccessJournal } from '@etare/application';
import {
  accessEventSchema,
  type AccessAction,
  type AccessEventList,
  type AccessEventListQuery,
} from '@etare/contracts';
import { InvalidInput, type Sensitivity } from '@etare/domain';
import { z } from 'zod';
import type { PoolClient } from './pool';

interface AccessEventRow {
  id: string;
  occurred_at: Date;
  recorded_at: Date;
  action: string;
  origin: string;
  sensitivity: string;
  site_id: string;
  site_name: string;
  user_name: string | null;
  device_name: string | null;
  publication_number: number | null;
}

const cursorKey = z.tuple([z.iso.datetime({ offset: true }), z.uuid()]);

function decodeJournalCursor(cursor: string): { before: string; id: string } {
  try {
    const [before, id] = cursorKey.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    return { before, id };
  } catch {
    throw new InvalidInput('Curseur de pagination invalide.', [{ path: 'cursor', message: 'Curseur invalide.' }]);
  }
}

/** Journal of the accesses to sensitive sites (PER-02): written and read through app.* functions. */
export class PostgresAccessJournal implements AccessJournal {
  constructor(private readonly client: PoolClient) {}

  async record(
    siteId: string,
    publicationId: string | null,
    action: AccessAction,
    device?: { readonly deviceId: string; readonly clientEventId?: string; readonly occurredAt?: Date },
  ): Promise<Sensitivity | null> {
    const { rows } = await this.client.query<{ sensitivity: Sensitivity | null }>(
      'select app.record_site_access($1, $2, $3, $4, $5, $6) as sensitivity',
      [
        siteId,
        publicationId,
        action,
        device?.deviceId ?? null,
        device?.clientEventId ?? null,
        device?.occurredAt ?? null,
      ],
    );
    return rows[0]?.sensitivity ?? null;
  }

  async list(query: AccessEventListQuery): Promise<AccessEventList> {
    const after = query.cursor ? decodeJournalCursor(query.cursor) : null;
    const { rows } = await this.client.query<AccessEventRow>('select * from app.access_journal($1, $2, $3, $4)', [
      query.site_id ?? null,
      after?.before ?? null,
      after?.id ?? null,
      query.limit + 1,
    ]);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) =>
        accessEventSchema.parse({
          ...row,
          occurred_at: row.occurred_at.toISOString(),
          recorded_at: row.recorded_at.toISOString(),
        }),
      ),
      next_cursor:
        rows.length > query.limit && last
          ? Buffer.from(JSON.stringify([last.occurred_at.toISOString(), last.id]), 'utf8').toString('base64url')
          : null,
    };
  }

  async exportAllowed(publicationId: string): Promise<boolean> {
    const { rows } = await this.client.query<{ allowed: boolean | null }>(
      'select app.publication_export_allowed($1) as allowed',
      [publicationId],
    );
    return rows[0]?.allowed === true;
  }
}
