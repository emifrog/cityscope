import { ImageUnreadable, type ImageResizer } from '@etare/application';
import { IMAGE_VARIANTS } from '@etare/domain';

/** Decoding limit: a 15 MB photo stays far below; a decompression bomb does not get decoded. */
const MAX_INPUT_PIXELS = 100_000_000;

/**
 * Reduced images with sharp (libvips): EXIF orientation applied, never enlarged, WebP,
 * metadata dropped (sharp keeps none unless asked: no GPS position in the variants).
 */
export class SharpImageResizer implements ImageResizer {
  async variants(content: Uint8Array): Promise<{ thumbnail: Uint8Array; preview: Uint8Array }> {
    const { default: sharp } = await import('sharp');
    const reduce = async (size: number, quality: number) =>
      new Uint8Array(
        await sharp(content, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
          .rotate()
          .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
          .webp({ quality })
          .toBuffer(),
      );
    try {
      return {
        thumbnail: await reduce(IMAGE_VARIANTS.thumbnail, 70),
        preview: await reduce(IMAGE_VARIANTS.preview, 80),
      };
    } catch {
      throw new ImageUnreadable();
    }
  }
}
