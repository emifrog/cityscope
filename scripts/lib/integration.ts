import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

export type AppRole = 'etare_api' | 'etare_worker';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function isLocalUrl(url: string): boolean {
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

/** 32 random bytes, URL-safe: no escaping issue in connection strings, no SASLprep ambiguity. */
export function generatePassword(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SCRAM-SHA-256 verifier (RFC 7677, PostgreSQL format). Sending the verifier
 * instead of the password means the clear-text password never reaches the
 * server, so it cannot end up in a statement log.
 */
export function scramSha256Verifier(password: string, salt: Buffer = randomBytes(16), iterations = 4096): string {
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

/**
 * Derives the connection string of an application role from the admin one:
 * same host, port, database and options (sslmode, sslrootcert...), with the
 * role as user. Supports direct connections (user "postgres") and the
 * Supabase pooler (user "postgres.<project-ref>").
 */
export function roleConnectionString(adminUrl: string, role: AppRole, password: string): string {
  const url = new URL(adminUrl);
  const user = decodeURIComponent(url.username);
  const match = /^postgres(\.[a-z0-9]+)?$/.exec(user);
  if (!match) {
    throw new Error(`Unexpected admin user "${user}": expected "postgres" or "postgres.<project-ref>".`);
  }
  url.username = `${role}${match[1] ?? ''}`;
  url.password = encodeURIComponent(password);
  return url.toString();
}

/** Sets KEY=value lines in a dotenv file content, keeping every other line (comments included). */
export function upsertEnvValues(content: string, values: Readonly<Record<string, string>>): string {
  const lines = content.split(/\r?\n/);
  const pending = new Map(Object.entries(values));
  const updated = lines.map((line) => {
    const key = /^([A-Z0-9_]+)=/.exec(line)?.[1];
    if (key && pending.has(key)) {
      const value = pending.get(key);
      pending.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });
  while (updated.length > 0 && updated.at(-1) === '') updated.pop();
  for (const [key, value] of pending) updated.push(`${key}=${value}`);
  return `${updated.join('\n')}\n`;
}
