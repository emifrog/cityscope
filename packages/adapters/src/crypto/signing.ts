import { readFile } from 'node:fs/promises';
import type { ContentSigner, IdentifiedSigner, LoadedKeyset } from '@etare/application';
import type { KeysetSetting, SigningKeySource } from '@etare/config';
import { isKeyActive, type Keyset, type SigningKeyPurpose } from '@etare/domain';
import { Ed25519Signer } from './ed25519';
import { isKeysetSignedBy, parseRootKeys, parseSignedKeyset } from './keyset';
import { TransitSigner } from './transit';

/**
 * Reads the key set of the configuration and, when root keys are configured,
 * checks its root signature: a process never serves or obeys a key set the
 * terminals would refuse (SEC-04, ADR-027).
 */
export async function loadKeyset(setting: KeysetSetting | null): Promise<LoadedKeyset | null> {
  if (!setting) return null;
  const text = setting.source.kind === 'inline' ? setting.source.text : await readFile(setting.source.path, 'utf8');
  const loaded = parseSignedKeyset(text.trim());
  if (setting.rootKeys && !isKeysetSignedBy(loaded.signed, parseRootKeys(setting.rootKeys))) {
    throw new Error(`Key set ${loaded.keyset.sequence}: not signed by a configured root key (DISTRIBUTION_ROOT_KEYS).`);
  }
  return loaded;
}

/**
 * Opens the signer of a purpose from its source. With a key set, its key must be
 * active there: a process never signs with a key the terminals do not trust yet,
 * nor with a retired or revoked one.
 */
export async function openSigner(
  source: SigningKeySource,
  purpose: SigningKeyPurpose,
  keyset: Keyset | null,
): Promise<IdentifiedSigner> {
  let signer: IdentifiedSigner;
  switch (source.kind) {
    case 'transit':
      signer = await TransitSigner.connect(
        {
          url: source.url,
          mount: source.mount,
          key: source.key,
          tokenFile: source.tokenFile,
          namespace: source.namespace,
        },
        purpose,
        keyset,
      );
      break;
    case 'file':
      signer = Ed25519Signer.fromSecret(await readFile(source.path, 'utf8'));
      break;
    case 'environment':
      signer = Ed25519Signer.fromPkcs8(source.value);
      break;
  }
  if (keyset && !isKeyActive(keyset, purpose, signer.keyId)) {
    throw new Error(`The ${purpose} key ${signer.keyId} is not active in the key set ${keyset.sequence}.`);
  }
  return signer;
}

/**
 * A signer opened at its first use, for processes whose dependencies are built
 * synchronously (the API); a failed opening is retried at the next signature.
 */
export function lazySigner(open: () => Promise<ContentSigner>): ContentSigner {
  let opening: Promise<ContentSigner> | null = null;
  return {
    async sign(context, content) {
      opening ??= open().catch((error: unknown) => {
        opening = null;
        throw error;
      });
      return (await opening).sign(context, content);
    },
  };
}
