import { describe, expect, it } from 'vitest';
import { detectMimeType, isSafeFilename } from './files';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => Uint8Array.from(value, (character) => character.charCodeAt(0));

describe('real file type detection', () => {
  it('recognises the allowed formats by their signature', () => {
    expect(detectMimeType(text('%PDF-1.7\n'))).toBe('application/pdf');
    expect(detectMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(detectMimeType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(detectMimeType(text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
  });

  it('rejects everything else, whatever the declared type', () => {
    expect(detectMimeType(text('MZ\u0090\u0000'))).toBeNull(); // Windows executable
    expect(detectMimeType(text('<html><script>'))).toBeNull();
    expect(detectMimeType(text('PK\u0003\u0004'))).toBeNull(); // zip / office
    expect(detectMimeType(new Uint8Array())).toBeNull();
  });
});

describe('file names', () => {
  it('accepts ordinary names, accents included', () => {
    expect(isSafeFilename('Plan RDC bâtiment A.pdf')).toBe(true);
  });

  it('refuses paths and control characters', () => {
    for (const name of [
      '../secret.pdf',
      'dir/plan.pdf',
      'dir\\plan.pdf',
      'plan\u0000.pdf',
      '',
      '..',
      'x'.repeat(256),
    ]) {
      expect(isSafeFilename(name), name).toBe(false);
    }
  });
});
