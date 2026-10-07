import { describe, expect, it } from 'vitest';
import {
  apkFileName,
  badgingPackage,
  displayFingerprint,
  isDebugCertificate,
  keytoolSha256,
  normalizeFingerprint,
  parsePubspecVersion,
  releaseDefinesProblems,
  signerCertificates,
} from './mobile-release';

const ROOT = 'root:ed25519-root:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const stagingDefines = {
  ENV: 'staging',
  API_BASE_URL: 'https://preprod.etare.example/api/v1',
  AUTH_URL: 'https://preprod.etare.example/auth/v1',
  AUTH_PUBLISHABLE_KEY: 'sb_publishable_preprod',
  TRUSTED_SIGNING_KEYS: ROOT,
};

describe('mobile release (EXP-04)', () => {
  it('accepts a staging configuration for the staging flavor only', () => {
    expect(releaseDefinesProblems('staging', stagingDefines)).toEqual([]);
    expect(releaseDefinesProblems('prod', stagingDefines)).toEqual([
      'ENV doit valoir « prod » pour la variante prod (lu : « staging »).',
    ]);
  });

  it('refuses a development configuration: HTTP, secret key, no root key, commit forced', () => {
    const problems = releaseDefinesProblems('prod', {
      ENV: 'dev',
      API_BASE_URL: 'http://10.0.2.2:3000/api/v1',
      AUTH_URL: 'pas une url',
      AUTH_PUBLISHABLE_KEY: 'sb_secret_abc',
      TRUSTED_SIGNING_KEYS: 'publication:k:AAAA',
      BUILD_COMMIT: 'abc',
    });
    expect(problems).toHaveLength(6);
    expect(problems.join('\n')).toMatch(/API_BASE_URL doit être une URL HTTPS/);
    expect(problems.join('\n')).toMatch(/clé secrète/);
  });

  it('reads the pubspec version and names the APK after it', () => {
    const version = parsePubspecVersion('name: etare_ops\nversion: 0.5.0+5\n');
    expect(version).toEqual({ name: '0.5.0', code: 5 });
    expect(apkFileName('staging', version)).toBe('firescape-staging-0.5.0-5.apk');
    expect(() => parsePubspecVersion('version: 0.5.0\n')).toThrow(/Version introuvable/);
  });

  it('reads the signers of apksigner and spots the debug key', () => {
    const output = [
      'Verifies',
      'Verified using v2 scheme (APK Signature Scheme v2): true',
      'Number of signers: 1',
      'Signer #1 certificate DN: CN=FireScape, O=SDIS, C=FR',
      'Signer #1 certificate SHA-256 digest: 0a1b2c3d',
      'Signer #1 certificate SHA-1 digest: ffff',
    ].join('\n');
    expect(signerCertificates(output)).toEqual([{ sha256: '0a1b2c3d', subject: 'CN=FireScape, O=SDIS, C=FR' }]);
    // Same certificate printed for several schemes, or by signer lineage: one certificate.
    const lineage = [
      'Signer (minSdkVersion=24, maxSdkVersion=2147483647) certificate DN: CN=FireScape, C=FR',
      'Signer (minSdkVersion=24, maxSdkVersion=2147483647) certificate SHA-256 digest: 0A:1B',
      'Signer #1 certificate DN: CN=FireScape, C=FR',
      'Signer #1 certificate SHA-256 digest: 0a1b',
      'Source Stamp Signer certificate SHA-256 digest: ffff',
    ].join('\n');
    expect(signerCertificates(lineage)).toEqual([{ sha256: '0a1b', subject: 'CN=FireScape, C=FR' }]);
    // Recent build-tools: « V2 Signer: certificate … ».
    const recent = [
      'Number of signers: 1',
      'V2 Signer: certificate DN: CN=FireScape, O=CI, C=FR',
      'V2 Signer: certificate SHA-256 digest: ef3f',
      'V2 Signer: public key SHA-256 digest: 4d60',
    ].join('\n');
    expect(signerCertificates(recent)).toEqual([{ sha256: 'ef3f', subject: 'CN=FireScape, O=CI, C=FR' }]);
    expect(isDebugCertificate('C=US, O=Android, CN=Android Debug')).toBe(true);
    expect(isDebugCertificate('CN=FireScape, O=SDIS, C=FR')).toBe(false);
  });

  it('reads the package of aapt2 and the fingerprint of keytool', () => {
    expect(
      badgingPackage(
        "package: name='fr.etare.ops.staging' versionCode='5' versionName='0.5.0-preprod' platformBuildVersionName='16'\n",
      ),
    ).toEqual({ applicationId: 'fr.etare.ops.staging', versionCode: 5, versionName: '0.5.0-preprod' });
    expect(keytoolSha256('Certificate fingerprints:\n\t SHA1: AA:BB\n\t SHA256: 0A:1B:2C:3D\n')).toBe('0a1b2c3d');
    expect(normalizeFingerprint('0A:1b 2C')).toBe('0a1b2c');
    expect(displayFingerprint('0a1b2c3d')).toBe('0A:1B:2C:3D');
  });
});
