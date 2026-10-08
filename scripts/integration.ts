/**
 * Administration of the shared integration environment (hosted Supabase project).
 *
 *   pnpm integration check                               verify schema, roles and absence of demo data
 *   pnpm integration roles                               set random passwords for etare_api / etare_worker
 *   pnpm integration roles-sql --pooler-url <url> --out <file.sql>
 *                                                        same, without the admin connection: the SQL to run in
 *                                                        the SQL editor of the dashboard holds only the SCRAM
 *                                                        verifiers; <url> is the pooler URL WITHOUT password
 *   pnpm integration tenant --slug <slug> --name <name>  create a SIS (tenant)
 *   pnpm integration grant --email <e> --tenant <slug> --role <ROLE> [--site <uuid>]
 *   pnpm integration members                             list memberships
 *   --dotenv <file>                                      another hosted environment (default .env.integration),
 *                                                        e.g. .env.preprod for the preproduction (EXP-01)
 *
 * The admin connection string is read ONLY from the INTEGRATION_ADMIN_DATABASE_URL
 * environment variable of the current shell: it is never written to disk.
 * Application role passwords are generated here, sent as SCRAM verifiers and
 * written to .env.integration, or the --dotenv file (gitignored); they are never displayed.
 * See docs/development.md, "Environnement d'intégration partagé".
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import {
  generatePassword,
  isLocalUrl,
  roleConnectionString,
  scramSha256Verifier,
  upsertEnvValues,
  type AppRole,
} from './lib/integration';

const root = resolve(import.meta.dirname, '..');
const TENANT_ROLES = ['SIS_ADMIN', 'PREVISION_EDITOR', 'PREVISION_VALIDATOR', 'OPS_USER', 'EXPLOITANT', 'READER'];

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const { positionals, values: options } = parseArgs({
  allowPositionals: true,
  options: {
    slug: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    tenant: { type: 'string' },
    role: { type: 'string' },
    site: { type: 'string' },
    'allow-local': { type: 'boolean', default: false },
    dotenv: { type: 'string', default: '.env.integration' },
    'pooler-url': { type: 'string' },
    out: { type: 'string' },
  },
});
const command = positionals[0];
const envFile = resolve(root, options.dotenv);
const envName = basename(envFile);
if (!/^\.env\.[a-z0-9-]+$/.test(envName) || ['.env.local', '.env.example'].includes(envName)) {
  fail('--dotenv must be a gitignored .env.<name> file (not .env.local, local stack, nor .env.example).');
}

const adminUrl = process.env['INTEGRATION_ADMIN_DATABASE_URL'];
// Every command but roles-sql works through the admin connection.
if (!adminUrl && command !== 'roles-sql') {
  fail('INTEGRATION_ADMIN_DATABASE_URL is not set in this shell (see docs/development.md).');
}

async function withAdmin<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: adminUrl, application_name: 'etare-integration-admin' });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function check(): Promise<void> {
  let ok = true;
  const report = (passed: boolean, label: string) => {
    ok &&= passed;
    console.log(`${passed ? '✔' : '✖'} ${label}`);
  };

  await withAdmin(async (client) => {
    const schema = await client.query(`select 1 from pg_namespace where nspname = 'app'`);
    report(schema.rowCount === 1, 'business schema "app" exists');

    const localMigrations = readdirSync(resolve(root, 'supabase/migrations'))
      .filter((file) => file.endsWith('.sql'))
      .map((file) => file.split('_')[0] ?? '')
      .sort();
    const applied = await client
      .query<{ version: string }>('select version from supabase_migrations.schema_migrations order by version')
      .then((result) => result.rows.map((row) => row.version))
      .catch(() => [] as string[]);
    const missing = localMigrations.filter((version) => !applied.includes(version));
    report(
      missing.length === 0,
      `all ${localMigrations.length} migrations applied${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`,
    );

    const roles = await client.query<{ rolname: string; rolcanlogin: boolean; rolbypassrls: boolean }>(
      `select rolname, rolcanlogin, rolbypassrls from pg_roles where rolname in ('etare_api', 'etare_worker') order by rolname`,
    );
    report(
      roles.rowCount === 2 && roles.rows.every((r) => r.rolcanlogin && !r.rolbypassrls),
      'etare_api and etare_worker can log in, without BYPASSRLS (run `pnpm integration roles` otherwise)',
    );

    // The local seed sets PUBLIC role passwords and demo accounts: it must never run here.
    const demo = await client
      .query<{ n: number }>(
        `select (select count(*) from app.tenant where slug like 'sdis-demo-%')
            + (select count(*) from auth.users where email like '%@demo.etare.test') as n`,
      )
      .catch(() => ({ rows: [{ n: 0 }] }));
    report(
      Number(demo.rows[0]?.n ?? 0) === 0,
      'no local demo data (if present: the seed ran here, reset the role passwords and delete the demo accounts)',
    );

    const exposed = await client
      .query<{ n: number }>(
        `select count(*)::int as n from information_schema.role_table_grants where table_schema = 'app' and grantee in ('anon', 'authenticated', 'service_role')`,
      )
      .catch(() => ({ rows: [{ n: -1 }] }));
    report(exposed.rows[0]?.n === 0, 'no Data API role has access to schema "app"');
  });

  if (existsSync(envFile)) {
    const content = readFileSync(envFile, 'utf8');
    const value = (key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(content)?.[1]?.trim() ?? '';
    const key = value('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    report(key.startsWith('sb_publishable_'), `${envName} uses a publishable key (never a secret key) in NEXT_PUBLIC_`);
    report(
      ['DATABASE_URL', 'WORKER_DATABASE_URL'].every((k) => value(k) !== ''),
      `${envName} has the application role URLs`,
    );
    report(
      ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'].every((k) => value(k) !== '' && !isLocalUrl(value(k))),
      `${envName} targets the hosted project`,
    );
  } else {
    report(false, `${envName} exists (copy .env.integration.example)`);
  }

  if (!ok) process.exit(1);
}

async function roles(): Promise<void> {
  if (isLocalUrl(adminUrl ?? '') && !options['allow-local']) {
    fail('The admin URL targets the local stack; local roles are managed by supabase/seed.sql.');
  }
  const urls: Record<string, string> = {};
  await withAdmin(async (client) => {
    for (const [role, variable] of [
      ['etare_api', 'DATABASE_URL'],
      ['etare_worker', 'WORKER_DATABASE_URL'],
    ] as const satisfies readonly (readonly [AppRole, string])[]) {
      const password = generatePassword();
      const { rows } = await client.query<{ statement: string }>(
        `select format('alter role %I with login password %L', $1::text, $2::text) as statement`,
        [role, scramSha256Verifier(password)],
      );
      await client.query(rows[0]?.statement ?? fail('could not build the ALTER ROLE statement'));
      urls[variable] = roleConnectionString(adminUrl ?? '', role, password);
    }
  });

  for (const [variable, url] of Object.entries(urls)) {
    const probe = new pg.Client({ connectionString: url, application_name: 'etare-integration-check' });
    try {
      await probe.connect();
      const { rows } = await probe.query<{ role: string }>('select current_user as role');
      console.log(`✔ ${variable}: login as ${rows[0]?.role} works`);
    } catch (error) {
      console.error(`✖ ${variable}: login failed (${error instanceof Error ? error.message : 'unknown error'})`);
    } finally {
      await probe.end().catch(() => undefined);
    }
  }

  const base = existsSync(envFile)
    ? readFileSync(envFile, 'utf8')
    : readFileSync(resolve(root, '.env.integration.example'), 'utf8');
  writeFileSync(envFile, upsertEnvValues(base, urls), { mode: 0o600 });
  console.log(`✔ ${envName} updated (passwords are not displayed)`);
}

/**
 * Passwords of the application roles without the admin connection (EXP-01): generated here and
 * written to the env file, never displayed; the SQL file sets their SCRAM verifiers (never the
 * passwords) when run in the SQL editor of the dashboard.
 */
