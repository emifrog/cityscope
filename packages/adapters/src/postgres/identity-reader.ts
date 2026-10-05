import type { IdentityReader } from '@etare/application';
import type { MeResponse } from '@etare/contracts';
import { Unauthenticated, isRole, type Permission } from '@etare/domain';
import type { PoolClient } from './pool';

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  second_factor: boolean | null;
  second_factor_reenrollment: boolean | null;
}

interface MembershipRow {
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  roles: string[];
  second_factor_required: boolean;
  limited: boolean;
}

export class PostgresIdentityReader implements IdentityReader {
  constructor(private readonly client: PoolClient) {}

  async me(): Promise<MeResponse> {
    const user = await this.client.query<UserRow>(
      `select id, email::text as email, display_name, app.my_second_factor() as second_factor,
              app.my_second_factor_reenrollment() as second_factor_reenrollment
       from app.user_account where id = app.current_user_id()`,
    );
    const row = user.rows[0];
    if (!row) throw new Unauthenticated('Compte inconnu ou désactivé.');

    const memberships = await this.client.query<MembershipRow>(
      'select tenant_id, tenant_slug, tenant_name, roles, second_factor_required, limited from app.my_memberships()',
    );
    return {
      user: {
        id: row.id,
        email: row.email,
        display_name: row.display_name,
        second_factor: row.second_factor === true,
        second_factor_reenrollment: row.second_factor_reenrollment === true,
      },
      memberships: memberships.rows.map((m) => ({
        tenant_id: m.tenant_id,
        tenant_slug: m.tenant_slug,
        tenant_name: m.tenant_name,
        roles: m.roles.filter(isRole),
        second_factor_required: m.second_factor_required,
        limited: m.limited,
      })),
    };
  }

  async holdsOnPart(permission: Permission): Promise<boolean> {
    const { rows } = await this.client.query<{ held: boolean }>('select app.holds_permission_on_part($1) as held', [
      permission,
    ]);
    return rows[0]?.held ?? false;
  }

  async holdsWithSecondFactor(permission: Permission): Promise<boolean> {
    const { rows } = await this.client.query<{ held: boolean }>('select app.holds_with_second_factor($1) as held', [
      permission,
    ]);
    return rows[0]?.held === true;
  }
}
