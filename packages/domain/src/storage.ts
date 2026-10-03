const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Object keys always carry the tenant and are addressed by identifiers, never
 * by user-provided file names: tenants/{tenantId}/assets/{assetId}/{versionId}.
 */
export function assetStorageKey(tenantId: string, assetId: string, versionId: string): string {
  for (const id of [tenantId, assetId, versionId]) {
    if (!UUID.test(id)) throw new Error('Storage key parts must be lowercase UUIDs.');
  }
  return `tenants/${tenantId}/assets/${assetId}/${versionId}`;
}

export function isStorageKeyOfTenant(key: string, tenantId: string): boolean {
  const parts = key.split('/');
  return (
    parts.length === 5 &&
    parts[0] === 'tenants' &&
    parts[1] === tenantId &&
    parts[2] === 'assets' &&
    parts.slice(3).every((part) => UUID.test(part))
  );
}

/** Sizes of the reduced images of a clean image (CAP-03): lists and previews. */
export const IMAGE_VARIANTS = { thumbnail: 320, preview: 1280 } as const;
export type ImageVariant = keyof typeof IMAGE_VARIANTS;

/** Key of a reduced image, next to its asset: tenants/{t}/thumbnails/{asset}/{version}-{size}.webp. */
export function variantStorageKey(assetKey: string, variant: ImageVariant): string {
  const parts = assetKey.split('/');
  if (
    parts.length !== 5 ||
    parts[0] !== 'tenants' ||
    parts[2] !== 'assets' ||
    !parts.every((p, i) => i === 0 || i === 2 || UUID.test(p))
  ) {
    throw new Error('Not an asset storage key.');
  }
  return `tenants/${parts[1]}/thumbnails/${parts[3]}/${parts[4]}-${IMAGE_VARIANTS[variant]}.webp`;
}

/** Uploads land here first; the worker promotes verified files to the asset key. */
export function quarantineStorageKey(tenantId: string, assetId: string, versionId: string): string {
  return assetStorageKey(tenantId, assetId, versionId).replace('/assets/', '/quarantine/');
}
