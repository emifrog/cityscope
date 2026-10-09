import { describe, expect, it } from 'vitest';
import { siteIdOfLink, siteLink } from './site-link';

const SITE = '06000002-0000-4000-8000-000000000001';

describe('site link (QR code of the ETARE)', () => {
  it('names the site under the public address, whatever its trailing slash', () => {
    expect(siteLink('https://firescape.io', SITE)).toBe(`https://firescape.io/sites/${SITE}`);
    expect(siteLink('https://preprod.example/', SITE)).toBe(`https://preprod.example/sites/${SITE}`);
  });

  it('reads the site identifier back from any origin', () => {
    expect(siteIdOfLink(`https://firescape.io/sites/${SITE}`)).toBe(SITE);
    expect(siteIdOfLink(` http://127.0.0.1:3000/sites/${SITE.toUpperCase()}/ `)).toBe(SITE);
    expect(siteIdOfLink(`https://firescape.io/sites/${SITE}?onglet=plans`)).toBe(SITE);
  });

  it('refuses anything that is not a site link', () => {
    expect(siteIdOfLink('ETARE 06-0428')).toBeNull();
    expect(siteIdOfLink('https://firescape.io/sites/not-a-uuid')).toBeNull();
    expect(siteIdOfLink(`https://firescape.io/publications/${SITE}`)).toBeNull();
    expect(siteIdOfLink(`etare://sites/${SITE}`)).toBeNull();
    expect(siteIdOfLink(`javascript:alert(1)//sites/${SITE}`)).toBeNull();
  });
});
