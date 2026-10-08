import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Ed25519Signer, verifyEd25519 } from '@etare/adapters/crypto';
import { SIGNATURE_CONTEXTS, canonicalJson, type Keyset } from '@etare/domain';
import {
  assetFindings,
  basemapProblems,
  countMismatches,
  findingsDifference,
  parseManifest,
  parseObjectHashes,
  parseObjectList,
  publicationProblems,
  quotedTable,
  signatureStatus,
  signedManifest,
  type FileIndex,
} from './backup-verify';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const TENANT = '06000000-0000-4000-8000-000000000000';
const PLAN = 'a'.repeat(64);
const PDF = 'b'.repeat(64);

describe('archive of a backup', () => {
  it('reads the manifest, the object list and the hashes written by the backup job', () => {
    const manifest = parseManifest(
      JSON.stringify({
        format: 1,
        nom: 'firescape-preprod-x',
        migrations: ['1'],
        tables: { 'app.tenant': 2 },
        objets: {},
      }),
    );
    expect(manifest.tables['app.tenant']).toBe(2);
    expect(() => parseManifest(JSON.stringify({ format: 2, nom: 'x', migrations: [] }))).toThrow(/format/);

    expect(parseObjectList('etare-assets\ttenants/t/assets/a/v\t42\timage/png\n')).toEqual([
      { bucket: 'etare-assets', name: 'tenants/t/assets/a/v', size: 42, mimeType: 'image/png' },
    ]);
    const hashes = parseObjectHashes(`${PLAN}  objets/etare-assets/tenants/t/assets/a/v\n`);
    expect(hashes.get('etare-assets/tenants/t/assets/a/v')).toBe(PLAN);
    expect(() => parseObjectHashes('pas une empreinte\n')).toThrow();
  });

  it('quotes only plain schema.table names', () => {
    expect(quotedTable('app.tenant')).toBe('"app"."tenant"');
    expect(() => quotedTable('app.tenant; drop table app.site')).toThrow();
    expect(() => quotedTable('tenant')).toThrow();
  });

  it('names the tables whose restored rows differ', () => {
    expect(countMismatches({ 'app.tenant': 2, 'auth.users': 5 }, { 'app.tenant': 2, 'auth.users': 5 })).toEqual([]);
    expect(countMismatches({ 'app.tenant': 2, 'app.site': 1 }, { 'app.tenant': 3 })).toEqual([
      'app.tenant : 3 ligne(s) au lieu de 2',
      'app.site : absente ligne(s) au lieu de 1',
    ]);
  });
});

describe('signatures of the restored content', () => {
  const { signer } = Ed25519Signer.generate();
  const { signer: stranger } = Ed25519Signer.generate();
  const keyset = (status: 'active' | 'retired' | 'revoked'): Keyset => ({
    keyset_version: 1,
    sequence: 4,
    issued_at: '2026-11-11T00:00:00Z',
    keys: [{ purpose: 'publication', key_id: signer.keyId, public_key: signer.publicKey, status }],
  });
  const manifest = { publication_id: 'p1', files: [] };
  const text = signedManifest('publication', manifest);
  const signature = signer.signNow(SIGNATURE_CONTEXTS.manifest, canonicalJson(manifest));

  it('accepts a signature by a trusted key, even retired, as the terminals do', () => {
    expect(signatureStatus(text, [signature], keyset('active'), verifyEd25519)).toBe('valid');
    expect(signatureStatus(text, [signature], keyset('retired'), verifyEd25519)).toBe('valid');
  });

  it('refuses a revoked key, an unknown key or another content', () => {
    expect(signatureStatus(text, [signature], keyset('revoked'), verifyEd25519)).toBe('invalid');
    const foreign = stranger.signNow(SIGNATURE_CONTEXTS.manifest, canonicalJson(manifest));
    expect(signatureStatus(text, [foreign], keyset('active'), verifyEd25519)).toBe('invalid');
    expect(signatureStatus(signedManifest('basemap', manifest), [signature], keyset('active'), verifyEd25519)).toBe(
      'invalid',
    );
  });

  it('tells an unsigned content from an unchecked one', () => {
    expect(signatureStatus(text, [], keyset('active'), verifyEd25519)).toBe('unsigned');
    expect(signatureStatus(text, [signature], null, verifyEd25519)).toBe('unchecked');
  });
});

