import { describe, expect, it } from 'vitest';
import { createLogger, redact } from './logger';

describe('structured logger', () => {
  it('never writes tokens, passwords or signed URLs', () => {
    const lines: string[] = [];
    const logger = createLogger({ component: 'test' }, { write: (line) => lines.push(line) });
    logger.info('request', {
      headers: { authorization: 'Bearer abc', 'x-trace-id': 't' },
      password: 'p',
      nested: { signedUrl: 'https://x', refresh_token: 'r' },
    });
    const entry = JSON.parse(lines[0] ?? '{}');
    expect(entry).toMatchObject({
      level: 'info',
      msg: 'request',
      component: 'test',
      headers: { authorization: '[redacted]', 'x-trace-id': 't' },
      password: '[redacted]',
      nested: { signedUrl: '[redacted]', refresh_token: '[redacted]' },
    });
  });

  it('filters by level', () => {
    const lines: string[] = [];
    const logger = createLogger({}, { level: 'warn', write: (line) => lines.push(line) });
    logger.info('ignored');
    logger.error('kept');
    expect(lines).toHaveLength(1);
  });

  it('serialises errors without stack traces', () => {
    expect(redact({ error: new Error('boom') })).toEqual({ error: { name: 'Error', message: 'boom' } });
  });
});
