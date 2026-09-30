import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical';

describe('canonical JSON', () => {
  it('sorts keys at every level and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1, { z: true, y: null }], c: 'é' } })).toBe(
      '{"a":{"c":"é","d":[3,1,{"y":null,"z":true}]},"b":1}',
    );
  });

  it('gives the same text whatever the insertion order', () => {
    expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
  });

  it('leaves undefined members out and normalizes numbers', () => {
    expect(canonicalJson({ a: undefined, b: -0, c: 1.5e3, d: [undefined] })).toBe('{"b":0,"c":1500,"d":[null]}');
  });

  it('refuses values JSON cannot represent exactly', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson({ a: () => 1 })).toThrow(TypeError);
  });
});
