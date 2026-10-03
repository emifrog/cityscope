import { ImageUnreadable } from '@etare/application';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SharpImageResizer } from './sharp-resizer';

describe('reduced images', () => {
  it('fit within 320 and 1280 px, in WebP, without metadata', async () => {
    const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#c84300' } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'GPS test' } } })
      .toBuffer();
    const { thumbnail, preview } = await new SharpImageResizer().variants(new Uint8Array(photo));
    const small = await sharp(thumbnail).metadata();
    expect(small).toMatchObject({ format: 'webp', width: 320, height: 213 });
    expect(small.exif).toBeUndefined();
    expect(await sharp(preview).metadata()).toMatchObject({ width: 1280, height: 853 });
  });

  it('never enlarges a small image', async () => {
    const icon = await sharp({ create: { width: 100, height: 80, channels: 4, background: '#012b5c' } })
      .png()
      .toBuffer();
    const { preview } = await new SharpImageResizer().variants(new Uint8Array(icon));
    expect(await sharp(preview).metadata()).toMatchObject({ width: 100, height: 80 });
  });

  it('refuses what cannot be decoded', async () => {
    await expect(
      new SharpImageResizer().variants(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])),
    ).rejects.toBeInstanceOf(ImageUnreadable);
  });
});
