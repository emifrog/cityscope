import type { HealthProbe } from '@etare/application';
import type { Pool } from './pool';

export class PostgresHealthProbe implements HealthProbe {
  constructor(private readonly pool: Pool) {}

  async database(): Promise<'ok' | 'unavailable'> {
    try {
      await this.pool.query('select 1');
      return 'ok';
    } catch {
      return 'unavailable';
    }
  }
}
