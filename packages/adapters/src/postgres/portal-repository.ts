import type { PortalAccessRepository, PortalInviteInput } from '@etare/application';
import {
  myPortalInvitationSchema,
  portalInvitationSchema,
  type MyPortalInvitation,
  type PortalInvitation,
  type PortalSettings,
} from '@etare/contracts';
import { portalInvitationState, type PortalAccessState } from '@etare/domain';
import type { PoolClient } from './pool';
import { toIso } from './versioned';

interface InvitationRow {
  id: string;
  email: string;
  display_name: string | null;
  organization: string | null;
  sites: { id: string; name: string }[];
  status: 'pending' | 'accepted' | 'revoked';
  expires_at: Date;
  access_until: Date | null;
  invited_by_name: string | null;
  created_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  revocation_reason: string | null;
  row_version: number;
}

/** Invitations of the current SIS with their sites (RLS: portal:invite). */
const INVITATION_SELECT = `
  select i.id, i.email::text as email, i.display_name, i.organization,
         coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by lower(s.name))
                   from app.portal_invitation_site pis
                   join app.site s on s.tenant_id = pis.tenant_id and s.id = pis.site_id
                   where pis.invitation_id = i.id), '[]'::jsonb) as sites,
         i.status, i.expires_at, i.access_until, app.member_name(i.invited_by) as invited_by_name,
         i.created_at, i.accepted_at, i.revoked_at, i.revocation_reason, i.row_version
  from app.portal_invitation i
  where i.tenant_id = app.current_tenant_id()`;

function toInvitation(row: InvitationRow, now: Date): PortalInvitation {
  return portalInvitationSchema.parse({
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    organization: row.organization,
    sites: row.sites,
    state: portalInvitationState({ status: row.status, expiresAt: row.expires_at, now }),
    expires_at: row.expires_at.toISOString(),
    access_until: toIso(row.access_until),
    invited_by_name: row.invited_by_name,
    created_at: row.created_at.toISOString(),
    accepted_at: toIso(row.accepted_at),
    revoked_at: toIso(row.revoked_at),
    revocation_reason: row.revocation_reason,
    row_version: row.row_version,
  } satisfies PortalInvitation);
}

interface MyInvitationRow {
  id: string;
  tenant_id: string;
  tenant_name: string;
  organization: string | null;
  invited_by_name: string;
  expires_at: Date;
  access_until: Date | null;
  sites: { id: string; name: string }[];
}

export class PostgresPortalAccessRepository implements PortalAccessRepository {
  constructor(
    private readonly client: PoolClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listInvitations(): Promise<PortalInvitation[]> {
    const { rows } = await this.client.query<InvitationRow>(`${INVITATION_SELECT} order by i.created_at desc, i.id`);
    const now = this.now();
    return rows.map((row) => toInvitation(row, now));
  }

  async getInvitation(id: string): Promise<PortalInvitation | null> {
    const { rows } = await this.client.query<InvitationRow>(`${INVITATION_SELECT} and i.id = $1`, [id]);
    return rows[0] ? toInvitation(rows[0], this.now()) : null;
  }

  async invite(
    input: PortalInviteInput,
    authSubject: string | null,
  ): Promise<{ invitationId: string; accountCreated: boolean } | null> {
    const { rows } = await this.client.query<{ invitation_id: string; account_created: boolean }>(
      'select invitation_id, account_created from app.portal_invite($1, $2, $3, $4::uuid[], $5, $6, $7)',
      [
        input.email,
        input.displayName,
        input.organization,
        [...input.siteIds],
        input.expiresAt,
        input.accessUntil,
        authSubject,
      ],
    );
    const row = rows[0];
    return row ? { invitationId: row.invitation_id, accountCreated: row.account_created } : null;
  }

  async revoke(id: string, expectedVersion: number, reason: string): Promise<PortalInvitation> {
    await this.client.query('select app.portal_revoke_invitation($1, $2, $3)', [id, expectedVersion, reason]);
    const invitation = await this.getInvitation(id);
    if (!invitation) throw new Error('revoked invitation not visible');
    return invitation;
  }

  async myInvitations(): Promise<MyPortalInvitation[]> {
    const { rows } = await this.client.query<MyInvitationRow>(
      `select id, tenant_id, tenant_name, organization, invited_by_name, expires_at, access_until, sites
       from app.my_portal_invitations()`,
    );
    return rows.map((row) =>
      myPortalInvitationSchema.parse({
        id: row.id,
        tenant_id: row.tenant_id,
        tenant_name: row.tenant_name,
        organization: row.organization,
        invited_by_name: row.invited_by_name,
        expires_at: row.expires_at.toISOString(),
        access_until: toIso(row.access_until),
        sites: row.sites,
      } satisfies MyPortalInvitation),
    );
  }

  async accept(id: string): Promise<string> {
    const { rows } = await this.client.query<{ tenant_id: string }>(
      'select app.portal_accept_invitation($1) as tenant_id',
      [id],
    );
    return rows[0]?.tenant_id ?? '';
  }

  async settings(): Promise<PortalSettings | null> {
    const { rows } = await this.client.query<{ mfa_required: boolean }>(
      'select mfa_required from app.portal_settings()',
    );
    return rows[0] ? { mfa_required: rows[0].mfa_required } : null;
  }

  async updateSettings(settings: PortalSettings): Promise<PortalSettings> {
    const { rows } = await this.client.query<{ mfa_required: boolean }>(
      'select app.update_portal_settings($1) as mfa_required',
      [settings.mfa_required],
    );
    return { mfa_required: rows[0]?.mfa_required ?? settings.mfa_required };
  }

  async accessState(): Promise<PortalAccessState> {
    const { rows } = await this.client.query<{ state: PortalAccessState }>('select app.portal_access_state() as state');
    return rows[0]?.state ?? 'none';
  }
}
