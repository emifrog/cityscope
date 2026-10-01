// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { photoRefusal } from './object-photos';

describe('photo choice', () => {
  it('accepts PNG, JPEG and WebP images up to 15 MB', () => {
    for (const mime_type of ['image/png', 'image/jpeg', 'image/webp'] as const) {
      expect(photoRefusal({ mime_type, size_bytes: 15 * 1024 * 1024 })).toBeNull();
    }
  });

  it('refuses a PDF and an oversized image before any upload', () => {
    expect(photoRefusal({ mime_type: 'application/pdf', size_bytes: 10 })).toBe(
      'Une photo est une image PNG, JPEG ou WebP.',
    );
    expect(photoRefusal({ mime_type: 'image/jpeg', size_bytes: 15 * 1024 * 1024 + 1 })).toBe(
      'Photo trop volumineuse (maximum 15 Mo).',
    );
  });
});