async function rolesSql(): Promise<void> {
  const pooler =
    options['pooler-url'] ?? fail('--pooler-url is required (pooler URL of the project, without password).');
  const out = resolve(options.out ?? fail('--out <file.sql> is required (outside the repository).'));
  let poolerUrl: URL;
  try {
    poolerUrl = new URL(pooler);
  } catch {
    fail('--pooler-url is not a URL.');
  }
  if (poolerUrl.password) fail('--pooler-url must not hold the password: it is never needed here.');
  if (isLocalUrl(pooler)) fail('--pooler-url targets the local stack; local roles are managed by supabase/seed.sql.');
  const inside = relative(root, out);
  if (!inside.startsWith('..') && !inside.includes(':')) {
    fail('--out must be outside the repository (the file holds the password verifiers).');
  }

  const urls: Record<string, string> = {};
  const statements: string[] = [];
  for (const [role, variable] of [
    ['etare_api', 'DATABASE_URL'],
    ['etare_worker', 'WORKER_DATABASE_URL'],
  ] as const satisfies readonly (readonly [AppRole, string])[]) {
    const password = generatePassword();
    // A verifier holds only base64 characters, '$' and ':': safe in a quoted literal.
    statements.push(`alter role ${role} with login password '${scramSha256Verifier(password)}';`);
    urls[variable] = roleConnectionString(pooler, role, password);
  }
  writeFileSync(
    out,
    [
      '-- Mots de passe des rôles applicatifs (empreintes SCRAM, jamais les mots de passe), générés par',
      `-- pnpm integration roles-sql. À lancer une fois dans l'éditeur SQL, puis supprimer ce fichier.`,
      'begin;',
      ...statements,
      'commit;',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  const base = existsSync(envFile)
    ? readFileSync(envFile, 'utf8')
    : readFileSync(resolve(root, '.env.integration.example'), 'utf8');
  writeFileSync(envFile, upsertEnvValues(base, urls), { mode: 0o600 });
  console.log(`✔ ${envName} updated (passwords are not displayed)`);
  console.log(`✔ ${out}: run it once in the SQL editor of the dashboard, then delete it`);
}

async function tenant(): Promise<void> {
  const slug = options.slug ?? fail('--slug is required');
  const name = options.name ?? fail('--name is required');
  await withAdmin(async (client) => {
    const { rows } = await client.query<{ id: string; created: boolean }>(
      `with inserted as (
         insert into app.tenant (slug, name, settings)
         values ($1, $2, '{"mfa_required_for_privileged": true}')
         on conflict (slug) do nothing
         returning id
       )
       select id, true as created from inserted
       union all
       select id, false from app.tenant where slug = $1 and not exists (select 1 from inserted)`,
      [slug, name],
    );
    console.log(`✔ tenant ${slug} ${rows[0]?.created ? 'created' : 'already exists'} (${rows[0]?.id})`);
  });
}

async function grant(): Promise<void> {
  const email = options.email ?? fail('--email is required');
  const slug = options.tenant ?? fail('--tenant is required');
  const role = options.role ?? fail('--role is required');
  if (!TENANT_ROLES.includes(role)) fail(`--role must be one of ${TENANT_ROLES.join(', ')}`);

  await withAdmin(async (client) => {
    await client.query('begin');
    try {
      const auth = await client.query<{ id: string; email: string }>(
        'select id, email from auth.users where lower(email) = lower($1)',
        [email],
      );
      const authUser =
        auth.rows[0] ??
        fail(`no Supabase Auth account for ${email}: create or invite it first (dashboard → Authentication).`);
      const tenantRow = await client.query<{ id: string }>('select id from app.tenant where slug = $1', [slug]);
      const tenantId = tenantRow.rows[0]?.id ?? fail(`unknown tenant ${slug}`);
      if (options.site) {
        const site = await client.query('select 1 from app.site where id = $1 and tenant_id = $2', [
          options.site,
          tenantId,
        ]);
        if (site.rowCount !== 1) fail(`site ${options.site} does not belong to ${slug}`);
      }

      const account = await client.query<{ id: string }>(
        `insert into app.user_account (auth_provider, auth_subject, email)
         values ('supabase', $1, $2)
         on conflict (auth_provider, auth_subject) do update set email = excluded.email
         returning id`,
        [authUser.id, authUser.email],
      );
      const userId = account.rows[0]?.id ?? fail('could not create the product account');
      const membership = await client.query<{ id: string }>(
        `insert into app.membership (tenant_id, user_id) values ($1, $2)
         on conflict (tenant_id, user_id) do update set status = 'active'
         returning id`,
        [tenantId, userId],
      );
      await client.query(
        `insert into app.role_binding (tenant_id, membership_id, role_id, scope_type, scope_id)
         select $1, $2, r.id, $4, $5 from app.role r where r.code = $3 and r.tenant_id is null
         on conflict (membership_id, role_id, scope_type, scope_id) where revoked_at is null do nothing`,
        [tenantId, membership.rows[0]?.id, role, options.site ? 'site' : 'tenant', options.site ?? null],
      );
      await client.query('commit');
      console.log(`✔ ${email} → ${role} @ ${slug}${options.site ? ` (site ${options.site})` : ''}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

async function members(): Promise<void> {
  await withAdmin(async (client) => {
    const { rows } = await client.query<{ tenant: string; email: string; roles: string }>(
      `select t.slug as tenant, u.email::text as email,
              coalesce(string_agg(r.code || case when rb.scope_type = 'site' then ' (site)' else '' end, ', ' order by r.code), '-') as roles
       from app.membership m
       join app.tenant t on t.id = m.tenant_id
       join app.user_account u on u.id = m.user_id
       left join app.role_binding rb on rb.membership_id = m.id and rb.revoked_at is null
       left join app.role r on r.id = rb.role_id
       group by t.slug, u.email order by t.slug, u.email`,
    );
    console.table(rows);
  });
}

const commands: Record<string, () => Promise<void>> = { check, roles, 'roles-sql': rolesSql, tenant, grant, members };
const run = command ? commands[command] : undefined;
if (!run) fail(`usage: pnpm integration <${Object.keys(commands).join('|')}> [options]`);
await run();
