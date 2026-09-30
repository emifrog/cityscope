import type { IdentityReader } from '@etare/application';
import type { MeResponse } from '@etare/contracts';
import { Unauthenticated, isRole } from '@etare/domain';
import type { PoolClient } from './pool';

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
}

interface MembershipRow {
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  roles: string[];
}

export class PostgresIdentityReader implements IdentityReader {
  constructor(private readonly client: PoolClient) {}

  async me(): Promise<MeResponse> {
    const user = await this.client.query<UserRow>(
      'select id, email::text as email, display_name from app.user_account where id = app.current_user_id()',
    );
    const row = user.rows[0];
    if (!row) throw new Unauthenticated('Compte inconnu ou désactivé.');

    const memberships = await this.client.query<MembershipRow>(
      'select tenant_id, tenant_slug, tenant_name, roles from app.my_memberships()',
    );
    return {
      user: { id: row.id, email: row.email, display_name: row.display_name },
      memberships: memberships.rows.map((m) => ({
        tenant_id: m.tenant_id,
        tenant_slug: m.tenant_slug,
        tenant_name: m.tenant_name,
        roles: m.roles.filter(isRole),
      })),
    };
  }
}
