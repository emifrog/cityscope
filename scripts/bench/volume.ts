/**
 * CAP-01 — volumetry bench on the LOCAL stack only (docs/volumetrie/cap-01.md).
 *
 *   pnpm bench:volume [--sites 10000] [--keep] [--reuse] [--skip <step,...>] [--out <file.json>]
 *                     [--jobs 100000] [--seconds 30]
 *
 * Loads two fictitious SIS (80 % / 20 % of the sites, with objects, risks, published versions,
 * sectors, terminals and history), then measures through the real API (in process, real tokens,
 * PostgreSQL with RLS): search, map, dossiers, site pages, member limited to a sector, catalogue and
 * receipt of a terminal, board and metrics, job queue, publication build, base map planning, rate
 * limiter, and 100 concurrent sessions. The bench SIS are removed at the end unless --keep.
 * Never run against a shared environment: every URL must point to the local stack.
 */
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  ApiMetrics,
  Ed25519Signer,
  PdfLibEtareRenderer,
  PostgresJobQueue,
  PostgresPlatformMetrics,
  PostgresPublicationBuildStore,
  SharpImageResizer,
  SupabaseObjectStorage,
  createLogger,
  createPool,
} from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { planBasemapTiles, type BasemapCoverage } from '@etare/domain';
import { HandlerRegistry, createWorker, noopHandler, publicationBuildHandler } from '@etare/worker';
import { DEMO_PASSWORD, authApi, drain, requireEnv, signIn, withSecondFactor } from '../../tests/integration/helpers';
import { Terminal } from '../../tests/integration/terminal';
import { benchTenants, cleanupSql, jobHistorySql, tenantSql, type BenchTenant } from './dataset';

const { values } = parseArgs({
  options: {
    sites: { type: 'string', default: '10000' },
    keep: { type: 'boolean', default: false },
    reuse: { type: 'boolean', default: false },
    skip: { type: 'string', default: '' },
    out: { type: 'string' },
    jobs: { type: 'string', default: '100000' },
    seconds: { type: 'string', default: '30' },
  },
});
const totalSites = Number(values.sites);
const skipped = new Set((values.skip ?? '').split(',').filter(Boolean));
const tenants = benchTenants(totalSites);
const [tenantA, tenantB] = tenants as [BenchTenant, BenchTenant];

// tests/integration/helpers refuses any non-local URL; the superuser is the local one of the stack.
const adminUrl = new URL(requireEnv('LOCAL_DATABASE_ADMIN_URL'));
const superUrl = new URL(adminUrl);
superUrl.username = 'supabase_admin';
const admin = createPool({
  connectionString: adminUrl.toString(),
  applicationName: 'bench-admin',
  max: 4,
  queryTimeoutMs: 0,
});
const worker = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'bench-worker',
  max: 12,
});
const silent = createLogger({}, { write: () => undefined });

// ---------------------------------------------------------------- measurement helpers
interface Stat {
  readonly label: string;
  readonly n: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  readonly errors: number;
  readonly note?: string;
}
const results: { stats: Stat[]; facts: Record<string, unknown> } = { stats: [], facts: {} };

const percentile = (sorted: readonly number[], p: number) =>
  sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0);

function record(label: string, durations: number[], errors: number, note?: string): Stat {
  const sorted = [...durations].sort((a, b) => a - b);
  const stat: Stat = {
    label,
    n: durations.length,
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    max: Math.round(sorted.at(-1) ?? 0),
    errors,
    ...(note ? { note } : {}),
  };
  results.stats.push(stat);
  console.log(
    `${label.padEnd(58)} n=${String(stat.n).padStart(4)} p50=${String(stat.p50).padStart(5)} ms p95=${String(stat.p95).padStart(5)} ms max=${String(stat.max).padStart(5)} ms${errors ? ` erreurs=${errors}` : ''}${note ? `  ${note}` : ''}`,
  );
  return stat;
}

