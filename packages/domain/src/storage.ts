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
