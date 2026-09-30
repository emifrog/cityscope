import { InvalidInput } from '@etare/domain';
import { z } from 'zod';

const keySchema = z.tuple([z.string(), z.uuid()]);

/** Opaque keyset cursor: base64url of the last (name, id) sort key. */
export function encodeCursor(name: string, id: string): string {
  return Buffer.from(JSON.stringify([name, id]), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { name: string; id: string } {
  try {
    const [name, id] = keySchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    return { name, id };
  } catch {
    throw new InvalidInput('Curseur de pagination invalide.', [{ path: 'cursor', message: 'Curseur invalide.' }]);
  }
}