/** Times [n] sequential runs after warm-up; a non-2xx answer counts as an error. */
async function sample(label: string, n: number, run: () => Promise<Response | void>, note?: string): Promise<Stat> {
  for (let warm = 0; warm < 3; warm += 1) await run();
  const durations: number[] = [];
  let errors = 0;
  for (let index = 0; index < n; index += 1) {
    const started = performance.now();
    const response = await run();
    durations.push(performance.now() - started);
    if (response && response.status >= 400) {
      errors += 1;
      if (errors === 1) console.log(`  ! ${label}: ${response.status} ${(await response.text()).slice(0, 200)}`);
    }
  }
  return record(label, durations, errors, note);
}

const fact = (key: string, value: unknown) => {
  results.facts[key] = value;
  console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
};

// ---------------------------------------------------------------- load and cleanup
async function benchPresent(): Promise<boolean> {
  const { rows } = await admin.query<{ n: number }>('select count(*)::int as n from app.tenant where id = $1', [
    tenantA.id,
  ]);
  return (rows[0]?.n ?? 0) > 0;
}

async function cleanup(): Promise<void> {
  const started = performance.now();
  const client = createPool({
    connectionString: superUrl.toString(),
    applicationName: 'bench-cleanup',
    max: 1,
    queryTimeoutMs: 0,
  });
  try {
    await client.query(
      cleanupSql(
        tenants.map((tenant) => tenant.id),
        tenants.flatMap((tenant) => tenant.users.map((user) => user.authId)),
      ),
    );
  } finally {
    await client.end();
  }
  console.log(`Données du banc retirées en ${Math.round((performance.now() - started) / 1000)} s.`);
}

