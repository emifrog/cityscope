/** Real concurrent transactions: a submission must never mix two committed versions. */
import { createHash, randomUUID } from 'node:crypto';
import { createPool, PostgresSessionFactory } from '@etare/adapters';
import { previewSiteEtare, submitRevision, type RequestSession, type SessionFactory } from '@etare/application';
import {
  buildingCreateSchema,
  contactCreateSchema,
  levelCreateSchema,
  operationalObjectCreateSchema,
  planCreateSchema,
  planRevisionCreateSchema,
  siteCreateSchema,
  type EtareSnapshot,
} from '@etare/contracts';
import { Conflict, canonicalJson, type RequestContext } from '@etare/domain';
import { afterAll, describe, expect, it } from 'vitest';
import { requireEnv, TENANT_06 } from './helpers';

const pool = createPool({ connectionString: requireEnv('DATABASE_URL'), applicationName: 'test-snapshot' });
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'test-snapshot',
});
const sessions = new PostgresSessionFactory(pool);
const context: RequestContext = {
  principal: { provider: 'supabase', subject: '00000000-0000-4000-a000-000000000002', email: null, assurance: 'aal1' },
  tenantId: TENANT_06,
  traceId: randomUUID(),
  origin: 'integration',
};
const sha256 = async (text: string) => createHash('sha256').update(text).digest('hex');
/** Another member of the SIS (administrator, site:write) editing at the same time. */
const otherEditor: RequestContext = {
  ...context,
  principal: { ...context.principal, subject: '00000000-0000-4000-a000-000000000001' },
};
const EDITOR_ACCOUNT = '00000000-0000-4000-b000-000000000002';
const OTHER_ACCOUNT = '00000000-0000-4000-b000-000000000001';

afterAll(async () => {
  await pool.end();
  await workerPool.end();
});

const background = {
  width: 1600,
  height: 1000,
  file: { filename: 'plan.png', mime_type: 'image/png', size_bytes: 1000, sha256: 'a'.repeat(64) },
};

/** A site with a level plan whose background is checked, and an SSI placed on it. */
async function planFixture() {
  const created = await sessions.run(context, async (session) => {
    const site = await session.sites.create(
      siteCreateSchema.parse({
        name: `Fond concurrent ${randomUUID()}`,
        site_type: 'erp',
        status: 'active',
        location: { type: 'Point', coordinates: [7.26, 43.7] },
      }),
    );
    const building = await session.buildings.create(site.id, buildingCreateSchema.parse({ name: 'Bâtiment A' }));
    const level =
      building &&
      (await session.buildings.createLevel(building.id, levelCreateSchema.parse({ label: 'RDC', sort_order: 0 })));
    const plan =
      level &&
      (await session.plans.create(
        site.id,
        planCreateSchema.parse({ title: 'RDC', plan_type: 'level', level_id: level.id, ...background }),
      ));
    const revision = await session.etare.createRevision(site.id, 'Fond remplacé pendant la soumission');
    if (!plan || !revision) throw new Error('Fixture not created');
    return { site, plan: plan.plan, assetId: plan.upload.assetId, revision };
  });
  // The first background passed the verification (worker verdict).
  await workerPool.query("select app.worker_complete_asset_verification($1, 'clean', '{}'::jsonb)", [created.assetId]);
  const firstBackground = created.plan.revisions[0]?.id ?? '';
  const object = await sessions.run(context, async (session) => {
    const ssi = (await session.objects.types()).find((type) => type.code === 'SSI');
    return session.objects.create(
      created.site.id,
      operationalObjectCreateSchema.parse({
        object_type_id: ssi?.id,
        label: 'SSI',
        plan_position: { plan_revision_id: firstBackground, geometry: { type: 'Point', coordinates: [100, 100] } },
      }),
    );
  });
  if (!object) throw new Error('Object not placed');
  return { ...created, firstBackground, object };
}

/** Every position on a plan refers to a background frozen in the same snapshot. */
const consistent = (snapshot: EtareSnapshot) => {
  const backgrounds = new Set(snapshot.plans.map((plan) => plan.background.revision_id));
  return [...snapshot.zones, ...snapshot.objects, ...snapshot.risks].every(
    (item) => !item.plan_position || backgrounds.has(item.plan_position.plan_revision_id),
  );
};

/**
 * Runs the reader's work, but lets another member replace the background and
 * move the object (committed) right after the reader has read the site.
 * `isolation: false` drops the isolation the use case asks for (READ COMMITTED).
 */
function replacingBackgroundDuringRead(
  fixture: Awaited<ReturnType<typeof planFixture>>,
  { isolation }: { isolation: boolean },
): SessionFactory {
  let done = false;
  return {
    run: (ctx, work, options) =>
      sessions.run(
        ctx,
        async (session: RequestSession) => {
          const get = session.sites.get.bind(session.sites);
          session.sites.get = async (id) => {
            const before = await get(id);
            if (!done) {
              done = true;
              await sessions.run(otherEditor, async (writer) => {
                const replaced = await writer.plans.addRevision(
                  fixture.plan.id,
                  planRevisionCreateSchema.parse(background),
                );
                const current = replaced?.plan.revisions.find((revision) => revision.is_current);
                await writer.objects.update(fixture.object.id, fixture.object.row_version, {
                  plan_position: {
                    plan_revision_id: current?.id ?? '',
                    geometry: { type: 'Point', coordinates: [200, 200] },
                  },
                });
              });
            }
            return before;
          };
          return work(session);
        },
        isolation ? options : undefined,
      ),
  };
}

