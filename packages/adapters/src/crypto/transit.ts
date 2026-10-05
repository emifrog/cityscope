import { readFile } from 'node:fs/promises';
import type { IdentifiedSigner } from '@etare/application';
import type { Signature } from '@etare/contracts';
import {
  SIGNATURE_ALGORITHM,
  ServiceUnavailable,
  isEd25519PublicKey,
  isKeyActive,
  signedText,
  type Keyset,
  type SignatureContext,
  type SigningKeyPurpose,
} from '@etare/domain';
import { keyIdOf, verifyEd25519 } from './ed25519';

/** A Transit engine of OpenBao or Vault holding a signing key that never leaves it. */
export interface TransitSettings {
  /** Address of the server, e.g. https://bao.internal:8200. */
  readonly url: string;
  /** Mount path of the Transit engine (`transit` by default). */
  readonly mount: string;
  /** Name of the key in the engine. */
  readonly key: string;
  /** File holding the token (written by the agent of the vault, renewed outside the process). */
  readonly tokenFile: string;
  /** Namespace (Vault Enterprise, HCP), if any. */
  readonly namespace?: string | null;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

/** One version of a Transit key, identified like any key of the platform. */
export interface TransitKeyVersion {
  readonly version: number;
  readonly publicKey: string;
  readonly keyId: string;
  readonly createdAt: string | null;
}

const DEFAULT_TIMEOUT_MS = 5_000;

async function transitRequest(settings: TransitSettings, path: string, body?: unknown): Promise<unknown> {
  const token = (await readFile(settings.tokenFile, 'utf8')).trim();
  if (!token) throw new ServiceUnavailable('Jeton du coffre de clés vide.');
  const headers: Record<string, string> = { 'x-vault-token': token, accept: 'application/json' };
  if (settings.namespace) headers['x-vault-namespace'] = settings.namespace;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let response: Response;
  try {
    response = await (settings.fetch ?? fetch)(
      `${settings.url.replace(/\/$/, '')}/v1/${settings.mount}/${path}/${encodeURIComponent(settings.key)}`,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(settings.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      },
    );
  } catch {
    throw new ServiceUnavailable('Coffre de clés injoignable.');
  }
  // The token never appears in an error: only the status.
  if (!response.ok) throw new ServiceUnavailable(`Coffre de clés : réponse ${response.status}.`);
  return response.json();
}

/** The versions of a Transit key, with the identifiers the key set uses. */
export async function transitKeyVersions(settings: TransitSettings): Promise<TransitKeyVersion[]> {
  const answer = (await transitRequest(settings, 'keys')) as {
    data?: { type?: string; keys?: Record<string, { public_key?: string; creation_time?: string }> };
  };
  if (answer.data?.type !== 'ed25519') throw new Error(`Transit key ${settings.key}: an ed25519 key is expected.`);
  return Object.entries(answer.data.keys ?? {})
    .map(([version, value]) => ({
      version: Number(version),
      publicKey: value.public_key ?? '',
      keyId: keyIdOf(value.public_key ?? ''),
      createdAt: value.creation_time ?? null,
    }))
    .filter((entry) => Number.isInteger(entry.version) && isEd25519PublicKey(entry.publicKey))
    .sort((a, b) => a.version - b.version);
}

/**
 * Signs through the Transit engine: the private key never reaches the process.
 * The version used is the newest one the key set lists as active for the purpose
 * (a version created by a rotation signs only once the key set announces it), or
 * the latest one without a key set (development).
 */
export class TransitSigner implements IdentifiedSigner {
  private constructor(
    private readonly settings: TransitSettings,
    private readonly version: TransitKeyVersion,
  ) {}

  get keyId(): string {
    return this.version.keyId;
  }

  get publicKey(): string {
    return this.version.publicKey;
  }

  static async connect(
    settings: TransitSettings,
    purpose: SigningKeyPurpose,
    keyset: Keyset | null,
  ): Promise<TransitSigner> {
    const versions = await transitKeyVersions(settings);
    const usable = keyset ? versions.filter((entry) => isKeyActive(keyset, purpose, entry.keyId)) : versions;
    const chosen = usable.at(-1);
    if (!chosen) {
      throw new Error(
        `Transit key ${settings.key}: no version is active for ${purpose} in the key set (rotate, then publish a key set).`,
      );
    }
    return new TransitSigner(settings, chosen);
  }

  async sign(context: SignatureContext, content: string): Promise<Signature> {
    const text = signedText(context, content);
    const answer = (await transitRequest(this.settings, 'sign', {
      input: Buffer.from(text, 'utf8').toString('base64'),
      key_version: this.version.version,
    })) as { data?: { signature?: string } };
    const match = /^vault:v(\d+):([A-Za-z0-9+/]{86}==)$/.exec(answer.data?.signature ?? '');
    if (!match || Number(match[1]) !== this.version.version) {
      throw new ServiceUnavailable('Coffre de clés : signature inattendue.');
    }
    const signature = match[2] ?? '';
    // Never hand out a signature the terminals would refuse.
    if (!verifyEd25519(this.version.publicKey, text, signature)) {
      throw new ServiceUnavailable('Coffre de clés : signature invalide.');
    }
    return { algorithm: SIGNATURE_ALGORITHM, key_id: this.version.keyId, signature };
  }
}
