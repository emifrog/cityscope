/**
 * Sprint 10 — sections of the ETARE (MET-05, ADR-026): the administration
 * hides optional sections; the setting is frozen into each submitted
 * revision, which never changes afterwards.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createPool, PostgresSessionFactory } from '@etare/adapters';
import {
  createRevision,
  getEtareLayoutSettings,
  getRevision,
  previewSiteEtare,
  submitRevision,
  updateEtareLayoutSettings,
} from '@etare/application';
import { siteCreateSchema } from '@etare/contracts';
import { AccessDenied, canonicalJson, type RequestContext } from '@etare/domain';
import { afterAll, describe, expect, it } from 'vitest';
import { requireEnv, TENANT_06 } from './helpers';

const pool = createPool({ connectionString: requireEnv('DATABASE_URL'), applicationName: 'test-etare-layout' });
const sessions = new PostgresSessionFactory(pool);
const sha256 = async (text: string) => createHash('sha256').update(text).digest('hex');
const as = (subject: string): RequestContext => ({
  principal: { provider: 'supabase', subject, email: null, assurance: 'aal1' },
  tenantId: TENANT_06,
  traceId: randomUUID(),
  origin: 'integration',
});
const admin = as('00000000-0000-4000-a000-000000000001');
const editor = as('00000000-0000-4000-a000-000000000002');

afterAll(async () => {
  // Shared demonstration SIS: every section shown again for the other tests.
  await updateEtareLayoutSettings(sessions, admin, { hidden_sections: [] });
  await pool.end();
});

describe('sections of the ETARE (MET-05)', () => {
  it('freezes the setting of the SIS into the revision, which keeps it afterwards', async () => {
    expect(await getEtareLayoutSettings(sessions, editor)).toEqual({ hidden_sections: [] });
    await expect(updateEtareLayoutSettings(sessions, editor, { hidden_sections: ['photos'] })).rejects.toThrow(
      AccessDenied,
    );
    expect(await updateEtareLayoutSettings(sessions, admin, { hidden_sections: ['photos', 'energy'] })).toEqual({
      hidden_sections: ['energy', 'photos'],
    });

    const site = await sessions.run(editor, (session) =>
      session.sites.create(
        siteCreateSchema.parse({
          name: `Sections ${randomUUID()}`,
          site_type: 'erp',
          status: 'active',
          location: { type: 'Point', coordinates: [7.26, 43.7] },
        }),
      ),
    );
    const preview = await previewSiteEtare({ sessions, sha256 }, editor, site.id);
    expect(preview.snapshot.layout?.sections).toEqual([
      'synthesis',
      'access',
      'risks',
      'water',
      'rescue',
      'plans',
      'contacts',
      'annexes',
    ]);
    expect(preview.content_hash).toBe(await sha256(canonicalJson(preview.snapshot)));

    const draft = await createRevision(sessions, editor, site.id, { change_summary: 'Première version' });
    const submitted = await submitRevision({ sessions, sha256 }, editor, draft.id, draft.row_version, {
      change_summary: 'Première version',
    });

    // The SIS shows everything again: new content has no layout, the frozen revision keeps its own.
    await updateEtareLayoutSettings(sessions, admin, { hidden_sections: [] });
    expect((await previewSiteEtare({ sessions, sha256 }, editor, site.id)).snapshot).not.toHaveProperty('layout');
    const frozen = await getRevision(sessions, editor, submitted.id);
    expect(frozen.snapshot?.layout?.sections).not.toContain('energy');
    expect(frozen.revision.content_hash).toBe(await sha256(canonicalJson(frozen.snapshot)));
  });
});
