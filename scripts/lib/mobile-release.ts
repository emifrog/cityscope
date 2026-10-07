/**
 * Pure helpers of the mobile release (EXP-04, docs/exploitation/livraison-mobile.md): checks of the
 * build configuration and reading of the Android tools' output. No process, no file system.
 */

export const FLAVORS = ['prod', 'staging'] as const;
export type Flavor = (typeof FLAVORS)[number];

/** Application identifier of each flavor (android/app/build.gradle.kts). */
export const APPLICATION_IDS: Readonly<Record<Flavor, string>> = {
  prod: 'fr.etare.ops',
  staging: 'fr.etare.ops.staging',
};

export function isFlavor(value: string | undefined): value is Flavor {
  return FLAVORS.includes(value as Flavor);
}

/**
 * Problems of the `--dart-define` file of a release (empty when fit): the application checks the same
 * rules at start-up, the build refuses earlier.
 */
export function releaseDefinesProblems(flavor: Flavor, defines: Readonly<Record<string, unknown>>): string[] {
  const problems: string[] = [];
  const text = (key: string) => (typeof defines[key] === 'string' ? (defines[key] as string).trim() : '');
  if (text('ENV') !== flavor) {
    problems.push(`ENV doit valoir « ${flavor} » pour la variante ${flavor} (lu : « ${text('ENV')} »).`);
  }
  for (const key of ['API_BASE_URL', 'AUTH_URL']) {
    let url: URL | null = null;
    try {
      url = new URL(text(key));
    } catch {
      url = null;
    }
    if (url?.protocol !== 'https:') problems.push(`${key} doit être une URL HTTPS.`);
  }
  const publishable = text('AUTH_PUBLISHABLE_KEY');
  if (!publishable) problems.push('AUTH_PUBLISHABLE_KEY manquante.');
  if (/^sb_secret_|service_role/.test(publishable)) {
    problems.push('AUTH_PUBLISHABLE_KEY ressemble à une clé secrète : seule la clé publishable est embarquée.');
  }
  if (!/(^|;)\s*root:/.test(text('TRUSTED_SIGNING_KEYS'))) {
    problems.push('TRUSTED_SIGNING_KEYS doit contenir la clé racine des jeux de clés (root:<id>:<clé>).');
  }
  if (text('BUILD_COMMIT')) problems.push('BUILD_COMMIT est posé par le script, pas par le fichier.');
  return problems;
}

/** `0.5.0+5` → name and code, as Flutter reads them. */
export function parsePubspecVersion(pubspec: string): { name: string; code: number } {
  const match = /^version:\s*(\d+\.\d+\.\d+)\+(\d+)\s*$/m.exec(pubspec);
  if (!match?.[1] || !match[2]) throw new Error('Version introuvable dans pubspec.yaml (forme 1.2.3+4).');
  return { name: match[1], code: Number(match[2]) };
}

export function apkFileName(flavor: Flavor, version: { name: string; code: number }): string {
  return `firescape-${flavor}-${version.name}-${version.code}.apk`;
}

/** Hex digest without separators, lower case: `AB:CD` and `abcd` compare equal. */
export function normalizeFingerprint(value: string): string {
  return value.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}

/**
 * Distinct signing certificates, from `apksigner verify --print-certs`. Depending on the build-tools
 * version and the signature schemes, a signer is printed as `Signer #1`, `Signer (minSdkVersion=…)` or
 * `Signer #1 (v3 …)`; the same certificate printed for several schemes counts once.
 */
export function signerCertificates(output: string): { sha256: string; subject: string }[] {
  const signers = new Map<string, { sha256?: string; subject?: string }>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^(Signer\b.*?) certificate (DN|SHA-256 digest): (.+)$/.exec(line.trim());
    if (!match?.[1] || !match[2] || !match[3] || /source stamp/i.test(match[1])) continue;
    const signer = signers.get(match[1]) ?? {};
    if (match[2] === 'DN') signer.subject = match[3];
    else signer.sha256 = normalizeFingerprint(match[3]);
    signers.set(match[1], signer);
  }
  const certificates = new Map<string, { sha256: string; subject: string }>();
  for (const signer of signers.values()) {
    if (signer.sha256 && !certificates.has(signer.sha256)) {
      certificates.set(signer.sha256, { sha256: signer.sha256, subject: signer.subject ?? '' });
    }
  }
  return [...certificates.values()];
}

/** The debug key of the Android tools: never acceptable for a delivered APK. */
export function isDebugCertificate(subject: string): boolean {
  return /CN=Android Debug/i.test(subject);
}

/** Package line of `aapt2 dump badging`. */
export function badgingPackage(output: string): { applicationId: string; versionCode: number; versionName: string } {
  const line = output.split(/\r?\n/).find((candidate) => candidate.startsWith('package:'));
  const field = (name: string) => (line ? new RegExp(`${name}='([^']*)'`).exec(line)?.[1] : undefined);
  const applicationId = field('name');
  const versionCode = field('versionCode');
  const versionName = field('versionName');
  if (!applicationId || !versionCode || versionName === undefined) {
    throw new Error('Sortie de aapt2 illisible (ligne « package: » absente).');
  }
  return { applicationId, versionCode: Number(versionCode), versionName };
}

/** SHA-256 certificate fingerprint printed by `keytool -list -v`. */
export function keytoolSha256(output: string): string {
  const match = /SHA256:\s*([0-9A-Fa-f:]+)/.exec(output);
  if (!match?.[1]) throw new Error('Empreinte SHA-256 absente de la sortie de keytool.');
  return normalizeFingerprint(match[1]);
}

/** Fingerprint grouped by pairs, as Android and MDM consoles display it. */
export function displayFingerprint(hex: string): string {
  return (normalizeFingerprint(hex).toUpperCase().match(/.{2}/g) ?? []).join(':');
}
