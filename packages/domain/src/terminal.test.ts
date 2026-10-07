import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERMINAL_POLICY,
  completeTerminalPolicy,
  deviceKeyRotationText,
  isDevicePublicKey,
  isDeviceSignature,
  terminalPolicyProblems,
} from './terminal';

// Vectors made with Node (prime256v1 SPKI, SHA256withECDSA in DER; Ed25519 raw key and signature).
const p256Public =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEwVUHiZ3Bbl3rwZXiFgC4m5Dz1Cpv2PIc6gKqxWXc2CB8SiLymoLXGrtbpe28Clnr9KstKojimelanoMfCqm+TQ==';
const p256Signatures = [
  'MEYCIQCa8+QpR8dfA3oOg+qEecewEMsiOepagny5ZRFHKWzcwgIhAKsKHmLDXYXiyW9BGfvQENhEOwuAi9Y+IX8F2IJMi+jO',
  'MEUCIQC/RiWMtLHObJ1elKhW92Vr7aA5/ru158YjcUnquxHZ9wIgKtPIT7N+Jo7pU0cLN+evWpI66FhqIx9TJPjWGVstOqA=',
  'MEUCIQDwRAI8XF4yVPlAZfysmXQ0eQv7/pybMJWfyZMKSGQmCQIgaJgDUpFuO2X9xS6dx/hGuw1sTpW/PQGIDUY8iW+C+bk=',
];
const p384Public =
  'MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE6RQW5SbxBNMnqwWiO2TmQcT7ZUEnGi0wCb/O0FoAiAo4oP4fUxD+6sXvw3HJGswH4BUDTV9rHFVu8iEse6FkGE4ZTQH1wYFTA+BnXIBae7hdTGibwkb76yoBobv/IdpW';
const edPublic = 'ZqxoyQzZaoZ1uQptrT1NjI3Mw6x8fJkFsWVuXLrezXU=';
const edSignature = '8Z0NpjnMoJlW/Vz5w2YICCD5iX3z9DwvUK4MHgwujuxbYUqW77sTyqfz7FVsq03JQ8bUm/8Of86/ddXhsOIUCQ==';

describe('terminal keys', () => {
  it('accepts each public key in the encoding of its own algorithm only', () => {
    expect(isDevicePublicKey('ecdsa-p256', p256Public)).toBe(true);
    expect(isDevicePublicKey('ed25519', edPublic)).toBe(true);
    expect(isDevicePublicKey('ed25519', p256Public)).toBe(false);
    expect(isDevicePublicKey('ecdsa-p256', edPublic)).toBe(false);
    // Another curve has another key prefix.
    expect(isDevicePublicKey('ecdsa-p256', p384Public)).toBe(false);
  });

  it('accepts DER signatures of ECDSA and raw signatures of Ed25519', () => {
    for (const signature of p256Signatures) expect(isDeviceSignature('ecdsa-p256', signature)).toBe(true);
    expect(isDeviceSignature('ed25519', edSignature)).toBe(true);
    expect(isDeviceSignature('ecdsa-p256', edSignature)).toBe(false);
    expect(isDeviceSignature('ed25519', p256Signatures[0] ?? '')).toBe(false);
    expect(isDeviceSignature('ecdsa-p256', 'MEUC')).toBe(false);
  });

  it('binds a rotation to the SIS, the terminal, the algorithm and the new key', () => {
    const text = deviceKeyRotationText({
      tenantId: 't',
      deviceId: 'd',
      algorithm: 'ecdsa-p256',
      publicKey: p256Public,
    });
    expect(text).toBe(`etare.device-key.v1
t
d
ecdsa-p256
${p256Public}`);
  });
});

describe('terminal policy', () => {
  it('defaults to the values of the porteur', () => {
    expect(DEFAULT_TERMINAL_POLICY).toEqual({
      idle_lock_minutes: 5,
      background_lock_seconds: 0,
      screenshots_allowed: false,
      max_days_without_login: 30,
      offline_authorization_days: 7,
    });
    expect(terminalPolicyProblems(DEFAULT_TERMINAL_POLICY)).toEqual([]);
  });

  it('refuses settings that would leave the tablets open', () => {
    expect(terminalPolicyProblems({ ...DEFAULT_TERMINAL_POLICY, idle_lock_minutes: 0 })).toHaveLength(1);
    expect(terminalPolicyProblems({ ...DEFAULT_TERMINAL_POLICY, idle_lock_minutes: 61 })).toHaveLength(1);
    expect(terminalPolicyProblems({ ...DEFAULT_TERMINAL_POLICY, background_lock_seconds: 601 })).toHaveLength(1);
    expect(terminalPolicyProblems({ ...DEFAULT_TERMINAL_POLICY, max_days_without_login: 91 })).toHaveLength(1);
    expect(terminalPolicyProblems({ ...DEFAULT_TERMINAL_POLICY, offline_authorization_days: 15 })).toHaveLength(1);
    expect(terminalPolicyProblems({ ...DEFAULT_TERMINAL_POLICY, idle_lock_minutes: 2.5 })).toHaveLength(1);
  });
});

describe('completed terminal policy', () => {
  it('keeps what the SIS set and fills the rest with the defaults', () => {
    expect(completeTerminalPolicy(null)).toEqual(DEFAULT_TERMINAL_POLICY);
    expect(completeTerminalPolicy({ idle_lock_minutes: 10, screenshots_allowed: true })).toEqual({
      ...DEFAULT_TERMINAL_POLICY,
      idle_lock_minutes: 10,
      screenshots_allowed: true,
    });
  });

  it('never keeps a setting out of its bounds', () => {
    expect(completeTerminalPolicy({ idle_lock_minutes: 0, max_days_without_login: 500 })).toEqual(
      DEFAULT_TERMINAL_POLICY,
    );
  });
});
