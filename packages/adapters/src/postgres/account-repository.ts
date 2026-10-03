import type { AccountRepository, SecuritySettingsRepository } from '@etare/application';
import {
  accountSessionSchema,
  type AccountSession,
  type RecoveryCodesState,
  type SecondFactorPolicy,
  type SecuritySettings,
} from '@etare/contracts';
import type { PoolClient } from './pool';
import { toIso } from './versioned';

interface SessionRow {
  id: string;
  created_at: Date;
  last_seen_at: Date;
  user_agent: string | null;
  ip: string | null;
  aal: string | null;
  is_current: boolean;
}

/** Sessions of the caller, read and closed through app.my_sessions / app.revoke_my_sessions. */
export class PostgresAccountRepository implements AccountRepository {
  constructor(private readonly client: PoolClient) {}

  async sessions(): Promise<AccountSession[]> {
    const { rows } = await this.client.query<SessionRow>(
      'select id, created_at, last_seen_at, user_agent, ip, aal, is_current from app.my_sessions()',
    );
    return rows.map((row) =>
      accountSessionSchema.parse({
        ...row,
        created_at: toIso(row.created_at),
        last_seen_at: toIso(row.last_seen_at),
        aal: row.aal === 'aal1' || row.aal === 'aal2' ? row.aal : null,
      }),
    );
  }

  async revoke(sessionId: string | null): Promise<number> {
    const { rows } = await this.client.query<{ revoked: number }>('select app.revoke_my_sessions($1) as revoked', [
      sessionId,
    ]);
    return rows[0]?.revoked ?? 0;
  }

  async recoveryCodes(): Promise<RecoveryCodesState> {
    const { rows } = await this.client.query<{ remaining: number; generated_at: Date | null }>(
      'select remaining, generated_at from app.recovery_codes_state()',
    );
    const row = rows[0];
    return {
      remaining: row?.remaining ?? 0,
      generated_at: row?.generated_at ? toIso(row.generated_at) : null,
    };
  }

  async regenerateRecoveryCodes(): Promise<string[]> {
    const { rows } = await this.client.query<{ code: string }>('select app.regenerate_recovery_codes() as code');
    return rows.map((row) => row.code);
  }

  async useRecoveryCode(code: string): Promise<void> {
    await this.client.query('select app.use_recovery_code($1)', [code]);
  }
}

export class PostgresSecuritySettingsRepository implements SecuritySettingsRepository {
  constructor(private readonly client: PoolClient) {}

  async get(): Promise<SecuritySettings | null> {
    const { rows } = await this.client.query<{ second_factor_policy: SecondFactorPolicy }>(
      'select second_factor_policy from app.security_settings()',
    );
    return rows[0] ? { second_factor_policy: rows[0].second_factor_policy } : null;
  }

  async update(settings: SecuritySettings): Promise<SecuritySettings> {
    const { rows } = await this.client.query<{ policy: SecondFactorPolicy }>(
      'select app.update_security_settings($1) as policy',
      [settings.second_factor_policy],
    );
    return { second_factor_policy: rows[0]?.policy ?? settings.second_factor_policy };
  }
}
