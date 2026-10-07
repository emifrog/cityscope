/**
 * Delivery of the Android application (EXP-04, ADR-030, docs/exploitation/livraison-mobile.md).
 *
 *   pnpm mobile:release signing-key --out <dir> [--organization <name>]
 *       new release key (PKCS12, RSA 4096, 30 years) and its key.properties, in a directory OUTSIDE the
 *       repository; prints the certificate fingerprint. Runs on an offline workstation.
 *   pnpm mobile:release build --flavor prod|staging --defines <file> [--signing <key.properties>]
 *                             [--out <dir>] [--gradle-home <dir>] [--allow-dirty]
 *       signed release APK of a clean commit, with its SHA-256 and a build record (commit, versions,
 *       certificate, environment).
 *   pnpm mobile:release verify --apk <file> [--certificate <sha256>] [--flavor prod|staging]
 *       signature (never the debug key), expected certificate and identifier, SHA-256.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  APPLICATION_IDS,
  apkFileName,
  badgingPackage,
  displayFingerprint,
  isDebugCertificate,
  isFlavor,
  keytoolSha256,
  normalizeFingerprint,
  parsePubspecVersion,
  releaseDefinesProblems,
  signerCertificates,
  type Flavor,
} from './lib/mobile-release';

const root = resolve(import.meta.dirname, '..');
const mobile = resolve(root, 'apps/mobile');
const windows = process.platform === 'win32';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): string {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: 'utf8',
    shell: windows && /\.(bat|cmd)$/i.test(command),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function javaTool(name: string): string {
  const home = process.env['JAVA_HOME'];
  const candidate = home ? join(home, 'bin', windows ? `${name}.exe` : name) : name;
  return home && existsSync(candidate) ? candidate : name;
}

/** Newest build-tools of the Android SDK (apksigner, aapt2). */
function buildTool(name: string): string {
  const sdk = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'];
  if (!sdk) fail('ANDROID_HOME manquant : chemin du SDK Android (build-tools).');
  const versions = readdirSync(join(sdk, 'build-tools')).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const latest = versions.at(-1);
  if (!latest) fail(`Aucun build-tools dans ${sdk}.`);
  const file = join(sdk, 'build-tools', latest, windows && name === 'apksigner' ? 'apksigner.bat' : name);
  return windows && name === 'aapt2' ? `${file}.exe` : file;
}

