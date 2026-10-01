import { createHash, createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { API_BASE_PATH } from '@etare/contracts';
import { deviceRequestText, enrollmentText, normalizeEnrollmentCode } from '@etare/domain';

/** The API under test, as `createApiApp` returns it. */
export interface TestApi {
  request(path: string, init: RequestInit): Response | Promise<Response>;
}

export const sha256Hex = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');

/** The OPS application: its key, generated on the device, and how it signs its requests (ADR-015). */
export class Terminal {
  readonly key: KeyObject = generateKeyPairSync('ed25519').privateKey;
  readonly publicKey = Buffer.from(createPublicKey(this.key).export({ format: 'jwk' }).x ?? '', 'base64url').toString(
    'base64',
  );
  deviceId = '';

  constructor(
    private readonly app: TestApi,
    private readonly token: string,
    private readonly tenant: string,
  ) {}

  signText(text: string): string {
    return sign(null, Buffer.from(text, 'utf8'), this.key).toString('base64');
  }

  /** Enrollment body for a one-time code, with the proof of possession of the key. */
  enrollment(code: string, publicKey = this.publicKey) {
    return {
      code,
      public_key: publicKey,
      platform: 'android',
      app_version: '1.0.0',
      proof: this.signText(
        enrollmentText({ tenantId: this.tenant, code: normalizeEnrollmentCode(code) ?? '', publicKey: this.publicKey }),
      ),
    };
  }

  async request(method: string, path: string, body?: unknown, options: { signedPath?: string } = {}) {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const timestamp = Date.now();
    const text = deviceRequestText({
      method,
      path: `${API_BASE_PATH}${options.signedPath ?? path}`,
      timestamp,
      bodySha256: sha256Hex(raw),
    });
    return this.app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        'x-tenant-id': this.tenant,
        'x-client-platform': 'mobile',
        'x-app-version': '1.0.0',
        'content-type': 'application/json',
        'x-device-id': this.deviceId,
        'x-device-time': String(timestamp),
        'x-device-signature': this.signText(text),
      },
      ...(body === undefined ? {} : { body: raw }),
    });
  }
}
