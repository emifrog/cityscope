import { createServer, type AddressInfo, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AntivirusUnavailable, ClamAvScanner, parseClamAvUrl } from './clamav';

/**
 * Minimal clamd: decodes the INSTREAM chunks exactly as the daemon does and
 * answers with what the test decides from the reassembled content.
 */
function fakeClamd(answer: (content: Buffer) => string | null): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      let buffer = Buffer.alloc(0);
      socket.on('data', (data) => {
        buffer = Buffer.concat([buffer, data]);
        const command = 'zINSTREAM\0';
        if (buffer.length < command.length) return;
        if (buffer.subarray(0, command.length).toString() !== command) {
          socket.end('UNKNOWN COMMAND\0');
          return;
        }
        const chunks: Buffer[] = [];
        let offset = command.length;
        while (offset + 4 <= buffer.length) {
          const size = buffer.readUInt32BE(offset);
          if (size === 0) {
            const reply = answer(Buffer.concat(chunks));
            if (reply !== null) socket.end(`${reply}\0`);
            return;
          }
          if (offset + 4 + size > buffer.length) return;
          chunks.push(buffer.subarray(offset + 4, offset + 4 + size));
          offset += 4 + size;
        }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port }));
  });
}

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function scannerFor(answer: (content: Buffer) => string | null, options: { timeoutMs?: number } = {}) {
  const { server, port } = await fakeClamd(answer);
  servers.push(server);
  return new ClamAvScanner({ host: '127.0.0.1', port, chunkBytes: 7, ...options });
}

describe('ClamAV scanner (SEC-01)', () => {
  it('streams the whole file in length-prefixed chunks and reads a clean verdict', async () => {
    let received = '';
    const scanner = await scannerFor((content) => {
      received = content.toString();
      return 'stream: OK';
    });
    const content = new TextEncoder().encode('%PDF-1.4 consignes de sécurité du site');
    await expect(scanner.scan(content)).resolves.toEqual({ verdict: 'clean', engine: 'clamav' });
    expect(received).toBe('%PDF-1.4 consignes de sécurité du site');
  });

  it('reports the signature of an infected file', async () => {
    const scanner = await scannerFor(() => 'stream: Win.Test.EICAR_HDB-1 FOUND');
    await expect(scanner.scan(new Uint8Array([1, 2, 3]))).resolves.toEqual({
      verdict: 'infected',
      engine: 'clamav',
      signature: 'Win.Test.EICAR_HDB-1',
    });
  });

  it('refuses a file above the stream limit of the daemon', async () => {
    const scanner = await scannerFor(() => 'INSTREAM size limit exceeded. ERROR');
    await expect(scanner.scan(new Uint8Array(32))).resolves.toMatchObject({ verdict: 'unscannable' });
  });

  it('never admits a file when the daemon is down, answers an error or does not answer', async () => {
    // Daemon stopped: its port refuses the connection.
    const { server, port } = await fakeClamd(() => 'stream: OK');
    await new Promise((resolve) => server.close(resolve));
    await expect(new ClamAvScanner({ host: '127.0.0.1', port }).scan(new Uint8Array(1))).rejects.toBeInstanceOf(
      AntivirusUnavailable,
    );
    const failing = await scannerFor(() => "Can't allocate memory ERROR");
    await expect(failing.scan(new Uint8Array(1))).rejects.toBeInstanceOf(AntivirusUnavailable);
    const silent = await scannerFor(() => null, { timeoutMs: 200 });
    await expect(silent.scan(new Uint8Array(1))).rejects.toThrow(/timeout/);
  });

  it('accepts only tcp://host:port addresses', () => {
    expect(parseClamAvUrl('tcp://clamav:3310')).toEqual({ host: 'clamav', port: 3310 });
    expect(() => parseClamAvUrl('http://clamav:3310')).toThrow();
  });
});