describe('published content after a restoration', () => {
  const payload = { schema_version: 1, data: { site: 'EHPAD' } };
  const manifest = {
    data_file: 'data.json',
    files: [
      { path: 'data.json', sha256: sha256(canonicalJson(payload)) },
      { path: 'plans/r1.png', sha256: PLAN },
      { path: 'etare.pdf', sha256: PDF },
    ],
  };
  const publication = {
    id: 'p1',
    tenantId: TENANT,
    manifest,
    manifestHash: sha256(canonicalJson(manifest)),
    payload,
    pdfStorageKey: `tenants/${TENANT}/publications/p1/etare-${PDF}.pdf`,
    signatures: [],
  };
  const objects = new Map([
    [`tenants/${TENANT}/assets/a1/v1`, PLAN],
    [`tenants/${TENANT}/publications/p1/etare-${PDF}.pdf`, PDF],
  ]);
  const files: FileIndex = {
    assetKey: (tenantId, hash) => (tenantId === TENANT && hash === PLAN ? `tenants/${TENANT}/assets/a1/v1` : undefined),
    objectHash: (key) => objects.get(key),
  };

  it('finds every file of the manifest with its content', () => {
    expect(publicationProblems(publication, sha256, files)).toEqual([]);
  });

  it('reports an altered manifest, altered data, a missing or altered file', () => {
    expect(publicationProblems({ ...publication, manifestHash: PDF }, sha256, files)).toEqual([
      'publication p1 : manifeste différent de son empreinte',
    ]);
    expect(publicationProblems({ ...publication, payload: { other: true } }, sha256, files)).toEqual([
      'publication p1 : données différentes',
    ]);
    expect(publicationProblems({ ...publication, pdfStorageKey: null }, sha256, files)).toEqual([
      'publication p1 : fichier etare.pdf absent',
    ]);
    const altered: FileIndex = { ...files, objectHash: (key) => (key.endsWith('/v1') ? PDF : objects.get(key)) };
    expect(publicationProblems(publication, sha256, altered)).toEqual(['publication p1 : fichier plans/r1.png altéré']);
  });

  it('checks every part of a base map in force', () => {
    const basemap = {
      id: 'b1',
      manifest: { version: 3 },
      manifestHash: sha256(canonicalJson({ version: 3 })),
      files: [{ sha256: PLAN, storage_key: `tenants/${TENANT}/assets/a1/v1` }],
    };
    expect(basemapProblems(basemap, sha256, files)).toEqual([]);
    expect(
      basemapProblems(
        { ...basemap, files: [{ sha256: PDF, storage_key: `tenants/${TENANT}/basemaps/b1/part-0` }] },
        sha256,
        files,
      ),
    ).toEqual(['fond de carte b1 : partie part-0 absente ou altérée']);
  });
});

describe('verified files of the SIS', () => {
  const asset = (key: string, hash: string, thumbnail: string | null = null) => ({
    tenantId: TENANT,
    storageKey: key,
    sha256: hash,
    thumbnailKey: thumbnail,
  });

  it('tells a conforming file from one absent, gone during the backup or different', () => {
    const archived = new Map([
      ['k/ok', PLAN],
      ['k/different', PDF],
    ]);
    const { verified, conforming, findings } = assetFindings(
      [
        asset('k/ok', PLAN),
        asset('k/absent', PLAN),
        asset('k/gone', PLAN),
        asset('k/different', PLAN),
        asset('k/ok', PLAN, 'k/thumb'),
      ],
      new Set(['k/ok', 'k/gone', 'k/different']),
      archived,
    );
    expect(conforming).toBe(2);
    expect(verified.get(`${TENANT}:${PLAN}`)).toBe('k/ok');
    expect(findings).toEqual([
      'fichier k/absent : absent du stockage à la sauvegarde',
      'fichier k/gone : disparu pendant la sauvegarde',
      'fichier k/different : contenu différent de son empreinte',
      'miniature k/thumb : absente',
    ]);
  });

  it('compares the anomalies of the restored platform with those of the source', () => {
    expect(findingsDifference(['a', 'b'], ['b', 'a'])).toEqual({ added: [], removed: [] });
    expect(findingsDifference(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
  });
});
