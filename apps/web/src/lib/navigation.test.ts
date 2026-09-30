import { describe, expect, it } from 'vitest';
import { isActivePath, safeNextPath } from './navigation';

describe('post-login redirection', () => {
  it('keeps internal paths', () => {
    expect(safeNextPath('/sites/123?tab=plans')).toBe('/sites/123?tab=plans');
  });

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/login', '', null])(
    'refuses %s',
    (value) => {
      expect(safeNextPath(value)).toBe('/');
    },
  );
});

describe('active navigation item', () => {
  it('matches sections and their children', () => {
    expect(isActivePath('/sites/abc', '/sites')).toBe(true);
    expect(isActivePath('/sitesx', '/sites')).toBe(false);
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/sites', '/')).toBe(false);
  });
});
