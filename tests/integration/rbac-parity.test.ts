/**
 * The database is the authority on roles and permissions; packages/domain
 * mirrors it for the UI and use cases. This test fails if they drift apart.
 */
import { DEFAULT_ROLE_PERMISSIONS, PRIVILEGED_PERMISSIONS, ROLES } from '@etare/domain';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { requireEnv } from './helpers';

const pool = new pg.Pool({ connectionString: requireEnv('LOCAL_DATABASE_ADMIN_URL'), max: 1 });
afterAll(() => pool.end());

describe('RBAC parity between the database and packages/domain', () => {
  it('has the same system roles and permissions', async () => {
    const { rows } = await pool.query<{ code: string; permissions: string[] }>(
      `select r.code, coalesce(array_agg(rp.permission_code order by rp.permission_code)
                                 filter (where rp.permission_code is not null), '{}') as permissions
       from app.role r left join app.role_permission rp on rp.role_id = r.id
       where r.is_system group by r.code`,
    );
    const database = Object.fromEntries(rows.map((row) => [row.code, row.permissions]));
    const domain = Object.fromEntries(ROLES.map((role) => [role, [...DEFAULT_ROLE_PERMISSIONS[role]].sort()]));
    expect(database).toEqual(domain);
  });

  it('flags the same permissions as requiring a second factor', async () => {
    const { rows } = await pool.query<{ code: string }>(
      'select code from app.permission where requires_aal2 order by code',
    );
    expect(rows.map((row) => row.code)).toEqual([...PRIVILEGED_PERMISSIONS].sort());
  });
});
