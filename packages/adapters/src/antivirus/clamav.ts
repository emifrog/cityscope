import { connect } from 'node:net';
import type { MalwareScanner } from '@etare/application';

export interface ClamAvOptions {
  readonly host: string;
  readonly port: number;
  /** Whole scan, connection included (a busy daemon delays the job, it never admits the file). */
  readonly timeoutMs?: number;
  readonly chunkBytes?: number;
}

/** Thrown when the daemon cannot give a verdict: the job is retried, the file stays in quarantine. */
export class AntivirusUnavailable extends Error {
  constructor(detail: string) {
    super(`ANTIVIRUS_UNAVAILABLE: ${detail}`);
    this.name = 'AntivirusUnavailable';
  }
}

/** Reads `tcp://host:port` (the only scheme accepted). */
export function parseClamAvUrl(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  if (parsed.protocol !== 'tcp:' || !parsed.hostname || !parsed.port) {
    throw new Error('ANTIVIRUS_URL must look like tcp://host:3310');
  }
  return { host: parsed.hostname.replace(/^\[|\]$/g, ''), port: Number(parsed.port) };
}

/**
 * ClamAV through the clamd INSTREAM command (SEC-01): the file is streamed in
 * length-prefixed chunks, never written to disk on our side. "OK" is clean,
 * "<signature> FOUND" infected; a stream above the daemon limit cannot be
 * scanned and is refused; any other answer or failure is an unavailability.
 */
export class ClamAvScanner implements MalwareScanner {
  constructor(private readonly options: ClamAvOptions) {}

  async scan(content: Uint8Array): ReturnType<MalwareScanner['scan']> {
    const reply = await this.instream(content);
    if (reply === 'stream: OK') return { verdict: 'clean', engine: 'clamav' };
    const found = /^stream: (.+) FOUND$/.exec(reply);
    if (found) return { verdict: 'infected', engine: 'clamav', signature: found[1] ?? 'unknown' };
    if (/size limit exceeded/i.test(reply)) {
      return { verdict: 'unscannable', engine: 'clamav', signature: 'STREAM_TOO_LARGE' };
    }
    throw new AntivirusUnavailable(reply.slice(0, 200));
  }

  private instream(content: Uint8Array): Promise<string> {
    const { host, port, timeoutMs = 60_000, chunkBytes = 64 * 1024 } = this.options;
    return new Promise((resolve, reject) => {
      const socket = connect({ host, port });
      const received: Buffer[] = [];
      let settled = false;
      const finish = (error: Error | null, reply?: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(reply ?? '');
      };
      socket.setTimeout(timeoutMs, () => finish(new AntivirusUnavailable('timeout')));
      socket.on('error', (error) => finish(new AntivirusUnavailable(error.message)));
      socket.on('data', (chunk) => received.push(chunk));
      socket.on('end', () => finish(null, Buffer.concat(received).toString('utf8').replace(/\0+$/, '').trim()));
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < content.byteLength; offset += chunkBytes) {
          const chunk = content.subarray(offset, Math.min(offset + chunkBytes, content.byteLength));
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.byteLength);
          socket.write(length);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}
