import { describe, expect, it } from 'vitest';
import { assetStorageKey, isStorageKeyOfTenant } from './storage';

const tenant06 = '06000000-0000-4000-8000-000000000000';
const tenant83 = '83000000-0000-4000-8000-000000000000';
const asset = '06000005-0000-4000-8000-000000000001';
const version = '06000005-0000-4000-8000-0000000000a1';

describe('asset storage keys', () => {
  it('prefixes every key with its tenant', () => {
    expect(assetStorageKey(tenant06, asset, version)).toBe(`tenants/${tenant06}/assets/${asset}/${version}`);
  });

  it('refuses anything that is not an identifier (no user file names, no traversal)', () => {
    expect(() => assetStorageKey(tenant06, '../../etc/passwd', version)).toThrow();
    expect(() => assetStorageKey(tenant06, asset, 'plan.pdf')).toThrow();
  });

  it('recognises keys of another tenant', () => {
    const key = assetStorageKey(tenant06, asset, version);
    expect(isStorageKeyOfTenant(key, tenant06)).toBe(true);
    expect(isStorageKeyOfTenant(key, tenant83)).toBe(false);
    expect(isStorageKeyOfTenant(`${key}/../../other`, tenant06)).toBe(false);
  });
});
