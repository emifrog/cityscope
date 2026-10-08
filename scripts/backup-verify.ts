/**
 * Control of a restored platform (EXP-02, ADR-031, docs/exploitation/sauvegarde-restauration.md), after
 * `firescape-sauvegarde restaurer`, against the archive extracted in <dossier>:
 *
 * - fidelity (exit code 1 on failure): migrations, rows per table, files of the archive (hashes
 *   recomputed), restored storage (every object at its size and content type; its bytes were compared
 *   by `restaurer`);
 * - content: what the terminals would receive (assets by hash, manifests, files, signatures, key set no
 *   older than theirs). Anomalies already present in the source are restored as they were: they are
 *   listed, and with --reference they must be exactly those of the source (exercise, infra/backup).
 *
 *   RESTORE_DATABASE_URL=<postgres role of the target> pnpm backup:verify --restauration <dossier>
 *     [--keyset <signed key set file>] [--dotenv <file with DISTRIBUTION_KEYSET / _FILE / _ROOT_KEYS>]
 *     [--contenu-seulement] [--rapport <out.json>] [--reference <rapport.json>]
 *
 * The URL is read from the environment only (it holds the password of the target). The extracted folder
 * holds data in clear: delete it afterwards.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { isKeysetSignedBy, parseRootKeys, parseSignedKeyset, verifyEd25519 } from '@etare/adapters/crypto';
import type { Keyset } from '@etare/domain';
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
  type StoredSignature,
} from './lib/backup-verify';

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const { values: options } = parseArgs({
  options: {
    restauration: { type: 'string' },
    keyset: { type: 'string' },
    dotenv: { type: 'string' },
    'contenu-seulement': { type: 'boolean', default: false },
    rapport: { type: 'string' },
    reference: { type: 'string' },
  },
});
const dir = resolve(options.restauration ?? fail('--restauration <dossier extrait par restaurer> est requis.'));
if (options.dotenv) process.loadEnvFile(resolve(options.dotenv));
const databaseUrl = process.env['RESTORE_DATABASE_URL'] ?? fail('RESTORE_DATABASE_URL manquant (environnement).');
if (!existsSync(join(dir, 'manifeste.json'))) fail(`${dir} : pas de manifeste.json (dossier extrait par restaurer).`);

const manifest = parseManifest(readFileSync(join(dir, 'manifeste.json'), 'utf8'));
const objects = parseObjectList(readFileSync(join(dir, 'base', 'objets.tsv'), 'utf8'));
const listedHashes = parseObjectHashes(readFileSync(join(dir, 'objets.sha256'), 'utf8'));

const fidelity: string[] = [];
const content: string[] = [];
const show = (mark: string, message: string, details: readonly string[]) => {
  console.log(`${mark} ${message}`);
  for (const detail of details.slice(0, 10)) console.log(`    ${detail}`);
  if (details.length > 10) console.log(`    … et ${details.length - 10} autre(s)`);
};
/** A check of the restoration itself: any problem fails the control. */
const checkFidelity = (message: string, problems: readonly string[]) => {
  show(problems.length === 0 ? '✔' : '✖', message, problems);
  if (problems.length > 0) fidelity.push(message);
};
/** A check of the content: anomalies are listed (and compared with the reference). */
const checkContent = (message: string, findings: readonly string[]) => {
  show(findings.length === 0 ? '✔' : '⚠', message, findings);
  content.push(...findings);
};
const sha256Text = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const sha256File = (path: string) =>
  new Promise<string>((done, failed) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => done(hash.digest('hex')))
      .on('error', failed);
  });

/** Key set the terminals trust: --keyset, else DISTRIBUTION_KEYSET or DISTRIBUTION_KEYSET_FILE. */
function loadKeyset(): Keyset | null {
  const file = options.keyset ?? process.env['DISTRIBUTION_KEYSET_FILE'];
  const text = file ? readFileSync(resolve(file), 'utf8') : process.env['DISTRIBUTION_KEYSET'];
  if (!text) return null;
  const { signed, keyset } = parseSignedKeyset(text);
  const roots = process.env['DISTRIBUTION_ROOT_KEYS'];
  if (roots) {
    checkFidelity(
      `jeu de clés n° ${keyset.sequence} signé par une racine`,
      isKeysetSignedBy(signed, parseRootKeys(roots)) ? [] : ['signature de la racine invalide'],
    );
  }
  return keyset;
}

