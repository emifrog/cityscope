import { describe, expect, it } from 'vitest';
import { describeUserAgent } from './sessions-section';

describe('describeUserAgent', () => {
  it('names the browser and the system of a session', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
      ),
    ).toEqual({ label: 'Chrome sur Windows', mobile: false });
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Linux; Android 11; iPlay40H) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36',
      ),
    ).toEqual({ label: 'Chrome sur Android', mobile: true });
  });

  it('recognises the tablet application and other clients', () => {
    expect(describeUserAgent('Dart/3.9 (dart:io)')).toEqual({ label: 'Application tablette', mobile: true });
    expect(describeUserAgent('node')).toEqual({ label: 'Autre application', mobile: false });
    expect(describeUserAgent(null)).toEqual({ label: 'Appareil inconnu', mobile: false });
  });
});
