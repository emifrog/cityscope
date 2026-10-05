import type { AccessEventList, AccessEventListQuery } from '@etare/contracts';
import type { RequestContext } from '@etare/domain';
import type { SessionFactory } from './ports';
import { inTenant } from './use-cases';

/** Journal of the accesses to sensitive sites (PER-02), for the holders of audit:read. */
export function listAccessEvents(
  sessions: SessionFactory,
  context: RequestContext,
  query: AccessEventListQuery,
): Promise<AccessEventList> {
  return inTenant(sessions, context, 'audit:read', (session) => session.accessJournal.list(query));
}
