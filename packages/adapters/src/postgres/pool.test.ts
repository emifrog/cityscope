import { describe, expect, it } from 'vitest';
import { createPool } from './pool';

describe('database pool', () => {
  it('survives the loss of an idle connection and reports it', async () => {
    const lost: string[] = [];
    const pool = createPool({
      connectionString: 'postgres://user:password@127.0.0.1:1/none',
      applicationName: 'test',
      onIdleError: (error) => lost.push(error.message),
    });
    // What pg emits when the server closes an idle connection (restart, failover).
    expect(() => pool.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
    expect(lost).toEqual(['Connection terminated unexpectedly']);
    await pool.end();
  });

  it('never stops the process, even without a reporter', async () => {
    const pool = createPool({ connectionString: 'postgres://127.0.0.1:1/none', applicationName: 'test' });
    expect(() => pool.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
    await pool.end();
  });
});