async function fixture() {
  return sessions.run(context, async (session) => {
    const site = await session.sites.create(
      siteCreateSchema.parse({
        name: `Snapshot avant ${randomUUID()}`,
        site_type: 'erp',
        status: 'active',
        location: { type: 'Point', coordinates: [7.26, 43.7] },
      }),
    );
    const contact = await session.contacts.create(
      site.id,
      contactCreateSchema.parse({
        name: 'Contact avant',
        phone: '0499000000',
        visibility: 'ops',
      }),
    );
    const revision = await session.etare.createRevision(site.id, 'Cohérence concurrente');
    if (!contact || !revision) throw new Error('Fixture not created');
    return { site, contact, revision };
  });
}

describe('consistent ETARE snapshot', () => {
  it.each(['preview', 'submit'] as const)('%s sees one database version across all repositories', async (operation) => {
    const { site, contact, revision } = await fixture();
    // Commit both edits on another connection after the reader has already read the site.
    const interleaved: SessionFactory = {
      run: (ctx, work, options) =>
        sessions.run(
          ctx,
          async (session) => {
            const get = session.sites.get.bind(session.sites);
            session.sites.get = async (id) => {
              const before = await get(id);
              await sessions.run(context, async (writer) => {
                await writer.sites.update(site.id, site.row_version, { name: 'Site après' });
                await writer.contacts.update(contact.id, contact.row_version, { name: 'Contact après' });
              });
              return before;
            };
            return work(session);
          },
          options,
        ),
    };
    const deps = { sessions: interleaved, sha256 };
    const result =
      operation === 'preview'
        ? await previewSiteEtare(deps, context, site.id)
        : await submitRevision(deps, context, revision.id, revision.row_version, {
            change_summary: 'Snapshot cohérent',
          });
    const frozen =
      operation === 'preview' && 'snapshot' in result
        ? result.snapshot
        : await sessions.run(context, async (session) => (await session.etare.revision(revision.id))?.snapshot);
    expect(frozen).toMatchObject({ site: { name: site.name }, contacts: [{ name: 'Contact avant' }] });
    expect(result.content_hash).toBe(await sha256(canonicalJson(frozen)));
    const current = await previewSiteEtare({ sessions, sha256 }, context, site.id);
    expect(current.snapshot).toMatchObject({ site: { name: 'Site après' }, contacts: [{ name: 'Contact après' }] });
  });

  it('freezes a background and the positions drawn on it together, and only the authors of that content', async () => {
    const fixture = await planFixture();
    const submitted = await submitRevision(
      { sessions: replacingBackgroundDuringRead(fixture, { isolation: true }), sha256 },
      context,
      fixture.revision.id,
      fixture.revision.row_version,
      { change_summary: 'Fond et positions cohérents' },
    );
    const record = await sessions.run(context, (session) => session.etare.revision(fixture.revision.id));
    const frozen = record?.snapshot as EtareSnapshot;
    expect(submitted.content_hash).toBe(await sha256(canonicalJson(frozen)));
    expect(consistent(frozen)).toBe(true);
    // The state before the concurrent edit, as a whole.
    expect(frozen.plans.map((plan) => plan.background.revision_id)).toEqual([fixture.firstBackground]);
    expect(frozen.objects[0]?.plan_position).toEqual({
      plan_revision_id: fixture.firstBackground,
      geometry: { type: 'Point', coordinates: [100, 100] },
    });
    // The other member's edit is not in the frozen content: they are not a contributor.
    const contributors = record?.contributors.map((person) => person.id) ?? [];
    expect(contributors).toContain(EDITOR_ACCOUNT);
    expect(contributors).not.toContain(OTHER_ACCOUNT);
    // The edit itself is committed and waits for the next revision.
    const next = await previewSiteEtare({ sessions, sha256 }, context, fixture.site.id);
    expect(next.snapshot.objects[0]?.plan_position?.geometry).toEqual({ type: 'Point', coordinates: [200, 200] });
    expect(next.checks.find((check) => check.code === 'plan_backgrounds')?.level).toBe('error');
  });

  it('would mix two versions under READ COMMITTED (control of the scenario above)', async () => {
    const fixture = await planFixture();
    const mixed = await previewSiteEtare(
      { sessions: replacingBackgroundDuringRead(fixture, { isolation: false }), sha256 },
      context,
      fixture.site.id,
    );
    // The object has moved to the new background while the plan list no longer offers a checked one.
    expect(consistent(mixed.snapshot)).toBe(false);
  });

  it('reports a serialization conflict as a retryable business conflict', async () => {
    const { site } = await fixture();
    await expect(
      sessions.run(
        context,
        async (reader) => {
          const before = await reader.sites.get(site.id);
          await sessions.run(context, (writer) =>
            writer.sites.update(site.id, site.row_version, { name: 'Concurrent' }),
          );
          await reader.sites.update(site.id, before?.row_version ?? 0, { name: 'Stale' });
        },
        { isolation: 'repeatable_read' },
      ),
    ).rejects.toBeInstanceOf(Conflict);
    expect((await sessions.run(context, (session) => session.sites.get(site.id)))?.name).toBe('Concurrent');
  });
});
