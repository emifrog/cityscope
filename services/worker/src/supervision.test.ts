import { createLogger } from '@etare/adapters/logging';
import { PermanentJobError, type WorkerSupervisionStore } from '@etare/application';
import { ServiceUnavailable } from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import { startWorkerSupervision } from './handlers';
import { failureCode } from './runner';

const silent = createLogger({}, { write: () => undefined });

describe('supervision of the worker (EXP-03)', () => {
  it('keeps the code of a failure: permanent, known error, else HANDLER_ERROR', () => {
    expect(failureCode(new PermanentJobError('SNAPSHOT_INVALID'))).toBe('SNAPSHOT_INVALID');
    expect(failureCode(Object.assign(new Error('clamd'), { code: 'ANTIVIRUS_UNAVAILABLE' }))).toBe(
      'ANTIVIRUS_UNAVAILABLE',
    );
    expect(failureCode(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))).toBe('ECONNREFUSED');
    // A SQLSTATE or a free text never becomes a code.
    expect(failureCode(Object.assign(new Error('timeout'), { code: '57014' }))).toBe('HANDLER_ERROR');
    expect(failureCode(Object.assign(new Error('x'), { code: 'not a code' }))).toBe('HANDLER_ERROR');
    expect(failureCode('boom')).toBe('HANDLER_ERROR');
  });

  it('beats, asks for the hourly maintenance, and records a clean shutdown', async () => {
    vi.useFakeTimers();
    try {
      const store: WorkerSupervisionStore = {
        beat: vi.fn(async () => undefined),
        scheduleMaintenance: vi.fn(async () => undefined),
        purgeHistory: vi.fn(async () => ({})),
      };
      const now = new Date('2026-10-28T10:15:00Z');
      const stop = startWorkerSupervision(
        store,
        { workerId: 'w1', version: '1.0.0', handlers: ['publication.build'], concurrency: 2 },
        silent,
        { intervalMs: 30_000, now: () => now },
      );
      expect(store.beat).toHaveBeenCalledTimes(1);
      expect(store.scheduleMaintenance).toHaveBeenCalledWith('2026-10-28T10');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(store.beat).toHaveBeenCalledTimes(3);
      await stop();
      expect(store.beat).toHaveBeenLastCalledWith(expect.objectContaining({ workerId: 'w1', stopping: true }));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(store.beat).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps beating when the database refuses a beat', async () => {
    const store: WorkerSupervisionStore = {
      beat: vi.fn(async () => {
        throw new ServiceUnavailable();
      }),
      scheduleMaintenance: vi.fn(async () => undefined),
      purgeHistory: vi.fn(async () => ({})),
    };
    const stop = startWorkerSupervision(
      store,
      { workerId: 'w1', version: 'dev', handlers: [], concurrency: 1 },
      silent,
    );
    await stop();
    expect(store.beat).toHaveBeenCalledTimes(2);
  });
});
