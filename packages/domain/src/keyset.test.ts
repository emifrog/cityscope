import { describe, expect, it } from 'vitest';
import { isKeyActive, isKeyTrusted, keysetProblems, preferredSignature, type Keyset, type KeysetKey } from './keyset';

const key = (purpose: KeysetKey['purpose'], id: string, status: KeysetKey['status']): KeysetKey => ({
  purpose,
  key_id: id,
  public_key: `${id.padEnd(43, 'A').slice(0, 43)}=`,
  status,
});

const keyset: Keyset = {
  keyset_version: 1,
  sequence: 3,
  issued_at: '2026-10-06T08:00:00.000Z',
  keys: [
    key('publication', 'pub-new', 'active'),
    key('publication', 'pub-old', 'retired'),
    key('publication', 'pub-lost', 'revoked'),
    key('catalog', 'cat-new', 'active'),
    key('catalog', 'cat-old', 'retired'),
  ],
};

describe('key set', () => {
  it('trusts active keys, and retired keys for content signed before only', () => {
    expect(isKeyTrusted(keyset, 'publication', 'pub-new')).toBe(true);
    expect(isKeyTrusted(keyset, 'publication', 'pub-old')).toBe(true);
    expect(isKeyTrusted(keyset, 'catalog', 'cat-new')).toBe(true);
    // A catalogue is signed at each contact: a retired catalogue key no longer counts.
    expect(isKeyTrusted(keyset, 'catalog', 'cat-old')).toBe(false);
  });

  it('never trusts a revoked, unknown or other-purpose key', () => {
    expect(isKeyTrusted(keyset, 'publication', 'pub-lost')).toBe(false);
    expect(isKeyTrusted(keyset, 'publication', 'unknown')).toBe(false);
    expect(isKeyTrusted(keyset, 'catalog', 'pub-new')).toBe(false);
  });

  it('lets only active keys sign', () => {
    expect(isKeyActive(keyset, 'publication', 'pub-new')).toBe(true);
    expect(isKeyActive(keyset, 'publication', 'pub-old')).toBe(false);
  });

  it('requires an active key per purpose, unique identifiers and separate keys', () => {
    expect(keysetProblems(keyset)).toEqual([]);
    const broken: Keyset = {
      ...keyset,
      keys: [key('publication', 'a', 'active'), { ...key('catalog', 'a', 'revoked') }],
    };
    expect(keysetProblems(broken)).toEqual([
      'clé a listée deux fois',
      'clé publique de a déjà listée',
      "aucune clé active pour l'usage catalog",
    ]);
  });

  it('serves the newest signature of an active key, else of a retired one', () => {
    const signatures = [{ key_id: 'pub-old' }, { key_id: 'pub-new' }, { key_id: 'pub-lost' }];
    expect(preferredSignature(signatures, keyset, 'publication')).toEqual({ key_id: 'pub-new' });
    expect(preferredSignature([{ key_id: 'pub-old' }, { key_id: 'pub-lost' }], keyset, 'publication')).toEqual({
      key_id: 'pub-old',
    });
    expect(preferredSignature([{ key_id: 'pub-lost' }], keyset, 'publication')).toBeNull();
    // Without a key set (development): the most recent.
    expect(preferredSignature(signatures, null, 'publication')).toEqual({ key_id: 'pub-lost' });
  });
});
