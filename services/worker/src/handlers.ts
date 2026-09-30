import { PermanentJobError, type Job } from '@etare/application';
import type { Logger } from '@etare/adapters/logging';
import { z } from 'zod';

export interface JobExecution {
  readonly job: Job;
  readonly logger: Logger;
  /** Aborted when the worker shuts down or loses the lease. */
  readonly signal: AbortSignal;
}

export interface HandlerDefinition<P> {
  readonly type: string;
  readonly payloadVersion: number;
  readonly payload: z.ZodType<P>;
  /** Must be idempotent: a job can be delivered more than once. */
  handle(payload: P, execution: JobExecution): Promise<void>;
}

/** A registered handler: payload validation is encapsulated, so handlers of any payload type can share a registry. */
export interface JobHandler {
  readonly type: string;
  readonly payloadVersion: number;
  run(rawPayload: unknown, execution: JobExecution): Promise<void>;
}

export function defineHandler<P>(definition: HandlerDefinition<P>): JobHandler {
  return {
    type: definition.type,
    payloadVersion: definition.payloadVersion,
    async run(rawPayload, execution) {
      // Validate before any side effect: a malformed payload will never succeed, do not retry it.
      const payload = definition.payload.safeParse(rawPayload);
      if (!payload.success) throw new PermanentJobError('INVALID_PAYLOAD');
      await definition.handle(payload.data, execution);
    },
  };
}

/**
 * Technical no-op job: proves the whole chain (enqueue in a transaction,
 * lease, heartbeat, completion) without side effect. Future handlers
 * (PDF generation, offline packages, thumbnails, imports, antivirus,
 * notifications, checksums) plug in the same way.
 */
export const noopHandler = defineHandler({
  type: 'system.noop',
  payloadVersion: 1,
  payload: z.looseObject({ note: z.string().max(200).optional() }),
  async handle(payload, { logger }) {
    logger.info('noop job executed', { note: payload.note });
  },
});

export class HandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  constructor(handlers: readonly JobHandler[] = []) {
    for (const handler of handlers) this.register(handler);
  }

  register(handler: JobHandler): void {
    if (this.handlers.has(handler.type)) throw new Error(`Duplicate job handler: ${handler.type}`);
    this.handlers.set(handler.type, handler);
  }

  /** Unknown types and unsupported payload versions are permanent errors. */
  async execute(execution: JobExecution): Promise<void> {
    const { job } = execution;
    const handler = this.handlers.get(job.type);
    if (!handler) throw new PermanentJobError('UNKNOWN_JOB_TYPE');
    if (job.payloadVersion !== handler.payloadVersion) throw new PermanentJobError('UNSUPPORTED_PAYLOAD_VERSION');
    await handler.run(job.payload, execution);
  }

  types(): string[] {
    return [...this.handlers.keys()];
  }
}
