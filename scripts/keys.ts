/**
 * Key ceremony of the offline distribution (SEC-04, ADR-027, docs/exploitation/cles-de-signature.md).
 * Runs on the workstation of the key holders, never on a server: the root key stays offline.
 *
 *   pnpm keys root --out <file>                       new root key (PEM); prints its public line
 *   pnpm keys generate --purpose <p> --out <file>     new signing key for a secret file (PEM)
 *   pnpm keys public --key-file <file>                public line of a key file
 *   pnpm keys transit --url <u> --key <k> --token-file <f> [--mount transit]
 *                                                     versions of a Transit key (OpenBao, Vault)
 *   pnpm keys sign --root <file> --in <draft.json> --out <keyset.json> [--previous <keyset.json>]
 *                                                     signs a key set with the root key
 *   pnpm keys show --in <keyset.json> [--root-keys "root:<id>:<base64>"]
 *                                                     checks and prints a key set
 *
 * A draft lists the keys by purpose, public key and status; identifiers are derived:
 *   { "sequence": 2, "keys": [{ "purpose": "publication", "public_key": "...", "status": "active" }] }
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  Ed25519Signer,
  isKeysetSignedBy,
  keyIdOf,
  parseRootKeys,
  parseSignedKeyset,
  signKeyset,
  transitKeyVersions,
} from '@etare/adapters/crypto';
import type { KeysetDocument } from '@etare/contracts';
import {
  SIGNING_KEY_PURPOSES,
  SIGNING_KEY_STATUSES,
  type Keyset,
  type SigningKeyPurpose,
  type SigningKeyStatus,
} from '@etare/domain';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    in: { type: 'string' },
    root: { type: 'string' },
    previous: { type: 'string' },
    purpose: { type: 'string' },
    'key-file': { type: 'string' },
    'root-keys': { type: 'string' },
    url: { type: 'string' },
    key: { type: 'string' },
    mount: { type: 'string', default: 'transit' },
    'token-file': { type: 'string' },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function required(name: keyof typeof values): string {
  const value = values[name];
  if (typeof value !== 'string' || !value) fail(`--${name} is required.`);
  return value;
}

/** Writes a private key: never over an existing file, readable by its owner only. */
function writeSecret(path: string, content: string): void {
  if (existsSync(path)) fail(`${path} already exists: a key is never overwritten.`);
  writeFileSync(path, content, { mode: 0o600, flag: 'wx' });
}

function printKeyset(keyset: Keyset): void {
  console.log(`Jeu de clés n° ${keyset.sequence}, émis le ${keyset.issued_at}`);
  for (const key of keyset.keys) {
    console.log(`  ${key.purpose.padEnd(12)} ${key.key_id}  ${key.status.padEnd(8)} ${key.public_key}`);
  }
}

const isPurpose = (value: unknown): value is SigningKeyPurpose =>
  SIGNING_KEY_PURPOSES.includes(value as SigningKeyPurpose);
const isStatus = (value: unknown): value is SigningKeyStatus =>
  SIGNING_KEY_STATUSES.includes(value as SigningKeyStatus);

/** The draft written by the key holders; the full rules are checked when signing. */
function readDraft(text: string): { sequence: number; keys: KeysetDocument['keys'] } {
  const draft = JSON.parse(text) as { sequence?: unknown; keys?: unknown };
  if (typeof draft.sequence !== 'number' || !Number.isInteger(draft.sequence) || draft.sequence < 1) {
    fail('Draft: "sequence" (positive integer) expected.');
  }
  if (!Array.isArray(draft.keys)) fail('Draft: "keys" (list) expected.');
  const keys = (draft.keys as { purpose?: unknown; public_key?: unknown; status?: unknown }[]).map((key) => {
    if (!isPurpose(key.purpose) || !isStatus(key.status) || typeof key.public_key !== 'string') {
      fail(`Draft: each key needs purpose (${SIGNING_KEY_PURPOSES.join('|')}), public_key and status.`);
    }
    return { purpose: key.purpose, public_key: key.public_key, status: key.status, key_id: keyIdOf(key.public_key) };
  });
  return { sequence: draft.sequence, keys };
}

switch (positionals[0]) {
  case 'root': {
    const { signer, privateKeyPem } = Ed25519Signer.generate();
    writeSecret(required('out'), privateKeyPem);
    console.log('Clé racine créée : gardez le fichier hors ligne, avec sa copie de secours (procédure SEC-04).');
    console.log(`Configuration des applications et des serveurs : root:${signer.keyId}:${signer.publicKey}`);
    break;
  }
  case 'generate': {
    const purpose = values.purpose;
    if (!isPurpose(purpose)) fail(`--purpose ${SIGNING_KEY_PURPOSES.join('|')} is required.`);
    const { signer, privateKeyPem } = Ed25519Signer.generate();
    writeSecret(required('out'), privateKeyPem);
    console.log(`Clé ${purpose} créée (${signer.keyId}) : à monter comme fichier de secret du processus.`);
    console.log(JSON.stringify({ purpose, public_key: signer.publicKey, status: 'active' }));
    break;
  }
  case 'public': {
    const signer = Ed25519Signer.fromSecret(readFileSync(required('key-file'), 'utf8'));
    console.log(`${signer.keyId} ${signer.publicKey}`);
    break;
  }
  case 'transit': {
    const versions = await transitKeyVersions({
      url: required('url'),
      mount: values.mount ?? 'transit',
      key: required('key'),
      tokenFile: required('token-file'),
    });
    for (const version of versions) {
      console.log(`v${version.version}  ${version.keyId}  ${version.publicKey}  ${version.createdAt ?? ''}`);
    }
    break;
  }
  case 'sign': {
    const root = Ed25519Signer.fromSecret(readFileSync(required('root'), 'utf8'));
    const draft = readDraft(readFileSync(required('in'), 'utf8'));
    const keyset: KeysetDocument = {
      keyset_version: 1,
      sequence: draft.sequence,
      issued_at: new Date().toISOString(),
      keys: draft.keys,
    };
    if (values.previous) {
      const previous = parseSignedKeyset(readFileSync(values.previous, 'utf8')).keyset;
      if (keyset.sequence <= previous.sequence) {
        fail(`Sequence ${keyset.sequence} must be above the previous one (${previous.sequence}).`);
      }
      // A revoked key never comes back: the terminals refuse what it signed for good.
      for (const key of previous.keys.filter((entry) => entry.status === 'revoked')) {
        const again = keyset.keys.find((entry) => entry.key_id === key.key_id);
        if (again && again.status !== 'revoked')
          fail(`Key ${key.key_id} was revoked: it cannot become ${again.status}.`);
      }
    }
    const signed = signKeyset(keyset, root);
    writeFileSync(required('out'), `${JSON.stringify(signed)}\n`, { flag: 'wx' });
    printKeyset(parseSignedKeyset(JSON.stringify(signed)).keyset);
    console.log(`Signé par la clé racine ${root.keyId}.`);
    break;
  }
  case 'show': {
    const { signed, keyset } = parseSignedKeyset(readFileSync(required('in'), 'utf8'));
    printKeyset(keyset);
    if (values['root-keys']) {
      const valid = isKeysetSignedBy(signed, parseRootKeys(values['root-keys']));
      console.log(valid ? `Signature racine valide (${signed.signature.key_id}).` : 'Signature racine INVALIDE.');
      if (!valid) process.exit(2);
    }
    break;
  }
  default:
    fail('usage: pnpm keys <root|generate|public|transit|sign|show> … (see scripts/keys.ts)');
}
