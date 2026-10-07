import { createHash, createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { API_BASE_PATH } from '@etare/contracts';
import {
  deviceKeyRotationText,
  deviceRequestText,
  enrollmentText,
  normalizeEnrollmentCode,
  type DeviceKeyAlgorithm,
} from '@etare/domain';

/** The API under test, as `createApiApp` returns it. */
export interface TestApi {
  request(path: string, init: RequestInit): Response | Promise<Response>;
}

export const sha256Hex = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');

/** A terminal key: Ed25519 (first tablets) or ECDSA P-256 as the Android Keystore holds it (SEC-05). */
export class TerminalKey {
  readonly key: KeyObject;
  readonly publicKey: string;

  constructor(readonly algorithm: DeviceKeyAlgorithm = 'ed25519') {
    if (algorithm === 'ed25519') {
      this.key = generateKeyPairSync('ed25519').privateKey;
      this.publicKey = Buffer.from(createPublicKey(this.key).export({ format: 'jwk' }).x ?? '', 'base64url').toString(
        'base64',
      );
    } else {
      this.key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
      this.publicKey = createPublicKey(this.key).export({ type: 'spki', format: 'der' }).toString('base64');
    }
  }

  sign(text: string): string {
    const data = Buffer.from(text, 'utf8');
    return (
      this.algorithm === 'ed25519'
        ? sign(null, data, this.key)
        : sign('sha256', data, { key: this.key, dsaEncoding: 'der' })
    ).toString('base64');
  }
}

/** The OPS application: its key, generated on the device, and how it signs its requests (ADR-015). */
export class Terminal {
  private current: TerminalKey;
  deviceId = '';

  constructor(
    private readonly app: TestApi,
    private readonly token: string,
    private readonly tenant: string,
    algorithm: DeviceKeyAlgorithm = 'ed25519',
  ) {
    this.current = new TerminalKey(algorithm);
  }

  /** The same terminal with its current key: kept to sign with a former key after a rotation. */
  copy(): Terminal {
    const copy = new Terminal(this.app, this.token, this.tenant);
    copy.current = this.current;
    copy.deviceId = this.deviceId;
    return copy;
  }

  get key(): KeyObject {
    return this.current.key;
  }

  get publicKey(): string {
    return this.current.publicKey;
  }

  get keyAlgorithm(): DeviceKeyAlgorithm {
    return this.current.algorithm;
  }

  signText(text: string): string {
    return this.current.sign(text);
  }

  /**
   * Moves to a new key (SEC-05): the request is signed by the current key, the new one signs the
   * rotation text. The terminal uses the new key only once the server accepted it.
   */
  async rotate(algorithm: DeviceKeyAlgorithm = 'ecdsa-p256', proofKey?: TerminalKey): Promise<Response> {
    const next = new TerminalKey(algorithm);
    const proof = (proofKey ?? next).sign(
      deviceKeyRotationText({ tenantId: this.tenant, deviceId: this.deviceId, algorithm, publicKey: next.publicKey }),
    );
    const response = await this.request('POST', '/sync/device-key', {
      key_algorithm: algorithm,
      public_key: next.publicKey,
      proof,
    });
    if (response.ok) this.current = next;
    return response;
  }

  /** Enrollment body for a one-time code, with the proof of possession of the key. */
  enrollment(code: string, publicKey = this.publicKey) {
    return {
      code,
      key_algorithm: this.keyAlgorithm,
      public_key: publicKey,
      platform: 'android',
      app_version: '1.0.0',
      proof: this.signText(
        enrollmentText({ tenantId: this.tenant, code: normalizeEnrollmentCode(code) ?? '', publicKey: this.publicKey }),
      ),
    };
  }

  /** A request signed by this terminal; [options.app] sends it to another configuration of the API. */
  async request(method: string, path: string, body?: unknown, options: { signedPath?: string; app?: TestApi } = {}) {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const timestamp = Date.now();
    const text = deviceRequestText({
      method,
      path: `${API_BASE_PATH}${options.signedPath ?? path}`,
      timestamp,
      bodySha256: sha256Hex(raw),
    });
    return (options.app ?? this.app).request(`${API_BASE_PATH}${path}`, {
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
