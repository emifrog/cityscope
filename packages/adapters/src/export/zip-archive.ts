import type { ArchiveBuilder } from '@etare/application';
import { zipSync, type Zippable } from 'fflate';

/**
 * A ZIP part of a reversibility export (ADR-033), built in memory with fflate (MIT): entries are
 * deflated unless already compressed media; a fixed timestamp keeps two builds of the same content
 * identical byte for byte.
 */
export class FflateArchiveBuilder implements ArchiveBuilder {
  private readonly content: Zippable = {};
  private added = 0;
  private count = 0;

  constructor(private readonly mtime: Date = new Date('2026-01-01T00:00:00Z')) {}

  add(path: string, content: Uint8Array, options: { compress?: boolean } = {}): void {
    if (!/^[A-Za-z0-9._\-/]+$/.test(path) || path.includes('..') || path.startsWith('/')) {
      throw new Error(`Invalid archive path: ${path}`);
    }
    this.content[path] = [content, { level: options.compress === false ? 0 : 6, mtime: this.mtime }];
    this.added += content.byteLength;
    this.count += 1;
  }

  get bytes(): number {
    return this.added;
  }

  get entries(): number {
    return this.count;
  }

  build(): Uint8Array {
    return zipSync(this.content);
  }
}
