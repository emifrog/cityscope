/**
 * Roles and permissions. The database (app.role_permission) is the authority;
 * this mirror lets the UI and use cases reason about capabilities, and an
 * integration test checks that both stay identical.
 */
export const ROLES = [
  'SUPER_ADMIN',
  'SIS_ADMIN',
  'PREVISION_EDITOR',
  'PREVISION_VALIDATOR',
  'OPS_USER',
  'EXPLOITANT',
  'READER',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'site:read',
  'site:write',
  'etare:read',
  'etare:edit',
  'etare:submit',
  'etare:approve',
  'publication:publish',
  'publication:read',
  'offline:download',
  'field_report:create',
  'contribution:create',
  'portal:read',
  'audit:read',
  'member:manage',
  'device:manage',
  'catalog:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Permissions that require a second authentication factor (aal2). */
export const PRIVILEGED_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  'etare:approve',
  'publication:publish',
  'member:manage',
  'device:manage',
]);

export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  // Platform operations only: never any access to business data.
  SUPER_ADMIN: [],
  // Administers the SIS but cannot validate nor publish without the validator role.
  SIS_ADMIN: [
    'site:read',
    'site:write',
    'etare:read',
    'etare:edit',
    'publication:read',
    'audit:read',
    'member:manage',
    'device:manage',
    'catalog:manage',
  ],
  PREVISION_EDITOR: ['site:read', 'site:write', 'etare:read', 'etare:edit', 'etare:submit', 'publication:read'],
  PREVISION_VALIDATOR: ['site:read', 'etare:read', 'etare:approve', 'publication:publish', 'publication:read'],
  OPS_USER: ['publication:read', 'offline:download', 'field_report:create'],
  EXPLOITANT: ['portal:read', 'contribution:create'],
  READER: ['site:read', 'etare:read', 'publication:read'],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  return new Set(roles.flatMap((role) => DEFAULT_ROLE_PERMISSIONS[role]));
}
