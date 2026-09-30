import { createLogger } from '@etare/adapters/logging';
import { PermanentJobError, type Job, type JobQueue } from '@etare/application';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { retryDelaySeconds } from './backoff';
import { HandlerRegistry, defineHandler, noopHandler } from './handlers';
import { createWorker } from './runner';

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    tenantId: '06000000-0000-4000-8000-000000000000',
    type: 'system.noop',
    payloadVersion: 1,
    payload: {},
    attempts: 1,
    maxAttempts: 5,
    correlationId: null,
    ...overrides,
  };
}

function fakeQueue(jobs: Job[]) {
  const queue = {
    claim: vi.fn(async () => jobs.splice(0)),
    heartbeat: vi.fn(async () => true),
    complete: vi.fn(async () => true),
    fail: vi.fn(async (_id: string, _code: string, retry: number | null): Promise<'queued' | 'dead'> =>
      retry === null ? 'dead' : 'queued',
    ),
  } satisfies JobQueue;
  return queue;
}

const silent = createLogger({}, { write: () => undefined });

function worker(queue: JobQueue, registry = new HandlerRegistry([noopHandler])) {
  return createWorker({
    queue,
    registry,
    logger: silent,
    concurrency: 2,
    leaseSeconds: 30,
    pollIntervalMs: 10,
    retryDelay: () => 7,
  });
}

describe('worker', () => {
  it('completes a successful job', async () => {
    const queue = fakeQueue([job()]);
    await expect(worker(queue).runOnce()).resolves.toBe(1);
    expect(queue.complete).toHaveBeenCalledWith('job-1');
    expect(queue.fail).not.toHaveBeenCalled();
  });

  it('retries transient failures with a delay', async () => {
    const flaky = defineHandler({
      type: 'test.flaky',
      payloadVersion: 1,
      payload: z.object({}),
      handle: async () => {
        throw new Error('network');
      },
    });
    const queue = fakeQueue([job({ type: 'test.flaky' })]);
    await worker(queue, new HandlerRegistry([flaky])).runOnce();
    expect(queue.fail).toHaveBeenCalledWith('job-1', 'HANDLER_ERROR', 7);
    expect(queue.complete).not.toHaveBeenCalled();
  });

  it('sends permanent errors straight to the dead state', async () => {
    const queue = fakeQueue([job({ type: 'unknown.type' })]);
    await worker(queue).runOnce();
    expect(queue.fail).toHaveBeenCalledWith('job-1', 'UNKNOWN_JOB_TYPE', null);
  });

  it('validates payloads before any side effect', async () => {
    const handle = vi.fn(async () => undefined);
    const strict = defineHandler({
      type: 'test.strict',
      payloadVersion: 1,
      payload: z.object({ siteId: z.uuid() }),
      handle,
    });
    const queue = fakeQueue([job({ type: 'test.strict', payload: { siteId: 'nope' } })]);
    await worker(queue, new HandlerRegistry([strict])).runOnce();
    expect(handle).not.toHaveBeenCalled();
    expect(queue.fail).toHaveBeenCalledWith('job-1', 'INVALID_PAYLOAD', null);
  });

  it('refuses unsupported payload versions', async () => {
    const queue = fakeQueue([job({ payloadVersion: 2 })]);
    await worker(queue).runOnce();
    expect(queue.fail).toHaveBeenCalledWith('job-1', 'UNSUPPORTED_PAYLOAD_VERSION', null);
  });

  it('stops gracefully', async () => {
    const queue = fakeQueue([]);
    const w = worker(queue);
    await w.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await w.stop();
    expect(queue.claim).toHaveBeenCalled();
  });

  it('rejects duplicate handler registrations', () => {
    expect(() => new HandlerRegistry([noopHandler, noopHandler])).toThrow('Duplicate');
  });

  it('keeps PermanentJobError codes', () => {
    expect(new PermanentJobError('X').code).toBe('X');
  });
});

describe('retry delay', () => {
  it('grows exponentially and is capped', () => {
    expect(retryDelaySeconds(1, () => 1)).toBe(10);
    expect(retryDelaySeconds(3, () => 1)).toBe(40);
    expect(retryDelaySeconds(30, () => 1)).toBe(3600);
    expect(retryDelaySeconds(3, () => 0)).toBe(1);
  });
});