async function load(): Promise<void> {
  if (await benchPresent()) {
    if (values.reuse) {
      console.log('Jeu de banc déjà présent : réutilisé (--reuse).');
      return;
    }
    await cleanup();
  }
  for (const tenant of tenants) {
    const started = performance.now();
    const client = await admin.connect();
    try {
      await client.query('begin');
      await client.query(tenantSql(tenant, DEMO_PASSWORD));
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    console.log(
      `${tenant.name} : ${tenant.sites} sites chargés en ${Math.round((performance.now() - started) / 1000)} s.`,
    );
  }
  const started = performance.now();
  await admin.query(jobHistorySql(Number(values.jobs)));
  await admin.query('analyze');
  console.log(
    `Historique de ${values.jobs} travaux et ANALYZE en ${Math.round((performance.now() - started) / 1000)} s.`,
  );
}

async function volumes(): Promise<void> {
  const { rows } = await admin.query<{ name: string; count: string }>(
    `select 'sites' as name, count(*) from app.site where tenant_id = any ($1)
     union all select 'objets', count(*) from app.operational_object where tenant_id = any ($1)
     union all select 'risques', count(*) from app.risk_occurrence where tenant_id = any ($1)
     union all select 'zones', count(*) from app.zone where tenant_id = any ($1)
     union all select 'niveaux', count(*) from app.level where tenant_id = any ($1)
     union all select 'contacts', count(*) from app.contact where tenant_id = any ($1)
     union all select 'publications en vigueur', count(*) from app.publication where tenant_id = any ($1) and status = 'published'
     union all select 'terminaux', count(*) from app.device where tenant_id = any ($1)
     union all select 'publications détenues par les terminaux', count(*) from app.device_publication where tenant_id = any ($1)
     union all select 'reçus (historique)', count(*) from app.device_sync_event where tenant_id = any ($1)
     union all select 'événements d''audit', count(*) from app.audit_event where tenant_id = any ($1)
     union all select 'travaux (toute la file)', count(*) from app.job`,
    [tenants.map((tenant) => tenant.id)],
  );
  fact('volumes', Object.fromEntries(rows.map((row) => [row.name, Number(row.count)])));
  const size = await admin.query<{ size: string }>(
    'select pg_size_pretty(pg_database_size(current_database())) as size',
  );
  fact('taille de la base', size.rows[0]?.size);
}

// ---------------------------------------------------------------- API measurements
const baseDeps = createApiDependencies({ ...process.env, RATE_LIMITS: 'off', LOG_LEVEL: 'warn' });
const app = createApiApp(baseDeps);
type Call = (path: string, init?: { method?: string; body?: unknown; ifMatch?: number }) => Promise<Response>;

const caller =
  (token: string, tenantId: string, target = app): Call =>
  async (path, init = {}) =>
    target.request(`${API_BASE_PATH}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId,
        'x-client-platform': 'web',
        'content-type': 'application/json',
        ...(init.ifMatch === undefined ? {} : { 'if-match': `"${init.ifMatch}"` }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });

const emailOf = (tenant: BenchTenant, key: string) => tenant.users.find((user) => user.key === key)?.email ?? '';

async function siteIds(tenantId: string, count: number): Promise<string[]> {
  const { rows } = await admin.query<{ id: string }>(
    `select s.id from app.site s join app.publication p on p.site_id = s.id and p.status = 'published'
     where s.tenant_id = $1 and s.sensitivity = 'normal' order by md5(s.id::text) limit $2`,
    [tenantId, count],
  );
  return rows.map((row) => row.id);
}

async function measureReads(): Promise<void> {
  console.log('\n— Lectures du back-office (SIS A, rédacteur sur tout le SIS) —');
  const editor = caller(await signIn(emailOf(tenantA, 'redacteur')), tenantA.id);
  const limited = caller(await signIn(emailOf(tenantA, 'redacteur-secteur')), tenantA.id);
  const ids = await siteIds(tenantA.id, 30);
  let next = 0;
  const someSite = () => ids[next++ % ids.length] ?? '';

  for (const [label, query] of [
    ['recherche fréquente « EHPAD » (800 réponses)', 'q=EHPAD'],
    ['recherche « Lavandes »', 'q=Lavandes'],
    ['recherche par n° ETARE « 06-0412 »', 'q=06-0412'],
    ['recherche précise « Collège Pasteur 41 »', 'q=Coll%C3%A8ge%20Pasteur%2041'],
    ['recherche sans réponse', 'q=zzzzzz'],
    ['liste filtrée par commune (Cannes)', 'city=Cannes'],
  ] as const) {
    await sample(`GET /sites ${label}`, 30, () => editor(`/sites?${query}`));
  }
  await sample('GET /sites page suivante (curseur)', 30, async () => {
    const first = endpoints.listSites.response.parse(await (await editor('/sites?limit=25')).json());
    return editor(`/sites?limit=25&cursor=${encodeURIComponent(first.next_cursor ?? '')}`);
  });
  await sample('GET /map/sites sans emprise (2 000 premiers, tronqué)', 15, () => editor('/map/sites'));
  await sample('GET /map/sites emprise d’une commune', 30, () => editor('/map/sites?bbox=7.10,43.70,7.25,43.78'));
  await sample('GET /map/features emprise de 0,02°', 30, () => editor('/map/features?bbox=7.10,43.70,7.12,43.72'));
  await sample('GET /etare dossiers, 1re page et compteurs', 30, () => editor('/etare'));
  await sample('GET /etare dossiers recherche « Lavandes »', 30, () => editor('/etare?q=Lavandes'));
  await sample('GET /sites/{id} fiche', 30, () => editor(`/sites/${someSite()}`));
  await sample('GET /sites/{id}/objects (25 objets)', 30, () => editor(`/sites/${someSite()}/objects`));
  await sample('GET /sites/{id}/etare dossier', 30, () => editor(`/sites/${someSite()}/etare`));

  console.log('\n— Coût des périmètres : rédacteur limité à un secteur (RLS) —');
  await sample('GET /sites « EHPAD » (membre limité à un secteur)', 30, () => limited('/sites?q=EHPAD'));
  await sample('GET /sites liste (membre limité à un secteur)', 30, () => limited('/sites?limit=25'));
  await sample('GET /map/sites sans emprise (membre limité)', 15, () => limited('/map/sites'));
  await sample('GET /etare dossiers (membre limité)', 30, () => limited('/etare'));

  console.log('\n— Second SIS (B, 20 % des sites) : isolation des volumes —');
  const editorB = caller(await signIn(emailOf(tenantB, 'redacteur')), tenantB.id);
  await sample('GET /sites « EHPAD » (SIS B)', 30, () => editorB('/sites?q=EHPAD'));
  await sample('GET /etare dossiers (SIS B)', 30, () => editorB('/etare'));
}

async function measureSupervision(): Promise<void> {
  console.log('\n— Supervision (EXP-03) —');
  const adminA = caller(await signIn(emailOf(tenantA, 'admin')), tenantA.id);
  await sample('GET /supervision tableau du SIS', 20, () => adminA('/supervision'));
  const pool = createPool({ connectionString: requireEnv('DATABASE_URL'), applicationName: 'bench-metrics', max: 2 });
  try {
    const metrics = new ApiMetrics({
      component: 'api',
      version: 'bench',
      pool,
      platform: new PostgresPlatformMetrics(pool),
    });
    let size = 0;
    await sample('collecte des métriques de la plateforme', 10, async () => {
      size = (await metrics.render()).length;
    });
    fact('taille d’une collecte de métriques (octets)', size);
  } finally {
    await pool.end();
  }
}

async function measureTerminal(): Promise<void> {
  console.log('\n— Terminal : catalogue signé et accusé (SIS A) —');
  const ops = await signIn(emailOf(tenantA, 'ops'));
  const opsSector = await signIn(emailOf(tenantA, 'ops-secteur'));
  const measureDevice = async (label: string, token: string, scope: 'tenant' | 'sectors') => {
    const terminal = new Terminal(app, token, tenantA.id);
    terminal.deviceId = randomUUID();
    await admin.query(
      `insert into app.device (id, tenant_id, name, status, platform, public_key, enrolled_at, enrolled_by, created_by, scope)
       select $1, $2, $3, 'active', 'android', $4, now(), u.id, u.id, $5
       from app.user_account u where u.email = $6`,
      [
        terminal.deviceId,
        tenantA.id,
        `BANC MESURE ${Date.now()}`,
        terminal.publicKey,
        scope,
        emailOf(tenantA, 'admin'),
      ],
    );
    if (scope === 'sectors') {
      await admin.query(
        `insert into app.device_sector (tenant_id, device_id, sector_id)
         select $1, $2, id from app.sector where tenant_id = $1 and code = 'S01'`,
        [tenantA.id, terminal.deviceId],
      );
    }
    let bytes = 0;
    let entries = 0;
    let installed: string[] = [];
    await sample(`GET /sync/catalog ${label}`, 15, async () => {
      const response = await terminal.request('GET', '/sync/catalog');
      const text = await response.text();
      bytes = text.length;
      if (response.ok) {
        const catalog = JSON.parse((JSON.parse(text) as { catalog: string }).catalog) as {
          publications: { publication_id: string }[];
        };
        entries = catalog.publications.length;
        installed = catalog.publications.map((entry) => entry.publication_id);
      }
      return new Response(null, { status: response.status });
    });
    fact(`catalogue ${label}`, { entrées: entries, octets: bytes });
    await sample(`POST /sync/receipts ${label} (${installed.length} versions)`, 10, () =>
      terminal.request('POST', '/sync/receipts', {
        generation: 1,
        status: 'installed',
        error_code: null,
        installed,
        keyset_sequence: 1,
      }),
    );
  };
  await measureDevice('tablette de tout le SIS', ops, 'tenant');
  await measureDevice('tablette d’un secteur, agent limité', opsSector, 'sectors');
}

async function measureQueue(): Promise<void> {
  console.log('\n— File de travaux —');
  const claims: number[] = [];
  for (let index = 0; index < 50; index += 1) {
    const started = performance.now();
    await worker.query("select * from app.claim_jobs('bench-empty', 1, 30, array['system.noop'])");
    claims.push(performance.now() - started);
  }
  record('claim_jobs sur file vide, historique de 100 000 travaux', claims, 0);
  const count = 2000;
  await admin.query(
    `insert into app.job (tenant_id, job_type, payload) select null, 'system.noop', jsonb_build_object('bench', true, 'n', n)
     from generate_series(1, $1) n`,
    [count],
  );
  const queue = createWorker({
    queue: new PostgresJobQueue(worker, 'bench-queue'),
    registry: new HandlerRegistry([noopHandler]),
    logger: silent,
    concurrency: 8,
    leaseSeconds: 30,
    pollIntervalMs: 50,
  });
  const started = performance.now();
  await drain(queue, 1000);
  const seconds = (performance.now() - started) / 1000;
  fact('débit de la file (travaux sans effet, 8 emplacements)', `${Math.round(count / seconds)} travaux/s`);
  const { rows } = await admin.query<{ p50: number; p95: number }>(
    `select percentile_cont(0.5) within group (order by extract(epoch from completed_at - started_at) * 1000) as p50,
            percentile_cont(0.95) within group (order by extract(epoch from completed_at - started_at) * 1000) as p95
     from app.job where job_type = 'system.noop' and payload ->> 'bench' = 'true' and completed_at > now() - interval '10 minutes'`,
  );
  fact(
    'durée d’un travail sans effet (prise → fin)',
    `p50 ${Math.round(rows[0]?.p50 ?? 0)} ms, p95 ${Math.round(rows[0]?.p95 ?? 0)} ms`,
  );
}

async function measurePublication(): Promise<void> {
  console.log('\n— Fabrication d’une publication (dossiers lourds, PDF compris) —');
  const editorToken = await signIn(emailOf(tenantA, 'redacteur'));
  const factor = await withSecondFactor(await signIn(emailOf(tenantA, 'validateur')));
  const editor = caller(editorToken, tenantA.id);
  const validator = caller(factor.token, tenantA.id);
  const signer = Ed25519Signer.fromPkcs8(requireEnv('PUBLICATION_SIGNING_KEY'));
  const objects = SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'));
  const sha256 = async (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
  const builder = createWorker({
    queue: new PostgresJobQueue(worker, 'bench-publication'),
    registry: new HandlerRegistry([
      publicationBuildHandler({
        store: new PostgresPublicationBuildStore(worker),
        tools: { sha256, byteLength: (text) => Buffer.byteLength(text, 'utf8'), now: () => new Date(), signer },
        artifacts: {
          renderer: new PdfLibEtareRenderer(),
          objects,
          sha256Bytes: sha256,
          images: new SharpImageResizer(),
        },
      }),
    ]),
    logger: silent,
    concurrency: 2,
    leaseSeconds: 120,
    pollIntervalMs: 100,
  });
  try {
    for (const objectCount of [25, 150, 500]) {
      // A site of the bench without plan (its background bytes are not stored), with many objects.
      const { rows } = await admin.query<{ id: string }>(
        `insert into app.site (tenant_id, name, status, site_type, geom)
         values ($1, $2, 'active', 'industrial', extensions.st_setsrid(extensions.st_makepoint(7.05, 43.62), 4326))
         returning id`,
        [tenantA.id, `Plateforme lourde ${objectCount} objets ${Date.now()}`],
      );
      const siteId = rows[0]?.id ?? '';
      await admin.query(
        `insert into app.operational_object (tenant_id, site_id, object_type_id, name, label, geom, properties, instructions, criticality)
         select $1, $2, t.id, t.name || ' ' || n, 'O' || n,
                extensions.st_setsrid(extensions.st_makepoint(7.05 + n * 0.00001, 43.62), 4326),
                jsonb_build_object('repere', n), 'Consigne ' || n, 'important'
         from generate_series(1, $3) n
         join lateral (select id, name from app.object_type where tenant_id is null and geometry_kind = 'point'
                       order by code offset (n % 19) limit 1) t on true`,
        [tenantA.id, siteId, objectCount],
      );
      await admin.query(
        `insert into app.risk_occurrence (tenant_id, site_id, risk_type_id, severity, description)
         select $1, $2, r.id, 1 + n % 5, 'Risque ' || n from generate_series(1, $3) n
         join lateral (select id from app.risk_type where tenant_id is null order by code offset (n % 15) limit 1) r on true`,
        [tenantA.id, siteId, Math.ceil(objectCount / 10)],
      );
      const draft = endpoints.createRevision.response.parse(
        await (
          await editor(`/sites/${siteId}/etare/revisions`, { method: 'POST', body: { change_summary: 'Banc' } })
        ).json(),
      );
      // The snapshot of the whole dossier is read and frozen at the submission (API).
      const submitStarted = performance.now();
      const revision = endpoints.submitRevision.response.parse(
        await (
          await editor(`/etare-revisions/${draft.id}/submit`, {
            method: 'POST',
            body: { change_summary: 'Banc' },
            ifMatch: draft.row_version,
          })
        ).json(),
      );
      const submitMs = performance.now() - submitStarted;
      const decided = await validator(`/etare-revisions/${draft.id}/decision`, {
        method: 'POST',
        body: { decision: 'approved', revision_hash: revision.content_hash, publish: true },
      });
      if (decided.status !== 200) console.log(`  ! décision : ${decided.status} ${await decided.text()}`);
      await drain(builder, 50);
      const timing = await admin.query<{ wait: number; compute: number; total: number; status: string }>(
        `select extract(epoch from j.first_started_at - j.created_at) * 1000 as wait,
                extract(epoch from j.completed_at - j.started_at) * 1000 as compute,
                extract(epoch from p.published_at - p.requested_at) * 1000 as total, p.status
         from app.publication p join app.job j on j.idempotency_key = 'publication.build:' || p.id
         where p.site_id = $1`,
        [siteId],
      );
      const row = timing.rows[0];
      fact(`publication de ${objectCount} objets`, {
        soumission_ms: Math.round(submitMs),
        attente_ms: Math.round(row?.wait ?? 0),
        calcul_ms: Math.round(row?.compute ?? 0),
        total_ms: Math.round(row?.total ?? 0),
        statut: row?.status,
      });
    }
  } finally {
    await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token });
  }
}

async function measureBasemaps(): Promise<void> {
  console.log('\n— Fonds de carte : couverture et préparation —');
  const { rows } = await admin.query<{
    sector: string;
    coverage: { extent: number[] | null; detail: number[][]; site_count: number };
  }>(
    `select s.name as sector, app.basemap_coverage(s.id) as coverage from app.sector s where s.tenant_id = $1 and s.code = 'S01'`,
    [tenantA.id],
  );
  const started = performance.now();
  await admin.query(`select app.basemap_coverage(id) from app.sector where tenant_id = $1`, [tenantA.id]);
  fact('couverture de tous les secteurs du SIS A (SQL)', `${Math.round(performance.now() - started)} ms`);
  const coverage = rows[0]?.coverage;
  if (!coverage) return;
  const planStarted = performance.now();
  const tiles = planBasemapTiles(coverage as unknown as BasemapCoverage);
  fact(`fond du secteur ${rows[0]?.sector}`, {
    sites: coverage.site_count,
    zones_de_détail: coverage.detail.length,
    tuiles: tiles.length,
    planification_ms: Math.round(performance.now() - planStarted),
    durée_au_débit_convenu_IGN: `${(tiles.length / 4 / 3600).toFixed(1)} h à 4 requêtes/s`,
  });
}

async function measureRateLimiter(): Promise<void> {
  console.log('\n— Limitation de débit (ADR-023) : coût du compteur par requête —');
  const token = await signIn(emailOf(tenantA, 'redacteur'));
  const limited = createApiApp({ ...createApiDependencies({ ...process.env, RATE_LIMITS: 'on', LOG_LEVEL: 'warn' }) });
  const ids = await siteIds(tenantA.id, 1);
  await sample('GET /sites/{id} sans compteur (fiche)', 100, () => caller(token, tenantA.id)(`/sites/${ids[0]}`));
  await sample('GET /sites/{id} avec compteur (fiche)', 100, () =>
    caller(token, tenantA.id, limited)(`/sites/${ids[0]}`),
  );
}

async function measureLoad(): Promise<void> {
  const seconds = Number(values.seconds);
  console.log(
    `\n— Charge : 100 sessions simultanées pendant ${seconds} s (une instance d’API, pool de 10 connexions) —`,
  );
  const token = await signIn(emailOf(tenantA, 'redacteur'));
  const call = caller(token, tenantA.id);
  const ids = await siteIds(tenantA.id, 200);
  const scenarios: [string, () => string][] = [
    ['recherche', () => `/sites?q=${['EHPAD', 'Lavandes', 'Port', 'Pasteur', 'Gare'][Math.floor(Math.random() * 5)]}`],
    ['fiche', () => `/sites/${ids[Math.floor(Math.random() * ids.length)]}`],
    ['objets', () => `/sites/${ids[Math.floor(Math.random() * ids.length)]}/objects`],
    [
      'carte',
      () => {
        const lon = 7.0 + Math.random() * 0.4;
        const lat = 43.6 + Math.random() * 0.2;
        return `/map/sites?bbox=${lon.toFixed(3)},${lat.toFixed(3)},${(lon + 0.05).toFixed(3)},${(lat + 0.04).toFixed(3)}`;
      },
    ],
    ['dossiers', () => '/etare'],
  ];
  const durations = new Map<string, number[]>(scenarios.map(([name]) => [name, []]));
  const failures = new Map<string, number>(scenarios.map(([name]) => [name, 0]));
  let errors = 0;
  const deadline = performance.now() + seconds * 1000;
  let total = 0;
  await Promise.all(
    Array.from({ length: 100 }, async () => {
      while (performance.now() < deadline) {
        const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
        if (!scenario) continue;
        const [name, path] = scenario;
        const started = performance.now();
        const response = await call(path());
        await response.arrayBuffer();
        durations.get(name)?.push(performance.now() - started);
        total += 1;
        if (response.status >= 400) {
          errors += 1;
          failures.set(name, (failures.get(name) ?? 0) + 1);
        }
      }
    }),
  );
  for (const [name, list] of durations) record(`charge 100 sessions : ${name}`, list, failures.get(name) ?? 0);
  fact('charge : débit', `${Math.round(total / seconds)} requêtes/s, ${errors} erreur(s)`);
}

// ---------------------------------------------------------------- run
const steps: [string, () => Promise<void>][] = [
  ['reads', measureReads],
  ['supervision', measureSupervision],
  ['terminal', measureTerminal],
  ['queue', measureQueue],
  ['publication', measurePublication],
  ['basemaps', measureBasemaps],
  ['ratelimit', measureRateLimiter],
  ['load', measureLoad],
];

try {
  const loadStarted = performance.now();
  await load();
  fact('chargement du jeu (s)', Math.round((performance.now() - loadStarted) / 1000));
  await volumes();
  for (const [name, step] of steps) {
    if (!skipped.has(name)) await step();
  }
  if (values.out) writeFileSync(values.out, `${JSON.stringify(results, null, 2)}\n`);
  // The reduced run of the CI (--sites 1000) fails on any request in error: a time limit exceeded
  // by a perimeter, a server error under load.
  const failed = results.stats.filter((stat) => stat.errors > 0);
  if (failed.length > 0) {
    console.error(`\n${failed.length} mesure(s) en erreur : ${failed.map((stat) => stat.label).join(' ; ')}`);
    process.exitCode = 1;
  }
} finally {
  if (!values.keep) await cleanup();
  await Promise.all([admin.end(), worker.end()]);
}