const client = new pg.Client({ connectionString: databaseUrl, application_name: 'firescape-backup-verify' });
await client.connect();
try {
  console.log(`Contrôle de ${options['contenu-seulement'] ? 'la source' : 'la restauration'} de ${manifest.nom}`);
  const keyset = loadKeyset();

  // 1. Files of the archive: content against objets.sha256, recomputed.
  const archived = new Map<string, string>();
  const altered: string[] = [];
  for (const [key, listed] of listedHashes) {
    const actual = await sha256File(join(dir, 'objets', key));
    // Keyed by storage key, whatever the bucket (keys of the platform are unique).
    archived.set(key.slice(key.indexOf('/') + 1), actual);
    if (actual !== listed) altered.push(key);
  }
  checkFidelity(`fichiers de l'archive : ${listedHashes.size} relus, empreintes conformes`, altered);

  if (!options['contenu-seulement']) {
    // 2. Schema, rows and storage of the target, against the archive.
    const { rows: migrations } = await client.query<{ version: string }>(
      'select version from supabase_migrations.schema_migrations order by version',
    );
    const restoredMigrations = migrations.map((row) => row.version);
    checkFidelity(
      `migrations : ${restoredMigrations.length} sur la cible, ${manifest.migrations.length} dans l'archive`,
      restoredMigrations.join() === manifest.migrations.join() ? [] : ['historiques différents'],
    );
    const counts: Record<string, number> = {};
    for (const table of Object.keys(manifest.tables)) {
      const { rows } = await client.query<{ count: string }>(`select count(*) as count from ${quotedTable(table)}`);
      counts[table] = Number(rows[0]?.count ?? -1);
    }
    const totalRows = Object.values(manifest.tables).reduce((sum, rows) => sum + rows, 0);
    checkFidelity(
      `lignes : ${Object.keys(manifest.tables).length} tables, ${totalRows} lignes comme l'archive`,
      countMismatches(manifest.tables, counts),
    );
    const { rows: stored } = await client.query<{ key: string; size: string | null; mime: string | null }>(
      `select bucket_id || '/' || name as key, metadata ->> 'size' as size, metadata ->> 'mimetype' as mime
       from storage.objects`,
    );
    const restored = new Map(stored.map((row) => [row.key, row]));
    const storageProblems: string[] = [];
    for (const object of objects) {
      const key = `${object.bucket}/${object.name}`;
      if (!listedHashes.has(key)) continue; // gone from the storage during the backup (manifest: manquants)
      const row = restored.get(key);
      if (!row) storageProblems.push(`${key} : absent du stockage`);
      else if (object.size >= 0 && Number(row.size) !== object.size) storageProblems.push(`${key} : taille différente`);
      else if (row.mime !== object.mimeType)
        storageProblems.push(`${key} : type ${row.mime ?? '?'}, ${object.mimeType} attendu`);
    }
    checkFidelity(`stockage restauré : ${listedHashes.size} objets à leur taille et leur type`, storageProblems);
  }

  // 3. Files of the SIS: every verified asset with its content, and its thumbnail.
  const { rows: assets } = await client.query<{
    tenant_id: string;
    storage_key: string;
    sha256: string;
    thumbnail_key: string | null;
  }>(`select tenant_id, storage_key, sha256, thumbnail_key from app.asset where scan_status = 'clean'`);
  const listedAtBackup = new Set(objects.map((object) => object.name));
  const {
    verified,
    conforming,
    findings: assetIssues,
  } = assetFindings(
    assets.map((asset) => ({
      tenantId: asset.tenant_id,
      storageKey: asset.storage_key,
      sha256: asset.sha256,
      thumbnailKey: asset.thumbnail_key,
    })),
    listedAtBackup,
    archived,
  );
  checkContent(
    `fichiers vérifiés des SIS : ${assets.length}, dont ${conforming} conformes à leur empreinte`,
    assetIssues,
  );
  const files: FileIndex = {
    assetKey: (tenantId, sha256) => verified.get(`${tenantId}:${sha256}`),
    objectHash: (storageKey) => archived.get(storageKey),
  };

  // 4. What the terminals receive: publications and base maps in force, signatures, key set.
  const { rows: publications } = await client.query<{
    id: string;
    tenant_id: string;
    manifest: unknown;
    manifest_hash: string;
    payload: unknown;
    pdf_storage_key: string | null;
    signatures: StoredSignature[];
  }>(
    `select p.id, p.tenant_id, p.manifest, p.manifest_hash, p.payload, p.pdf_storage_key,
            case when p.manifest_signature is null then '[]'::jsonb else jsonb_build_array(p.manifest_signature) end
              || coalesce((select jsonb_agg(s.signature order by s.signed_at) from app.publication_signature s
                           where s.publication_id = p.id), '[]'::jsonb) as signatures
     from app.publication p where p.status in ('ready', 'published') and p.manifest is not null`,
  );
  const publicationIssues: string[] = [];
  const signatures = { valid: 0, unsigned: 0, unchecked: 0 };
  for (const publication of publications) {
    publicationIssues.push(
      ...publicationProblems(
        {
          id: publication.id,
          tenantId: publication.tenant_id,
          manifest: publication.manifest,
          manifestHash: publication.manifest_hash,
          payload: publication.payload,
          pdfStorageKey: publication.pdf_storage_key,
          signatures: publication.signatures,
        },
        sha256Text,
        files,
      ),
    );
    const status = signatureStatus(
      signedManifest('publication', publication.manifest),
      publication.signatures,
      keyset,
      verifyEd25519,
    );
    if (status === 'invalid') publicationIssues.push(`publication ${publication.id} : aucune signature valide`);
    else signatures[status] += 1;
  }
  checkContent(
    `publications en vigueur : ${publications.length} (signatures valides ${signatures.valid}, non signées ${signatures.unsigned}, non contrôlées ${signatures.unchecked})`,
    publicationIssues,
  );

  const { rows: basemaps } = await client.query<{
    id: string;
    manifest: unknown;
    manifest_hash: string;
    files: unknown;
    signatures: StoredSignature[];
  }>(
    `select b.id, b.manifest, b.manifest_hash, b.files,
            case when b.manifest_signature is null then '[]'::jsonb else jsonb_build_array(b.manifest_signature) end
              || coalesce((select jsonb_agg(s.signature order by s.signed_at) from app.basemap_pack_signature s
                           where s.pack_id = b.id), '[]'::jsonb) as signatures
     from app.basemap_pack b where b.status = 'ready' and b.files_removed_at is null`,
  );
  const basemapIssues: string[] = [];
  for (const basemap of basemaps) {
    basemapIssues.push(
      ...basemapProblems(
        { id: basemap.id, manifest: basemap.manifest, manifestHash: basemap.manifest_hash, files: basemap.files },
        sha256Text,
        files,
      ),
    );
    if (
      signatureStatus(signedManifest('basemap', basemap.manifest), basemap.signatures, keyset, verifyEd25519) ===
      'invalid'
    ) {
      basemapIssues.push(`fond de carte ${basemap.id} : aucune signature valide`);
    }
  }
  checkContent(`fonds de carte en vigueur : ${basemaps.length}`, basemapIssues);

  if (keyset) {
    // A terminal never goes back to an older key set (docs/exploitation/cles-de-signature.md, §7).
    const { rows } = await client.query<{ sequence: number | null }>(
      'select max(keyset_sequence) as sequence from app.device_sync_state',
    );
    const held = rows[0]?.sequence ?? 0;
    checkContent(
      `jeu de clés servi n° ${keyset.sequence}, tablettes au n° ${held || 'aucun'}`,
      keyset.sequence >= held
        ? []
        : [`jeu de clés n° ${keyset.sequence} plus ancien que celui des tablettes : en signer un de numéro supérieur`],
    );
  } else {
    console.log('  (signatures et jeu de clés non contrôlés : --keyset ou DISTRIBUTION_KEYSET pour les contrôler)');
  }
} finally {
  await client.end();
}

const findings = [...content].sort();
if (options.rapport) {
  writeFileSync(
    resolve(options.rapport),
    `${JSON.stringify({ archive: manifest.nom, fidelite: fidelity, contenu: findings }, null, 2)}\n`,
  );
}
if (options.reference) {
  const reference = JSON.parse(readFileSync(resolve(options.reference), 'utf8')) as { contenu?: string[] };
  const { added, removed } = findingsDifference(reference.contenu ?? [], findings);
  checkFidelity(`anomalies du contenu identiques à celles de la source (${findings.length})`, [
    ...added.map((finding) => `nouvelle : ${finding}`),
    ...removed.map((finding) => `disparue : ${finding}`),
  ]);
}
if (fidelity.length > 0) fail(`${fidelity.length} contrôle(s) de fidélité en échec.`);
const subject = options['contenu-seulement'] ? 'Source contrôlée' : 'Restauration conforme à l’archive';
console.log(
  findings.length === 0
    ? `✔ ${subject}, contenu sans anomalie.`
    : `✔ ${subject} ; ${findings.length} anomalie(s) du contenu (⚠)${options.reference ? ', les mêmes que dans la source' : ' à examiner'}.`,
);
