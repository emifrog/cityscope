import type { MemberRepository } from '@etare/application';
import {
  memberSchema,
  type Member,
  type MemberInvite,
  type MemberPerimeterInput,
  type MemberSensitiveAccessInput,
  type MemberUpdate,
} from '@etare/contracts';
import type { PoolClient } from './pool';
import { toIso } from './versioned';

interface MemberRow {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  status: string;
  account_status: string;
  roles: string[];
  site_roles: { role: string; site_id: string; site_name: string | null }[];
  perimeter: { sectors: { id: string; name: string }[]; sites: { id: string; name: string }[] } | null;
  sensitive_access: { sectors: { id: string; name: string }[]; valid_until: string } | null;
  is_self: boolean;
  last_sign_in_at: Date | null;
  second_factor: boolean | null;
  row_version: number;
  created_at: Date;
}

/** Reads are plain queries under RLS (member:manage); writes go through app.admin_* functions. */
const MEMBER_SELECT = `
  select m.id, m.user_id, u.email::text as email, u.display_name, m.status, u.status as account_status,
         m.row_version, m.created_at, m.user_id = app.current_user_id() as is_self,
         ids.last_sign_in_at, ids.second_factor,
         coalesce(array_agg(distinct r.code) filter (where r.code <> 'EXPLOITANT'), '{}') as roles,
         coalesce(
           jsonb_agg(distinct jsonb_build_object('role', r.code, 'site_id', b.scope_id, 'site_name', s.name))
             filter (where b.scope_type = 'site' and r.code = 'EXPLOITANT'),
           '[]'
         ) as site_roles,
         -- The roles share one perimeter (PER-01): null for the whole SIS.
         case
           when coalesce(bool_or(b.scope_type = 'tenant'), false)
             or not coalesce(bool_or(b.scope_type <> 'tenant' and r.code <> 'EXPLOITANT'), false) then null
           else jsonb_build_object(
             'sectors', coalesce(jsonb_agg(distinct jsonb_build_object('id', sc.id, 'name', sc.name))
                                   filter (where b.scope_type = 'sector'), '[]'),
             'sites', coalesce(jsonb_agg(distinct jsonb_build_object('id', s.id, 'name', coalesce(s.name, 'Site')))
                                 filter (where b.scope_type = 'site' and r.code <> 'EXPLOITANT'), '[]'))
         end as perimeter,
         -- Habilitation to the sensitive sites (PER-02): whole SIS when no sector.
         (select jsonb_build_object(
                   'valid_until', min(h.valid_until),
                   'sectors', coalesce(jsonb_agg(jsonb_build_object('id', sc2.id, 'name', sc2.name))
                                         filter (where h.scope_type = 'sector'), '[]'))
          from app.sensitive_habilitation h
          left join app.sector sc2 on sc2.id = h.scope_id
          where h.membership_id = m.id and h.revoked_at is null and h.valid_until > now()
          having count(*) > 0) as sensitive_access
  from app.membership m
  join app.user_account u on u.id = m.user_id
  left join app.member_identity_states() ids on ids.user_id = m.user_id
  left join app.role_binding b
    on b.membership_id = m.id and b.revoked_at is null and (b.valid_until is null or b.valid_until > now())
  left join app.role r on r.id = b.role_id
  left join app.site s on s.id = b.scope_id and b.scope_type = 'site'
  left join app.sector sc on sc.id = b.scope_id and b.scope_type = 'sector'
  where m.tenant_id = app.current_tenant_id()`;

const toMember = (row: MemberRow): Member =>
  memberSchema.parse({
    ...row,
    sensitive_access: row.sensitive_access
      ? { ...row.sensitive_access, valid_until: new Date(row.sensitive_access.valid_until).toISOString() }
      : null,
    created_at: toIso(row.created_at),
    last_sign_in_at: row.last_sign_in_at ? toIso(row.last_sign_in_at) : null,
    second_factor: row.second_factor === true,
  });

export class PostgresMemberRepository implements MemberRepository {
  constructor(private readonly client: PoolClient) {}

  async list(): Promise<Member[]> {
    const { rows } = await this.client.query<MemberRow>(
      `${MEMBER_SELECT} group by m.id, u.id, ids.last_sign_in_at, ids.second_factor order by lower(coalesce(u.display_name, u.email::text))`,
    );
    return rows.map(toMember);
  }

  private async get(id: string): Promise<Member | null> {
    const { rows } = await this.client.query<MemberRow>(
      `${MEMBER_SELECT} and m.id = $1 group by m.id, u.id, ids.last_sign_in_at, ids.second_factor`,
      [id],
    );
    return rows[0] ? toMember(rows[0]) : null;
  }

  async add(input: MemberInvite, identitySubject: string | null): Promise<Member | null> {
    const { rows } = await this.client.query<{ membership_id: string }>(
      'select membership_id from app.admin_add_member($1, $2, $3, $4)',
      [input.email, input.display_name ?? null, input.roles, identitySubject],
    );
    return rows[0] ? this.get(rows[0].membership_id) : null;
  }

  async update(id: string, expectedVersion: number, patch: MemberUpdate): Promise<Member | null> {
    await this.client.query('select app.admin_update_member($1, $2, $3, $4)', [
      id,
      expectedVersion,
      patch.roles ?? null,
      patch.status ?? null,
    ]);
    return this.get(id);
  }

  async setPerimeter(id: string, expectedVersion: number, input: MemberPerimeterInput): Promise<Member | null> {
    await this.client.query('select app.admin_set_member_perimeter($1, $2, $3::uuid[], $4::uuid[])', [
      id,
      expectedVersion,
      input.sector_ids,
      input.site_ids,
    ]);
    return this.get(id);
  }

  async setSensitiveAccess(
    id: string,
    expectedVersion: number,
    input: MemberSensitiveAccessInput,
  ): Promise<Member | null> {
    await this.client.query('select app.admin_set_sensitive_access($1, $2, $3::uuid[], $4)', [
      id,
      expectedVersion,
      input.sector_ids,
      input.valid_until,
    ]);
    return this.get(id);
  }

  async resetSecondFactor(id: string, expectedVersion: number): Promise<Member | null> {
    await this.client.query('select app.admin_reset_second_factor($1, $2)', [id, expectedVersion]);
    return this.get(id);
  }
}