function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function signingKey(values: Record<string, string | boolean | undefined>): void {
  const out = typeof values['out'] === 'string' ? resolve(values['out']) : fail('--out <dossier> requis.');
  const inside = relative(root, out);
  if (!inside.startsWith('..') && !isAbsolute(inside)) {
    fail('La clé ne se crée jamais dans le dépôt : choisissez un dossier hors du dépôt (support chiffré).');
  }
  const keystore = join(out, 'firescape-release.p12');
  if (existsSync(keystore)) fail(`${keystore} existe déjà : une clé de release ne se remplace pas.`);
  mkdirSync(out, { recursive: true });
  const organization = typeof values['organization'] === 'string' ? values['organization'] : 'FireScape';
  const alias = 'firescape';
  // PKCS12 : un seul mot de passe pour le magasin et la clé ; passé par l'environnement, jamais en argument.
  const password = randomBytes(24).toString('base64url');
  const env = { ...process.env, ETARE_KEYSTORE_PASSWORD: password };
  run(
    javaTool('keytool'),
    [
      '-genkeypair',
      '-keystore',
      keystore,
      '-storetype',
      'PKCS12',
      '-alias',
      alias,
      '-keyalg',
      'RSA',
      '-keysize',
      '4096',
      '-validity',
      '10950',
      '-dname',
      `CN=FireScape, O=${organization.replace(/,/g, ' ')}, C=FR`,
      '-storepass:env',
      'ETARE_KEYSTORE_PASSWORD',
      '-keypass:env',
      'ETARE_KEYSTORE_PASSWORD',
    ],
    { env },
  );
  const listing = run(
    javaTool('keytool'),
    ['-list', '-v', '-keystore', keystore, '-alias', alias, '-storepass:env', 'ETARE_KEYSTORE_PASSWORD'],
    { env },
  );
  const fingerprint = displayFingerprint(keytoolSha256(listing));
  writeFileSync(
    join(out, 'key.properties'),
    [
      '# Clé de signature de release FireScape (EXP-04) : à garder chiffrée, jamais dans le dépôt.',
      `storeFile=${keystore.replace(/\\/g, '/')}`,
      `storePassword=${password}`,
      `keyAlias=${alias}`,
      `keyPassword=${password}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  writeFileSync(join(out, 'certificat-sha256.txt'), `${fingerprint}\n`);
  console.log(`Clé créée : ${keystore}`);
  console.log(`Propriétés : ${join(out, 'key.properties')} (mot de passe inclus)`);
  console.log(`Empreinte SHA-256 du certificat (publique) : ${fingerprint}`);
  console.log('Faire deux copies chiffrées du dossier, dans deux coffres distincts, avec un procès-verbal.');
}

function verifyApk(apk: string, expected: { certificate?: string; flavor?: Flavor }) {
  if (!existsSync(apk)) fail(`${apk} introuvable.`);
  const result = spawnSync(buildTool('apksigner'), ['verify', '--verbose', '--print-certs', apk], {
    encoding: 'utf8',
    shell: windows,
  });
  if (result.status !== 0) fail(`Signature invalide :\n${result.stdout}${result.stderr}`);
  // Selon la version des build-tools, une partie de la sortie passe par stderr.
  const output = `${result.stdout}\n${result.stderr}`;
  const signers = signerCertificates(output);
  if (signers.length !== 1) {
    fail(`Un seul certificat de signature attendu (${signers.length} trouvé(s)) :\n${output}`);
  }
  const [signer] = signers;
  if (!signer || isDebugCertificate(signer.subject)) fail('APK signé par la clé de debug : jamais diffusé.');
  if (expected.certificate && normalizeFingerprint(expected.certificate) !== signer.sha256) {
    fail(
      `Certificat inattendu : ${displayFingerprint(signer.sha256)} (attendu ${displayFingerprint(expected.certificate)}).`,
    );
  }
  const badging = badgingPackage(run(buildTool('aapt2'), ['dump', 'badging', apk]));
  if (expected.flavor && badging.applicationId !== APPLICATION_IDS[expected.flavor]) {
    fail(`Identifiant ${badging.applicationId}, attendu ${APPLICATION_IDS[expected.flavor]}.`);
  }
  return { ...badging, certificateSha256: signer.sha256, certificateSubject: signer.subject, sha256: sha256File(apk) };
}

function build(values: Record<string, string | boolean | undefined>): void {
  const flavor = values['flavor'];
  if (typeof flavor !== 'string' || !isFlavor(flavor)) fail('--flavor prod|staging requis.');
  const definesFile = typeof values['defines'] === 'string' ? resolve(values['defines']) : fail('--defines requis.');
  const defines = JSON.parse(readFileSync(definesFile, 'utf8')) as Record<string, unknown>;
  const problems = releaseDefinesProblems(flavor, defines);
  if (problems.length > 0) fail(`Configuration refusée :\n- ${problems.join('\n- ')}`);

  const signing = resolve(
    typeof values['signing'] === 'string' ? values['signing'] : (process.env['ETARE_ANDROID_SIGNING'] ?? ''),
  );
  if (!existsSync(signing)) fail('--signing <key.properties> (ou ETARE_ANDROID_SIGNING) requis.');

  const commit = run('git', ['rev-parse', 'HEAD']).trim();
  const dirty = run('git', ['status', '--porcelain']).trim() !== '';
  if (dirty && values['allow-dirty'] !== true) {
    fail('Arbre de travail modifié : une release se construit depuis un commit propre (--allow-dirty pour un essai).');
  }
  const version = parsePubspecVersion(readFileSync(join(mobile, 'pubspec.yaml'), 'utf8'));

  const env: NodeJS.ProcessEnv = { ...process.env, ETARE_ANDROID_SIGNING: signing };
  if (typeof values['gradle-home'] === 'string') {
    // Construction isolée de la configuration Gradle personnelle du poste : mémoire suffisante, sans
    // démon, compilation Kotlin non incrémentale (ses caches échouent sous Windows quand le projet et
    // le cache Pub sont sur deux lecteurs).
    const home = resolve(values['gradle-home']);
    mkdirSync(home, { recursive: true });
    writeFileSync(
      join(home, 'gradle.properties'),
      [
        'org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g',
        'org.gradle.daemon=false',
        'kotlin.incremental=false',
        '',
      ].join('\n'),
    );
    env['GRADLE_USER_HOME'] = home;
  }
  const flutter = windows ? 'flutter.bat' : 'flutter';
  const result = spawnSync(
    flutter,
    [
      'build',
      'apk',
      '--release',
      '--flavor',
      flavor,
      `--dart-define-from-file=${definesFile}`,
      `--dart-define=BUILD_COMMIT=${commit}`,
    ],
    { cwd: mobile, env, stdio: 'inherit', shell: windows },
  );
  if (result.status !== 0) fail('Construction en échec.');

  const produced = join(mobile, 'build/app/outputs/flutter-apk', `app-${flavor}-release.apk`);
  const out = resolve(typeof values['out'] === 'string' ? values['out'] : join(mobile, 'build/release'));
  mkdirSync(out, { recursive: true });
  const apk = join(out, apkFileName(flavor, version));
  copyFileSync(produced, apk);

  const checked = verifyApk(apk, { flavor });
  if (checked.versionCode !== version.code) fail(`versionCode ${checked.versionCode}, attendu ${version.code}.`);
  const flutterVersion = JSON.parse(run(flutter, ['--version', '--machine'], { cwd: mobile })) as Record<
    string,
    string
  >;
  const record = {
    application_id: checked.applicationId,
    flavor,
    version_name: checked.versionName,
    version_code: checked.versionCode,
    commit,
    dirty,
    built_at: new Date().toISOString(),
    flutter: flutterVersion['frameworkVersion'],
    dart: flutterVersion['dartSdkVersion'],
    environment: { ENV: defines['ENV'], API_BASE_URL: defines['API_BASE_URL'], AUTH_URL: defines['AUTH_URL'] },
    apk: basename(apk),
    apk_sha256: checked.sha256,
    apk_bytes: readFileSync(apk).byteLength,
    certificate_sha256: displayFingerprint(checked.certificateSha256),
    certificate_subject: checked.certificateSubject,
  };
  writeFileSync(apk.replace(/\.apk$/, '.json'), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(`${apk}.sha256`, `${checked.sha256}  ${basename(apk)}\n`);
  console.log(`APK : ${apk}`);
  console.log(`SHA-256 : ${checked.sha256}`);
  console.log(`Certificat : ${record.certificate_sha256}`);
  console.log(`Commit : ${commit}${dirty ? ' (arbre modifié : essai seulement)' : ''}`);
}

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    out: { type: 'string' },
    organization: { type: 'string' },
    flavor: { type: 'string' },
    defines: { type: 'string' },
    signing: { type: 'string' },
    'gradle-home': { type: 'string' },
    'allow-dirty': { type: 'boolean' },
    apk: { type: 'string' },
    certificate: { type: 'string' },
  },
});

switch (command) {
  case 'signing-key':
    signingKey(values);
    break;
  case 'build':
    build(values);
    break;
  case 'verify': {
    const apk = typeof values.apk === 'string' ? resolve(values.apk) : fail('--apk requis.');
    const flavor = values.flavor;
    if (flavor !== undefined && !isFlavor(flavor)) fail('--flavor prod|staging.');
    const checked = verifyApk(apk, {
      ...(values.certificate ? { certificate: values.certificate } : {}),
      ...(flavor ? { flavor } : {}),
    });
    console.log(`${checked.applicationId} ${checked.versionName} (${checked.versionCode})`);
    console.log(`Certificat : ${displayFingerprint(checked.certificateSha256)} — ${checked.certificateSubject}`);
    console.log(`SHA-256 : ${checked.sha256}`);
    break;
  }
  default:
    fail('Usage : pnpm mobile:release signing-key|build|verify … (voir l’en-tête du script).');
}
